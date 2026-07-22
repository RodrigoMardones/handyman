#!/usr/bin/env node
/**
 * Handyman sprint lifecycle: open, close, and inspect work periods.
 *
 * Faithful port of `scripts/sprint.py`. A sprint is a declared partition label
 * on features (`"sprint": "2026-SP1"`); the sprint document is *derived* at
 * close time from the artifacts the workflow already writes
 * (feature_list.json, progress/history.md, backlog/ frontmatter), never
 * hand-maintained in parallel (single source of truth). The feature contract
 * stays a four-state machine: the label says which period a feature belongs
 * to, not when anything happened.
 *
 * Operations:
 *   open ID    Stamp every unlabeled pending/in_progress feature with the
 *              sprint label and record `current_sprint` in harness.config.json
 *              (mirrored to the feature_list config block when present).
 *              Rejects a second open sprint and malformed ids.
 *   close      Derive docs/sprints/sprint.<ID>.md inside the workspace,
 *              archive the sprint's done features to archive/feature_archive.json,
 *              compact the archived features' history entries to one-line stubs
 *              (the narrative just moved into the sprint document), strip the
 *              label from carry-over features, and clear current_sprint.
 *              --dry-run previews without writing.
 *   status     Report the open sprint and its features. Read-only.
 *
 * Usage:
 *   node dist/sprint.js [--root PATH] open SPRINT_ID
 *   node dist/sprint.js [--root PATH] close [--dry-run]
 *   node dist/sprint.js [--root PATH] status
 *
 * Exit codes: 0 ok, 1 error, 2 usage (argparse semantics: usage text on
 * stderr, exit 2).
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "./core/frontmatter.js";
import {
  loadFeatureList,
  readCurrentSprint,
  resolveDocsDir,
  resolveWorkspace,
  saveFeatureList,
} from "./core/index.js";

/** Bundled templates directory. `src/` (vitest) and `dist/` (built) both sit
 *  one level below the package root, so `../assets` is correct in either
 *  location (mirrors Python `Path(__file__).resolve().parent.parent / "assets"`). */
const ASSETS_DIR = fileURLToPath(new URL("../assets", import.meta.url));

// Any filesystem-safe slug: the id becomes `docs/sprints/sprint.<ID>.md`, so
// no slashes or spaces. Branch-as-unit labels slugify `/` to `-`
// (feat/rework-tools -> feat-rework-tools); calendar ids stay valid.
const SPRINT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const HISTORY_HEADING = /^## \d{4}-\d{2}-\d{2} - Feature \d+: (.+)$/;
// Inlined from the retired scripts/metrics.py (ported to src/metrics.ts).
// Written by `feature done`: "## 2026-06-18 - Feature 5: harness_versioning".
const CLOSURE_HEADING = /^## (\d{4}-\d{2}-\d{2}) - Feature (\d+): (.+)$/;

interface Closure {
  date: string;
  id: number;
  name: string;
}

interface Feature {
  id?: number;
  name?: string;
  status?: string;
  sprint?: string;
  blocked_reason?: string;
  [key: string]: unknown;
}

/** Closure entries derived from the dated headings in progress/history.md. */
function historyClosures(workspace: string): Closure[] {
  const path = join(workspace, "progress", "history.md");
  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch {
    return [];
  }
  const closures: Closure[] = [];
  for (const line of text.split(/\r\n|\r|\n/)) {
    const match = CLOSURE_HEADING.exec(line);
    if (match) {
      const [, date, id, name] = match;
      closures.push({ date: date as string, id: Number(id), name: (name as string).trim() });
    }
  }
  return closures;
}

/** Map backlog report filename -> parsed frontmatter (reuses the shared parser). */
function backlogReports(workspace: string): Record<string, Record<string, string>> {
  const backlogDir = join(workspace, "backlog");
  const reports: Record<string, Record<string, string>> = {};
  let names: string[];
  try {
    names = readdirSync(backlogDir);
  } catch {
    return reports;
  }
  // Python `sorted(backlog.glob("*.md"))`: entries ending in `.md`, Unicode-sorted.
  const sorted = names.filter((n) => n.endsWith(".md")).sort();
  for (const name of sorted) {
    reports[name] = parseFrontmatter(join(backlogDir, name));
  }
  return reports;
}

/** err: print `error: <msg>` to stderr, return exit code 1. */
function err(msg: string): number {
  process.stderr.write(`error: ${msg}\n`);
  return 1;
}

/** Read a UTF-8 JSON file into a plain JS value (Python `json.loads`). */
function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf-8"));
}

/** Serialize harness state to the exact byte string Python writes
 *  (`json.dumps(data, indent=2, ensure_ascii=False) + "\n"`). */
function dumpJson(data: unknown): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

/** Write a JSON state file with the exact bytes Python writes. */
function writeJson(path: string, data: unknown): void {
  writeFileSync(path, dumpJson(data), { encoding: "utf-8" });
}

/** Record the open sprint in harness.config.json and mirror it to the
 *  feature_list config block when one exists. True if at least one location
 *  was written. */
function writeCurrentSprint(root: string, workspace: string, value: string | null): boolean {
  let written = false;
  const cfg = join(root, "harness.config.json");
  if (existsSync(cfg)) {
    try {
      const data = readJson(cfg) as Record<string, unknown>;
      data.current_sprint = value;
      writeJson(cfg, data);
      written = true;
    } catch {
      // ignore
    }
  }
  const fl = join(workspace, "feature_list.json");
  if (existsSync(fl)) {
    try {
      const data = readJson(fl) as { config?: Record<string, unknown> };
      if (data.config) {
        data.config.current_sprint = value;
        writeJson(fl, data);
        written = true;
      }
    } catch {
      // ignore
    }
  }
  return written;
}

/** Map feature name -> its rich history entry body (text until the next
 *  heading), derived from the dated headings `feature done` writes. */
function historyBlocks(workspace: string): Record<string, string> {
  const path = join(workspace, "progress", "history.md");
  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch {
    return {};
  }
  const blocks: Record<string, string> = {};
  let name: string | null = null;
  const body: string[] = [];
  const lines = text.split(/\r\n|\r|\n/);
  const flush = (): void => {
    if (name !== null) {
      blocks[name] = body.join("\n");
    }
  };
  for (const line of lines) {
    const match = HISTORY_HEADING.exec(line);
    if (match) {
      flush();
      name = (match[1] as string).trim();
      body.length = 0;
    } else if (line.startsWith("## ")) {
      flush();
      name = null;
      body.length = 0;
    } else if (name !== null) {
      body.push(line);
    }
  }
  flush();
  return blocks;
}

/** Values of `- **<key>:** ...` bullets in a history block, skipping the `...`
 *  narrative placeholder. */
function bulletValues(block: string, key: string): string[] {
  const values: string[] = [];
  const prefix = `- **${key}:**`;
  for (const line of block.split(/\r\n|\r|\n/)) {
    const stripped = line.trim();
    if (stripped.startsWith(prefix)) {
      const value = stripped.slice(prefix.length).trim();
      if (value && value !== "...") {
        values.push(value);
      }
    }
  }
  return values;
}

/**
 * Apply the replacements in order, each replacing every occurrence (Python
 * `str.replace`). Uses `split/join` instead of `String.replace` so a value
 * containing `$&`/`$$`/`$n` is not interpreted as a replacement pattern (the
 * bug that corrupted template fills in the Python port surface).
 */
function applyTemplate(
  template: string,
  replacements: ReadonlyArray<readonly [string, string]>,
): string {
  let out = template;
  for (const [placeholder, value] of replacements) {
    out = out.split(placeholder).join(value);
  }
  return out;
}

function renderDoc(sid: string, labeled: Feature[], workspace: string): string {
  const templatePath = join(ASSETS_DIR, "sprint.template.md");
  const template = readFileSync(templatePath, "utf-8");
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  // Exact close moment (ISO 8601) for metrics; the calendar `today` above only
  // feeds the human-facing `updated`/`Closed` date headings.
  const closedAt = now.toISOString();

  const done = labeled.filter((f) => f.status === "done");
  const carry = labeled.filter((f) => f.status !== "done");
  const doneNames = new Set(done.map((f) => f.name ?? ""));

  const closures = historyClosures(workspace).filter((c) => doneNames.has(c.name));
  const dateSet = [...new Set(closures.map((c) => c.date))].sort();
  const period = dateSet.length > 0 ? `${dateSet[0]} to ${dateSet[dateSet.length - 1]}` : "-";

  const blocks = historyBlocks(workspace);
  const branches: string[] = [];
  const tools: string[] = [];
  for (const name of [...doneNames].sort()) {
    const block = blocks[name] ?? "";
    for (const value of bulletValues(block, "Branch")) {
      if (!branches.includes(value)) {
        branches.push(value);
      }
    }
    for (const value of bulletValues(block, "Tools")) {
      tools.push(`- \`${name}\`: ${value}`);
    }
  }

  const rows = ["| id | name | status |", "|----|------|--------|"];
  for (const f of [...labeled].sort((a, b) => (a.id ?? 0) - (b.id ?? 0))) {
    rows.push(`| ${f.id ?? "?"} | ${f.name ?? "?"} | ${f.status ?? "?"} |`);
  }
  const featuresTable = labeled.length > 0 ? rows.join("\n") : "_No features carried the label._";

  const perDate: Record<string, number> = {};
  for (const c of closures) {
    perDate[c.date] = (perDate[c.date] ?? 0) + 1;
  }
  const reports = backlogReports(workspace);
  let approved = 0;
  let changes = 0;
  let covered = 0;
  for (const name of doneNames) {
    const front = reports[`review_${name}.md`] ?? {};
    if (front.status === "approved") {
      approved += 1;
    } else if (front.status === "changes_requested") {
      changes += 1;
    }
    if (`impl_${name}.md` in reports && `review_${name}.md` in reports) {
      covered += 1;
    }
  }
  const metricLines = [
    `- **Features done:** ${done.length} (carry-over: ${carry.length})`,
    "- **Throughput:** " +
      ([...Object.entries(perDate)]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([d, n]) => `${d} = ${n}`)
        .join(", ") || "-"),
    `- **Review verdicts:** approved=${approved} changes_requested=${changes}`,
    `- **Report coverage:** ${covered}/${done.length} done with impl+review pair`,
  ];

  const carryLines: string[] = [];
  for (const f of [...carry].sort((a, b) => (a.id ?? 0) - (b.id ?? 0))) {
    let line = `- ${f.name ?? "?"} (${f.status ?? "?"})`;
    const reason = f.blocked_reason;
    if (reason) {
      line += ` - ${reason}`;
    }
    carryLines.push(line);
  }

  return applyTemplate(template, [
    ["<sprint_id>", sid],
    ["<closed_at>", closedAt],
    ["YYYY-MM-DD", today],
    ["<period>", period],
    ["<branches>", branches.join(", ") || "-"],
    ["<features_table>", featuresTable],
    ["<metrics>", metricLines.join("\n")],
    ["<tools>", tools.join("\n") || "_No tools provenance recorded._"],
    ["<carryover>", carryLines.join("\n") || "_None._"],
  ]);
}

function archive(workspace: string, sid: string, done: Feature[]): string {
  const archiveDir = join(workspace, "archive");
  mkdirSync(archiveDir, { recursive: true });
  const path = join(archiveDir, "feature_archive.json");
  let archiveData: { sprints?: Record<string, Feature[]> };
  if (existsSync(path)) {
    try {
      archiveData = readJson(path) as { sprints?: Record<string, Feature[]> };
    } catch {
      archiveData = {};
    }
  } else {
    archiveData = {};
  }
  // Python `archive.setdefault("sprints", {})` then `.setdefault(sid, []).extend(done)`.
  if (!archiveData.sprints) {
    archiveData.sprints = {};
  }
  const sprints = archiveData.sprints;
  if (!sprints[sid]) {
    sprints[sid] = [];
  }
  sprints[sid].push(...done);
  writeJson(path, archiveData);
  return path;
}

/**
 * Compress the history bodies of the sprint's archived features to a one-line
 * stub (memory decay at period close).
 *
 * The dated heading stays byte-identical: `historyClosures` and the sprint
 * renderer key on it, so throughput stays derivable forever. Only the body is
 * replaced - its narrative was captured moments earlier in the derived sprint
 * document. Idempotent: a body that already is the stub is left alone. Returns
 * how many entries would be (or were) compacted.
 */
function compactHistory(
  workspace: string,
  sid: string,
  doneNames: Set<string>,
  dryRun = false,
): number {
  const path = join(workspace, "progress", "history.md");
  if (!existsSync(path)) {
    return 0;
  }
  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch {
    return 0;
  }
  const stub = `- archived to sprint ${sid}; narrative in ${basename(resolveDocsDir(workspace))}/sprints/sprint.${sid}.md`;
  const lines = text.split("\n");
  const out: string[] = [];
  let compacted = 0;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] as string;
    const match = HISTORY_HEADING.exec(line);
    if (match && (match[1] as string).trim() && doneNames.has((match[1] as string).trim())) {
      const j = i + 1;
      const body: string[] = [];
      let k = j;
      while (k < lines.length) {
        const bk = lines[k];
        if (bk === undefined || bk.startsWith("## ")) {
          break;
        }
        body.push(bk);
        k += 1;
      }
      const meaningful = body.filter((b) => b.trim());
      out.push(line);
      const onlyMeaningful = meaningful.length === 1 ? meaningful[0] : undefined;
      const alreadyStub = onlyMeaningful?.trim().startsWith("- archived to sprint") ?? false;
      if (meaningful.length > 0 && !alreadyStub) {
        out.push(stub);
        out.push("");
        compacted += 1;
      } else {
        out.push(...body);
      }
      i = k;
    } else {
      out.push(line);
      i += 1;
    }
  }
  if (compacted && !dryRun) {
    writeFileSync(path, out.join("\n"), { encoding: "utf-8" });
  }
  return compacted;
}

// --- argparse-compatible CLI (usage errors: usage text to stderr, exit 2) ----

function mainUsage(prog: string): string {
  return `usage: ${prog} [-h] [--root ROOT] {open,close,status} ...\n`;
}

function subUsage(prog: string, command: "open" | "close" | "status"): string {
  if (command === "open") {
    return `usage: ${prog} open [-h] sprint_id\n`;
  }
  if (command === "close") {
    return `usage: ${prog} close [-h] [--dry-run]\n`;
  }
  return `usage: ${prog} status [-h]\n`;
}

/** argparse `parser.error(...)`: usage to stderr, `prog: error: msg`, exit 2. */
function exitUsage(usage: string, errorProg: string, message: string): never {
  process.stderr.write(usage);
  process.stderr.write(`${errorProg}: error: ${message}\n`);
  process.exit(2);
}

function printMainHelp(prog: string): never {
  process.stdout.write(mainHelpText(prog));
  process.exit(0);
}

function printSubHelp(prog: string, command: "open" | "close" | "status"): never {
  process.stdout.write(subHelpText(prog, command));
  process.exit(0);
}

function mainHelpText(prog: string): string {
  return `usage: ${prog} [-h] [--root ROOT] {open,close,status} ...

Handyman sprint lifecycle: open, close, and inspect work periods. A sprint is
a declared partition label on features (\`"sprint": "2026-SP1"\`); the sprint
document is *derived* at close time from the artifacts the workflow already
writes (feature_list.json, progress/history.md, backlog/ frontmatter), never
hand-maintained in parallel (single source of truth). The feature contract
stays a four-state machine: the label says which period a feature belongs to,
not when anything happened. Operations: open ID Stamp every unlabeled
pending/in_progress feature with the sprint label and record \`current_sprint\`
in harness.config.json (mirrored to the feature_list config block when
present). Rejects a second open sprint and malformed ids. close Derive
docs/sprints/sprint.<ID>.md inside the workspace, archive the sprint's done
features to archive/feature_archive.json, compact the archived features'
history entries to one-line stubs (the narrative just moved into the sprint
document), strip the label from carry-over features, and clear
current_sprint. --dry-run previews without writing. status Report the open
sprint and its features. Read-only. Usage: scripts/sprint.py [--root PATH]
open SPRINT_ID scripts/sprint.py [--root PATH] close [--dry-run]
scripts/sprint.py [--root PATH] status Exit codes: 0 ok, 1 error, 2 usage.

positional arguments:
  {open,close,status}
    open               Open a sprint and stamp its features.
    close              Close the open sprint.
    status             Report the open sprint. Read-only.

options:
  -h, --help            show this help message and exit
  --root ROOT           Project root (default: current directory).
`;
}

function subHelpText(prog: string, command: "open" | "close" | "status"): string {
  const usage = subUsage(prog, command);
  if (command === "open") {
    return `${usage}
positional arguments:
  sprint_id

options:
  -h, --help  show this help message and exit
`;
  }
  if (command === "close") {
    return `${usage}
options:
  -h, --help     show this help message and exit
  --dry-run      Preview the close without writing.
`;
  }
  return `${usage}
options:
  -h, --help  show this help message and exit
`;
}

/**
 * True when a token reads as an option, not a positional (argparse heuristic).
 * Tokens that look like negative numbers are positionals: argparse's
 * `_negative_number_matcher` (`^-\d+$|^-\d*\.\d+$`) exempts them because no
 * registered option string here looks like a negative number. A token that
 * contains a space is never an option (argparse's `' ' in arg_string` rule).
 */
function looksLikeOption(token: string): boolean {
  return (
    token.length > 1 &&
    token.startsWith("-") &&
    !token.includes(" ") &&
    !/^-\d+$|^-\d*\.\d+$/.test(token)
  );
}

/** Consume the value of `--opt VALUE`; argparse errors when it is missing. */
function optionValue(
  argv: readonly string[],
  index: number,
  option: string,
  usage: string,
  errorProg: string,
): [string, number] {
  const value = argv[index + 1];
  if (value === undefined || looksLikeOption(value)) {
    exitUsage(usage, errorProg, `argument ${option}: expected one argument`);
  }
  return [value, index + 1];
}

interface ParsedArgs {
  root: string;
  command: "open" | "close" | "status";
  sprintId: string | null;
  dryRun: boolean;
}

/** Parse the subcommand's arguments (mirrors the argparse subparsers). */
function parseSubArgs(
  rest: string[],
  prog: string,
  command: "open" | "close" | "status",
): { sprintId: string | null; dryRun: boolean } {
  const usage = subUsage(prog, command);
  const errorProg = `${prog} ${command}`;
  let sprintId: string | null = null;
  let dryRun = false;
  let positionalOnly = false;
  const extras: string[] = [];

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i] as string;
    if (!positionalOnly && (arg === "-h" || arg === "--help")) {
      printSubHelp(prog, command);
    } else if (!positionalOnly && arg === "--") {
      positionalOnly = true;
    } else if (!positionalOnly && command === "close" && arg === "--dry-run") {
      dryRun = true;
    } else if (!positionalOnly && looksLikeOption(arg)) {
      extras.push(arg);
    } else if (command === "open" && sprintId === null) {
      sprintId = arg;
    } else {
      extras.push(arg);
    }
  }

  if (command === "open" && sprintId === null) {
    exitUsage(usage, errorProg, "the following arguments are required: sprint_id");
  }
  if (extras.length > 0) {
    exitUsage(mainUsage(prog), prog, `unrecognized arguments: ${extras.join(" ")}`);
  }
  return { sprintId, dryRun };
}

/** Parse argv like the Python argparse parser (exit 2 on usage, 0 on help). */
function parseArgs(argv: string[], prog: string): ParsedArgs {
  const usage = mainUsage(prog);
  const commands = ["open", "close", "status"] as const;
  let root = ".";
  let command: "open" | "close" | "status" | null = null;
  const extras: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === "-h" || arg === "--help") {
      printMainHelp(prog);
    } else if (arg === "--" && i === argv.length - 1) {
      // A trailing `--` is never consumed by the command positional (argparse's
      // PARSER pattern needs a following token); the missing-command error
      // below fires.
    } else if (arg === "--root") {
      const [rootVal, next] = optionValue(argv, i, "--root", usage, prog);
      root = rootVal;
      i = next;
    } else if (arg.startsWith("--root=")) {
      root = arg.slice("--root=".length);
    } else if (arg !== "--" && looksLikeOption(arg)) {
      extras.push(arg);
    } else {
      if (!(commands as readonly string[]).includes(arg as "open")) {
        exitUsage(
          usage,
          prog,
          `argument command: invalid choice: '${arg}' (choose from 'open', 'close', 'status')`,
        );
      }
      command = arg as "open" | "close" | "status";
      const rest = argv.slice(i + 1);
      const sub = parseSubArgs(rest, prog, command);
      if (extras.length > 0) {
        exitUsage(usage, prog, `unrecognized arguments: ${extras.join(" ")}`);
      }
      return { root, command, ...sub };
    }
  }

  if (extras.length > 0) {
    exitUsage(usage, prog, `unrecognized arguments: ${extras.join(" ")}`);
  }
  exitUsage(usage, prog, "the following arguments are required: command");
}

// --- commands ----------------------------------------------------------------

function cmdOpen(args: ParsedArgs, workspace: string, root: string): number {
  const sid = args.sprintId as string;
  if (!SPRINT_ID.test(sid)) {
    return err(
      `malformed sprint id '${sid}' (expected a filesystem-safe slug, e.g. 2026-SP1 or feat-rework-tools)`,
    );
  }
  const current = readCurrentSprint(root, workspace);
  if (current) {
    return err(`sprint already open: ${current} (close it first)`);
  }
  const flPath = join(workspace, "feature_list.json");
  if (!existsSync(flPath)) {
    return err(`feature_list not found: ${flPath}`);
  }
  let data: { features?: Feature[]; config?: Record<string, unknown> };
  try {
    data = loadFeatureList(flPath);
  } catch (exc) {
    return err(`feature_list not found: ${exc instanceof Error ? exc.message : String(exc)}`);
  }
  const hasCfg = existsSync(join(root, "harness.config.json"));
  const hasMirror = data.config !== undefined && data.config !== null;
  if (!hasCfg && !hasMirror) {
    return err(
      "nowhere to record current_sprint: neither harness.config.json nor a feature_list config block exists",
    );
  }
  let stamped = 0;
  for (const feature of data.features ?? []) {
    if (
      (feature.status === "pending" || feature.status === "in_progress") &&
      !("sprint" in feature)
    ) {
      feature.sprint = sid;
      stamped += 1;
    }
  }
  saveFeatureList(flPath, data);
  writeCurrentSprint(root, workspace, sid);
  process.stdout.write(`opened sprint ${sid}: stamped ${stamped} feature(s)\n`);
  return 0;
}

function cmdClose(args: ParsedArgs, workspace: string, root: string): number {
  const sid = readCurrentSprint(root, workspace);
  if (!sid) {
    return err("no sprint open (run 'open <id>' first)");
  }
  const flPath = join(workspace, "feature_list.json");
  if (!existsSync(flPath)) {
    return err(`feature_list not found: ${flPath}`);
  }
  let data: { features?: Feature[] };
  try {
    data = loadFeatureList(flPath);
  } catch (exc) {
    return err(`feature_list not found: ${exc instanceof Error ? exc.message : String(exc)}`);
  }
  const features = data.features ?? [];
  const labeled = features.filter((f) => f.sprint === sid);
  const active = labeled.filter((f) => f.status === "in_progress").map((f) => f.name ?? "?");
  if (active.length > 0) {
    return err(
      `sprint ${sid} has in_progress feature(s): ${active.join(", ")}; close or block them first`,
    );
  }
  const done = labeled.filter((f) => f.status === "done");
  const carry = labeled.filter((f) => f.status !== "done");
  const docPath = join(resolveDocsDir(workspace), "sprints", `sprint.${sid}.md`);
  if (existsSync(docPath)) {
    return err(`sprint document already exists: ${docPath}`);
  }

  const content = renderDoc(sid, labeled, workspace);
  const doneNames = new Set(done.map((f) => f.name ?? ""));
  if (args.dryRun) {
    process.stdout.write(`DRY RUN: would write ${docPath}\n`);
    process.stdout.write(
      `DRY RUN: would archive ${done.length} done feature(s) to ${join(workspace, "archive", "feature_archive.json")}\n`,
    );
    const n = compactHistory(workspace, sid, doneNames, true);
    process.stdout.write(`DRY RUN: would compact ${n} history entrie(s) to archive stubs\n`);
    process.stdout.write(
      `DRY RUN: would strip the label from ${carry.length} carry-over feature(s)\n`,
    );
    process.stdout.write(`DRY RUN: would clear current_sprint (${sid})\n`);
    return 0;
  }

  mkdirSync(join(resolveDocsDir(workspace), "sprints"), { recursive: true });
  writeFileSync(docPath, content, { encoding: "utf-8" });
  const archivePath = archive(workspace, sid, done);
  // Compact AFTER the sprint document is rendered and written: the stub points
  // at the document that now holds the full narrative.
  const compacted = compactHistory(workspace, sid, doneNames);
  data.features = features.filter((f) => !(f.sprint === sid && f.status === "done"));
  for (const feature of data.features) {
    if (feature.sprint === sid) {
      delete feature.sprint;
    }
  }
  saveFeatureList(flPath, data);
  writeCurrentSprint(root, workspace, null);
  process.stdout.write(`closed sprint ${sid} -> ${docPath}\n`);
  process.stdout.write(
    `archived ${done.length} done feature(s) -> ${archivePath}; ${carry.length} carried over\n`,
  );
  process.stdout.write(`compacted ${compacted} history entrie(s) to archive stubs\n`);
  return 0;
}

function cmdStatus(workspace: string, root: string): number {
  const sid = readCurrentSprint(root, workspace);
  if (!sid) {
    process.stdout.write("no sprint open\n");
    return 0;
  }
  const flPath = join(workspace, "feature_list.json");
  if (!existsSync(flPath)) {
    process.stdout.write(`sprint ${sid} open; feature_list not found\n`);
    return 0;
  }
  let data: { features?: Feature[] };
  try {
    data = loadFeatureList(flPath);
  } catch {
    process.stdout.write(`sprint ${sid} open; feature_list not found\n`);
    return 0;
  }
  const labeled = (data.features ?? []).filter((f) => f.sprint === sid);
  process.stdout.write(`sprint ${sid} open: ${labeled.length} feature(s)\n`);
  for (const feature of [...labeled].sort((a, b) => (a.id ?? 0) - (b.id ?? 0))) {
    process.stdout.write(
      `  ${feature.id ?? "?"} ${feature.name ?? "?"} [${feature.status ?? "?"}]\n`,
    );
  }
  return 0;
}

export function main(argv: string[]): number {
  const prog = basename(process.argv[1] ?? "sprint.js");
  const args = parseArgs(argv, prog);
  // Python `Path(args.root).resolve()`: absolutize then resolve symlinks
  // (non-strict -- a missing path is still absolutized).
  let root = resolve(args.root);
  try {
    root = realpathSync(root);
  } catch {
    // keep the absolutized path; downstream is-dir checks reject it.
  }
  const workspace = resolveWorkspace(root);
  if (args.command === "open") {
    return cmdOpen(args, workspace, root);
  }
  if (args.command === "close") {
    return cmdClose(args, workspace, root);
  }
  return cmdStatus(workspace, root);
}

// Run when executed directly (mirrors Python `if __name__ == "__main__"`).
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}

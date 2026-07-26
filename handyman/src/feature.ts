#!/usr/bin/env node
import { execFileSync } from "node:child_process";
/**
 * Handyman feature-state CLI.
 *
 * Faithful port of `scripts/feature.py`. Atomic transitions over
 * feature_list.json so agents never hand-edit the state machine (the root
 * cause of split-scope, two-in_progress, and history-drift risks documented
 * in references/checklists.md).
 *
 * Operations:
 *   add    Append a new pending feature (auto-incremented id).
 *   start  Mark a feature in_progress, enforcing the single-in_progress
 *          invariant, and refresh progress/current.md.
 *   block  Mark a feature blocked and record the reason.
 *   unblock Clear a block: blocked -> pending, dropping blocked_reason.
 *   acceptance Replace a feature's acceptance list wholesale. Refuses a `done`
 *          feature unless `--force`, which records the override in history.md.
 *   done   Run the verifier; only on exit 0 mark the feature done, append a
 *          rich progress/history.md entry whose Review line carries the
 *          verdict read from backlog/review_<name>.md, and reset
 *          progress/current.md.
 *   ready  List the pending features whose depends_on are all satisfied
 *          (done or archived). The unattended-loop work detector: exit 0
 *          means claimable work exists, exit 3 means the backlog is drained.
 *   log    Append a bullet to the Log section of progress/current.md.
 *   next   Set the Next Step section of progress/current.md.
 *
 * Observation shape: the last stdout line is always `status: ok|warn|error`
 * (preceded by a `next:` hint when one applies), except in --json modes where
 * the JSON payload is the observation.
 *
 * Usage:
 *   node dist/feature.js [--root PATH] add --name NAME [--title T] [--description D]
 *                        [--acceptance LINE]... [--depends-on ID]...
 *   node dist/feature.js [--root PATH] start NAME [--no-preflight]
 *   node dist/feature.js [--root PATH] block NAME --reason WHY
 *   node dist/feature.js [--root PATH] unblock NAME
 *   node dist/feature.js [--root PATH] acceptance NAME --acceptance LINE [--acceptance LINE]... [--force]
 *   node dist/feature.js [--root PATH] done NAME [--verifier PATH] [--date YYYY-MM-DD]
 *   node dist/feature.js [--root PATH] ready [--json]
 *   node dist/feature.js [--root PATH] log LINE
 *   node dist/feature.js [--root PATH] next STEP
 *
 * Exit codes: 0 ok, 1 error, 2 usage, 3 no ready work (ready only).
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { addFeature } from "./core/featureWrite.js";
import { parseFrontmatter } from "./core/frontmatter.js";
import {
  loadFeatureList,
  readCurrentSprint,
  resolveWorkspace,
  saveFeatureList,
  validateFeatureList,
} from "./core/index.js";

/** Bundled dist directory (sibling resolution): preflight.js is now the Node
 *  port and lives beside feature.js in dist/, not in scripts/ (mirrors
 *  Python SCRIPT_DIR, updated for the #10 port). Both `src/` (vitest) and
 *  `dist/` (built) sit one level below the package root, so `../dist`
 *  resolves correctly from either (same pattern as `upgrade_harness.ts`'s
 *  `ASSETS`). */
const DIST_DIR = fileURLToPath(new URL("../dist", import.meta.url));

const VALID_STATUS = ["pending", "in_progress", "done", "blocked"] as const;

const SESSION_TEMPLATE =
  "---\n" +
  "type: Session Log\n" +
  "feature: {feature}\n" +
  "status: {status}\n" +
  "role: leader\n" +
  "updated: {updated}\n" +
  "tags: [handyman/session/current]\n" +
  "---\n" +
  "\n" +
  "# Current Session\n" +
  "\n" +
  "This file is reset when a session closes and its summary moves to `[[history]]`. Keep it updated while working, not only at the end.\n" +
  "\n" +
  "- **Feature in progress:** {in_progress}\n" +
  "- **Start:** {start}\n" +
  "- **Agent:** {agent}\n" +
  "- **Branch:** {branch}\n" +
  "\n" +
  "## Plan\n" +
  "\n" +
  "_Write 3 to 5 bullets before editing code._\n" +
  "\n" +
  "## Log\n" +
  "\n" +
  "_Record significant steps, files changed, decisions, and blockers._\n" +
  "\n" +
  "- ...\n" +
  "\n" +
  "## Next Step\n" +
  "\n" +
  "_If interrupted, the next session starts here._\n" +
  "";

// --- small shared helpers ----------------------------------------------------

function err(msg: string): number {
  process.stderr.write(`error: ${msg}\n`);
  return 1;
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Local calendar date as YYYY-MM-DD (mirrors Python `date.today().isoformat()`). */
function todayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Exact moment as an ISO 8601 timestamp (UTC, e.g. `2026-07-17T12:34:56.789Z`).
 *
 * The calendar `--date` only backdates the human-facing date headings in
 * progress/current.md and history.md; this is the real wall-clock instant a
 * transition happened, which the observer needs for precise duration/throughput
 * metrics. Always the live `now()`, never overridden by `--date`.
 */
function nowIso(): string {
  return new Date().toISOString();
}

interface FeatureMeta extends Record<string, unknown> {
  started_at?: string;
  done_at?: string;
}

/**
 * Stamp an exact-moment metadata field on a feature, preserving any sibling
 * keys already present. Creates the `meta` object on first use; a feature that
 * was never started has no `meta` at all (the schema marks it optional).
 */
function stampMeta(feature: Feature, key: "started_at" | "done_at", value: string): void {
  if (
    feature.meta === undefined ||
    feature.meta === null ||
    typeof feature.meta !== "object" ||
    Array.isArray(feature.meta)
  ) {
    feature.meta = {};
  }
  (feature.meta as FeatureMeta)[key] = value;
}

/**
 * Read a text file and normalize CRLF/CR to LF (Python opens text files in
 * universal-newline mode: `\r\n` and `\r` both become `\n`). Without this,
 * `log`/`next` over a CRLF `current.md` would emit mixed line endings.
 */
function readTextUniversal(path: string): string {
  return readFileSync(path, "utf-8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

// --- feature_list IO ---------------------------------------------------------

function load(workspace: string): [Record<string, unknown>, string] {
  const path = join(workspace, "feature_list.json");
  if (!isFile(path)) {
    throw new FileNotFoundError(path);
  }
  return [loadFeatureList<Record<string, unknown>>(path), path];
}

/** Save with the exact bytes Python writes (indent 2, ensure_ascii false, trailing newline). */
function save(path: string, data: unknown): void {
  saveFeatureList(path, data);
}

/**
 * Save only if the result still satisfies `assets/schemas/feature_list.schema.json`.
 *
 * The single write path: every verb that touches feature_list.json (`add`,
 * `start`, `block`, `unblock`, `acceptance`, `done`) runs the schema before the
 * file, so a malformed result aborts with the file untouched rather than
 * leaving state the `check_schema` gate would reject. `save()` stays private to
 * this function - a second caller would be a second contract.
 *
 * Returns 0 on a successful write, 1 on a validation failure.
 */
function saveValidated(path: string, data: unknown): number {
  const result = validateFeatureList(data);
  if (!result.valid) {
    return err(`refusing to write invalid feature_list.json: ${result.errors.join("; ")}`);
  }
  save(path, data);
  return 0;
}

// --- preflight (read-only stability report run before starting work) ---------

/**
 * Run the read-only preflight stability report before starting work.
 *
 * Best-effort: a preflight problem never blocks starting a feature (preflight
 * only reports and always exits 0). Skipped when there is no harness.config.json
 * (a bare or fixture workspace) or preflight.js is not alongside this script.
 *
 * preflight is now the Node port (#10; scripts/preflight.py was dropped) -
 * invoked as the built artifact `dist/preflight.js`, like the other sibling
 * fan-out targets it in turn calls (`ready` itself is this same module: no
 * recursion, since `ready` is read-only and never calls preflight).
 */
function runPreflight(root: string): void {
  const preflight = join(DIST_DIR, "preflight.js");
  if (!isFile(preflight) || !isFile(join(root, "harness.config.json"))) {
    return;
  }
  try {
    execFileSync("node", [preflight, "--root", root], { stdio: "inherit" });
  } catch {
    // OSError equivalent: best-effort, ignore.
  }
}

// --- post_run hooks ----------------------------------------------------------

interface PostRunContainer {
  post_run?: unknown;
}

function readPostRun(root: string): string[] {
  const cfg = join(root, "harness.config.json");
  try {
    if (isFile(cfg)) {
      const data = loadFeatureList<PostRunContainer>(cfg);
      const steps = data.post_run;
      if (Array.isArray(steps)) {
        return steps.filter((s): s is string => typeof s === "string" && s.trim() !== "");
      }
    }
  } catch {
    // fall through
  }
  let fl = join(root, ".handyman", "feature_list.json");
  if (!isFile(fl)) {
    fl = join(root, "feature_list.json");
  }
  try {
    if (isFile(fl)) {
      const data = loadFeatureList<{ config?: PostRunContainer }>(fl);
      const steps = data.config?.post_run;
      if (Array.isArray(steps)) {
        return steps.filter((s): s is string => typeof s === "string" && s.trim() !== "");
      }
    }
  } catch {
    // fall through
  }
  return [];
}

function runPostRun(root: string): void {
  const steps = readPostRun(root);
  if (steps.length === 0) {
    return;
  }
  for (const cmd of steps) {
    let result: { status: number; stderr: string; stdout: string } | null = null;
    let osErr: string | null = null;
    try {
      const out = execFileSync("bash", ["-c", cmd], {
        cwd: root,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      // execFileSync throws on non-zero; a zero exit means success (no WARN).
      void out;
      continue;
    } catch (exc) {
      const e = exc as NodeJS.ErrnoException & {
        status?: number;
        stdout?: string;
        stderr?: string;
      };
      if (typeof e.status === "number") {
        result = { status: e.status, stderr: e.stderr ?? "", stdout: e.stdout ?? "" };
      } else if (e.code === "ENOENT" || e.code === "EACCES") {
        osErr = e.message;
      } else {
        result = { status: 1, stderr: e.stderr ?? "", stdout: e.stdout ?? "" };
      }
    }
    if (osErr !== null) {
      process.stderr.write(`post_run WARN: could not run '${cmd}': ${osErr}\n`);
      continue;
    }
    if (result !== null && result.status !== 0) {
      const detail = (result.stderr || result.stdout || "").trim().split("\n");
      const tail = detail.length > 0 ? detail[detail.length - 1] : "";
      process.stderr.write(
        `post_run WARN: '${cmd}' exited ${result.status}${tail ? ` - ${tail}` : ""}\n`,
      );
    }
  }
}

// --- feature lookup ----------------------------------------------------------

interface Feature {
  id?: number;
  name?: string;
  title?: string;
  description?: string;
  acceptance?: string[];
  status?: string;
  depends_on?: number[];
  blocked_reason?: string;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

function find(features: Feature[], name: string): Feature | undefined {
  for (const feature of features) {
    if (feature.name === name) {
      return feature;
    }
  }
  return undefined;
}

// --- git / session branch ----------------------------------------------------

/**
 * The current git branch of the project root, or null outside a repo or on a
 * detached HEAD. `symbolic-ref` also works on a fresh repo with no commits
 * yet (unborn HEAD).
 */
function gitBranch(root: string): string | null {
  try {
    const out = execFileSync("git", ["symbolic-ref", "--short", "-q", "HEAD"], {
      cwd: root,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const branch = out.trim();
    return branch.length > 0 ? branch : null;
  } catch {
    return null;
  }
}

function sessionBranch(workspace: string): string | null {
  const current = join(workspace, "progress", "current.md");
  if (!isFile(current)) {
    return null;
  }
  let text: string;
  try {
    text = readTextUniversal(current);
  } catch {
    return null;
  }
  for (const line of text.split("\n")) {
    const stripped = line.trim();
    if (stripped.startsWith("- **Branch:**")) {
      const value = stripped.slice("- **Branch:**".length).trim();
      if (value && value !== "_-_") {
        return value;
      }
      return null;
    }
  }
  return null;
}

/**
 * Advisory fired by the session-mutating verbs when the checked-out branch
 * differs from the one the session recorded in current.md. The workspace is
 * shared across every branch of a checkout, so without the warning the
 * mutation lands silently on another line of work's session state. This is
 * the validate_harness NOTE moved to the moment of mutation. It never blocks:
 * git worktree is the supported answer for parallel branches.
 */
function warnBranchMismatch(root: string, workspace: string): void {
  const recorded = sessionBranch(workspace);
  const actual = gitBranch(root);
  if (recorded && actual && recorded !== actual) {
    process.stderr.write(
      `WARN: session belongs to branch '${recorded}' but '${actual}' is checked out - ` +
        `the change lands on that branch's session; use a git worktree for parallel work.\n`,
    );
  }
}

/**
 * The review verdict for a feature, read from the reviewer's own file.
 *
 * `done` used to assert `APPROVED` unconditionally, which put a claim the
 * tool had not verified into history.md -- the durable record the harness
 * exists to produce. The verdict now comes from `backlog/review_<name>.md`,
 * uppercased. `status:` is the canonical key: it is what the template behind
 * `backlog.js review` stamps, what references/workflow.md documents, and what
 * metrics.ts and sprint.ts already tally. `verdict:` is a fallback for the
 * hand-written reviews that predate that convention. When neither key can be
 * read the marker says so instead of substituting a verdict: an absent review
 * is a fact worth recording, not a blank to fill in.
 */
function reviewVerdict(workspace: string, name: string): string {
  const path = join(workspace, "backlog", `review_${name}.md`);
  if (!isFile(path)) {
    return "NO REVIEW FILE";
  }
  const front = parseFrontmatter(path);
  const verdict = (front.status ?? front.verdict)?.trim();
  return verdict ? verdict.toUpperCase() : "NO VERDICT";
}

// --- current.md writing ------------------------------------------------------

/**
 * Apply a single token replacement across the session template.
 *
 * FIX (handoff bug #1): Python `str.format` does literal substitution, but
 * JS `String.prototype.replace` interprets `$&`, `$$`, `$n` in the replacement
 * and re-scans for further placeholders. A feature name like `x$&y` corrupted
 * current.md. Use `split(token).join(value)` for plain literal substitution.
 */
function fillTemplate(
  feature: string,
  status: string,
  updated: string,
  inProgress: string,
  start: string,
  agent: string,
  branch: string,
): string {
  return SESSION_TEMPLATE.split("{feature}")
    .join(feature)
    .split("{status}")
    .join(status)
    .split("{updated}")
    .join(updated)
    .split("{in_progress}")
    .join(inProgress)
    .split("{start}")
    .join(start)
    .split("{agent}")
    .join(agent)
    .split("{branch}")
    .join(branch);
}

function writeCurrent(
  workspace: string,
  opts: {
    feature: string;
    status: string;
    inProgress: string;
    start: string;
    agent: string;
    today: string;
    branch?: string;
  },
): void {
  const current = join(workspace, "progress", "current.md");
  if (!isDir(dirname(current))) {
    return;
  }
  const text = fillTemplate(
    opts.feature,
    opts.status,
    opts.today,
    opts.inProgress,
    opts.start,
    opts.agent,
    opts.branch ?? "_-_",
  );
  writeFileSync(current, text, "utf-8");
}

function currentText(workspace: string): [string, string] | [null, null] {
  const current = join(workspace, "progress", "current.md");
  if (!isFile(current)) {
    return [null, null];
  }
  return [current, readTextUniversal(current)];
}

function bumpUpdated(text: string, today: string): string {
  const lines = text.split("\n");
  let inFm = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (i === 0 && line.trim() === "---") {
      inFm = true;
      continue;
    }
    if (inFm && line.trim() === "---") {
      break;
    }
    if (inFm && line.startsWith("updated:")) {
      lines[i] = `updated: ${today}`;
      break;
    }
  }
  return lines.join("\n");
}

function sectionBounds(lines: string[], heading: string): [number, number] | [null, null] {
  let start: number | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.trim() === heading) {
      start = i;
      break;
    }
  }
  if (start === null) {
    return [null, null];
  }
  let end = lines.length;
  for (let j = start + 1; j < lines.length; j++) {
    if (lines[j]!.startsWith("## ")) {
      end = j;
      break;
    }
  }
  return [start, end];
}

function appendLog(text: string, bullet: string): string | null {
  const lines = text.split("\n");
  const [start, end] = sectionBounds(lines, "## Log");
  if (start === null) {
    return null;
  }
  const newBullet = `- ${bullet}`;
  for (let k = start + 1; k < end; k++) {
    if (lines[k]!.trim() === "- ...") {
      lines[k] = newBullet;
      return lines.join("\n");
    }
  }
  let insert = end;
  while (insert - 1 > start && lines[insert - 1]!.trim() === "") {
    insert--;
  }
  lines.splice(insert, 0, newBullet);
  return lines.join("\n");
}

function setNextStep(text: string, step: string): string | null {
  const lines = text.split("\n");
  const [start, end] = sectionBounds(lines, "## Next Step");
  if (start === null) {
    return null;
  }
  const rebuilt = [...lines.slice(0, start), lines[start]!, "", step, "", ...lines.slice(end)];
  return rebuilt.join("\n");
}

// --- commands: log / next ----------------------------------------------------

interface CommonArgs {
  date: string | null;
}

function cmdLog(args: CommonArgs & { line: string }, workspace: string, root: string): number {
  warnBranchMismatch(root, workspace);
  const [current, text] = currentText(workspace);
  if (text === null || current === null) {
    return err("progress/current.md not found");
  }
  const today = args.date ?? todayIsoDate();
  const updated = appendLog(bumpUpdated(text, today), args.line);
  if (updated === null) {
    return err("no '## Log' section in progress/current.md");
  }
  writeFileSync(current, updated, "utf-8");
  process.stdout.write(`logged to ${current}\n`);
  return 0;
}

function cmdNext(args: CommonArgs & { step: string }, workspace: string, root: string): number {
  warnBranchMismatch(root, workspace);
  const [current, text] = currentText(workspace);
  if (text === null || current === null) {
    return err("progress/current.md not found");
  }
  const today = args.date ?? todayIsoDate();
  const updated = setNextStep(bumpUpdated(text, today), args.step);
  if (updated === null) {
    return err("no '## Next Step' section in progress/current.md");
  }
  writeFileSync(current, updated, "utf-8");
  process.stdout.write(`next step set in ${current}\n`);
  return 0;
}

// --- archive dependency helpers ----------------------------------------------

function archivedIds(workspace: string): Set<number> {
  const path = join(workspace, "archive", "feature_archive.json");
  if (!isFile(path)) {
    return new Set();
  }
  const ids = new Set<number>();
  try {
    const archive = loadFeatureList<{ sprints?: Record<string, Feature[]> }>(path);
    const sprints = archive.sprints ?? {};
    for (const sprint of Object.values(sprints)) {
      if (!Array.isArray(sprint)) {
        continue;
      }
      for (const f of sprint) {
        if (f && typeof f === "object" && typeof f.id === "number") {
          ids.add(f.id);
        }
      }
    }
  } catch {
    return new Set();
  }
  return ids;
}

function unmetDeps(feature: Feature, features: Feature[], archived: Set<number>): number[] {
  const byId = new Map<number, Feature>();
  for (const f of features) {
    if (typeof f.id === "number") {
      byId.set(f.id, f);
    }
  }
  const unmet: number[] = [];
  for (const dep of feature.depends_on ?? []) {
    if (archived.has(dep)) {
      continue;
    }
    const target = byId.get(dep);
    if (target === undefined || target.status !== "done") {
      unmet.push(dep);
    }
  }
  return unmet;
}

// --- commands: add / ready ---------------------------------------------------

function cmdAdd(
  args: {
    name: string;
    title: string | null;
    description: string | null;
    acceptance: string[] | null;
    dependsOn: number[] | null;
  },
  workspace: string,
  root: string,
): number {
  // The append itself lives in core/featureWrite.ts (feature 60), so this verb
  // and the panel's POST route are two presentations of ONE write instead of
  // two implementations that drift. What stays here is the CLI's own contract:
  // its exact stderr strings and exit codes, which the black-box oracle pins.
  const result = addFeature(workspace, {
    name: args.name,
    acceptance: args.acceptance ?? [],
    title: args.title,
    description: args.description,
    dependsOn: args.dependsOn,
    sprint: readCurrentSprint(root, workspace),
  });
  if (result.status === "duplicate_name") {
    return err(`feature '${args.name}' already exists`);
  }
  if (result.status === "invalid_state") {
    return err(`refusing to write invalid feature_list.json: ${result.errors.join("; ")}`);
  }
  if (result.status === "write_error") {
    return err(`could not write feature_list.json under ${workspace}`);
  }
  process.stdout.write(`added feature ${result.id} '${args.name}' (pending)\n`);
  return 0;
}

function cmdReady(args: { json: boolean }, workspace: string): number {
  const [data] = load(workspace);
  const features = (data.features as Feature[] | undefined) ?? [];
  const archived = archivedIds(workspace);
  const ready = features
    .filter((f) => f.status === "pending" && unmetDeps(f, features, archived).length === 0)
    .sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  if (args.json) {
    process.stdout.write(
      `${JSON.stringify(
        ready.map((f) => ({ id: f.id, name: f.name, title: f.title ?? "" })),
        null,
        2,
      )}\n`,
    );
  } else {
    for (const f of ready) {
      process.stdout.write(`${f.id ?? ""} ${f.name ?? ""}\n`);
    }
  }
  if (ready.length > 0) {
    if (!args.json) {
      process.stdout.write(`ready: ${ready.length} feature(s)\n`);
    }
    return 0;
  }
  const counts: Record<string, number> = {};
  for (const s of VALID_STATUS) {
    counts[s] = features.filter((f) => f.status === s).length;
  }
  process.stderr.write(
    `no ready features (pending: ${counts.pending}, ` +
      `blocked: ${counts.blocked}, in_progress: ${counts.in_progress})\n`,
  );
  return 3;
}

// --- commands: start / block / done -----------------------------------------

function cmdStart(
  args: CommonArgs & { name: string; noPreflight: boolean },
  workspace: string,
  root: string,
): number {
  if (!args.noPreflight) {
    runPreflight(root);
  }
  warnBranchMismatch(root, workspace);
  const [data, path] = load(workspace);
  const features = (data.features as Feature[] | undefined) ?? [];
  const feature = find(features, args.name);
  if (feature === undefined) {
    return err(`feature '${args.name}' not found`);
  }
  const others = features.filter((f) => f.status === "in_progress" && f.name !== args.name);
  if (others.length > 0) {
    const names = others.map((f) => String(f.name ?? "")).join(", ");
    return err(`another feature is already in_progress: ${names}`);
  }
  const unmet = unmetDeps(feature, features, archivedIds(workspace));
  if (unmet.length > 0) {
    process.stderr.write(
      `WARN: feature '${args.name}' has unmet dependencies: ${unmet.join(", ")}\n`,
    );
  }
  feature.status = "in_progress";
  delete feature.blocked_reason;
  // Adopt the open period when the feature predates it: `sprint open` stamped
  // what existed, `add` stamps what is born later, and this covers the feature
  // that existed unlabeled before the period opened. Never overwrites a label.
  if (!("sprint" in feature)) {
    const sid = readCurrentSprint(root, workspace);
    if (sid) {
      feature.sprint = sid;
    }
  }
  stampMeta(feature, "started_at", nowIso());
  const rcStart = saveValidated(path, data);
  if (rcStart !== 0) {
    return rcStart;
  }
  const today = args.date ?? todayIsoDate();
  writeCurrent(workspace, {
    feature: args.name,
    status: "in_progress",
    inProgress: `${args.name} (id ${feature.id ?? ""})`,
    start: today,
    agent: "leader",
    today,
    branch: gitBranch(root) ?? "_-_",
  });
  process.stdout.write(`started feature ${feature.id ?? ""} '${args.name}' (in_progress)\n`);
  return 0;
}

function cmdBlock(args: { name: string; reason: string }, workspace: string): number {
  const [data, path] = load(workspace);
  const features = (data.features as Feature[] | undefined) ?? [];
  const feature = find(features, args.name);
  if (feature === undefined) {
    return err(`feature '${args.name}' not found`);
  }
  feature.status = "blocked";
  feature.blocked_reason = args.reason;
  const rc = saveValidated(path, data);
  if (rc !== 0) {
    return rc;
  }
  process.stdout.write(`blocked feature ${feature.id ?? ""} '${args.name}': ${args.reason}\n`);
  return 0;
}

/**
 * Clear a block: `blocked` -> `pending`, dropping `blocked_reason`.
 *
 * The inverse of `block`, and the reason `worklist` can finally say "unblock
 * blocked work" and mean a command. Refuses any other source status: reviving a
 * feature that was never blocked is a state-machine jump, not an unblock, and
 * silently allowing it would let `unblock` reopen a `done` feature.
 */
function cmdUnblock(args: { name: string }, workspace: string): number {
  const [data, path] = load(workspace);
  const features = (data.features as Feature[] | undefined) ?? [];
  const feature = find(features, args.name);
  if (feature === undefined) {
    return err(`feature '${args.name}' not found`);
  }
  if (feature.status !== "blocked") {
    return err(`feature '${args.name}' is not blocked (status: ${feature.status ?? "unknown"})`);
  }
  feature.status = "pending";
  delete feature.blocked_reason;
  const rc = saveValidated(path, data);
  if (rc !== 0) {
    return rc;
  }
  process.stdout.write(`unblocked feature ${feature.id ?? ""} '${args.name}' (pending)\n`);
  return 0;
}

/**
 * Replace a feature's acceptance list wholesale.
 *
 * Whole-list replacement, not append: an acceptance list is a contract read as
 * a unit, and editing it by hand is what `architecture.md` forbids. At least
 * one `--acceptance` is required so a forgotten flag cannot silently erase the
 * contract - clearing a list is not something you do by omission.
 *
 * A `done` feature is refused. Its acceptance list is the contract a reviewer
 * already signed against, so rewriting it silently would retro-date the terms
 * of a closed verdict and leave `backlog/review_<name>.md` attesting to a
 * contract that no longer exists. `--force` still allows it - sometimes a
 * closed contract really does need a correction - but never silently: the
 * override appends its own `progress/history.md` entry, so the rewrite is a
 * fact in the durable record rather than a diff nobody sees.
 */
function cmdAcceptance(
  args: CommonArgs & { name: string; acceptance: string[]; force: boolean },
  workspace: string,
  root: string,
): number {
  const [data, path] = load(workspace);
  const features = (data.features as Feature[] | undefined) ?? [];
  const feature = find(features, args.name);
  if (feature === undefined) {
    return err(`feature '${args.name}' not found`);
  }
  const wasDone = feature.status === "done";
  if (wasDone && !args.force) {
    return err(
      `feature '${args.name}' is done: its acceptance list is the contract its ` +
        `review signed against. Re-run with --force to rewrite it anyway ` +
        `(the override is recorded in progress/history.md).`,
    );
  }
  const before = Array.isArray(feature.acceptance) ? feature.acceptance.length : 0;
  feature.acceptance = [...args.acceptance];
  const rc = saveValidated(path, data);
  if (rc !== 0) {
    return rc;
  }
  if (wasDone) {
    appendAcceptanceOverride(workspace, root, args, feature, before);
  }
  process.stdout.write(
    `feature ${feature.id ?? ""} '${args.name}': ${args.acceptance.length} acceptance criteria\n`,
  );
  return 0;
}

/**
 * Record a `--force`d acceptance rewrite of a closed feature in history.md.
 *
 * Mirrors the shape `cmdDone` appends so the file stays one scannable format,
 * but says plainly that the feature was not reopened: the entry documents a
 * contract edit, not a state transition.
 */
function appendAcceptanceOverride(
  workspace: string,
  root: string,
  args: CommonArgs & { name: string; acceptance: string[] },
  feature: Feature,
  before: number,
): void {
  const history = join(workspace, "progress", "history.md");
  if (!isFile(history)) {
    return;
  }
  const today = args.date ?? todayIsoDate();
  const branch = sessionBranch(workspace) ?? gitBranch(root) ?? "...";
  appendFileSync(
    history,
    `\n## ${today} - Feature ${feature.id ?? ""}: ${args.name} (acceptance rewritten)\n` +
      `- **Agent:** leader\n` +
      `- **Branch:** ${branch}\n` +
      `- **Change:** acceptance list rewritten on a done feature via --force ` +
      `(${before} -> ${args.acceptance.length} criteria)\n` +
      `- **Warning:** backlog/review_${args.name}.md signed the previous contract\n` +
      `- **Closure:** unchanged (still done)\n`,
  );
}

function cmdDone(
  args: CommonArgs & { name: string; verifier: string | null; tools: string | null },
  workspace: string,
  root: string,
): number {
  const [data, path] = load(workspace);
  const features = (data.features as Feature[] | undefined) ?? [];
  const feature = find(features, args.name);
  if (feature === undefined) {
    return err(`feature '${args.name}' not found`);
  }
  warnBranchMismatch(root, workspace);

  const verifier = args.verifier ? args.verifier : join(root, "init.sh");
  if (!isFile(verifier)) {
    return err(`verifier not found: ${verifier}`);
  }
  let verifierExit = 0;
  try {
    execFileSync("bash", [verifier], {
      cwd: root,
      stdio: ["ignore", "ignore", "ignore"],
    });
  } catch (exc) {
    const e = exc as NodeJS.ErrnoException & { status?: number };
    verifierExit = typeof e.status === "number" ? e.status : 1;
  }
  if (verifierExit !== 0) {
    return err(
      `verifier failed (exit ${verifierExit}); ` +
        `feature '${args.name}' stays ${feature.status ?? ""}`,
    );
  }

  feature.status = "done";
  delete feature.blocked_reason;
  stampMeta(feature, "done_at", nowIso());
  const rcDone = saveValidated(path, data);
  if (rcDone !== 0) {
    return rcDone;
  }

  const today = args.date ?? todayIsoDate();
  const history = join(workspace, "progress", "history.md");
  if (isFile(history)) {
    const tools = args.tools && args.tools.trim() !== "" ? args.tools.trim() : "...";
    const branch = sessionBranch(workspace) ?? gitBranch(root) ?? "...";
    // Compact entry: what closed, where the evidence lives, and the gate.
    // The old 8-field form auto-degraded to "Plan: ..." placeholders because
    // nothing filled it; the narrative belongs to backlog/impl_<name>.md.
    // `Branch` and `Tools` stay: sprint.js renderDoc aggregates both.
    const entry =
      `\n## ${today} - Feature ${feature.id ?? ""}: ${args.name}\n` +
      `- **Branch:** ${branch}\n` +
      `- **Tools:** ${tools}\n` +
      `- **Evidence:** backlog/impl_${args.name}.md · review: ` +
      `${reviewVerdict(workspace, args.name)} -> backlog/review_${args.name}.md\n` +
      `- **Verification:** verifier exit 0 · closure done\n`;
    appendFileSync(history, entry);
  }
  writeCurrent(workspace, {
    feature: "none",
    status: "idle",
    inProgress: "_none_",
    start: "_-_",
    agent: "_-_",
    today,
  });
  process.stdout.write(`closed feature ${feature.id ?? ""} '${args.name}' (done)\n`);
  runPostRun(root);
  return 0;
}

/** Append a string to a file (mirrors Python `open(..., "a").write`). */
function appendFileSync(path: string, text: string): void {
  const existing = isFile(path) ? readTextUniversal(path) : "";
  writeFileSync(path, existing + text, "utf-8");
}

// --- argparse-compatible CLI -------------------------------------------------

/** Raised when feature_list.json is missing (mirrors Python FileNotFoundError). */
class FileNotFoundError extends Error {
  readonly path: string;
  constructor(path: string) {
    super(path);
    this.path = path;
  }
}

function mainUsage(prog: string): string {
  return `usage: ${prog} [-h] [--root ROOT] {add,start,block,unblock,acceptance,done,ready,log,next} ...\n`;
}

/**
 * argparse `parser.error(...)`: usage to stderr, `prog: error: msg`, exit 2.
 * Mirrors the exit-2 usage shim shared across the TS ports.
 */
function exitUsage(usage: string, errorProg: string, message: string): never {
  process.stderr.write(usage);
  process.stderr.write(`${errorProg}: error: ${message}\n`);
  process.exit(2);
}

/**
 * True when a token reads as an option, not a positional (argparse heuristic).
 *
 * Tokens that look like negative numbers are positionals: argparse's
 * `_negative_number_matcher` (`^-\d+$|^-\d*\.\d+$`) exempts them because no
 * registered option string here looks like a negative number. FIX (handoff
 * finding): argparse also treats a token containing a space as a non-option
 * (`' ' in arg_string`), so `--reason "- wait"` classifies as a positional and
 * does NOT consume the next argv token as its value.
 */
function looksLikeOption(token: string): boolean {
  return (
    token.length > 1 &&
    token.startsWith("-") &&
    !/^-\d+$|^-\d*\.\d+$/.test(token) &&
    !token.includes(" ")
  );
}

/** Consume the value of `--opt VALUE`; argparse errors when it is missing. */
function optionValue(
  argv: string[],
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

function printMainHelp(prog: string): never {
  process.stdout.write(
    `usage: ${prog} [-h] [--root ROOT] {add,start,block,unblock,acceptance,done,ready,log,next} ...

Handyman feature-state CLI. Atomic transitions over feature_list.json so agents
never hand-edit the state machine (the root cause of split-scope, two_in_progress,
and history-drift risks documented in references/checklists.md). Operations: add
Append a new pending feature (auto-incremented id). start Mark a feature
in_progress, enforcing the single_in_progress invariant, and refresh
progress/current.md. block Mark a feature blocked and record the reason. unblock
Clear a block: blocked -> pending, dropping blocked_reason. acceptance Replace a
feature's acceptance list wholesale (at least one --acceptance required; a done
feature is refused unless --force, which is recorded in history.md). done Run
the verifier; only on exit 0 mark the feature done, append a rich
progress/history.md entry, and reset progress/current.md. ready List the pending
features whose depends_on are all satisfied (done or archived). The
unattended-loop work detector: exit 0 means claimable work exists, exit 3 means
the backlog is drained. log Append a bullet to the Log section of
progress/current.md. next Set the Next Step section of progress/current.md.

positional arguments:
  {add,start,block,unblock,acceptance,done,ready,log,next}

options:
  -h, --help            show this help message and exit
  --root ROOT           Project root holding the harness (default: cwd).
`,
  );
  process.exit(0);
}

interface ParsedArgs {
  root: string;
  command: string;
  // per-command fields (only the relevant ones are set)
  name?: string;
  title?: string | null;
  description?: string | null;
  acceptance?: string[];
  dependsOn?: number[];
  noPreflight?: boolean;
  reason?: string;
  force?: boolean;
  verifier?: string | null;
  tools?: string | null;
  json?: boolean;
  line?: string;
  step?: string;
  date?: string | null;
}

const COMMANDS = ["add", "start", "block", "unblock", "acceptance", "done", "ready", "log", "next"];

/** Parse argv like the Python `build_parser()` (exit 2 on usage, 0 on help). */
function parseArgs(argv: string[], prog: string): ParsedArgs {
  const usage = mainUsage(prog);
  let root = ".";
  let command: string | null = null;
  let rest: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "-h" || arg === "--help") {
      printMainHelp(prog);
    } else if (arg === "--root") {
      [root, i] = optionValue(argv, i, "--root", usage, prog);
    } else if (arg.startsWith("--root=")) {
      root = arg.slice("--root=".length);
    } else if (arg !== "--" && looksLikeOption(arg)) {
      exitUsage(usage, prog, `unrecognized arguments: ${arg}`);
    } else {
      if (!COMMANDS.includes(arg)) {
        exitUsage(
          usage,
          prog,
          `argument command: invalid choice: '${arg}' (choose from 'add', 'start', 'block', 'unblock', 'acceptance', 'done', 'ready', 'log', 'next')`,
        );
      }
      command = arg;
      rest = argv.slice(i + 1);
      break;
    }
  }

  if (command === null) {
    exitUsage(usage, prog, "the following arguments are required: command");
  }

  return parseSubArgs(command, rest, root, prog);
}

function parseSubArgs(command: string, rest: string[], root: string, prog: string): ParsedArgs {
  const errorProg = `${prog} ${command}`;
  const base: ParsedArgs = { root, command };

  if (command === "add") {
    return parseAdd(rest, base, errorProg);
  }
  if (command === "start") {
    return parseStart(rest, base, errorProg);
  }
  if (command === "block") {
    return parseBlock(rest, base, errorProg);
  }
  if (command === "unblock") {
    return parseUnblock(rest, base, errorProg);
  }
  if (command === "acceptance") {
    return parseAcceptance(rest, base, errorProg);
  }
  if (command === "done") {
    return parseDone(rest, base, errorProg);
  }
  if (command === "ready") {
    return parseReady(rest, base, errorProg);
  }
  if (command === "log") {
    return parseLog(rest, base, errorProg);
  }
  return parseNext(rest, base, errorProg);
}

function parseAdd(rest: string[], base: ParsedArgs, errorProg: string): ParsedArgs {
  const usage = `usage: ${errorProg} [-h] [--name NAME] [--title TITLE] [--description DESCRIPTION] [--acceptance ACCEPTANCE] [--depends-on DEPENDS_ON]\n`;
  let name: string | null = null;
  let title: string | null = null;
  let description: string | null = null;
  const acceptance: string[] = [];
  const dependsOn: number[] = [];
  const extras: string[] = [];
  let positionalOnly = false;

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (!positionalOnly && (arg === "-h" || arg === "--help")) {
      process.stdout.write(
        `${usage}options:
  -h, --help            show this help message and exit
  --name NAME
  --title TITLE
  --description DESCRIPTION
  --acceptance ACCEPTANCE
                        Acceptance criterion (repeatable).
  --depends-on DEPENDS_ON
                        Feature id that must be done first (repeatable).
`,
      );
      process.exit(0);
    } else if (!positionalOnly && arg === "--") {
      positionalOnly = true;
    } else if (!positionalOnly && arg === "--name") {
      [name, i] = optionValue(rest, i, "--name", usage, errorProg);
    } else if (!positionalOnly && arg.startsWith("--name=")) {
      name = arg.slice("--name=".length);
    } else if (!positionalOnly && arg === "--title") {
      [title, i] = optionValue(rest, i, "--title", usage, errorProg);
    } else if (!positionalOnly && arg.startsWith("--title=")) {
      title = arg.slice("--title=".length);
    } else if (!positionalOnly && arg === "--description") {
      [description, i] = optionValue(rest, i, "--description", usage, errorProg);
    } else if (!positionalOnly && arg.startsWith("--description=")) {
      description = arg.slice("--description=".length);
    } else if (!positionalOnly && arg === "--acceptance") {
      const [v, next] = optionValue(rest, i, "--acceptance", usage, errorProg);
      acceptance.push(v);
      i = next;
    } else if (!positionalOnly && arg.startsWith("--acceptance=")) {
      acceptance.push(arg.slice("--acceptance=".length));
    } else if (!positionalOnly && arg === "--depends-on") {
      const [v, next] = optionValue(rest, i, "--depends-on", usage, errorProg);
      dependsOn.push(parseIntOrError(v, "--depends-on", usage, errorProg));
      i = next;
    } else if (!positionalOnly && arg.startsWith("--depends-on=")) {
      dependsOn.push(
        parseIntOrError(arg.slice("--depends-on=".length), "--depends-on", usage, errorProg),
      );
    } else if (!positionalOnly && looksLikeOption(arg)) {
      extras.push(arg);
    } else {
      extras.push(arg);
    }
  }

  if (name === null) {
    exitUsage(usage, errorProg, "the following arguments are required: --name");
  }
  if (extras.length > 0) {
    exitUsage(mainUsage(prog0()), errorProg, `unrecognized arguments: ${extras.join(" ")}`);
  }
  return {
    ...base,
    name,
    title,
    description,
    acceptance,
    dependsOn: dependsOn.length > 0 ? dependsOn : undefined,
  };
}

function parseIntOrError(value: string, option: string, usage: string, errorProg: string): number {
  const n = Number(value);
  if (!/^-?\d+$/.test(value)) {
    exitUsage(usage, errorProg, `argument ${option}: invalid int value: '${value}'`);
  }
  return n;
}

function prog0(): string {
  return basename(process.argv[1] ?? "feature.js");
}

function parseStart(rest: string[], base: ParsedArgs, errorProg: string): ParsedArgs {
  const usage = `usage: ${errorProg} [-h] [--no-preflight] name\n`;
  return parseSimplePositional(
    rest,
    base,
    errorProg,
    usage,
    (name, noPreflight, date) => ({
      ...base,
      name,
      noPreflight,
      date,
    }),
    "--no-preflight",
  );
}

function parseBlock(rest: string[], base: ParsedArgs, errorProg: string): ParsedArgs {
  const usage = `usage: ${errorProg} [-h] --reason REASON name\n`;
  let name: string | null = null;
  let reason: string | null = null;
  const extras: string[] = [];
  let positionalOnly = false;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (!positionalOnly && (arg === "-h" || arg === "--help")) {
      process.stdout.write(
        `${usage}options:\n  -h, --help  show this help message and exit\n  --reason REASON\n`,
      );
      process.exit(0);
    } else if (!positionalOnly && arg === "--") {
      positionalOnly = true;
    } else if (!positionalOnly && arg === "--reason") {
      [reason, i] = optionValue(rest, i, "--reason", usage, errorProg);
    } else if (!positionalOnly && arg.startsWith("--reason=")) {
      reason = arg.slice("--reason=".length);
    } else if (!positionalOnly && looksLikeOption(arg)) {
      extras.push(arg);
    } else if (name === null) {
      name = arg;
    } else {
      extras.push(arg);
    }
  }
  if (reason === null) {
    exitUsage(usage, errorProg, "the following arguments are required: --reason");
  }
  if (name === null) {
    exitUsage(usage, errorProg, "the following arguments are required: name");
  }
  if (extras.length > 0) {
    exitUsage(mainUsage(prog0()), errorProg, `unrecognized arguments: ${extras.join(" ")}`);
  }
  return { ...base, name, reason };
}

function parseUnblock(rest: string[], base: ParsedArgs, errorProg: string): ParsedArgs {
  const usage = `usage: ${errorProg} [-h] name\n`;
  let name: string | null = null;
  const extras: string[] = [];
  let positionalOnly = false;
  for (const arg of rest) {
    if (!positionalOnly && (arg === "-h" || arg === "--help")) {
      process.stdout.write(`${usage}options:\n  -h, --help  show this help message and exit\n`);
      process.exit(0);
    } else if (!positionalOnly && arg === "--") {
      positionalOnly = true;
    } else if (!positionalOnly && looksLikeOption(arg)) {
      extras.push(arg);
    } else if (name === null) {
      name = arg;
    } else {
      extras.push(arg);
    }
  }
  if (name === null) {
    exitUsage(usage, errorProg, "the following arguments are required: name");
  }
  if (extras.length > 0) {
    exitUsage(mainUsage(prog0()), errorProg, `unrecognized arguments: ${extras.join(" ")}`);
  }
  return { ...base, name };
}

function parseAcceptance(rest: string[], base: ParsedArgs, errorProg: string): ParsedArgs {
  const usage = `usage: ${errorProg} [-h] --acceptance ACCEPTANCE [--acceptance ACCEPTANCE ...] [--force] name\n`;
  let name: string | null = null;
  const acceptance: string[] = [];
  const extras: string[] = [];
  let force = false;
  let positionalOnly = false;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (!positionalOnly && (arg === "-h" || arg === "--help")) {
      process.stdout.write(
        `${usage}options:\n  -h, --help  show this help message and exit\n  --acceptance ACCEPTANCE\n              Acceptance criterion (repeatable). Replaces the whole list.\n  --force     Rewrite the contract of a done feature anyway; the override is\n              recorded in progress/history.md.\n`,
      );
      process.exit(0);
    } else if (!positionalOnly && arg === "--") {
      positionalOnly = true;
    } else if (!positionalOnly && arg === "--force") {
      force = true;
    } else if (!positionalOnly && arg === "--date") {
      // Accepted for the same reason start/done/log/next accept it: --force
      // appends a dated history.md entry, and a dated record needs a pinnable
      // date to be testable.
      [, i] = optionValue(rest, i, "--date", usage, errorProg);
      base.date = rest[i]!;
    } else if (!positionalOnly && arg.startsWith("--date=")) {
      base.date = arg.slice("--date=".length);
    } else if (!positionalOnly && arg === "--acceptance") {
      const [v, next] = optionValue(rest, i, "--acceptance", usage, errorProg);
      acceptance.push(v);
      i = next;
    } else if (!positionalOnly && arg.startsWith("--acceptance=")) {
      acceptance.push(arg.slice("--acceptance=".length));
    } else if (!positionalOnly && looksLikeOption(arg)) {
      extras.push(arg);
    } else if (name === null) {
      name = arg;
    } else {
      extras.push(arg);
    }
  }
  // Required, not optional-with-empty-default: a forgotten flag must not read as
  // "clear the acceptance list".
  if (acceptance.length === 0) {
    exitUsage(usage, errorProg, "the following arguments are required: --acceptance");
  }
  if (name === null) {
    exitUsage(usage, errorProg, "the following arguments are required: name");
  }
  if (extras.length > 0) {
    exitUsage(mainUsage(prog0()), errorProg, `unrecognized arguments: ${extras.join(" ")}`);
  }
  return { ...base, name, acceptance, force };
}

function parseDone(rest: string[], base: ParsedArgs, errorProg: string): ParsedArgs {
  const usage = `usage: ${errorProg} [-h] [--verifier VERIFIER] [--tools TOOLS] name\n`;
  let name: string | null = null;
  let verifier: string | null = null;
  let tools: string | null = null;
  const extras: string[] = [];
  let positionalOnly = false;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (!positionalOnly && (arg === "-h" || arg === "--help")) {
      process.stdout.write(
        `${usage}options:\n  -h, --help            show this help message and exit\n  --verifier VERIFIER\n  --tools TOOLS\n`,
      );
      process.exit(0);
    } else if (!positionalOnly && arg === "--") {
      positionalOnly = true;
    } else if (!positionalOnly && arg === "--verifier") {
      [verifier, i] = optionValue(rest, i, "--verifier", usage, errorProg);
    } else if (!positionalOnly && arg.startsWith("--verifier=")) {
      verifier = arg.slice("--verifier=".length);
    } else if (!positionalOnly && arg === "--tools") {
      [tools, i] = optionValue(rest, i, "--tools", usage, errorProg);
    } else if (!positionalOnly && arg.startsWith("--tools=")) {
      tools = arg.slice("--tools=".length);
    } else if (!positionalOnly && arg === "--date") {
      [, i] = optionValue(rest, i, "--date", usage, errorProg);
      base.date = rest[i];
    } else if (!positionalOnly && arg.startsWith("--date=")) {
      base.date = arg.slice("--date=".length);
    } else if (!positionalOnly && looksLikeOption(arg)) {
      extras.push(arg);
    } else if (name === null) {
      name = arg;
    } else {
      extras.push(arg);
    }
  }
  if (name === null) {
    exitUsage(usage, errorProg, "the following arguments are required: name");
  }
  if (extras.length > 0) {
    exitUsage(mainUsage(prog0()), errorProg, `unrecognized arguments: ${extras.join(" ")}`);
  }
  return { ...base, name, verifier, tools };
}

function parseReady(rest: string[], base: ParsedArgs, errorProg: string): ParsedArgs {
  const usage = `usage: ${errorProg} [-h] [--json]\n`;
  let json = false;
  const extras: string[] = [];
  let positionalOnly = false;
  for (const arg of rest) {
    if (!positionalOnly && (arg === "-h" || arg === "--help")) {
      process.stdout.write(
        `${usage}options:\n  -h, --help  show this help message and exit\n  --json      Print the ready list as JSON only.\n`,
      );
      process.exit(0);
    } else if (!positionalOnly && arg === "--") {
      positionalOnly = true;
    } else if (!positionalOnly && arg === "--json") {
      json = true;
    } else if (!positionalOnly && looksLikeOption(arg)) {
      extras.push(arg);
    } else {
      extras.push(arg);
    }
  }
  if (extras.length > 0) {
    exitUsage(mainUsage(prog0()), errorProg, `unrecognized arguments: ${extras.join(" ")}`);
  }
  return { ...base, json };
}

function parseLog(rest: string[], base: ParsedArgs, errorProg: string): ParsedArgs {
  const usage = `usage: ${errorProg} [-h] line\n`;
  let line: string | null = null;
  const extras: string[] = [];
  let positionalOnly = false;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (!positionalOnly && (arg === "-h" || arg === "--help")) {
      process.stdout.write(`${usage}options:\n  -h, --help  show this help message and exit\n`);
      process.exit(0);
    } else if (!positionalOnly && arg === "--") {
      positionalOnly = true;
    } else if (!positionalOnly && arg === "--date") {
      [, i] = optionValue(rest, i, "--date", usage, errorProg);
      base.date = rest[i]!;
    } else if (!positionalOnly && arg.startsWith("--date=")) {
      base.date = arg.slice("--date=".length);
    } else if (!positionalOnly && looksLikeOption(arg)) {
      extras.push(arg);
    } else if (line === null) {
      line = arg;
    } else {
      extras.push(arg);
    }
  }
  if (line === null) {
    exitUsage(usage, errorProg, "the following arguments are required: line");
  }
  if (extras.length > 0) {
    exitUsage(mainUsage(prog0()), errorProg, `unrecognized arguments: ${extras.join(" ")}`);
  }
  return { ...base, line };
}

function parseNext(rest: string[], base: ParsedArgs, errorProg: string): ParsedArgs {
  const usage = `usage: ${errorProg} [-h] step\n`;
  let step: string | null = null;
  const extras: string[] = [];
  let positionalOnly = false;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (!positionalOnly && (arg === "-h" || arg === "--help")) {
      process.stdout.write(`${usage}options:\n  -h, --help  show this help message and exit\n`);
      process.exit(0);
    } else if (!positionalOnly && arg === "--") {
      positionalOnly = true;
    } else if (!positionalOnly && arg === "--date") {
      [, i] = optionValue(rest, i, "--date", usage, errorProg);
      base.date = rest[i]!;
    } else if (!positionalOnly && arg.startsWith("--date=")) {
      base.date = arg.slice("--date=".length);
    } else if (!positionalOnly && looksLikeOption(arg)) {
      extras.push(arg);
    } else if (step === null) {
      step = arg;
    } else {
      extras.push(arg);
    }
  }
  if (step === null) {
    exitUsage(usage, errorProg, "the following arguments are required: step");
  }
  if (extras.length > 0) {
    exitUsage(mainUsage(prog0()), errorProg, `unrecognized arguments: ${extras.join(" ")}`);
  }
  return { ...base, step };
}

/** Shared parser for `start`-style: one positional + optional flag + hidden --date. */
function parseSimplePositional(
  rest: string[],
  base: ParsedArgs,
  errorProg: string,
  usage: string,
  build: (name: string, flagValue: boolean, date: string | null) => ParsedArgs,
  flagName: string,
): ParsedArgs {
  let name: string | null = null;
  let flagValue = false;
  const extras: string[] = [];
  let positionalOnly = false;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (!positionalOnly && (arg === "-h" || arg === "--help")) {
      process.stdout.write(
        `${usage}options:\n  -h, --help  show this help message and exit\n  ${flagName}\n`,
      );
      process.exit(0);
    } else if (!positionalOnly && arg === "--") {
      positionalOnly = true;
    } else if (!positionalOnly && arg === flagName) {
      flagValue = true;
    } else if (!positionalOnly && arg === "--date") {
      [, i] = optionValue(rest, i, "--date", usage, errorProg);
      base.date = rest[i];
    } else if (!positionalOnly && arg.startsWith("--date=")) {
      base.date = arg.slice("--date=".length);
    } else if (!positionalOnly && looksLikeOption(arg)) {
      extras.push(arg);
    } else if (name === null) {
      name = arg;
    } else {
      extras.push(arg);
    }
  }
  if (name === null) {
    exitUsage(usage, errorProg, "the following arguments are required: name");
  }
  if (extras.length > 0) {
    exitUsage(mainUsage(prog0()), errorProg, `unrecognized arguments: ${extras.join(" ")}`);
  }
  return build(name, flagValue, base.date ?? null);
}

// --- dispatch ----------------------------------------------------------------

function dispatch(args: ParsedArgs, workspace: string, root: string): number {
  try {
    switch (args.command) {
      case "add":
        return cmdAdd(
          {
            name: args.name!,
            title: args.title ?? null,
            description: args.description ?? null,
            acceptance: args.acceptance ?? [],
            dependsOn: args.dependsOn ?? null,
          },
          workspace,
          root,
        );
      case "start":
        return cmdStart(
          { name: args.name!, noPreflight: args.noPreflight ?? false, date: args.date ?? null },
          workspace,
          root,
        );
      case "block":
        return cmdBlock({ name: args.name!, reason: args.reason! }, workspace);
      case "unblock":
        return cmdUnblock({ name: args.name! }, workspace);
      case "acceptance":
        return cmdAcceptance(
          {
            name: args.name!,
            acceptance: args.acceptance ?? [],
            force: args.force ?? false,
            date: args.date ?? null,
          },
          workspace,
          root,
        );
      case "done":
        return cmdDone(
          {
            name: args.name!,
            verifier: args.verifier ?? null,
            tools: args.tools ?? null,
            date: args.date ?? null,
          },
          workspace,
          root,
        );
      case "ready":
        return cmdReady({ json: args.json ?? false }, workspace);
      case "log":
        return cmdLog({ line: args.line!, date: args.date ?? null }, workspace, root);
      case "next":
        return cmdNext({ step: args.step!, date: args.date ?? null }, workspace, root);
      default:
        return 2;
    }
  } catch (exc) {
    if (exc instanceof FileNotFoundError) {
      return err(`feature_list.json not found: ${exc.path}`);
    }
    return err(exc instanceof Error ? exc.message : String(exc));
  }
}

export function main(argv: string[]): number {
  const prog = basename(process.argv[1] ?? "feature.js");
  const args = parseArgs(argv, prog);
  // Python `Path(args.root).resolve()`: absolutize then resolve symlinks.
  // FIX (handoff finding): realpath AFTER absolutizing (Node `resolve` collapses
  // `..` lexically; Python `Path.resolve()` resolves symlinks first). This keeps
  // root paths with symlinks consistent with the oracle.
  const root = resolveRoot(args.root);
  if (!isDir(root)) {
    return err(`root is not a directory: ${root}`);
  }
  const workspace = resolveWorkspace(root);
  const rc = dispatch(args, workspace, root);
  // Observation shape: stable machine-readable last line. --json is exempt.
  const jsonMode = args.command === "ready" && (args.json ?? false);
  if (!jsonMode) {
    if (rc === 3) {
      process.stdout.write(
        "next: add features, finish their dependencies, or unblock blocked work\n",
      );
    }
    const status = rc === 0 ? "ok" : rc === 3 ? "warn" : "error";
    process.stdout.write(`status: ${status}\n`);
  }
  return rc;
}

/**
 * Absolutize then resolve symlinks, mirroring Python `Path.resolve()` (Python
 * 3.6+ resolves symlinks non-strictly; a missing path is still absolutized).
 */
function resolveRoot(rootArg: string): string {
  let root = rootArg;
  if (!root.startsWith("/")) {
    root = join(process.cwd(), root);
  }
  try {
    root = realpathSync(root);
  } catch {
    // keep the absolutized path; the is-dir check rejects missing paths
  }
  return root;
}

// Run when executed directly (mirrors Python `if __name__ == "__main__"`).
// FIX (handoff bug #3): the `file://${argv[1]}` guard fails when the script is
// reached via a symlink or a path containing characters needing escaping. Use
// realpath on both sides of the comparison so symlinks/spaces match correctly.
if (import.meta.url === entryGuardUrl()) {
  process.exit(main(process.argv.slice(2)));
}

function entryGuardUrl(): string {
  try {
    return `file://${realpathSync(fileURLToPath(import.meta.url))}`;
  } catch {
    return import.meta.url;
  }
}

#!/usr/bin/env node
/**
 * Handyman backlog-entry generator.
 *
 * Faithful port of `scripts/backlog.py`. Instantiates a backlog report from
 * its bundled template with the exact, per-type YAML frontmatter the contract
 * requires, so agents stop hand-stamping
 * `feature`/`status`/`role`/`updated`/`tags` (the drift risk documented in
 * docs/analisis-acciones-deterministas-por-capa.md and enforced nowhere else).
 *
 * Operations:
 *   impl     Create backlog/impl_<feature>.md    (role: implementer).
 *   review   Create backlog/review_<feature>.md  (role: reviewer; --status).
 *   explore  Create backlog/explore_<topic>.md   (role: explorer).
 *
 * Usage:
 *   node dist/backlog.js [--root PATH] impl FEATURE
 *   node dist/backlog.js [--root PATH] review FEATURE [--status approved|changes_requested] [--force]
 *   node dist/backlog.js [--root PATH] explore TOPIC
 *
 * The generator never overwrites an existing entry: it leaves project-owned
 * content untouched and reports the path. `review --force` is the one exception,
 * and it is not an overwrite: it re-stamps the verdict tokens and keeps the body,
 * so the CHANGES_REQUESTED -> APPROVED cycle is a command instead of a hand-edit.
 * Without `--force`, a request that contradicts the verdict on disk now exits 1
 * instead of passing silently. Exit codes: 0 ok, 1 error, 2 usage
 * (argparse semantics: usage text on stderr, exit 2).
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveWorkspace } from "./core/index.js";

/**
 * Bundled templates directory. Both `src/` (vitest) and `dist/` (built) sit
 * one level below the package root, so `../assets` is correct in either
 * location (mirrors Python `Path(__file__).resolve().parent.parent / "assets"`).
 */
const ASSETS_DIR = fileURLToPath(new URL("../assets", import.meta.url));

const COMMANDS = ["impl", "review", "explore"] as const;
type Command = (typeof COMMANDS)[number];

type ReviewStatus = "approved" | "changes_requested";

interface ParsedArgs {
  root: string;
  command: Command;
  /** The `feature` (impl/review) or `topic` (explore) positional. */
  name: string;
  status: ReviewStatus;
  date: string | null;
  /** `review --force`: re-stamp an existing report's verdict instead of refusing. */
  force: boolean;
}

/** Raised by `render` when a bundled template is missing (FileNotFoundError). */
class TemplateNotFoundError extends Error {
  readonly path: string;

  constructor(path: string) {
    super(path);
    this.path = path;
  }
}

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

/** Characters Python `str.strip()` removes (BMP set where `str.isspace()` is true). */
const PY_WHITESPACE = new Set([
  "\t",
  "\n",
  "\u000b",
  "\f",
  "\r",
  "\u001c",
  "\u001d",
  "\u001e",
  "\u001f",
  " ",
  "\u0085",
  "\u00a0",
  "\u1680",
  "\u2000",
  "\u2001",
  "\u2002",
  "\u2003",
  "\u2004",
  "\u2005",
  "\u2006",
  "\u2007",
  "\u2008",
  "\u2009",
  "\u200a",
  "\u2028",
  "\u2029",
  "\u202f",
  "\u205f",
  "\u3000",
]);

/** Python `str.strip()` (no arguments): trim Python-whitespace from both ends. */
function pyStrip(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && PY_WHITESPACE.has(value[start] as string)) {
    start++;
  }
  while (end > start && PY_WHITESPACE.has(value[end - 1] as string)) {
    end--;
  }
  return value.slice(start, end);
}

/**
 * Python `repr()` of a string, for error messages (`f"{value!r}"`). Covers the
 * practical cases: quote selection, backslash/quote escapes, and `\xNN` for
 * Latin-1 control characters; printable non-ASCII stays literal.
 */
function pyRepr(value: string): string {
  const quote = value.includes("'") && !value.includes('"') ? '"' : "'";
  let out = quote;
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === "\\" || ch === quote) {
      out += `\\${ch}`;
    } else if (ch === "\n") {
      out += "\\n";
    } else if (ch === "\r") {
      out += "\\r";
    } else if (ch === "\t") {
      out += "\\t";
    } else if (code < 0x20 || (code >= 0x7f && code <= 0xa0)) {
      out += `\\x${code.toString(16).padStart(2, "0")}`;
    } else {
      out += ch;
    }
  }
  return out + quote;
}

/**
 * A backlog identifier becomes a filename; keep it inside backlog/.
 *
 * Reject empty names and any path-traversal characters so `explore ../../x`
 * cannot escape the workspace.
 */
function safeSlug(value: string): string | null {
  const slug = pyStrip(value);
  if (slug === "") {
    return null;
  }
  if (slug.includes("/") || slug.includes("\\") || slug.startsWith(".") || slug.includes("..")) {
    return null;
  }
  return slug;
}

// --- argparse-compatible CLI (usage errors: usage text to stderr, exit 2) ----

function mainUsage(prog: string): string {
  return `usage: ${prog} [-h] [--root ROOT] {impl,review,explore} ...\n`;
}

function subUsage(prog: string, command: Command): string {
  if (command === "impl") {
    return `usage: ${prog} impl [-h] feature\n`;
  }
  if (command === "review") {
    return `usage: ${prog} review [-h] [--status {approved,changes_requested}] [--force] feature\n`;
  }
  return `usage: ${prog} explore [-h] topic\n`;
}

/** argparse `parser.error(...)`: usage to stderr, `prog: error: msg`, exit 2. */
function exitUsage(usage: string, errorProg: string, message: string): never {
  process.stderr.write(usage);
  process.stderr.write(`${errorProg}: error: ${message}\n`);
  process.exit(2);
}

function printMainHelp(prog: string): never {
  process.stdout.write(
    `usage: ${prog} [-h] [--root ROOT] {impl,review,explore} ...

Handyman backlog-entry generator. Instantiates a backlog report from its
bundled template with the exact, per-type YAML frontmatter the contract
requires, so agents stop hand-stamping
\`feature\`/\`status\`/\`role\`/\`updated\`/\`tags\` (the drift risk documented in
docs/analisis-acciones-deterministas-por-capa.md and enforced nowhere else).
Operations: impl Create backlog/impl_<feature>.md (role: implementer). review
Create backlog/review_<feature>.md (role: reviewer; --status). explore Create
backlog/explore_<topic>.md (role: explorer). Usage: node dist/backlog.js
[--root PATH] impl FEATURE node dist/backlog.js [--root PATH] review FEATURE
[--status approved|changes_requested] [--force] node dist/backlog.js [--root
PATH] explore TOPIC The generator never overwrites an existing entry: it leaves
project-owned content untouched and reports the path. review --force re-stamps
the verdict tokens of an existing report and keeps the body, so the
CHANGES_REQUESTED -> APPROVED cycle is a command instead of a hand-edit; without
it, a --status that contradicts the file exits 1. Exit codes: 0 ok, 1
error, 2 usage.

positional arguments:
  {impl,review,explore}
    impl                Create an implementer report.
    review              Create a reviewer verdict.
    explore             Create an exploration report.

options:
  -h, --help            show this help message and exit
  --root ROOT           Project root holding the harness (default: cwd).
`,
  );
  process.exit(0);
}

function printSubHelp(prog: string, command: Command): never {
  const usage = subUsage(prog, command);
  if (command === "review") {
    process.stdout.write(`${usage}
positional arguments:
  feature

options:
  -h, --help            show this help message and exit
  --status {approved,changes_requested}
                        Review verdict (default: approved).
  --force               Reissue an existing report: re-stamp the verdict tokens
                        and keep the body. Without it, a --status that
                        contradicts the file exits 1.
`);
  } else {
    process.stdout.write(`${usage}
positional arguments:
  ${command === "explore" ? "topic" : "feature"}

options:
  -h, --help  show this help message and exit
`);
  }
  process.exit(0);
}

/**
 * True when a token reads as an option, not a positional (argparse heuristic).
 * Tokens that look like negative numbers are positionals: argparse's
 * `_negative_number_matcher` (`^-\d+$|^-\d*\.\d+$`) exempts them because no
 * registered option string here looks like a negative number.
 */
function looksLikeOption(token: string): boolean {
  return token.length > 1 && token.startsWith("-") && !/^-\d+$|^-\d*\.\d+$/.test(token);
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

function checkStatus(value: string, usage: string, errorProg: string): ReviewStatus {
  if (value === "approved" || value === "changes_requested") {
    return value;
  }
  exitUsage(
    usage,
    errorProg,
    `argument --status: invalid choice: ${pyRepr(value)} (choose from 'approved', 'changes_requested')`,
  );
}

/** Parse the subcommand's arguments (mirrors the argparse subparsers). */
function parseSubArgs(
  rest: string[],
  prog: string,
  command: Command,
  extras: string[],
): { name: string; status: ReviewStatus; date: string | null; force: boolean } {
  const usage = subUsage(prog, command);
  const errorProg = `${prog} ${command}`;
  let name: string | null = null;
  let status: ReviewStatus = "approved";
  let date: string | null = null;
  let force = false;
  let positionalOnly = false;

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i] as string;
    if (!positionalOnly && (arg === "-h" || arg === "--help")) {
      printSubHelp(prog, command);
    } else if (!positionalOnly && arg === "--") {
      positionalOnly = true;
    } else if (!positionalOnly && arg === "--date") {
      [date, i] = optionValue(rest, i, "--date", usage, errorProg);
    } else if (!positionalOnly && arg.startsWith("--date=")) {
      date = arg.slice("--date=".length);
    } else if (!positionalOnly && command === "review" && arg === "--status") {
      const [value, next] = optionValue(rest, i, "--status", usage, errorProg);
      status = checkStatus(value, usage, errorProg);
      i = next;
    } else if (!positionalOnly && command === "review" && arg.startsWith("--status=")) {
      status = checkStatus(arg.slice("--status=".length), usage, errorProg);
    } else if (!positionalOnly && command === "review" && arg === "--force") {
      force = true;
    } else if (!positionalOnly && looksLikeOption(arg)) {
      extras.push(arg);
    } else if (name === null) {
      name = arg;
    } else {
      extras.push(arg);
    }
  }

  // argparse ordering: a missing required positional is reported by the
  // subparser before leftover tokens bubble up as `unrecognized arguments`.
  if (name === null) {
    const positional = command === "explore" ? "topic" : "feature";
    exitUsage(usage, errorProg, `the following arguments are required: ${positional}`);
  }
  if (extras.length > 0) {
    exitUsage(mainUsage(prog), prog, `unrecognized arguments: ${extras.join(" ")}`);
  }
  return { name, status, date, force };
}

/** Parse argv like the Python `build_parser()` (exit 2 on usage, 0 on help). */
function parseArgs(argv: string[], prog: string): ParsedArgs {
  const usage = mainUsage(prog);
  let root = ".";
  let command: Command | null = null;
  let rest: string[] = [];
  const extras: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === "-h" || arg === "--help") {
      printMainHelp(prog);
    } else if (arg === "--" && i === argv.length - 1) {
      // A trailing `--` is never consumed by the command positional (argparse's
      // PARSER pattern needs a following token), so the missing-command error
      // below fires, matching the Python 3.12 oracle.
    } else if (arg === "--root") {
      [root, i] = optionValue(argv, i, "--root", usage, prog);
    } else if (arg.startsWith("--root=")) {
      root = arg.slice("--root=".length);
    } else if (arg !== "--" && looksLikeOption(arg)) {
      extras.push(arg);
    } else {
      // `--` followed by more tokens lands here on purpose: the Python 3.12
      // subparsers action (nargs=PARSER) does not strip `--`, so the token
      // itself is matched as the command and fails the choice check.
      if (!(COMMANDS as readonly string[]).includes(arg)) {
        exitUsage(
          usage,
          prog,
          `argument command: invalid choice: ${pyRepr(arg)} (choose from 'impl', 'review', 'explore')`,
        );
      }
      command = arg as Command;
      rest = argv.slice(i + 1);
      break;
    }
  }

  if (command === null) {
    exitUsage(usage, prog, "the following arguments are required: command");
  }
  const sub = parseSubArgs(rest, prog, command, extras);
  return { root, command, ...sub };
}

// --- rendering and writing ----------------------------------------------------

/**
 * Load `assets/backlog-<kind>.template.md` and apply the replacements in
 * order, each replacing every occurrence (Python `str.replace`).
 */
function render(kind: Command, replacements: ReadonlyArray<readonly [string, string]>): string {
  const template = join(ASSETS_DIR, `backlog-${kind}.template.md`);
  if (!isFile(template)) {
    throw new TemplateNotFoundError(template);
  }
  let text = readFileSync(template, "utf-8");
  for (const [before, after] of replacements) {
    text = text.split(before).join(after);
  }
  return text;
}

function writeEntry(workspace: string, filename: string, content: string): number {
  const backlogDir = join(workspace, "backlog");
  mkdirSync(backlogDir, { recursive: true });
  const dest = join(backlogDir, filename);
  if (existsSync(dest)) {
    process.stdout.write(`exists (left untouched): ${dest}\n`);
    return 0;
  }
  writeFileSync(dest, content, "utf-8");
  process.stdout.write(`created ${dest}\n`);
  return 0;
}

function cmdImpl(args: ParsedArgs, workspace: string): number {
  const name = safeSlug(args.name);
  if (name === null) {
    return err(`invalid feature name: ${pyRepr(args.name)}`);
  }
  const content = render("impl", [
    ["<feature_name>", name],
    ["YYYY-MM-DD", args.date || todayIsoDate()],
  ]);
  return writeEntry(workspace, `impl_${name}.md`, content);
}

/**
 * Re-stamp an existing review report with a new verdict, keeping its body.
 *
 * Only the three tokens that encode the verdict change - the same three
 * `cmdReview` flips when it renders the template - so a reissued report has the
 * same shape as a freshly generated one. Everything the reviewer wrote
 * (findings, evidence, Required Changes) survives: that prose *is* the report,
 * and `writeEntry`'s never-overwrite policy exists to protect exactly it.
 * Re-rendering from the template would discard the review while claiming to
 * update it.
 *
 * `bodyFlipped` is false when the `## Verdict` section carries no recognisable
 * marker - a hand-restructured report. The caller says so instead of pretending
 * the whole file is coherent.
 */
function reissueVerdict(text: string, status: ReviewStatus): [string, boolean] {
  const other: ReviewStatus = status === "approved" ? "changes_requested" : "approved";
  const upper = status.toUpperCase();
  const otherUpper = other.toUpperCase();
  const lines = text.split("\n");
  let delimiters = 0;
  let inVerdict = false;
  let bodyFlipped = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    if (line.trim() === "---" && delimiters < 2) {
      delimiters += 1;
      continue;
    }
    // 1. The frontmatter `status:` -- the only key any consumer reads
    //    (feature.js done, metrics.ts, sprint.ts, validate_harness.ts).
    if (delimiters === 1 && line.startsWith("status:")) {
      lines[i] = `status: ${status}`;
      continue;
    }
    // 2. The verdict tag, so the tag list cannot contradict the frontmatter.
    if (delimiters === 1 && line.includes(`handyman/review/${other}`)) {
      lines[i] = line.split(`handyman/review/${other}`).join(`handyman/review/${status}`);
      continue;
    }
    // 3. The human-facing marker under `## Verdict`. The leading token decides
    //    whether to act, but the swap covers the whole line: the template ships
    //    a hint comment naming the other verdict
    //    (`APPROVED   <!-- or CHANGES_REQUESTED -->`), and flipping only the
    //    first token would leave `APPROVED   <!-- or APPROVED -->`. Neither
    //    word is a substring of the other, so the swap is unambiguous.
    if (delimiters === 2) {
      if (line.startsWith("## ")) {
        inVerdict = line.trim() === "## Verdict";
      } else if (inVerdict && line.trim() !== "") {
        if (line.startsWith(otherUpper)) {
          lines[i] = line.replace(/APPROVED|CHANGES_REQUESTED/g, (m) =>
            m === "APPROVED" ? "CHANGES_REQUESTED" : "APPROVED",
          );
          bodyFlipped = true;
        } else if (line.startsWith(upper)) {
          bodyFlipped = true;
        }
        inVerdict = false;
      }
    }
  }
  return [lines.join("\n"), bodyFlipped];
}

function cmdReview(args: ParsedArgs, workspace: string): number {
  const name = safeSlug(args.name);
  if (name === null) {
    return err(`invalid feature name: ${pyRepr(args.name)}`);
  }
  const dest = join(workspace, "backlog", `review_${name}.md`);
  if (existsSync(dest)) {
    return reviewExisting(dest, args.status, args.force);
  }
  const replacements: Array<readonly [string, string]> = [
    ["<feature_name>", name],
    ["YYYY-MM-DD", args.date || todayIsoDate()],
  ];
  if (args.status === "changes_requested") {
    // The template is authored in the approved variant; flip the three tokens
    // that encode the verdict so status, tag, and body stay coherent.
    replacements.push(
      ["status: approved", "status: changes_requested"],
      ["handyman/review/approved", "handyman/review/changes_requested"],
      ["APPROVED   <!-- or CHANGES_REQUESTED -->", "CHANGES_REQUESTED   <!-- or APPROVED -->"],
    );
  }
  const content = render("review", replacements);
  return writeEntry(workspace, `review_${name}.md`, content);
}

/**
 * Handle `review <f> --status <s>` when the report already exists.
 *
 * The CHANGES_REQUESTED -> APPROVED cycle is the normal path of a review, and
 * before this it had no verb: the second call printed "exists (left untouched)"
 * and exited 0, so the only way to flip a verdict was to hand-edit the file -
 * the very pattern the harness forbids for feature_list.json - and a caller
 * could not tell the no-op from a write.
 *
 * Three directions, because "already exists" is not one situation:
 *   - same verdict, no flag  -> 0. Re-running a command is not an error.
 *   - different verdict, no flag -> 1, naming both. A verdict silently
 *     discarded is worse than a refusal.
 *   - `--force` -> re-stamp, keeping the body.
 */
function reviewExisting(dest: string, status: ReviewStatus, force: boolean): number {
  const text = readFileSync(dest, "utf-8");
  const [reissued, bodyFlipped] = reissueVerdict(text, status);
  const declared = declaredStatus(text);

  if (!force) {
    if (declared === status) {
      process.stdout.write(`exists (left untouched): ${dest}\n`);
      return 0;
    }
    return err(
      `${dest} declares '${declared ?? "no status"}' but --status asked for ` +
        `'${status}'; left untouched. Re-run with --force to reissue it.`,
    );
  }

  writeFileSync(dest, reissued, "utf-8");
  const from = declared ?? "no status";
  const note = bodyFlipped ? "" : "; NOTE: no verdict marker under '## Verdict' to update";
  process.stdout.write(`reissued ${dest}: ${from} -> ${status} (body preserved)${note}\n`);
  return 0;
}

/** The `status:` a review report's frontmatter declares, or null. */
function declaredStatus(text: string): string | null {
  let delimiters = 0;
  for (const line of text.split("\n")) {
    if (line.trim() === "---") {
      delimiters += 1;
      if (delimiters === 2) {
        break;
      }
      continue;
    }
    if (delimiters === 1 && line.startsWith("status:")) {
      const value = line.slice("status:".length).trim();
      return value === "" ? null : value;
    }
  }
  return null;
}

function cmdExplore(args: ParsedArgs, workspace: string): number {
  const topic = safeSlug(args.name);
  if (topic === null) {
    return err(`invalid topic: ${pyRepr(args.name)}`);
  }
  const content = render("explore", [
    ["<topic>", topic],
    ["YYYY-MM-DD", args.date || todayIsoDate()],
  ]);
  return writeEntry(workspace, `explore_${topic}.md`, content);
}

export function main(argv: string[]): number {
  const prog = basename(process.argv[1] ?? "backlog.js");
  const args = parseArgs(argv, prog);
  // Python `Path(args.root).resolve()`: absolutize and resolve symlinks
  // (non-strict -- a missing path is still absolutized).
  let root = resolve(args.root);
  try {
    root = realpathSync(root);
  } catch {
    // keep the absolutized path; the is-dir check below will reject it.
  }
  if (!isDir(root)) {
    return err(`root is not a directory: ${root}`);
  }
  const workspace = resolveWorkspace(root);
  try {
    if (args.command === "impl") {
      return cmdImpl(args, workspace);
    }
    if (args.command === "review") {
      return cmdReview(args, workspace);
    }
    return cmdExplore(args, workspace);
  } catch (exc) {
    if (exc instanceof TemplateNotFoundError) {
      return err(`template not found: ${exc.path}`);
    }
    return err(exc instanceof Error ? exc.message : String(exc));
  }
}

// Run when executed directly (mirrors Python `if __name__ == "__main__"`).
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}

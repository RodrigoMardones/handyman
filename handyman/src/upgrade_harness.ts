#!/usr/bin/env node
/**
 * Detect and apply Handyman harness version upgrades.
 *
 * Faithful port of `scripts/upgrade_harness.py`. Two operations over a target
 * harness, built on the Phase 0 `harness_version` seal (see
 * docs/archive/analisis-actualizacion-harness.md):
 *
 *   --check    Read-only. Resolve the workspace, read the installed
 *              `harness_version`, compare it to the version of the skill that
 *              ships this script (SKILL.md `metadata.version`), and report
 *              the pending structural migrations. Exit non-zero when
 *              behind/unsealed.
 *
 *   (default)  Apply the pending migrations from the installed version up to
 *              the current one: drop in missing *managed* scaffolding files,
 *              print the manual steps for *project-owned* content, back up
 *              the files it will change, then re-seal `harness_version`.
 *              `--dry-run` previews the diffs and writes nothing.
 *
 * Migrations are idempotent: a managed file is created only when missing, and
 * a second run after a successful upgrade is a no-op. Project-owned state
 * (`feature_list.json`, `progress/`, `backlog/`, filled `docs/`) is never
 * overwritten - it is only reported.
 *
 * Usage:
 *   node dist/upgrade_harness.js --check [--root PATH]
 *   node dist/upgrade_harness.js [--dry-run] [--root PATH]
 *
 * Exit codes:
 *   0  up to date, or migrations applied (or previewed) successfully
 *   1  --check found the harness behind or unsealed
 *   2  usage error
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveWorkspace, unifiedDiff } from "./core/index.js";

/** Bundled assets directory (managed-file templates). Both `src/` (vitest) and
 *  `dist/` (built) sit one level below the package root, so `../assets` is
 *  correct in either location (mirrors Python
 *  `Path(__file__).resolve().parent.parent / "assets"`). */
const ASSETS = fileURLToPath(new URL("../assets", import.meta.url));

/** SKILL.md that ships beside this script (same package-root resolution). */
const SKILL_MD = fileURLToPath(new URL("../SKILL.md", import.meta.url));

/** package.json at the package root: the version source when SKILL.md is
 *  absent (the published `handyman-harness` tarball ships no SKILL.md). */
const PKG_JSON = fileURLToPath(new URL("../package.json", import.meta.url));

/** A comparable `[major, minor, patch]` semver tuple. */
export type SemVer = readonly [number, number, number];

interface Migration {
  version: string;
  summary: string;
  ensures: ReadonlyArray<readonly [string, string]>;
  advisories: readonly string[];
  /** Custom migration logic beyond template ensures (e.g. moving user
   *  content). Runs after `ensures`, before `advisories` are printed. Must
   *  be idempotent and honor `dryRun` (report `would ...`, write nothing). */
  apply?: (ctx: MigrationCtx) => void;
}

interface MigrationCtx {
  root: string;
  workspace: string;
  dryRun: boolean;
}

/**
 * Ordered, idempotent migration registry. Each entry upgrades a harness *to*
 * its version. `ensures` are managed scaffolding files copied only when
 * missing; `advisories` are project-owned content changes a human must apply.
 * Source: docs/archive/analisis-actualizacion-harness.md (drift surface).
 */
const MIGRATIONS: readonly Migration[] = [
  {
    version: "1.6.0",
    summary: "docs/business.md layer + abstract harness gitignore",
    ensures: [["docs/business.md", "docs-business.template.md"]],
    advisories: ["gitignore: add `.handyman/*` + `!.handyman/docs/` (see references/templates.md)"],
  },
  {
    version: "1.7.0",
    summary: "prompt-injection mitigation: security.md + role-file notes",
    ensures: [],
    advisories: [
      "role files: carry the data-not-instructions boundary (see references/security.md)",
    ],
  },
  {
    version: "1.8.0",
    summary: "deterministic tooling: validate_harness, schemas, feature CLI, init validate phase",
    ensures: [],
    advisories: [
      "verifier: add the `validate` phase; validate_harness.py / feature.py / schemas ship with the skill",
    ],
  },
  {
    // Version criterion: the entry carries the skill version that SHIPS THE
    // FIX, not the one that introduced the change (the memory/ layout landed
    // in 3.5.0, commit b4abf51) and not the legacy 1.x sequence (dead since
    // seals use skill versions: a 2.1.1 harness compares above every 1.x
    // entry and would skip them all). Carrying the fix version offers the
    // migration to every harness sealed before the fix existed — including
    // the 3.5.0+ seals that still carry docs/ — and the migration's own
    // guard (memory/ missing AND docs/ files present) keeps it safe and
    // idempotent for everyone else.
    version: "3.7.5",
    summary: "memory/ layout: move docs/{business,architecture,conventions,verification}.md to memory/",
    ensures: [],
    advisories: [
      "gitignore: add `!.handyman/memory/` (legacy `!.handyman/docs/` stays; see assets/harness.gitignore.template)",
      "AGENTS.md: read knowledge files from $HARNESS_WORKSPACE/memory/ (docs/ is the legacy fallback)",
    ],
    apply: migrateDocsToMemory,
  },
];

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

/** Parse 'X.Y.Z' into a comparable tuple, or null when it is not semver
 *  (mirrors Python `parse_version`'s falsy-input short-circuit). */
export function parseVersion(value: string | null | undefined): SemVer | null {
  if (!value) {
    return null;
  }
  const match = SEMVER_RE.exec(value.trim());
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemVer(a: SemVer, b: SemVer): number {
  for (let i = 0; i < 3; i++) {
    const diff = (a[i] as number) - (b[i] as number);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

/** Read a text file the way Python's `open(path, encoding="utf-8")` does:
 *  universal-newline translation collapses `\r\n` and `\r` to `\n`. */
function readTextUniversal(path: string): string {
  return readFileSync(path, "utf-8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/** The line boundaries of Python `str.splitlines()`: LF, VT, FF, CR, FS, GS,
 *  RS, NEL, LINE SEPARATOR, PARAGRAPH SEPARATOR (CRLF counts as one). */
const LINE_BREAKS = new Set([0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x85, 0x2028, 0x2029]);

/** Python `str.splitlines(keepends=True)`: split on its line boundaries,
 *  keeping each terminator attached to the line it ends. */
function splitlinesKeepEnds(text: string): string[] {
  const lines: string[] = [];
  let start = 0;
  let i = 0;
  while (i < text.length) {
    const code = text.charCodeAt(i);
    if (LINE_BREAKS.has(code)) {
      const end = code === 0x0d && text.charCodeAt(i + 1) === 0x0a ? i + 2 : i + 1;
      lines.push(text.slice(start, end));
      i = end;
      start = end;
    } else {
      i += 1;
    }
  }
  if (start < text.length) {
    lines.push(text.slice(start));
  }
  return lines;
}

/** Python `repr()` of a string: quote selection, backslash/quote escapes, and
 *  `\xNN` for Latin-1 control characters; printable non-ASCII stays literal. */
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

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Parse JSON, falling back to `{}` on any parse/IO error (mirrors Python's
 *  `except (ValueError, OSError): data = {}`). Caller has already checked the
 *  path is a file, so only JSON.parse failures are expected here. */
function readJsonOrEmpty(path: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(readTextUniversal(path));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Python truthiness of a JSON scalar (used for `data.get("harness_version")`
 *  and similar `if value:` checks): everything but None/""/0/false/[]/{} is
 *  truthy. Returns the value narrowed to a non-empty string, or null. */
function truthyString(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return null;
}

/** `metadata.version` from the SKILL.md shipped beside this script, falling
 *  back to the package.json version. The two agree by construction: the pack
 *  script refuses to build a tarball where they differ. */
export function currentSkillVersion(): string {
  try {
    const match = /^\s+version:\s*(.+)$/m.exec(readTextUniversal(SKILL_MD));
    if (match) {
      return (match[1] as string).trim();
    }
  } catch {
    // no SKILL.md beside the script: published-tarball layout
  }
  try {
    const version = JSON.parse(readTextUniversal(PKG_JSON)).version;
    return typeof version === "string" ? version : "";
  } catch {
    return "";
  }
}

/** `harness_version` from harness.config.json, else feature_list.json config. */
export function readInstalledVersion(root: string, workspace: string): string | null {
  const configPath = join(root, "harness.config.json");
  if (isFile(configPath)) {
    const data = readJsonOrEmpty(configPath);
    const version = truthyString(data.harness_version);
    if (version !== null) {
      return version;
    }
  }
  const featureListPath = join(workspace, "feature_list.json");
  if (isFile(featureListPath)) {
    const data = readJsonOrEmpty(featureListPath);
    const config = data.config;
    const configObj =
      config && typeof config === "object" && !Array.isArray(config)
        ? (config as Record<string, unknown>)
        : {};
    const version = truthyString(configObj.harness_version);
    if (version !== null) {
      return version;
    }
  }
  return null;
}

/** Registry entries newer than installed and within current, in order. */
function pendingMigrations(installed: SemVer | null, current: SemVer): Migration[] {
  const floor = installed ?? ([0, 0, 0] as const);
  const pending: Migration[] = [];
  for (const migration of MIGRATIONS) {
    const version = parseVersion(migration.version);
    if (
      version !== null &&
      compareSemVer(floor, version) < 0 &&
      compareSemVer(version, current) <= 0
    ) {
      pending.push(migration);
    }
  }
  return pending;
}

function print(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

function printErr(msg: string): void {
  process.stderr.write(`${msg}\n`);
}

function header(
  root: string,
  workspace: string,
  installedRaw: string | null,
  currentRaw: string,
): void {
  print(`==> harness: ${root}`);
  print(`    workspace:          ${workspace}`);
  print(`    installed version:  ${installedRaw || "(unsealed)"}`);
  print(`    current version:    ${currentRaw}`);
}

function printPending(pending: readonly Migration[]): void {
  if (pending.length > 0) {
    print("    pending structural upgrades:");
    for (const migration of pending) {
      print(`      ${migration.version}  ${migration.summary}`);
      for (const advisory of migration.advisories) {
        print(`        manual: ${advisory}`);
      }
    }
  }
  print("    apply: npx handyman-harness@3 upgrade_harness --root <root> (use --dry-run to preview)");
}

// --- check (read-only) -------------------------------------------------------

function check(root: string): number {
  const workspace = resolveWorkspace(root);
  const currentRaw = currentSkillVersion();
  const current = parseVersion(currentRaw);
  if (current === null) {
    printErr(`error: cannot read current skill version (got ${pyRepr(currentRaw)})`);
    return 2;
  }

  const installedRaw = readInstalledVersion(root, workspace);
  const installed = parseVersion(installedRaw);
  header(root, workspace, installedRaw, currentRaw);

  if (installed !== null && compareSemVer(installed, current) >= 0) {
    print("==> harness is up to date");
    return 0;
  }

  if (installed === null) {
    print(
      "==> harness has no valid version stamp (created before harness versioning; assume < 1.6.0)",
    );
  } else {
    print(`==> harness is behind: ${installedRaw} -> ${currentRaw}`);
  }
  printPending(pendingMigrations(installed, current));
  return 1;
}

// --- apply -------------------------------------------------------------------

function apply(root: string, dryRun: boolean): number {
  const workspace = resolveWorkspace(root);
  const currentRaw = currentSkillVersion();
  const current = parseVersion(currentRaw);
  if (current === null) {
    printErr(`error: cannot read current skill version (got ${pyRepr(currentRaw)})`);
    return 2;
  }

  const installedRaw = readInstalledVersion(root, workspace);
  const installed = parseVersion(installedRaw);
  header(root, workspace, installedRaw, currentRaw);

  if (installed !== null && compareSemVer(installed, current) >= 0) {
    print("==> harness is up to date; nothing to apply");
    return 0;
  }

  const pending = pendingMigrations(installed, current);
  if (pending.length === 0) {
    print("==> no structural migrations for this gap; re-sealing the version only");
  }

  if (!dryRun) {
    const backup = makeBackup(root, workspace);
    if (backup !== null) {
      print(`    backup: ${backup}`);
    }
  }

  for (const migration of pending) {
    print(`==> migrate to ${migration.version}: ${migration.summary}`);
    for (const [destRel, templateName] of migration.ensures) {
      ensureManagedFile(workspace, destRel, templateName, dryRun);
    }
    migration.apply?.({ root, workspace, dryRun });
    for (const advisory of migration.advisories) {
      print(`    manual: ${advisory}`);
    }
  }

  resealVersion(root, currentRaw, installedRaw, dryRun);

  if (dryRun) {
    print("==> dry-run: nothing written");
  } else {
    print("==> migration complete; run the verifier (./init.sh) to confirm");
  }
  return 0;
}

/** Knowledge files moved by the docs/ -> memory/ layout migration (F73). */
const KNOWLEDGE_FILES = ["business.md", "architecture.md", "conventions.md", "verification.md"] as const;

/** docs/ -> memory/ migration (entry 3.7.5): move the four knowledge files
 *  when memory/ does not exist, preserving user content byte-for-byte and
 *  backing up the originals under .upgrade-backups/<stamp>/docs/ first.
 *  Idempotent: an existing memory/ (or no docs/ files) is a no-op. */
function migrateDocsToMemory({ workspace, dryRun }: MigrationCtx): void {
  const docsDir = join(workspace, "docs");
  const memoryDir = join(workspace, "memory");
  if (existsSync(memoryDir)) {
    print("    ok (exists): memory/");
    return;
  }
  const present = KNOWLEDGE_FILES.filter((name) => isFile(join(docsDir, name)));
  if (present.length === 0) {
    print("    skip: no docs/ knowledge files to move");
    return;
  }
  if (dryRun) {
    for (const name of present) {
      print(`    would move: docs/${name} -> memory/${name}`);
    }
    return;
  }
  const backupDir = join(workspace, ".upgrade-backups", backupStamp(new Date()), "docs");
  mkdirSync(backupDir, { recursive: true });
  mkdirSync(memoryDir, { recursive: true });
  for (const name of present) {
    copyFileSync(join(docsDir, name), join(backupDir, name));
    renameSync(join(docsDir, name), join(memoryDir, name));
    print(`    moved: docs/${name} -> memory/${name}`);
  }
  print(`    backup: ${backupDir}`);
}

/** Copy a managed template only when the destination is missing. */
function ensureManagedFile(
  workspace: string,
  destRel: string,
  templateName: string,
  dryRun: boolean,
): void {  const dest = join(workspace, destRel);
  const template = join(ASSETS, templateName);
  if (existsSync(dest)) {
    print(`    ok (exists): ${destRel}`);
    return;
  }
  if (!isFile(template)) {
    print(`    skip (missing template): ${templateName}`);
    return;
  }
  if (dryRun) {
    print(`    would create: ${destRel}`);
    const content = splitlinesKeepEnds(readTextUniversal(template));
    const diff = unifiedDiff([], content, { fromFile: "/dev/null", toFile: `b/${destRel}` });
    process.stdout.write(diff.join(""));
    return;
  }
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(template, dest);
  print(`    created: ${destRel}`);
}

/** Back up the files a migration may modify (never the whole workspace). */
function makeBackup(root: string, workspace: string): string | null {
  const configPath = join(root, "harness.config.json");
  const targets = isFile(configPath) ? [configPath] : [];
  if (targets.length === 0) {
    return null;
  }
  const stamp = backupStamp(new Date());
  const backupDir = join(workspace, ".upgrade-backups", stamp);
  mkdirSync(backupDir, { recursive: true });
  for (const path of targets) {
    copyFileSync(path, join(backupDir, basename(path)));
  }
  return backupDir;
}

/** `datetime.now().strftime("%Y%m%d-%H%M%S")`: local time, zero-padded. */
function backupStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/** Set harness_version, inserting it after harness_workspace when new. */
function withVersion(mapping: Record<string, unknown>, version: string): Record<string, unknown> {
  if ("harness_version" in mapping) {
    return { ...mapping, harness_version: version };
  }
  const rebuilt: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(mapping)) {
    rebuilt[key] = value;
    if (key === "harness_workspace") {
      rebuilt.harness_version = version;
    }
  }
  if (!("harness_version" in rebuilt)) {
    rebuilt.harness_version = version;
  }
  return rebuilt;
}

/** Re-stamp harness_version in harness.config.json (feature_list untouched). */
function resealVersion(
  root: string,
  version: string,
  installedRaw: string | null,
  dryRun: boolean,
): void {
  const configPath = join(root, "harness.config.json");
  if (!isFile(configPath)) {
    print(
      "    note: no harness.config.json to seal; create one to record " +
        "harness_version (feature_list.json left untouched)",
    );
    return;
  }
  if (dryRun) {
    print(`    would re-seal harness_version: ${installedRaw || "(unsealed)"} -> ${version}`);
    return;
  }
  let data: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(readTextUniversal(configPath));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("harness.config.json does not contain a JSON object");
    }
    data = parsed as Record<string, unknown>;
  } catch (exc) {
    printErr(
      `    error: cannot read harness.config.json: ${exc instanceof Error ? exc.message : String(exc)}`,
    );
    return;
  }
  data = withVersion(data, version);
  writeFileSync(configPath, `${JSON.stringify(data, null, 2)}\n`, { encoding: "utf-8" });
  print(`    re-sealed harness_version -> ${version}`);
}

// --- CLI ---------------------------------------------------------------------

const PROG = "upgrade_harness";

function usage(): string {
  return `usage: ${PROG} [-h] [--root ROOT] [--check] [--dry-run]\n`;
}

function helpText(): string {
  return (
    usage() +
    "\n" +
    "Detect or apply Handyman harness version upgrades.\n" +
    "\n" +
    "options:\n" +
    "  -h, --help   show this help message and exit\n" +
    "  --root ROOT  target project root (default: cwd)\n" +
    "  --check      report drift read-only; exit non-zero if behind\n" +
    "  --dry-run    apply-mode preview: show diffs, write nothing\n"
  );
}

/** argparse `parser.error(...)`: usage to stderr, `prog: error: msg`, exit 2. */
function exitUsage(message: string): never {
  process.stderr.write(usage());
  process.stderr.write(`${PROG}: error: ${message}\n`);
  process.exit(2);
}

/**
 * True when a token reads as an option, not a positional (argparse
 * heuristic). Tokens that look like negative numbers are positionals:
 * argparse's `_negative_number_matcher` (`^-\d+$|^-\d*\.\d+$`) exempts them
 * because no registered option string here looks like a negative number. A
 * token that contains a space is never an option (argparse's
 * `' ' in arg_string` rule).
 */
function looksLikeOption(token: string): boolean {
  return (
    token.length > 1 &&
    token.startsWith("-") &&
    !token.includes(" ") &&
    !/^-\d+$|^-\d*\.\d+$/.test(token)
  );
}

interface ParsedArgs {
  root: string;
  check: boolean;
  dryRun: boolean;
}

/** Parse argv like the Python argparse parser (exit 2 on usage, 0 on help). */
function parseArgs(argv: string[]): ParsedArgs {
  let root = ".";
  let check = false;
  let dryRun = false;
  let optionsEnded = false;
  const extras: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (optionsEnded) {
      extras.push(arg);
      continue;
    }
    if (arg === "--") {
      optionsEnded = true;
      extras.push(arg);
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(helpText());
      process.exit(0);
    }
    if (arg === "--root") {
      const next = argv[i + 1];
      if (next === undefined || looksLikeOption(next)) {
        exitUsage("argument --root: expected one argument");
      }
      root = next;
      i += 1;
      continue;
    }
    if (arg.startsWith("--root=")) {
      root = arg.slice("--root=".length);
      continue;
    }
    if (arg === "--check") {
      check = true;
      continue;
    }
    if (arg.startsWith("--check=")) {
      exitUsage(
        `argument --check: ignored explicit argument ${pyRepr(arg.slice("--check=".length))}`,
      );
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg.startsWith("--dry-run=")) {
      exitUsage(
        `argument --dry-run: ignored explicit argument ${pyRepr(arg.slice("--dry-run=".length))}`,
      );
    }
    extras.push(arg);
  }

  if (extras.length > 0) {
    exitUsage(`unrecognized arguments: ${extras.join(" ")}`);
  }

  return { root, check, dryRun };
}

function main(argv: string[]): number {
  const args = parseArgs(argv);

  // Python `Path(args.root).resolve()`: absolutize then resolve symlinks
  // (unlike update_harness.py's `os.path.abspath`, which never does).
  const rootArg = resolve(args.root);
  let root = rootArg;
  try {
    root = realpathSync(rootArg);
  } catch {
    root = rootArg;
  }
  if (!isDir(root)) {
    printErr(`error: root is not a directory: ${root}`);
    return 2;
  }

  if (args.check) {
    if (args.dryRun) {
      process.stderr.write(usage());
      printErr("error: --check and --dry-run are mutually exclusive");
      return 2;
    }
    return check(root);
  }

  return apply(root, args.dryRun);
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

// Entry guard: run only when invoked directly (not when imported by a test).
// Basename check, not import.meta.url: bundle-proof (see toolbox.ts).
if (basename(process.argv[1] ?? "") === "upgrade_harness.js") {
  process.exit(main(process.argv.slice(2)));
}

export { main };

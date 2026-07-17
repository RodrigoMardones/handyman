#!/usr/bin/env node
/**
 * Handyman harness updater.
 *
 * Faithful port of `scripts/update_harness.py`. Complements scripts/scaffold.sh:
 * scaffold never overwrites, this script updates parameters of an EXISTING
 * harness consistently across every surface where they are declared, so
 * config and role frontmatter never drift apart.
 *
 * Surfaces updated per role:
 *   - harness.config.json            -> "models" / "tools" maps
 *   - .github/agents/<role>.agent.md -> frontmatter `model:` / `tools:`
 *   - .claude/agents/<role>.md       -> frontmatter `model:` / `tools:`
 *
 * When pointed at the Handyman skill repo itself (detected by SKILL.md +
 * assets/), it updates the distributed templates instead:
 *   - assets/harness.config.local.template.json / .global.template.json
 *   - assets/role-<role>.template.md
 *
 * Usage:
 *   node dist/update_harness.js [--root PATH] --list
 *   node dist/update_harness.js [--root PATH] --check
 *   node dist/update_harness.js [--root PATH] [--dry-run] --sync
 *   node dist/update_harness.js [--root PATH] [--dry-run] \
 *       [--model ROLE=MODEL]... [--tools ROLE=t1,t2,...]... [--set KEY=VALUE]...
 *
 * Exit codes: 0 ok, 1 error, 2 usage.
 */
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { PLATFORM_ROLE_DIRS, unifiedDiff } from "./core/index.js";

const ROLES = ["leader", "implementer", "reviewer", "explorer"] as const;
type Role = (typeof ROLES)[number];

/** Top-level scalar keys allowed via --set. Workspace moves are a migration
 *  (see SKILL.md "Migrate local to global"), but the keys stay editable for
 *  repointing after an approved migration. */
const CONFIG_KEYS = [
  "install_mode",
  "project_name",
  "project_root",
  "handyman_root",
  "harness_workspace",
] as const;

const CHANGED = "CHANGED";
const KEEP = "KEEP";
const ABSENT = "ABSENT";
type ApplyResult = typeof CHANGED | typeof KEEP | typeof ABSENT;

interface Found {
  configs: string[];
  roles: Record<Role, string[]>;
}

function info(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

function err(msg: string): void {
  process.stderr.write(`error: ${msg}\n`);
}

// --- discovery ---------------------------------------------------------------

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

function isSkillRepo(root: string): boolean {
  return isFile(join(root, "SKILL.md")) && isDir(join(root, "assets"));
}

/** Return {configs: [paths], roles: {role: [paths]}} for the root. */
function discover(root: string): Found {
  const configs: string[] = [];
  const roles: Record<Role, string[]> = { leader: [], implementer: [], reviewer: [], explorer: [] };
  if (isSkillRepo(root)) {
    for (const name of [
      "harness.config.local.template.json",
      "harness.config.global.template.json",
    ]) {
      const path = join(root, "assets", name);
      if (isFile(path)) {
        configs.push(path);
      }
    }
    for (const role of ROLES) {
      const path = join(root, "assets", `role-${role}.template.md`);
      if (isFile(path)) {
        roles[role].push(path);
      }
    }
  } else {
    const path = join(root, "harness.config.json");
    if (isFile(path)) {
      configs.push(path);
    }
    for (const role of ROLES) {
      const candidates = [
        join(root, PLATFORM_ROLE_DIRS[0] as string, `${role}.agent.md`),
        join(root, PLATFORM_ROLE_DIRS[1] as string, `${role}.md`),
      ];
      for (const candidate of candidates) {
        if (isFile(candidate)) {
          roles[role].push(candidate);
        }
      }
    }
  }
  return { configs, roles };
}

// --- frontmatter editing -----------------------------------------------------

const FM_RE = /^---\n([\s\S]*?\n)---\n/;

/** Set `key: value` inside the YAML frontmatter. null when no frontmatter. */
function editFrontmatter(text: string, key: string, value: string): string | null {
  const match = FM_RE.exec(text);
  if (!match) {
    return null;
  }
  const body = match[1] as string;
  const bodyStart = (match.index ?? 0) + match[0].indexOf(body);
  const bodyEnd = bodyStart + body.length;
  const line = `${key}: ${value}\n`;
  const keyRe = new RegExp(`^${escapeRegExp(key)}:[^\\n]*\\n`, "m");
  const keyMatch = keyRe.exec(body);
  const newBody = keyMatch
    ? body.slice(0, keyMatch.index) + line + body.slice(keyMatch.index + keyMatch[0].length)
    : body + line;
  return text.slice(0, bodyStart) + newBody + text.slice(bodyEnd);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toolsYaml(tools: readonly string[]): string {
  return `[${tools.join(", ")}]`;
}

// --- file IO -----------------------------------------------------------------

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

function applyText(path: string, newText: string, dryRun: boolean): ApplyResult {
  const oldText = readTextUniversal(path);
  if (oldText === newText) {
    return KEEP;
  }
  if (dryRun) {
    const rel = basename(path);
    const diff = unifiedDiff(splitlinesKeepEnds(oldText), splitlinesKeepEnds(newText), {
      fromFile: `a/${rel}`,
      toFile: `b/${rel}`,
    });
    process.stdout.write(diff.join(""));
  } else {
    writeFileSync(path, newText, { encoding: "utf-8" });
  }
  return CHANGED;
}

function loadJson(path: string): unknown {
  const text = readTextUniversal(path);
  try {
    return JSON.parse(text);
  } catch (exc) {
    err(`invalid JSON in ${path}: ${exc instanceof Error ? exc.message : String(exc)}`);
    return undefined;
  }
}

function dumpJson(data: unknown): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

// --- repr helpers (Python `!r` formatting for --list output) -----------------

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

/** Python `repr()` of an arbitrary JSON scalar (string/None/bool/number). */
function pyReprValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "None";
  }
  if (typeof value === "boolean") {
    return value ? "True" : "False";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "string") {
    return pyRepr(value);
  }
  return pyRepr(String(value));
}

// --- operations ----------------------------------------------------------------

interface ConfigShape {
  models?: Record<string, unknown>;
  tools?: Record<string, unknown>;
  [key: string]: unknown;
}

function updateConfig(
  path: string,
  models: Record<string, string>,
  tools: Record<string, string[]>,
  sets: Record<string, string>,
  dryRun: boolean,
): ApplyResult {
  const data = loadJson(path) as ConfigShape | undefined;
  if (data === undefined) {
    return ABSENT;
  }
  if (Object.keys(models).length > 0) {
    data.models = { ...(data.models ?? {}), ...models };
  }
  if (Object.keys(tools).length > 0) {
    const merged: Record<string, unknown> = { ...(data.tools ?? {}) };
    for (const [role, list] of Object.entries(tools)) {
      merged[role] = [...list];
    }
    data.tools = merged;
  }
  Object.assign(data, sets);
  return applyText(path, dumpJson(data), dryRun);
}

function updateRoleFile(
  path: string,
  model: string | null,
  tools: readonly string[] | null,
  dryRun: boolean,
): ApplyResult {
  const text = readTextUniversal(path);
  let newText: string | null = text;
  if (model !== null) {
    newText = editFrontmatter(newText, "model", model);
    if (newText === null) {
      err(`no YAML frontmatter in ${path}; skipped`);
      return ABSENT;
    }
  }
  if (tools !== null) {
    newText = editFrontmatter(newText, "tools", toolsYaml(tools));
    if (newText === null) {
      err(`no YAML frontmatter in ${path}; skipped`);
      return ABSENT;
    }
  }
  return applyText(path, newText, dryRun);
}

function listState(root: string, found: Found): void {
  const mode = isSkillRepo(root) ? "skill-repo templates" : "installed harness";
  info(`==> root: ${root} (${mode})`);
  for (const path of found.configs) {
    const data = loadJson(path) as ConfigShape | undefined;
    if (data === undefined) {
      continue;
    }
    info(`==> config: ${relative(root, path)}`);
    for (const role of ROLES) {
      const model = (data.models?.[role] as unknown) ?? "-";
      const toolsRaw = data.tools?.[role];
      const tools = Array.isArray(toolsRaw) ? (toolsRaw as string[]) : [];
      info(`    ${role.padEnd(12)} model=${pyReprValue(model)} tools=${tools.join(",") || "-"}`);
    }
    for (const key of CONFIG_KEYS) {
      if (key in data) {
        info(`    ${key} = ${pyReprValue(data[key])}`);
      }
    }
  }
  for (const role of ROLES) {
    for (const path of found.roles[role]) {
      const text = readTextUniversal(path);
      const match = FM_RE.exec(text);
      const body = match ? (match[1] as string) : "";
      const modelM = /^model:\s*(.+)$/m.exec(body);
      const toolsM = /^tools:\s*(.+)$/m.exec(body);
      info(`==> role file: ${relative(root, path)}`);
      info(`    model=${modelM ? (modelM[1] as string).trim() : "-"}`);
      info(`    tools=${toolsM ? (toolsM[1] as string).trim() : "-"}`);
    }
  }
}

/** Normalize a model value for comparison (strip surrounding quotes/space). */
function normModel(value: unknown): string {
  return pyStrip(pyStrip(pyStrip(String(value)), "\"'"));
}

/** Python `str.strip()` (no args): trim ASCII/Unicode whitespace from both ends. */
function pyStrip(value: string, chars?: string): string {
  if (chars === undefined) {
    return value.trim();
  }
  const set = new Set(chars);
  let start = 0;
  let end = value.length;
  while (start < end && set.has(value[start] as string)) {
    start += 1;
  }
  while (end > start && set.has(value[end - 1] as string)) {
    end -= 1;
  }
  return value.slice(start, end);
}

/** Parse a frontmatter tools value like '[a, b, c]' into ['a', 'b', 'c']. */
function parseTools(raw: string): string[] {
  return pyStrip(pyStrip(raw), "[]")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

interface Expected {
  model?: unknown;
  tools?: unknown;
}

/**
 * Read-only drift audit: config models/tools vs role-file frontmatter.
 *
 * The detection counterpart of --list: it gives preflight a real pass/fail
 * signal for the config<->role-file sync control. Returns 0 when every role
 * file agrees with the config (or there is nothing to compare) and 1 when any
 * drift is found. Writes nothing.
 */
function checkState(root: string, found: Found): number {
  const mode = isSkillRepo(root) ? "skill-repo templates" : "installed harness";
  info(`==> sync check: ${root} (${mode})`);
  const expected: Partial<Record<Role, Expected>> = {};
  for (const path of found.configs) {
    const data = loadJson(path) as ConfigShape | undefined;
    if (data === undefined) {
      continue;
    }
    for (const role of ROLES) {
      if (role in expected) {
        continue;
      }
      expected[role] = {
        model: data.models?.[role],
        tools: data.tools?.[role],
      };
    }
  }
  let drift = 0;
  let compared = 0;
  for (const role of ROLES) {
    for (const path of found.roles[role]) {
      compared += 1;
      const text = readTextUniversal(path);
      const match = FM_RE.exec(text);
      const body = match ? (match[1] as string) : "";
      const modelM = /^model:\s*(.+)$/m.exec(body);
      const toolsM = /^tools:\s*(.+)$/m.exec(body);
      const fileModel = modelM ? (modelM[1] as string).trim() : null;
      const fileTools = toolsM ? parseTools(toolsM[1] as string) : null;
      const exp = expected[role] ?? {};
      const rel = relative(root, path);
      let fileDrift = 0;
      if (exp.model !== undefined && exp.model !== null && fileModel !== null) {
        if (normModel(exp.model) !== normModel(fileModel)) {
          info(
            `    DRIFT ${rel}: model config=${pyReprValue(exp.model)} file=${pyReprValue(fileModel)}`,
          );
          fileDrift += 1;
        }
      }
      if (exp.tools !== undefined && exp.tools !== null && fileTools !== null) {
        const expTools = Array.isArray(exp.tools) ? (exp.tools as unknown[]) : [];
        if (!arraysEqual(expTools, fileTools)) {
          info(
            `    DRIFT ${rel}: tools config=${pyListRepr(expTools)} file=${pyListRepr(fileTools)}`,
          );
          fileDrift += 1;
        }
      }
      if (fileDrift === 0) {
        info(`    OK ${rel}`);
      }
      drift += fileDrift;
    }
  }
  if (compared === 0) {
    info("    no role files to compare (config-only harness)");
    return 0;
  }
  if (drift) {
    info(`==> sync drift: ${drift} mismatch(es) between config and role files`);
    info("    reconcile deterministically with: update_harness.py --sync (config -> role files)");
    return 1;
  }
  info("==> sync OK: config and role files agree");
  return 0;
}

function arraysEqual(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Python `repr(list)` for a list of strings (used in the tools DRIFT line). */
function pyListRepr(values: readonly unknown[]): string {
  return `[${values.map((v) => pyReprValue(v)).join(", ")}]`;
}

/**
 * Reconcile role files to the config deterministically: write the config's
 * models/tools into every role-file frontmatter. The config is the canonical
 * source of truth (see references/anatomy.md), so the deterministic direction
 * is config -> role files. The write counterpart of --check; honors --dry-run.
 * Returns 0 on success, 1 on error.
 */
function syncState(root: string, found: Found, dryRun: boolean): number {
  const models: Partial<Record<Role, string>> = {};
  const tools: Partial<Record<Role, string[]>> = {};
  for (const path of found.configs) {
    const data = loadJson(path) as ConfigShape | undefined;
    if (data === undefined) {
      continue;
    }
    for (const role of ROLES) {
      if (!(role in models) && data.models && role in data.models) {
        models[role] = data.models[role] as string;
      }
      if (!(role in tools) && data.tools && role in data.tools) {
        tools[role] = [...(data.tools[role] as string[])];
      }
    }
  }
  if (!ROLES.some((role) => found.roles[role].length > 0)) {
    info("==> sync: no role files to reconcile (config-only harness)");
    return 0;
  }
  info("==> sync: reconciling role files to the config (config -> role files)");
  let failures = 0;
  let touched = 0;
  for (const role of ROLES) {
    for (const path of found.roles[role]) {
      const result = updateRoleFile(path, models[role] ?? null, tools[role] ?? null, dryRun);
      if (result === ABSENT) {
        failures += 1;
      } else if (result === CHANGED) {
        touched += 1;
      }
      info(`    ${result}: ${relative(root, path)}`);
    }
  }
  if (dryRun) {
    info("==> dry-run: nothing written");
  } else if (touched === 0) {
    info("==> sync: role files already match the config");
  } else {
    info(`==> sync: reconciled ${touched} role file(s) to the config`);
  }
  return failures ? 1 : 0;
}

// --- CLI -----------------------------------------------------------------------

function mainUsage(prog: string): string {
  return (
    `usage: ${prog} [-h] [--root ROOT] [--dry-run] [--list] [--check]\n` +
    `                         [--sync] [--model ROLE=MODEL]\n` +
    `                         [--tools ROLE=t1,t2,...] [--set KEY=VALUE]\n`
  );
}

function mainHelpText(prog: string): string {
  return (
    mainUsage(prog) +
    `\n` +
    `Update models/tools/config of an existing Handyman harness.\n` +
    `\n` +
    `options:\n` +
    `  -h, --help            show this help message and exit\n` +
    `  --root ROOT           project root (default: cwd)\n` +
    `  --dry-run             print diffs, write nothing\n` +
    `  --list                show current models/tools per surface and exit\n` +
    `  --check               read-only drift audit: config vs role files, exit 1 on\n` +
    `                        drift (writes nothing)\n` +
    `  --sync                reconcile role files to the config (config -> role\n` +
    `                        files); honors --dry-run\n` +
    `  --model ROLE=MODEL\n` +
    `  --tools ROLE=t1,t2,...\n` +
    `  --set KEY=VALUE\n`
  );
}

/** argparse `parser.error(...)`: usage to stderr, `prog: error: msg`, exit 2. */
function exitUsage(usage: string, prog: string, message: string): never {
  process.stderr.write(usage);
  process.stderr.write(`${prog}: error: ${message}\n`);
  process.exit(2);
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

interface ParsedArgs {
  root: string;
  dryRun: boolean;
  list: boolean;
  check: boolean;
  sync: boolean;
  models: string[];
  tools: string[];
  sets: string[];
}

/** Parse argv like the Python argparse parser (exit 2 on usage, 0 on help). */
function parseArgs(argv: string[], prog: string): ParsedArgs {
  const usage = mainUsage(prog);
  let root = ".";
  let dryRun = false;
  let list = false;
  let check = false;
  let sync = false;
  const models: string[] = [];
  const tools: string[] = [];
  const sets: string[] = [];
  let optionsEnded = false;
  const extras: string[] = [];

  const flags: ReadonlyArray<{ name: string; set: () => void }> = [
    { name: "--dry-run", set: () => (dryRun = true) },
    { name: "--list", set: () => (list = true) },
    { name: "--check", set: () => (check = true) },
    { name: "--sync", set: () => (sync = true) },
  ];

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
      process.stdout.write(mainHelpText(prog));
      process.exit(0);
    }
    if (arg === "--root") {
      const next = argv[i + 1];
      if (next === undefined || looksLikeOption(next)) {
        exitUsage(usage, prog, "argument --root: expected one argument");
      }
      root = next;
      i += 1;
      continue;
    }
    if (arg.startsWith("--root=")) {
      root = arg.slice("--root=".length);
      continue;
    }

    let matchedFlag = false;
    for (const flag of flags) {
      if (arg === flag.name) {
        flag.set();
        matchedFlag = true;
        break;
      }
      if (arg.startsWith(`${flag.name}=`)) {
        const value = arg.slice(flag.name.length + 1);
        exitUsage(usage, prog, `argument ${flag.name}: ignored explicit argument ${pyRepr(value)}`);
      }
    }
    if (matchedFlag) {
      continue;
    }

    if (arg === "--model") {
      const next = argv[i + 1];
      if (next === undefined || looksLikeOption(next)) {
        exitUsage(usage, prog, "argument --model: expected one argument");
      }
      models.push(next);
      i += 1;
      continue;
    }
    if (arg.startsWith("--model=")) {
      models.push(arg.slice("--model=".length));
      continue;
    }
    if (arg === "--tools") {
      const next = argv[i + 1];
      if (next === undefined || looksLikeOption(next)) {
        exitUsage(usage, prog, "argument --tools: expected one argument");
      }
      tools.push(next);
      i += 1;
      continue;
    }
    if (arg.startsWith("--tools=")) {
      tools.push(arg.slice("--tools=".length));
      continue;
    }
    if (arg === "--set") {
      const next = argv[i + 1];
      if (next === undefined || looksLikeOption(next)) {
        exitUsage(usage, prog, "argument --set: expected one argument");
      }
      sets.push(next);
      i += 1;
      continue;
    }
    if (arg.startsWith("--set=")) {
      sets.push(arg.slice("--set=".length));
      continue;
    }

    extras.push(arg);
  }

  if (extras.length > 0) {
    exitUsage(usage, prog, `unrecognized arguments: ${extras.join(" ")}`);
  }

  return { root, dryRun, list, check, sync, models, tools, sets };
}

function parseRoleArg(raw: string, what: "model" | "tools"): [Role, string] {
  if (!raw.includes("=")) {
    process.stderr.write(`usage: --${what} ROLE=VALUE (got ${pyRepr(raw)})\n`);
    process.exit(1);
  }
  const idx = raw.indexOf("=");
  const roleRaw = raw.slice(0, idx).trim();
  const value = raw.slice(idx + 1).trim();
  if (!(ROLES as readonly string[]).includes(roleRaw)) {
    process.stderr.write(
      `error: unknown role ${pyRepr(roleRaw)} (expected one of ${ROLES.join(", ")})\n`,
    );
    process.exit(1);
  }
  if (value === "") {
    process.stderr.write(`error: empty value for --${what} ${roleRaw}\n`);
    process.exit(1);
  }
  return [roleRaw as Role, value];
}

function main(argv: string[]): number {
  const prog = "update_harness.py";
  const args = parseArgs(argv, prog);

  // Python `os.path.abspath(args.root)`.
  const root = resolve(args.root);
  if (!isDir(root)) {
    err(`root '${args.root}' does not exist`);
    return 1;
  }

  const found = discover(root);
  if (found.configs.length === 0 && !ROLES.some((role) => found.roles[role].length > 0)) {
    err(
      `no harness surfaces found under ${root} (expected harness.config.json, ` +
        ".github/agents/, .claude/agents/, or the skill repo assets/)",
    );
    return 1;
  }

  if (args.check) {
    return checkState(root, found);
  }
  if (args.sync) {
    return syncState(root, found, args.dryRun);
  }
  if (args.list) {
    listState(root, found);
    return 0;
  }

  const models: Record<string, string> = {};
  for (const raw of args.models) {
    const [role, value] = parseRoleArg(raw, "model");
    models[role] = value;
  }
  const tools: Record<string, string[]> = {};
  for (const raw of args.tools) {
    const [role, value] = parseRoleArg(raw, "tools");
    const parsed = value
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    if (parsed.length === 0) {
      err(`empty tools list for role '${role}'`);
      return 2;
    }
    tools[role] = parsed;
  }
  const sets: Record<string, string> = {};
  for (const raw of args.sets) {
    if (!raw.includes("=")) {
      err(`usage: --set KEY=VALUE (got ${pyRepr(raw)})`);
      return 2;
    }
    const idx = raw.indexOf("=");
    const key = raw.slice(0, idx);
    const value = raw.slice(idx + 1);
    if (!(CONFIG_KEYS as readonly string[]).includes(key)) {
      err(`unknown config key '${key}' (allowed: ${CONFIG_KEYS.join(", ")})`);
      return 2;
    }
    sets[key] = value;
  }
  if ("harness_workspace" in sets || "install_mode" in sets) {
    info(
      "note: moving the workspace is a migration; see SKILL.md " +
        "'Migrate local to global' before relying on this change.",
    );
  }

  if (
    Object.keys(models).length === 0 &&
    Object.keys(tools).length === 0 &&
    Object.keys(sets).length === 0
  ) {
    process.stderr.write(mainUsage(prog));
    err("nothing to do: pass --list, --check, --sync, --model, --tools, or --set");
    return 2;
  }

  let failures = 0;
  if (found.configs.length > 0) {
    for (const path of found.configs) {
      const result = updateConfig(path, models, tools, sets, args.dryRun);
      if (result === ABSENT) {
        failures += 1;
      }
      info(`    ${result}: ${relative(root, path)}`);
    }
  } else if (Object.keys(sets).length > 0) {
    err("--set requires a harness config file, none found");
    failures += 1;
  }

  for (const role of ROLES) {
    const roleModel = models[role];
    const roleTools = tools[role];
    if (roleModel === undefined && roleTools === undefined) {
      continue;
    }
    const paths = found.roles[role];
    if (paths.length === 0) {
      info(`    ABSENT: no role file for '${role}' (config-only update)`);
      continue;
    }
    for (const path of paths) {
      const result = updateRoleFile(path, roleModel ?? null, roleTools ?? null, args.dryRun);
      if (result === ABSENT) {
        failures += 1;
      }
      info(`    ${result}: ${relative(root, path)}`);
    }
  }

  if (args.dryRun) {
    info("==> dry-run: nothing written");
  }
  if (failures) {
    return 1;
  }
  info(
    "==> update complete; run the verifier (./init.sh) to confirm the harness is still coherent",
  );
  return 0;
}

// Run when executed directly (mirrors Python `if __name__ == "__main__"`).
// Python `os.path.abspath(args.root)` never resolves symlinks for `--root`
// (unlike validate_harness's `Path.resolve()`), so `main` does the same:
// plain `path.resolve`, no `realpathSync`.
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}

export { main };

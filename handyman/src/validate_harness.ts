#!/usr/bin/env node
/**
 * Deterministic structure validator for a Handyman harness.
 *
 * Faithful port of `scripts/validate_harness.py`. Turns the manual *Analysis
 * Checklist* into reproducible checks: resolve HARNESS_WORKSPACE, verify the
 * required core files, parse feature_list.json, enforce the "at most one
 * in_progress" invariant, validate depends_on references (live or archived),
 * and confirm role files live in the platform path instead of inside the
 * harness workspace. Two non-blocking advisories (frontmatter + branch) print
 * NOTE lines to stderr without contributing to the gap list.
 *
 * Usage:
 *   node dist/validate_harness.js [--root PATH]
 *
 * Exit codes:
 *   0  the harness is well-formed
 *   1  root is not a directory, or one or more gaps were found
 *
 * The `--help`/usage contract is delegated to the shared argparse-compatible
 * shim (exit 2 on a bad flag), mirroring the Python `argparse` behaviour.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { computeEvidenceDebt } from "@handyman/toolbox-core/triage";
import { parseFrontmatter } from "./core/frontmatter.js";
import { PLATFORM_ROLE_DIRS, resolveWorkspace, validateFeatureList } from "./core/index.js";

/** Core files that must exist inside the resolved HARNESS_WORKSPACE. */
const REQUIRED_WORKSPACE_FILES = [
  "feature_list.json",
  "progress/current.md",
  "progress/history.md",
] as const;

/** The four-status feature contract (mirrors the schema enum). */
const VALID_STATUS = ["pending", "in_progress", "done", "blocked"] as const;

/** Required frontmatter keys per report type for the non-blocking advisory. */
const FRONTMATTER_REQUIRED: Record<string, readonly string[]> = {
  current: ["feature", "status", "role", "updated", "tags"],
  impl: ["feature", "status", "role", "updated", "tags"],
  review: ["feature", "status", "role", "updated", "tags"],
  explore: ["topic", "role", "updated", "tags"],
};

/** Pre-2.1 reports wrote `verdict:`/`date:`/`reviewer:` for what is now
 *  `status:`/`updated:`/`role:`. `done` already honors the legacy key
 *  (feature.ts `front.status ?? front.verdict`); the advisory must not flag
 *  as missing what the reader accepts. */
const FRONTMATTER_LEGACY_ALIASES: Record<string, string> = {
  status: "verdict",
  updated: "date",
  role: "reviewer",
};

interface Feature {
  id?: number;
  name?: string;
  status?: string;
  depends_on?: unknown;
  [key: string]: unknown;
}

/** Read + parse a JSON file, swallowing parse/IO errors (returns undefined). */
function readJsonSwallow(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return undefined;
  }
}

/** True when `path` is an existing file (Python `Path.is_file()`). */
function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** True when `path` is an existing directory (Python `Path.is_dir()`). */
function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function checkRequiredFiles(workspace: string, gaps: string[]): void {
  for (const rel of REQUIRED_WORKSPACE_FILES) {
    if (!isFile(join(workspace, rel))) {
      gaps.push(`missing harness file: ${join(workspace, rel)}`);
    }
  }
}

function archivedIds(workspace: string): Set<number> {
  /** Feature ids already moved to archive/feature_archive.json by sprint
   *  closes. Archived ids stay valid dependency targets. */
  const path = join(workspace, "archive", "feature_archive.json");
  if (!isFile(path)) {
    return new Set();
  }
  const archive = readJsonSwallow(path) as { sprints?: Record<string, unknown[]> } | undefined;
  if (!archive || typeof archive !== "object") {
    return new Set();
  }
  const ids = new Set<number>();
  for (const sprint of Object.values(archive.sprints ?? {})) {
    if (!Array.isArray(sprint)) {
      continue;
    }
    for (const entry of sprint) {
      if (entry && typeof entry === "object") {
        const id = (entry as Feature).id;
        if (typeof id === "number") {
          ids.add(id);
        }
      }
    }
  }
  return ids;
}

function featureIdent(feature: Feature): string {
  const name = feature.name;
  if (typeof name === "string" && name.length > 0) {
    return name;
  }
  const id = feature.id;
  return typeof id === "number" ? String(id) : "?";
}

function checkDependsOn(workspace: string, features: Feature[], gaps: string[]): void {
  /** Every depends_on id must reference a real feature: itself is a cycle,
   *  and an id that exists neither live nor in the sprint archive is dangling
   *  (the schema only checks the shape; this checks the references). */
  const known = new Set<unknown>();
  for (const feature of features) {
    if (typeof feature.id === "number") {
      known.add(feature.id);
    }
  }
  for (const id of archivedIds(workspace)) {
    known.add(id);
  }
  for (const feature of features) {
    const deps = feature.depends_on;
    if (!Array.isArray(deps)) {
      continue;
    }
    const ident = featureIdent(feature);
    for (const dep of deps) {
      if (dep === feature.id) {
        gaps.push(`feature '${ident}' depends on itself`);
      } else if (!known.has(dep)) {
        gaps.push(
          `feature '${ident}' depends_on unknown feature id ${dep} (not live, not archived)`,
        );
      }
    }
  }
}

function checkFeatureList(workspace: string, gaps: string[]): void {
  const listPath = join(workspace, "feature_list.json");
  if (!isFile(listPath)) {
    gaps.push(`feature_list.json not found: ${listPath}`);
    return;
  }
  const data = readJsonSwallow(listPath);
  if (data === undefined) {
    gaps.push(`feature_list.json does not parse: ${listPath}`);
    return;
  }
  const obj = data as { features?: unknown };
  const features = obj.features;
  if (!Array.isArray(features)) {
    gaps.push("feature_list.json has no 'features' array");
    return;
  }
  const featureList = features as Feature[];

  const inProgress = featureList.filter((f) => f && f.status === "in_progress");
  if (inProgress.length > 1) {
    const names = inProgress
      .map((f) => {
        const name = f.name;
        if (typeof name === "string" && name.length > 0) return name;
        const id = f.id;
        return typeof id === "number" ? String(id) : "?";
      })
      .join(", ");
    gaps.push(`more than one feature is in_progress (${inProgress.length}): ${names}`);
  }

  for (const feature of featureList) {
    if (!feature || typeof feature !== "object") {
      continue;
    }
    const status = feature.status;
    if (status !== undefined && !(VALID_STATUS as readonly string[]).includes(status)) {
      const ident = featureIdent(feature);
      gaps.push(`feature '${ident}' has invalid status '${status}'`);
    }
  }

  checkDependsOn(workspace, featureList, gaps);
}

/** Resolve the bundled feature_list JSON Schema (mirrors Python
 *  `_feature_list_schema_path`). `src/` (vitest) and `dist/` (built) sit one
 *  level below the package root, so `../assets/schemas/...` is correct. */
function featureListSchemaPath(): string {
  return new URL("../assets/schemas/feature_list.schema.json", import.meta.url).pathname;
}

function checkSchema(workspace: string, gaps: string[]): void {
  /** Validate the live feature_list.json against its JSON Schema. Catches keys
   *  the contract does not define (additionalProperties:false). Degrades
   *  gracefully when the schema file is unreachable in an installed target
   *  repo (the bundled core validator is always available via ajv, so the only
   *  skip condition is a missing schema asset). */
  const listPath = join(workspace, "feature_list.json");
  if (!isFile(listPath)) {
    return; // already reported by checkRequiredFiles / checkFeatureList
  }
  const schemaPath = featureListSchemaPath();
  if (!isFile(schemaPath)) {
    process.stderr.write(
      `NOTE: feature_list schema not found at ${schemaPath} - skipping schema validation.\n`,
    );
    return;
  }
  const data = readJsonSwallow(listPath);
  if (data === undefined) {
    gaps.push(`could not load schema or feature_list for validation: ${listPath}`);
    return;
  }
  const result = validateFeatureList(data);
  if (result.valid) {
    return;
  }
  // Python sorts jsonschema.iter_errors by list(error.path); ajv returns
  // instancePath-prefixed strings. Sort by the path prefix for stability.
  const sorted = [...result.errors].sort((a, b) => {
    const pa = a.split(":")[0] ?? "";
    const pb = b.split(":")[0] ?? "";
    return pa < pb ? -1 : pa > pb ? 1 : 0;
  });
  for (const error of sorted) {
    gaps.push(`feature_list.json schema violation at ${error}`);
  }
}

/** Python `Path.is_relative_to(root)` -> is `path` inside `root`? */
function isRelativeTo(path: string, root: string): boolean {
  const rel = relative(root, path);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

function checkRoleFiles(root: string, workspace: string, gaps: string[]): void {
  /** Role files must live in a platform path, never inside the workspace. */
  if (!existsSync(workspace)) {
    return;
  }
  const stray: string[] = [];
  /** Recursive walk for `*.agent.md` (mirrors Python `rglob`). */
  const stack = [workspace];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (dir === undefined) {
      continue;
    }
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let st: ReturnType<typeof statSync>;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        stack.push(full);
      } else if (st.isFile() && entry.endsWith(".agent.md")) {
        stray.push(isRelativeTo(full, root) ? relative(root, full) : full);
      }
    }
  }
  for (const rel of stray.sort()) {
    gaps.push(
      `role file inside HARNESS_WORKSPACE: ${rel} (move to ${(PLATFORM_ROLE_DIRS as readonly string[]).join(" or ")})`,
    );
  }
}

/** Return (keys, tags_line) from the leading YAML frontmatter, or (null, ""). */
function frontmatterKeys(text: string): { keys: string[] | null; tagsLine: string } {
  const lines = text.split("\n");
  if (lines.length === 0 || lines[0]?.trim() !== "---") {
    return { keys: null, tagsLine: "" };
  }
  const keys: string[] = [];
  let tagsLine = "";
  for (const line of lines.slice(1)) {
    if (line.trim() === "---") {
      break;
    }
    const match = /^([A-Za-z_][A-Za-z0-9_]*):/.exec(line);
    if (match && match[1] !== undefined) {
      keys.push(match[1]);
      if (match[1] === "tags") {
        tagsLine = line;
      }
    }
  }
  return { keys, tagsLine };
}

function checkFrontmatterAdvisory(workspace: string): void {
  /** Non-blocking advisory over progress/ and backlog/ report frontmatter.
   *  Only prints NOTE lines; never contributes to the gap list (cannot change
   *  the exit code). Empty placeholder files are skipped. */
  const targets: Array<{ kind: string; path: string }> = [];
  const current = join(workspace, "progress", "current.md");
  if (isFile(current)) {
    targets.push({ kind: "current", path: current });
  }
  const backlog = join(workspace, "backlog");
  if (isDir(backlog)) {
    const patterns: Array<{ kind: string; prefix: string }> = [
      { kind: "impl", prefix: "impl_" },
      { kind: "review", prefix: "review_" },
      { kind: "explore", prefix: "explore_" },
    ];
    let entries: string[];
    try {
      entries = readdirSync(backlog).sort();
    } catch {
      entries = [];
    }
    for (const { kind, prefix } of patterns) {
      for (const entry of entries) {
        if (entry.startsWith(prefix) && entry.endsWith(".md")) {
          targets.push({ kind, path: join(backlog, entry) });
        }
      }
    }
  }

  for (const { kind, path } of targets) {
    let text: string;
    try {
      text = readFileSync(path, "utf-8");
    } catch {
      continue;
    }
    if (text.trim() === "") {
      continue;
    }
    const required = FRONTMATTER_REQUIRED[kind] ?? [];
    const { keys, tagsLine } = frontmatterKeys(text);
    if (keys === null) {
      process.stderr.write(
        `NOTE: ${path} has no YAML frontmatter (expected ${required.join(", ")}).\n`,
      );
      continue;
    }
    const missing = required.filter((k) => {
      if (keys.includes(k)) return false;
      const alias = FRONTMATTER_LEGACY_ALIASES[k];
      return !(alias && keys.includes(alias));
    });
    if (missing.length > 0) {
      process.stderr.write(`NOTE: ${path} frontmatter is missing: ${missing.join(", ")}.\n`);
    }
    if (keys.includes("tags") && !tagsLine.includes("handyman/")) {
      process.stderr.write(`NOTE: ${path} tags do not use the #handyman/ namespace.\n`);
    }
  }
}

function checkEvidenceDebtAdvisory(workspace: string): void {
  /** Non-blocking advisory: a feature closed `done` whose backlog has no
   *  review_<name>.md left no reviewable evidence behind. `checkFrontmatterAdvisory`
   *  only inspects the reports that DO exist, so this is the other direction —
   *  the cross against feature_list.json that nothing in the gate did before.
   *
   *  NOTE, not gap, on purpose: breaking the exit code of installed harnesses
   *  that already carry legitimate debt is hostile. Warn first; hardening this
   *  later is a one-line change, and by then it has data behind it.
   *
   *  Reuses computeEvidenceDebt from the core (the same computation the
   *  triage route serves) rather than re-implementing the cross. */
  let debt: Array<{ name?: string; missing: string }>;
  try {
    debt = computeEvidenceDebt(workspace);
  } catch {
    return; // a bare or unreadable workspace is not this advisory's problem
  }
  for (const entry of debt) {
    process.stderr.write(
      `NOTE: feature '${entry.name ?? ""}' is done but ${join(workspace, "backlog", entry.missing)} is missing.\n`,
    );
  }
}

function checkActorCollisionAdvisory(workspace: string): void {
  /** Non-blocking advisory: when impl_<f>.md and review_<f>.md declare the same
   *  `actor:`, one agent both wrote the code and signed off on it.
   *
   *  This makes the deviation VISIBLE, it does not prevent it - an agent that
   *  runs all three roles and writes three different actor values passes this
   *  check untouched. Preventing it is process (separate sessions), not code,
   *  and pretending a checker covers it would be worse than saying so.
   *
   *  `actor:` is OPTIONAL on purpose: the reports that installed harnesses
   *  already wrote have no such field, and invalidating them would be hostile.
   *  A report without it is simply silent here. */
  const backlog = join(workspace, "backlog");
  if (!isDir(backlog)) {
    return;
  }
  let entries: string[];
  try {
    entries = readdirSync(backlog).sort();
  } catch {
    return;
  }
  const actorOf = (prefix: string, feature: string): string | null => {
    const path = join(backlog, `${prefix}_${feature}.md`);
    if (!isFile(path)) {
      return null;
    }
    const actor = parseFrontmatter(path).actor;
    return typeof actor === "string" && actor.trim() !== "" ? actor.trim() : null;
  };
  for (const entry of entries) {
    if (!entry.startsWith("impl_") || !entry.endsWith(".md")) {
      continue;
    }
    const feature = entry.slice("impl_".length, -".md".length);
    const implActor = actorOf("impl", feature);
    const reviewActor = actorOf("review", feature);
    if (implActor !== null && reviewActor !== null && implActor === reviewActor) {
      process.stderr.write(
        `NOTE: feature '${feature}' was implemented and reviewed by the same actor ` +
          `('${implActor}'): the review is not independent.\n`,
      );
    }
  }
}

function checkBranchAdvisory(root: string, workspace: string): void {
  /** Non-blocking advisory: the session in progress/current.md records the
   *  branch it started on; when that differs from the currently checked-out
   *  branch, the session belongs to another line of work. Prints a NOTE and
   *  never contributes to the gap list. */
  const current = join(workspace, "progress", "current.md");
  if (!isFile(current)) {
    return;
  }
  let text: string;
  try {
    text = readFileSync(current, "utf-8");
  } catch {
    return;
  }
  let recorded: string | null = null;
  for (const line of text.split(/\r\n|\r|\n/)) {
    const stripped = line.trim();
    if (stripped.startsWith("- **Branch:**")) {
      const value = stripped.slice("- **Branch:**".length).trim();
      if (value !== "" && value !== "_-_") {
        recorded = value;
      }
      break;
    }
  }
  if (recorded === null) {
    return;
  }
  const result = spawnSync("git", ["symbolic-ref", "--short", "-q", "HEAD"], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
  });
  if (result.error) {
    return;
  }
  const actual = (result.stdout ?? "").trim();
  if (result.status !== 0 || actual === "") {
    return;
  }
  if (actual !== recorded) {
    process.stderr.write(
      `NOTE: progress/current.md session belongs to branch '${recorded}' but '${actual}' is checked out - resume there, block the session (feature.py block), or use a git worktree.\n`,
    );
  }
}

function validate(root: string): { gaps: string[]; workspace: string } {
  const gaps: string[] = [];
  const workspace = resolveWorkspace(root);
  checkRequiredFiles(workspace, gaps);
  checkFeatureList(workspace, gaps);
  checkSchema(workspace, gaps);
  checkRoleFiles(root, workspace, gaps);
  return { gaps, workspace };
}

function printUsage(prog: string): void {
  process.stderr.write(
    `usage: ${prog} [-h] [--root ROOT]\n` +
      `\n` +
      `Deterministic structure validator for a Handyman harness.\n` +
      `\n` +
      `Turns the manual *Analysis Checklist* into reproducible checks: resolve\n` +
      `HARNESS_WORKSPACE, verify the required core files, parse feature_list.json,\n` +
      `enforce the "at most one in_progress" invariant, and confirm role files live\n` +
      `in the platform path instead of inside the harness workspace.\n` +
      `\n` +
      `options:\n` +
      `  -h, --help  show this help message and exit\n` +
      `  --root ROOT\n` +
      `        Project root that holds the harness (default: current directory).\n`,
  );
}

/** Minimal argparse-compatible parser: only `--root` and `-h/--help`, exit 2 on
 *  any other flag or a stray positional (mirrors Python argparse semantics). */
function parseArgs(argv: string[]): { root: string } | number {
  const prog = "validate_harness.py";
  let root = ".";
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === undefined) {
      i += 1;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      printUsage(prog);
      return 0;
    }
    if (arg === "--root") {
      const next = argv[i + 1];
      if (next === undefined) {
        process.stderr.write(`${prog}: error: argument --root: expected one argument\n`);
        printUsage(prog);
        return 2;
      }
      root = next;
      i += 2;
      continue;
    }
    if (arg.startsWith("--root=")) {
      root = arg.slice("--root=".length);
      i += 1;
      continue;
    }
    process.stderr.write(`${prog}: error: unrecognized arguments: ${arg}\n`);
    printUsage(prog);
    return 2;
  }
  return { root };
}

function main(argv: string[]): number {
  const parsed = parseArgs(argv);
  if (typeof parsed === "number") {
    return parsed;
  }
  const rootArg = resolve(parsed.root);
  // Python `Path(args.root).resolve()`: absolutize then resolve symlinks
  // (macOS `/var` -> `/private/var`). realpathSync throws if the path is gone;
  // fall back to the lexical resolve so the "root is not a directory" branch
  // still prints a stable, absolute path.
  let root = rootArg;
  try {
    root = realpathSync(rootArg);
  } catch {
    root = rootArg;
  }
  if (!isDir(root)) {
    process.stderr.write(`validate_harness: root is not a directory: ${root}\n`);
    return 1;
  }
  const { gaps, workspace } = validate(root);
  checkFrontmatterAdvisory(workspace);
  checkEvidenceDebtAdvisory(workspace);
  checkActorCollisionAdvisory(workspace);
  checkBranchAdvisory(root, workspace);

  if (gaps.length > 0) {
    process.stderr.write(`validate_harness: FAIL (HARNESS_WORKSPACE=${workspace})\n`);
    for (const gap of gaps) {
      process.stderr.write(`    ${gap}\n`);
    }
    return 1;
  }
  process.stdout.write(`validate_harness: OK (HARNESS_WORKSPACE=${workspace})\n`);
  return 0;
}

// Entry guard: run only when invoked directly (not when imported by a test).
// Basename check, not import.meta.url: bundle-proof (see toolbox.ts).
if (basename(process.argv[1] ?? "") === "validate_harness.js") {
  const code = main(process.argv.slice(2));
  process.exit(code);
}

export { main };

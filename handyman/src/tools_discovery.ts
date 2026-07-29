#!/usr/bin/env node
/**
 * Handyman skill, MCP, and agent discovery helper.
 *
 * Faithful port of `scripts/tools_discovery.py`. Platform discovery of skills
 * and MCP servers is *semantic*: a skill triggers on its `description`
 * (progressive disclosure) and an MCP tool surfaces through a deferred list
 * plus a semantic `tool_search`. This CLI is the deterministic counterpart the
 * harness asks for in `docs/archive/analisis-tool-discovery.md`: it lists the installed
 * skills, finds them by keyword without a similarity model, and checks the
 * `discovery` block of `harness.config.json` against what is actually on disk.
 *
 * It does not — and cannot — force the platform to trigger a skill; it only
 * makes the *declaration* and the *existence* of skills, MCP servers, and
 * consultation agents reproducible and auditable.
 *
 * Operations:
 *   list               Print every installed skill (name + description).
 *   find KEYWORD       Print installed skills whose name/description match KEYWORD.
 *   check              Cross-check the declared discovery block (skills, agents, MCP)
 *                      against disk, printing the resolved path of each present
 *                      skill and agent as a direct reference.
 *   declare KIND NAME  Add a skill, MCP server, or agent to the `discovery` block
 *                      of harness.config.json (json round-trip; rejects duplicates;
 *                      validates against the schema).
 *
 * Usage:
 *   node dist/tools_discovery.js [--root PATH] [--skills-dir DIR ...] list [--json]
 *   node dist/tools_discovery.js [--root PATH] [--skills-dir DIR ...] find KEYWORD [--json]
 *   node dist/tools_discovery.js [--root PATH] [--skills-dir DIR ...] check
 *   node dist/tools_discovery.js [--root PATH] declare <skill|mcp|agent> NAME [--dry-run]
 *
 * Skill roots resolve from --skills-dir (verbatim override), else the
 * project-local roots (<root>/.agents/skills, .claude/skills, .github/skills)
 * FIRST, then the global roots from $HANDYMAN_SKILL_ROOTS (os.pathsep-separated)
 * or the ~/... defaults — "always local, then global". Missing roots are
 * skipped (graceful degradation).
 *
 * MCP servers are validated against on-disk host manifests declared in
 * MCP_CONFIG_SOURCES (VS Code's .vscode/mcp.json today; the registry is open to
 * new hosts): a declared server present in a manifest is `ok`, an absent one is
 * a non-gating NOTE (it may be host/extension-provided), and a
 * configured-but-undeclared server is noted. With no manifest on disk, `check`
 * falls back to shape validation.
 *
 * Agents (consultation subagents) are role files (`*.agent.md`) under the
 * platform role directories imported from the core (`.github/agents`,
 * `.claude/agents`). Because a role file is a document on disk, a declared
 * agent is verified like a skill: present is `ok` with its path, absent is
 * `MISSING` and gates. The contract declares *names* (portable); `check`
 * resolves and prints the *path* (machine-specific) as a direct reference — it
 * is never persisted in the declaration.
 *
 * Exit codes: 0 ok, 1 a declared skill or agent is missing (check) or a declare
 * error (missing config, duplicate, schema-invalid result), 2 usage error.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { parseFrontmatter } from "./core/frontmatter.js";
import {
  PLATFORM_ROLE_DIRS,
  resolveWorkspace,
  unifiedDiff,
  validateHarnessConfig,
} from "./core/index.js";

const DEFAULT_LOCAL_SKILL_DIRS = [".agents/skills", ".claude/skills", ".github/skills"];
const DEFAULT_GLOBAL_SKILL_ROOTS = ["~/.agents/skills", "~/.claude/skills", "~/.github/skills"];

/**
 * MCP server configuration sources, in precedence order. Each row maps a host
 * label to its workspace-relative config file and the JSON key holding the
 * server map. The registry is intentionally open: add a row to support a new
 * host (for example ".cursor/mcp.json" or a root ".mcp.json") without touching
 * the logic below.
 */
const MCP_CONFIG_SOURCES: ReadonlyArray<readonly [string, string, string]> = [
  ["vscode", ".vscode/mcp.json", "servers"],
];

const DECLARE_KEYS: Readonly<Record<string, string>> = {
  skill: "skills",
  mcp: "mcp",
  agent: "agents",
};
const DECLARE_KINDS = Object.keys(DECLARE_KEYS).sort(); // sorted(_DECLARE_KEYS)

interface SkillEntry {
  name: string;
  description: string;
  path: string;
}

/** stderr `error: {msg}` + return code 2 (argparse-style usage error). */
function errUsage(msg: string): number {
  process.stderr.write(`error: ${msg}\n`);
  return 2;
}

function info(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Read + parse a JSON file, swallowing parse/IO errors (returns {}). */
function readJsonSwallow(path: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Expand a leading `~` to the home directory (Python `Path.expanduser`). */
function expandUser(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

/**
 * Resolve the ordered skill roots to scan, *local first, then global*.
 *
 * `--skills-dir` is an explicit, hermetic override and is used verbatim.
 * Otherwise the project-local roots are scanned BEFORE the global roots (from
 * `$HANDYMAN_SKILL_ROOTS`, else the `~/...` defaults). Because the first
 * occurrence of a skill name wins (see `discoverSkills`), a locally vendored
 * skill shadows a same-named global one — "always local, then global". Missing
 * roots are skipped.
 */
function skillRoots(cliDirs: string[] | null, root: string | null = null): string[] {
  let raw: string[];
  if (cliDirs && cliDirs.length > 0) {
    raw = [...cliDirs];
  } else {
    const base = expandUser(root ?? ".");
    const local = DEFAULT_LOCAL_SKILL_DIRS.map((rel) => join(base, rel));
    const envRoots = process.env.HANDYMAN_SKILL_ROOTS;
    const globalRoots =
      envRoots && envRoots.length > 0 ? envRoots.split(":") : [...DEFAULT_GLOBAL_SKILL_ROOTS];
    raw = [...local, ...globalRoots];
  }
  const roots: string[] = [];
  for (const item of raw) {
    const path = expandUser(item);
    if (isDir(path) && !roots.includes(path)) {
      roots.push(path);
    }
  }
  return roots;
}

/** Sorted, de-duplicated child SKILL.md paths under a root (Python STAR-slash-SKILL.md glob). */
function sortedSkillMd(root: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return [];
  }
  const paths: string[] = [];
  for (const name of entries) {
    const child = join(root, name);
    if (isDir(child)) {
      const skillMd = join(child, "SKILL.md");
      if (isFile(skillMd)) {
        paths.push(skillMd);
      }
    }
  }
  // Python `sorted(root.glob("*/SKILL.md"))` sorts the Path objects (by str).
  paths.sort();
  return paths;
}

/** Sorted `*.agent.md` paths directly under a directory (Python glob). */
function sortedAgentMd(directory: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    return [];
  }
  const paths: string[] = [];
  for (const name of entries) {
    if (name.endsWith(".agent.md")) {
      const full = join(directory, name);
      if (isFile(full)) {
        paths.push(full);
      }
    }
  }
  paths.sort();
  return paths;
}

/**
 * Return a sorted, de-duplicated catalog of installed skills.
 *
 * A skill is any `<root>/<dir>/SKILL.md`. Its name is the frontmatter `name`
 * (falling back to the directory name) and its description is the frontmatter
 * `description` (possibly empty). First occurrence wins on duplicate names.
 */
function discoverSkills(roots: readonly string[]): SkillEntry[] {
  const seen = new Map<string, SkillEntry>();
  for (const root of roots) {
    for (const skillMd of sortedSkillMd(root)) {
      const front = parseFrontmatter(skillMd);
      const dirName = skillMd.split(sep).slice(-2, -1)[0] ?? "";
      const name = front.name || dirName;
      if (seen.has(name)) {
        continue;
      }
      seen.set(name, {
        name,
        description: front.description ?? "",
        path: skillMd,
      });
    }
  }
  const names = [...seen.keys()].sort();
  return names.map((n) => seen.get(n) as SkillEntry);
}

/**
 * Return a sorted, de-duplicated catalog of consultation agents (role files).
 *
 * An agent is any `<root>/<dir>/*.agent.md` where `<dir>` is one of the platform
 * role directories (`.github/agents`, `.claude/agents`). Its name is the
 * frontmatter `name` (falling back to the file stem without the `.agent`
 * suffix) and its description is the frontmatter `description`. First
 * occurrence wins on duplicate names.
 */
function discoverAgents(root: string): SkillEntry[] {
  const seen = new Map<string, SkillEntry>();
  for (const rel of PLATFORM_ROLE_DIRS) {
    const directory = join(root, rel);
    if (!isDir(directory)) {
      continue;
    }
    for (const agentMd of sortedAgentMd(directory)) {
      const front = parseFrontmatter(agentMd);
      const base = agentMd.split(sep).pop() ?? "";
      const stem = base.endsWith(".agent.md") ? base.slice(0, -".agent.md".length) : base;
      const name = front.name || stem;
      if (seen.has(name)) {
        continue;
      }
      seen.set(name, {
        name,
        description: front.description ?? "",
        path: agentMd,
      });
    }
  }
  const names = [...seen.keys()].sort();
  return names.map((n) => seen.get(n) as SkillEntry);
}

/**
 * Read the `discovery` block following the config precedence.
 *
 * Order: harness.config.json -> feature_list.json config (in the workspace).
 * Returns null when no discovery block is declared.
 */
function readDiscovery(root: string): Record<string, unknown> | null {
  const config = join(root, "harness.config.json");
  if (isFile(config)) {
    const data = readJsonSwallow(config);
    const disc = data.discovery;
    if (disc !== null && typeof disc === "object") {
      return disc as Record<string, unknown>;
    }
  }
  const workspace = resolveWorkspace(root);
  const featureList = join(workspace, "feature_list.json");
  if (isFile(featureList)) {
    const data = readJsonSwallow(featureList);
    const cfg = data.config;
    if (cfg !== null && typeof cfg === "object") {
      const disc = (cfg as Record<string, unknown>).discovery;
      if (disc !== null && typeof disc === "object") {
        return disc as Record<string, unknown>;
      }
    }
  }
  return null;
}

/**
 * Return a map of configured MCP server name -> host label.
 *
 * Scans every source in `MCP_CONFIG_SOURCES` relative to the project root.
 * Missing files and malformed JSON are skipped (graceful degradation); the
 * first host to declare a name wins.
 */
function discoverMcpServers(root: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const [host, rel, key] of MCP_CONFIG_SOURCES) {
    const path = join(root, rel);
    if (!isFile(path)) {
      continue;
    }
    let data: unknown;
    try {
      data = JSON.parse(readFileSync(path, "utf-8"));
    } catch {
      continue;
    }
    const block = data && typeof data === "object" ? (data as Record<string, unknown>)[key] : null;
    if (block !== null && typeof block === "object" && !Array.isArray(block)) {
      for (const name of Object.keys(block as Record<string, unknown>)) {
        if (!found.has(name)) {
          found.set(name, host);
        }
      }
    } else if (Array.isArray(block)) {
      for (const item of block) {
        if (typeof item === "string") {
          if (!found.has(item)) {
            found.set(item, host);
          }
        } else if (item !== null && typeof item === "object") {
          const name = (item as Record<string, unknown>).name;
          if (typeof name === "string" && !found.has(name)) {
            found.set(name, host);
          }
        }
      }
    }
  }
  return found;
}

/** List the MCP config files that actually exist under the project root. */
function mcpSourcesPresent(root: string): string[] {
  return MCP_CONFIG_SOURCES.filter(([, rel]) => isFile(join(root, rel))).map(([, rel]) => rel);
}

function cmdList(args: ParsedArgs): number {
  const roots = skillRoots(args.skillsDir, args.root);
  const skills = discoverSkills(roots);
  if (args.json) {
    process.stdout.write(`${asciiStringify(skills)}\n`);
    return 0;
  }
  if (skills.length === 0) {
    const labels = roots.map((r) => r).join(", ") || "<none>";
    info(`no skills found in: ${labels}`);
    return 0;
  }
  for (const skill of skills) {
    info(`${skill.name}\t${skill.description}`);
  }
  return 0;
}

function cmdFind(args: ParsedArgs): number {
  const needle = (args.keyword ?? "").toLowerCase();
  const roots = skillRoots(args.skillsDir, args.root);
  const matches = discoverSkills(roots).filter(
    (s) => s.name.toLowerCase().includes(needle) || s.description.toLowerCase().includes(needle),
  );
  if (args.json) {
    process.stdout.write(`${asciiStringify(matches)}\n`);
    return 0;
  }
  if (matches.length === 0) {
    info(`no skill matches '${args.keyword}'`);
    return 0;
  }
  for (const skill of matches) {
    info(`${skill.name}\t${skill.description}`);
  }
  return 0;
}

function cmdCheck(args: ParsedArgs): number {
  const root = resolve(args.root ?? ".");
  const discovery = readDiscovery(root);
  if (discovery === null) {
    info("no discovery block declared; nothing to verify");
    return 0;
  }

  const roots = skillRoots(args.skillsDir, root);
  const skillPath = new Map<string, string>();
  for (const s of discoverSkills(roots)) {
    skillPath.set(s.name, s.path);
  }
  const installed = new Set(skillPath.keys());

  const declaredSkills = asStringList(discovery.skills);
  const missing = declaredSkills.filter((s) => !installed.has(s));
  for (const name of declaredSkills) {
    if (missing.includes(name)) {
      info(`skill ${name}: MISSING`);
    } else {
      info(`skill ${name}: ok -> ${skillPath.get(name) ?? ""}`);
    }
  }

  // NOTE only project-local installs: a skill under the user's global roots is
  // their personal toolbox, not this repo's contract, and listing every global
  // install buried the signal under dozens of NOTEs. An explicit --skills-dir
  // is a hermetic override and keeps the full report.
  const projectLocal = (n: string) =>
    args.skillsDir !== null || (skillPath.get(n) ?? "").startsWith(root + sep);
  const undeclared = [...installed]
    .filter((n) => !declaredSkills.includes(n) && projectLocal(n))
    .sort();
  for (const name of undeclared) {
    info(`NOTE: installed but not declared: ${name}`);
  }

  const declaredAgents = asStringList(discovery.agents);
  const agentPath = new Map<string, string>();
  for (const a of discoverAgents(root)) {
    agentPath.set(a.name, a.path);
  }
  const installedAgents = new Set(agentPath.keys());
  const missingAgents = declaredAgents.filter((a) => !installedAgents.has(a));
  for (const name of declaredAgents) {
    if (missingAgents.includes(name)) {
      info(`agent ${name}: MISSING`);
    } else {
      info(`agent ${name}: ok -> ${agentPath.get(name) ?? ""}`);
    }
  }
  for (const name of [...installedAgents].filter((n) => !declaredAgents.includes(n)).sort()) {
    info(`NOTE: installed but not declared: agent ${name}`);
  }

  const declaredMcp = asStringList(discovery.mcp);
  const configured = discoverMcpServers(root);
  const sources = mcpSourcesPresent(root);
  for (const name of declaredMcp) {
    if (!(typeof name === "string" && name.trim().length > 0)) {
      info(`mcp ${name}: INVALID`);
    } else if (configured.has(name)) {
      info(`mcp ${name}: ok (configured in ${configured.get(name) ?? ""})`);
    } else if (sources.length > 0) {
      info(`mcp ${name}: NOTE not configured in ${sources.join(", ")} (host-provided?)`);
    } else {
      info(`mcp ${name}: ok (declared, not verifiable on disk)`);
    }
  }

  if (sources.length > 0) {
    const declaredNames = new Set(declaredMcp.filter((n) => typeof n === "string"));
    for (const name of [...configured.keys()].filter((n) => !declaredNames.has(n)).sort()) {
      info(`NOTE: configured but not declared: ${name} (${configured.get(name) ?? ""})`);
    }
  }

  if (missing.length > 0) {
    process.stderr.write(
      `error: ${missing.length} declared skill(s) missing: ${missing.join(", ")}\n`,
    );
    return 1;
  }
  if (missingAgents.length > 0) {
    process.stderr.write(
      `error: ${missingAgents.length} declared agent(s) missing: ${missingAgents.join(", ")}\n`,
    );
    return 1;
  }
  return 0;
}

/** Self-locating schema validation; returns null when ok or gracefully skipped. */
function validateConfig(data: unknown): string | null {
  const result = validateHarnessConfig(data);
  if (result.valid) {
    return null;
  }
  // Python joins jsonschema messages with "; "; ajv messages are not
  // byte-identical to jsonschema but the oracle never asserts their wording
  // (same precedent as the validate_harness/evals ports).
  return result.errors.length > 0 ? result.errors.join("; ") : "invalid";
}

function cmdDeclare(args: ParsedArgs): number {
  const root = resolve(args.root ?? ".");
  const configPath = join(root, "harness.config.json");
  if (!isFile(configPath)) {
    process.stderr.write(`error: no harness.config.json under ${root}\n`);
    return 1;
  }
  let data: Record<string, unknown>;
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf-8"));
    data = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    process.stderr.write(`error: cannot parse ${configPath}\n`);
    return 1;
  }
  const name = (args.name ?? "").trim();
  if (name.length === 0) {
    return errUsage("empty name");
  }
  const key = DECLARE_KEYS[args.kind] as string;
  let discovery = data.discovery;
  if (!(discovery !== null && typeof discovery === "object")) {
    discovery = { skills: [], mcp: [], agents: [] };
    data.discovery = discovery;
  }
  const discMap = discovery as Record<string, unknown>;
  const rawEntries = discMap[key];
  let entries: unknown[];
  if (Array.isArray(rawEntries)) {
    entries = rawEntries;
  } else {
    entries = [];
    discMap[key] = entries;
  }
  if (entries.includes(name)) {
    process.stderr.write(`error: ${args.kind} '${name}' already declared in discovery.${key}\n`);
    return 1;
  }
  entries.push(name);
  const problem = validateConfig(data);
  if (problem !== null) {
    process.stderr.write(`error: result would not validate against the schema: ${problem}\n`);
    return 1;
  }
  const newText = `${asciiStringify(data)}\n`;
  if (args.dryRun) {
    const oldText = readFileSync(configPath, "utf-8");
    const diff = unifiedDiff(keepEndsLines(oldText), keepEndsLines(newText), {
      fromFile: configPath,
      toFile: `${configPath} (declared)`,
    });
    process.stdout.write(diff.join(""));
    info(`dry-run: would declare ${args.kind} '${name}' in discovery.${key}`);
    return 0;
  }
  writeFileSync(configPath, newText, { encoding: "utf-8" });
  info(`declared ${args.kind} '${name}' in discovery.${key} of ${configPath}`);
  return 0;
}

// --- JSON serialization (Python json.dumps(indent=2, ensure_ascii=True)) ------

/**
 * Serialize a value exactly like Python `json.dumps(data, indent=2)`, which
 * defaults to `ensure_ascii=True`: non-ASCII characters escape as lowercase
 * `\uXXXX` (astral chars as UTF-16 surrogate pairs, which is how JS strings
 * already encode them). 2-space indent; empty containers stay inline; key
 * order is insertion order. The Python `declare` write and the `--json` outputs
 * both use this default (NOT `ensure_ascii=False`), so a plain
 * `JSON.stringify(_, null, 2)` would diverge on any non-ASCII content.
 */
function asciiStringify(data: unknown): string {
  return emit(data, 0);
}

function indent(n: number): string {
  return "  ".repeat(n);
}

function emit(data: unknown, depth: number): string {
  if (data === null) {
    return "null";
  }
  if (typeof data === "boolean") {
    return data ? "true" : "false";
  }
  if (typeof data === "number") {
    return Number.isFinite(data) ? String(data) : "null";
  }
  if (typeof data === "string") {
    return quoteAscii(data);
  }
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return "[]";
    }
    const inner = data.map((v) => `${indent(depth + 1)}${emit(v, depth + 1)}`).join(",\n");
    return `[\n${inner}\n${indent(depth)}]`;
  }
  if (typeof data === "object") {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) {
      return "{}";
    }
    const inner = entries
      .map(([k, v]) => `${indent(depth + 1)}${quoteAscii(k)}: ${emit(v, depth + 1)}`)
      .join(",\n");
    return `{\n${inner}\n${indent(depth)}}`;
  }
  return "null";
}

/**
 * Quote a string with Python `json.dumps(ensure_ascii=True)` escaping:
 * `"` and `\`, the `\b \t \n \f \r` short forms, control chars (`\u00xx`), and
 * everything outside 0x20..0x7e (`\uXXXX`). Lowercase hex, 4 digits. Iterating
 * by UTF-16 code unit naturally yields surrogate pairs for astral characters.
 */
function quoteAscii(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x22) {
      out += '\\"';
    } else if (c === 0x5c) {
      out += "\\\\";
    } else if (c === 0x08) {
      out += "\\b";
    } else if (c === 0x09) {
      out += "\\t";
    } else if (c === 0x0a) {
      out += "\\n";
    } else if (c === 0x0c) {
      out += "\\f";
    } else if (c === 0x0d) {
      out += "\\r";
    } else if (c < 0x20 || c > 0x7e) {
      out += `\\u${c.toString(16).padStart(4, "0")}`;
    } else {
      out += s.charAt(i);
    }
  }
  return `${out}"`;
}

/**
 * Split keeping line terminators (Python `str.splitlines(keepends=True)`), for
 * the difflib `unified_diff` input. Handles `\n`, `\r\n`, and `\r`; other rare
 * Python line boundaries never occur in harness JSON.
 */
function keepEndsLines(text: string): string[] {
  const lines: string[] = [];
  let start = 0;
  let i = 0;
  while (i < text.length) {
    const code = text.charCodeAt(i);
    if (code === 0x0a || code === 0x0d) {
      const end = code === 0x0d && text.charCodeAt(i + 1) === 0x0a ? i + 2 : i + 1;
      lines.push(text.slice(start, end));
      i = end;
      start = i;
    } else {
      i += 1;
    }
  }
  if (start < text.length) {
    lines.push(text.slice(start));
  }
  return lines;
}

// --- small helpers for discovery block shapes --------------------------------

/** Coerce a discovery entry to a list of strings (Python `discovery.get(...) or []`). */
function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  return [];
}

// --- argparse-parity CLI ------------------------------------------------------

interface ParsedArgs {
  root: string | null;
  skillsDir: string[] | null;
  command: string;
  json: boolean;
  dryRun: boolean;
  keyword: string | null;
  kind: string;
  name: string | null;
}

/**
 * True when a token reads as an option, not a positional (argparse heuristic).
 * A token that contains a space is never an option (argparse's `' ' in arg`
 * rule); negative numbers are positionals (`_negative_number_matcher`).
 */
function looksLikeOption(token: string): boolean {
  return (
    token.length > 1 &&
    token.startsWith("-") &&
    !token.includes(" ") &&
    !/^-\d+$|^-\d*\.\d+$/.test(token)
  );
}

/** Global usage line, wrapped like argparse (continuation aligned under the
 *  first option, i.e. `len("usage: ") + len(prog) + 1` columns). */
function globalUsage(prog: string): string {
  const pad = " ".repeat("usage: ".length + prog.length + 1);
  return (
    `usage: ${prog} [-h] [--root ROOT] [--skills-dir SKILLS_DIR]\n` +
    `${pad}{list,find,check,declare} ...\n`
  );
}

/**
 * Per-subcommand usage line (argparse composes the subparser prog as
 * `<prog> <command>`). Only the declare/find lines are ever printed in an
 * error (missing-required / invalid-choice); list/check only error on
 * unrecognized arguments, which argparse attributes to the global parser.
 */
function subUsage(prog: string, command: string): string {
  const subProg = `${prog} ${command}`;
  switch (command) {
    case "find":
      return `usage: ${subProg} [-h] [--json] keyword\n`;
    case "declare":
      return `usage: ${subProg} [-h] [--dry-run] {agent,mcp,skill} name\n`;
    case "list":
      return `usage: ${subProg} [-h] [--json]\n`;
    default:
      return `usage: ${subProg} [-h]\n`;
  }
}

/**
 * argparse `parser.error(...)`: usage to stderr, `<prog>: error: msg`, exit 2.
 * `prog` is either the global prog (unrecognized-argument errors, which
 * argparse attributes to the main parser) or the subparser prog
 * `<prog> <command>` (missing-required / invalid-choice errors).
 */
function failUsage(usage: string, prog: string, message: string): never {
  process.stderr.write(usage);
  process.stderr.write(`${prog}: error: ${message}\n`);
  process.exit(2);
}

/**
 * Parse argv like the Python argparse parser with subparsers. Global options
 * (`--root`, `--skills-dir`, `-h/--help`) precede the subcommand; each
 * subcommand then parses its own options/positionals. Exit 2 on usage error,
 * 0 on help.
 */
function parseArgs(argv: string[], prog: string): ParsedArgs {
  const usage = globalUsage(prog);
  const args: ParsedArgs = {
    root: null,
    skillsDir: null,
    command: "",
    json: false,
    dryRun: false,
    keyword: null,
    kind: "",
    name: null,
  };
  let i = 0;

  // --- global phase: --root / --skills-dir / -h until the subcommand -------
  while (i < argv.length) {
    const arg = argv[i] as string;
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(helpText(prog));
      process.exit(0);
    }
    if (arg === "--root") {
      const next = argv[i + 1];
      if (next === undefined || looksLikeOption(next)) {
        failUsage(usage, prog, "argument --root: expected one argument");
      }
      args.root = next;
      i += 2;
      continue;
    }
    if (arg.startsWith("--root=")) {
      args.root = arg.slice("--root=".length);
      i += 1;
      continue;
    }
    if (arg === "--skills-dir") {
      const next = argv[i + 1];
      if (next === undefined || looksLikeOption(next)) {
        failUsage(usage, prog, "argument --skills-dir: expected one argument");
      }
      args.skillsDir = appendSkillDir(args.skillsDir, next);
      i += 2;
      continue;
    }
    if (arg.startsWith("--skills-dir=")) {
      args.skillsDir = appendSkillDir(args.skillsDir, arg.slice("--skills-dir=".length));
      i += 1;
      continue;
    }
    // First non-option token is the subcommand.
    if (looksLikeOption(arg)) {
      failUsage(usage, prog, `unrecognized arguments: ${arg}`);
    }
    break;
  }

  if (i >= argv.length) {
    failUsage(usage, prog, "the following arguments are required: command");
  }

  const command = argv[i] as string;
  args.command = command;
  i += 1;
  const rest = argv.slice(i);

  switch (command) {
    case "list":
      return parseList(rest, args, prog);
    case "find":
      return parseFind(rest, args, prog);
    case "check":
      return parseCheck(rest, args, prog);
    case "declare":
      return parseDeclare(rest, args, prog);
    default:
      failUsage(
        usage,
        prog,
        `argument {list,find,check,declare}: invalid choice: '${command}' (choose from 'list', 'find', 'check', 'declare')`,
      );
  }
}

function parseList(rest: string[], args: ParsedArgs, prog: string): ParsedArgs {
  const gUsage = globalUsage(prog);
  const positionals: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i] as string;
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(`${subUsage(prog, "list")}\npositional ...\n`);
      process.exit(0);
    }
    if (arg === "--json") {
      args.json = true;
      continue;
    }
    if (arg.startsWith("--json=")) {
      failUsage(
        gUsage,
        prog,
        `argument --json: ignored explicit argument ${arg.slice("--json=".length)}`,
      );
    }
    if (looksLikeOption(arg)) {
      failUsage(gUsage, prog, `unrecognized arguments: ${arg}`);
    }
    positionals.push(arg);
  }
  if (positionals.length > 0) {
    failUsage(gUsage, prog, `unrecognized arguments: ${positionals.join(" ")}`);
  }
  return args;
}

function parseFind(rest: string[], args: ParsedArgs, prog: string): ParsedArgs {
  const gUsage = globalUsage(prog);
  const subProg = `${prog} find`;
  const sUsage = subUsage(prog, "find");
  const positionals: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i] as string;
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(`${sUsage}\npositional ...\n`);
      process.exit(0);
    }
    if (arg === "--json") {
      args.json = true;
      continue;
    }
    if (arg.startsWith("--json=")) {
      failUsage(
        gUsage,
        prog,
        `argument --json: ignored explicit argument ${arg.slice("--json=".length)}`,
      );
    }
    if (looksLikeOption(arg)) {
      failUsage(gUsage, prog, `unrecognized arguments: ${arg}`);
    }
    positionals.push(arg);
  }
  if (positionals.length === 0) {
    failUsage(sUsage, subProg, "the following arguments are required: keyword");
  }
  if (positionals.length > 1) {
    failUsage(gUsage, prog, `unrecognized arguments: ${positionals.slice(1).join(" ")}`);
  }
  args.keyword = positionals[0] ?? null;
  return args;
}

function parseCheck(rest: string[], args: ParsedArgs, prog: string): ParsedArgs {
  const gUsage = globalUsage(prog);
  const extras: string[] = [];
  for (const arg of rest) {
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(`${subUsage(prog, "check")}\n`);
      process.exit(0);
    }
    extras.push(arg);
  }
  if (extras.length > 0) {
    failUsage(gUsage, prog, `unrecognized arguments: ${extras.join(" ")}`);
  }
  return args;
}

function parseDeclare(rest: string[], args: ParsedArgs, prog: string): ParsedArgs {
  const gUsage = globalUsage(prog);
  const subProg = `${prog} declare`;
  const sUsage = subUsage(prog, "declare");
  const positionals: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i] as string;
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(`${sUsage}\n`);
      process.exit(0);
    }
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (arg.startsWith("--dry-run=")) {
      failUsage(
        gUsage,
        prog,
        `argument --dry-run: ignored explicit argument ${arg.slice("--dry-run=".length)}`,
      );
    }
    if (looksLikeOption(arg)) {
      failUsage(gUsage, prog, `unrecognized arguments: ${arg}`);
    }
    positionals.push(arg);
  }
  const required: string[] = [];
  if (positionals[0] === undefined) required.push("kind");
  if (positionals[1] === undefined) required.push("name");
  if (required.length > 0) {
    failUsage(sUsage, subProg, `the following arguments are required: ${required.join(", ")}`);
  }
  const kind = positionals[0] as string;
  if (!DECLARE_KINDS.includes(kind)) {
    failUsage(
      sUsage,
      subProg,
      `argument kind: invalid choice: '${kind}' (choose from ${DECLARE_KINDS.map((k) => `'${k}'`).join(", ")})`,
    );
  }
  args.kind = kind;
  args.name = positionals[1] ?? null;
  const extra = positionals.slice(2);
  if (extra.length > 0) {
    failUsage(gUsage, prog, `unrecognized arguments: ${extra.join(" ")}`);
  }
  return args;
}

function appendSkillDir(current: string[] | null, value: string): string[] {
  return current ? [...current, value] : [value];
}

function helpText(prog: string): string {
  return (
    globalUsage(prog) +
    `\n` +
    `List, find, and check Handyman skills and MCP declarations.\n` +
    `\n` +
    `options:\n` +
    `  -h, --help            show this help message and exit\n` +
    `  --root ROOT           Project root (for resolving the discovery block).\n` +
    `  --skills-dir SKILLS_DIR\n` +
    `                        Skill root directory to scan (repeatable).\n`
  );
}

function dispatch(args: ParsedArgs): number {
  switch (args.command) {
    case "list":
      return cmdList(args);
    case "find":
      return cmdFind(args);
    case "check":
      return cmdCheck(args);
    case "declare":
      return cmdDeclare(args);
    default:
      // parseArgs guarantees a valid command; defensive fallthrough.
      return 2;
  }
}

function main(argv: string[]): number {
  const prog = "tools_discovery.py";
  const args = parseArgs(argv, prog);
  return dispatch(args);
}

// Run when executed directly; basename check, not import.meta.url:
// bundle-proof (see toolbox.ts).
if (basename(process.argv[1] ?? "") === "tools_discovery.js") {
  process.exit(main(process.argv.slice(2)));
}

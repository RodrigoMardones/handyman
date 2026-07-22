#!/usr/bin/env node
/**
 * Handyman seed CLI — portable harness snapshot export/import.
 *
 * A seed is the minimal, replicable layer of a Handyman harness: the project
 * config + verifier (Tier 1) and the domain knowledge memory (Tier 2), plus
 * bundled bridge templates so a restore is self-contained. Everything else
 * (the CLI itself, mutable feature_list/progress/backlog, archive) is either
 * reproducible from the `handyman-harness` package or is operational state
 * that should not be snapshotted.
 *
 * Operations:
 *   export  Write a seed folder from the live harness at --root. Copies Tier 1
 *           (init.sh, harness.config.json), Tier 2 (memory/*.md), and the
 *           bridge templates from this package's assets/, then writes
 *           manifest.json. Refresh the seed after config/knowledge drifts.
 *   import  Restore a harness from a seed: bootstrap the skeleton from the
 *           bundled templates (when no feature_list.json exists), then overlay
 *           the Tier 1+2 seed files. Idempotent and non-destructive — existing
 *           files are kept, never overwritten, so re-running only fills gaps.
 *
 * Observation shape: the last stdout line is `status: ok|error`.
 *
 * Usage:
 *   node dist/seed.js [--root PATH] export [--seed PATH]
 *   node dist/seed.js [--root PATH] import [--seed PATH] [--overlay]
 *
 * Exit codes: 0 ok, 1 error, 2 usage.
 */
import {
  cpSync,
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

// This package's bundled bridge templates (shipped in the npm tarball under
// assets/, but NOT scripts/scaffold.sh — so a self-contained seed carries them).
const ASSETS_DIR = fileURLToPath(new URL("../assets", import.meta.url));

const KNOWLEDGE_DOCS = ["business", "architecture", "conventions", "verification"] as const;

// Bridge templates bundled into the seed so import works without scaffold.sh.
// init.sh is handled separately (template -> root/init.sh) to avoid a stray
// init.template.sh in the restored tree, so it is absent from these maps.
// ROOT_BRIDGE land at the project root (scaffold.sh convention); WORKSPACE_BRIDGE
// land inside HARNESS_WORKSPACE (.handyman).
const ROOT_BRIDGE_TEMPLATES: Record<string, string> = {
  "AGENTS.md": "AGENTS.template.md",
  "CHECKPOINTS.md": "CHECKPOINTS.template.md",
};
const WORKSPACE_BRIDGE_TEMPLATES: Record<string, string> = {
  "progress/current.md": "progress-current.template.md",
  "progress/history.md": "progress-history.template.md",
  "feature_list.json": "feature_list.template.json",
  "index.md": "index.template.md",
  "feature-request.md": "feature-request.template.md",
};
const ROLE_TEMPLATES: Array<[string, string]> = [
  [".github/agents/leader.agent.md", "role-leader.template.md"],
  [".github/agents/implementer.agent.md", "role-implementer.template.md"],
  [".github/agents/reviewer.agent.md", "role-reviewer.template.md"],
  [".github/agents/explorer.agent.md", "role-explorer.template.md"],
];

interface CommonArgs {
  root: string;
  seed: string;
  overlay: boolean;
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

/** Read + parse JSON, returning null on IO/parse failure (swallowed). */
function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function usage(prog: string): string {
  return (
    `usage: ${prog} [-h] [--root ROOT] {export,import} ...\n` +
    `\n` +
    `  export [--seed PATH]    write a seed snapshot from the live harness\n` +
    `  import [--seed PATH] [--overlay]   restore a harness from a seed\n`
  );
}

function exitUsage(usageText: string, prog: string, message: string): never {
  process.stderr.write(usageText);
  process.stderr.write(`${prog}: error: ${message}\n`);
  process.exit(2);
}

/** Absolutize then resolve symlinks, mirroring Python Path.resolve() non-strict. */
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

function parseArgs(argv: string[], prog: string): CommonArgs & { command: string } {
  let root = ".";
  let seed = ".handyman.seed";
  let overlay = false;
  let command = "";
  let i = 0;
  const positionals: string[] = [];  while (i < argv.length) {
    const arg = argv[i];
    if (arg === "--root") {
      root = argv[i + 1] ?? "";
      if (!root) exitUsage(usage(prog), prog, "--root requires a value");
      i += 2;
    } else if (arg?.startsWith("--root=")) {
      root = arg.slice("--root=".length);
      i += 1;
    } else if (arg === "--seed") {
      seed = argv[i + 1] ?? "";
      if (!seed) exitUsage(usage(prog), prog, "--seed requires a value");
      i += 2;
    } else if (arg?.startsWith("--seed=")) {
      seed = arg.slice("--seed=".length);
      i += 1;
    } else if (arg === "--overlay") {
      overlay = true;
      i += 1;
    } else if (arg === "-h" || arg === "--help") {
      process.stdout.write(usage(prog));
      process.exit(0);
    } else if (arg && !arg.startsWith("-")) {
      positionals.push(arg);
      i += 1;
    } else {
      exitUsage(usage(prog), prog, `unexpected argument: ${arg ?? ""}`);
    }
  }
  command = positionals[0] ?? "";
  if (command !== "export" && command !== "import") {
    exitUsage(usage(prog), prog, `expected {export,import}, got '${command || "<none>"}'`);
  }
  if (positionals.length > 1) {
    exitUsage(usage(prog), prog, `unexpected positional: ${positionals[1]}`);
  }
  return { root, command, seed, overlay };
}

/** Resolve harness_version from the live harness.config.json, else pkg version. */
function liveHarnessVersion(root: string): string {
  const cfg = readJson(join(root, "harness.config.json"));
  if (cfg && typeof cfg === "object") {
    const v = (cfg as Record<string, unknown>).harness_version;
    if (typeof v === "string" && v) return v;
  }
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    if (typeof pkg.version === "string") return pkg.version;
  } catch {
    /* fall through */
  }
  return "0.0.0";
}

// --- export ---------------------------------------------------------------

function cmdExport(args: CommonArgs, workspace: string, root: string): number {
  const seedDir = resolve(args.seed);
  const seedRoot = args.seed.startsWith("/") ? args.seed : join(root, args.seed);
  const target = seedRoot;
  mkdirSync(join(target, "memory"), { recursive: true });
  mkdirSync(join(target, "templates"), { recursive: true });

  const copied: string[] = [];
  const kept: string[] = [];

  // Tier 1: config + verifier.
  for (const rel of ["init.sh", "harness.config.json"] as const) {
    const src = join(root, rel);
    if (!isFile(src)) {
      process.stdout.write(`    SKIP (missing in harness): ${rel}\n`);
      continue;
    }
    cpSync(src, join(target, rel));
    copied.push(rel);
    process.stdout.write(`    NEW:  ${rel}\n`);
  }
  // Tier 2: knowledge memory.
  for (const doc of KNOWLEDGE_DOCS) {
    const rel = `memory/${doc}.md`;
    const src = join(workspace, rel);
    if (!isFile(src)) {
      process.stdout.write(`    SKIP (missing in harness): ${rel}\n`);
      continue;
    }
    cpSync(src, join(target, rel));
    copied.push(rel);
    process.stdout.write(`    NEW:  ${rel}\n`);
  }
  // Bundled bridge templates (from this package's assets/).
  const templates: string[] = [];
  for (const [seedRel, assetName] of Object.entries(ROOT_BRIDGE_TEMPLATES)) {
    const src = join(ASSETS_DIR, assetName);
    if (!isFile(src)) {
      process.stdout.write(`    SKIP (missing asset): ${assetName}\n`);
      continue;
    }
    cpSync(src, join(target, "templates", assetName));
    templates.push(`templates/${assetName}`);
    process.stdout.write(`    NEW:  templates/${assetName}\n`);
  }
  for (const [seedRel, assetName] of Object.entries(WORKSPACE_BRIDGE_TEMPLATES)) {
    const src = join(ASSETS_DIR, assetName);
    if (!isFile(src)) {
      process.stdout.write(`    SKIP (missing asset): ${assetName}\n`);
      continue;
    }
    cpSync(src, join(target, "templates", assetName));
    templates.push(`templates/${assetName}`);
    process.stdout.write(`    NEW:  templates/${assetName}\n`);
  }
  for (const [seedRel, assetName] of ROLE_TEMPLATES) {
    const src = join(ASSETS_DIR, assetName);
    if (!isFile(src)) continue;
    cpSync(src, join(target, "templates", assetName));
    templates.push(`templates/${assetName}`);
    process.stdout.write(`    NEW:  templates/${assetName}\n`);
  }

  const manifest = {
    handyman_seed: 1,
    harness_version: liveHarnessVersion(root),
    tier: [1, 2],
    self_contained: true,
    description:
      "Minimal replicable Handyman harness seed: project config (Tier 1) + domain knowledge (Tier 2), plus bundled bridge templates so restore is self-contained.",
    files: copied
      .filter((p) => !p.startsWith("templates/"))
      .map((p) => ({
        path: p,
        tier: p === "init.sh" || p === "harness.config.json" ? 1 : 2,
        kind: p === "init.sh" ? "verifier" : p === "harness.config.json" ? "config" : "knowledge",
      })),
    templates,
  };
  writeFileSync(join(target, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
  process.stdout.write(`    NEW:  manifest.json\n`);
  process.stdout.write(`exported seed -> ${target} (${copied.length} files, ${templates.length} templates)\n`);
  if (kept.length > 0) {
    void kept;
  }
  void seedDir;
  return 0;
}

/** Copy src->dest only when dest does not yet exist (non-destructive). */
function copyNew(src: string, dest: string): "new" | "keep" | "skip" {
  if (!isFile(src)) return "skip";
  if (existsSync(dest)) {
    process.stdout.write(`    KEEP (exists): ${dest}\n`);
    return "keep";
  }
  mkdirSync(join(dest, ".."), { recursive: true });
  cpSync(src, dest);
  process.stdout.write(`    NEW:  ${dest}\n`);
  return "new";
}

// --- import ---------------------------------------------------------------

function cmdImport(args: CommonArgs, workspace: string, root: string): number {
  const seedRoot = args.seed.startsWith("/") ? args.seed : join(root, args.seed);
  if (!isDir(seedRoot)) {
    return err(`seed folder not found: ${seedRoot}`);
  }
  if (!isFile(join(seedRoot, "manifest.json"))) {
    return err(`not a seed (no manifest.json): ${seedRoot}`);
  }

  // Phase 1: bootstrap skeleton from bundled templates unless --overlay or the
  // workspace already has a feature_list.json. A clean repo has no
  // harness.config.json, so resolveWorkspace() would return `root`; a freshly
  // initialized local harness belongs in `.handyman` (the standard scaffold
  // convention), so bootstrap targets that explicitly.
  const hasHarness = isFile(join(workspace, "feature_list.json"));
  const bootWorkspace = join(root, ".handyman");
  if (!args.overlay && !hasHarness) {
    process.stdout.write("==> phase 1: bootstrap skeleton from templates/\n");
    mkdirSync(join(bootWorkspace, "progress"), { recursive: true });
    mkdirSync(join(bootWorkspace, "backlog"), { recursive: true });
    mkdirSync(join(bootWorkspace, "memory"), { recursive: true });
    for (const [destRel, assetName] of Object.entries(ROOT_BRIDGE_TEMPLATES)) {
      copyNew(join(seedRoot, "templates", assetName), join(root, destRel));
    }
    for (const [destRel, assetName] of Object.entries(WORKSPACE_BRIDGE_TEMPLATES)) {
      copyNew(join(seedRoot, "templates", assetName), join(bootWorkspace, destRel));
    }
    // init.template.sh -> root/init.sh (executable)
    const initDest = join(root, "init.sh");
    if (copyNew(join(seedRoot, "templates", "init.template.sh"), initDest) === "new") {
      try {
        cpSync(initDest, initDest, { mode: 0o755 });
      } catch {
        /* chmod best-effort */
      }
    }
    // Bridge role templates -> platform path.
    for (const [destRel, assetName] of ROLE_TEMPLATES) {
      copyNew(join(seedRoot, "templates", assetName), join(root, destRel));
    }
  } else {
    process.stdout.write("==> phase 1: bootstrap skipped (workspace exists or --overlay)\n");
  }

  // Phase 2: overlay Tier 1+2 seed files (non-destructive). Knowledge goes to
  // the same workspace bootstrap targeted when it ran, otherwise the resolved
  // workspace (existing harness).
  const memoryWorkspace = !args.overlay && !hasHarness ? bootWorkspace : workspace;
  process.stdout.write("==> phase 2: overlay seed (Tier 1 config + Tier 2 knowledge)\n");
  copyNew(join(seedRoot, "init.sh"), join(root, "init.sh"));
  copyNew(join(seedRoot, "harness.config.json"), join(root, "harness.config.json"));
  mkdirSync(join(memoryWorkspace, "memory"), { recursive: true });
  for (const doc of KNOWLEDGE_DOCS) {
    copyNew(join(seedRoot, "memory", `${doc}.md`), join(memoryWorkspace, "memory", `${doc}.md`));
  }
  process.stdout.write(`restored harness from ${seedRoot} -> ${memoryWorkspace}\n`);
  return 0;
}

export function main(argv: string[]): number {
  const prog = basename(process.argv[1] ?? "seed.js");
  const args = parseArgs(argv, prog);
  const root = resolveRoot(args.root);
  if (!isDir(root)) {
    return err(`root is not a directory: ${root}`);
  }
  const workspace = resolveWorkspace(root);
  let rc: number;
  if (args.command === "export") {
    rc = cmdExport(args, workspace, root);
  } else {
    rc = cmdImport(args, workspace, root);
  }
  process.stdout.write(`status: ${rc === 0 ? "ok" : "error"}\n`);
  return rc;
}

// Run when executed directly (mirrors Python `if __name__ == "__main__"`).
// argv[1] form: under vitest process.argv[1] is the runner binary, so the
// guard never matches and main() does not fire at import time.
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}

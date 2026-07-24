#!/usr/bin/env node
/**
 * handyman-mcp-server: thin MCP (stdio) wrapper over the handyman CLI/core.
 *
 * The contract lives in code, not prose: every verb shells out to the same
 * dist/*.js CLIs the roles already run (zero second source of truth), so
 * `feature_close` inherits the verifier gate from feature.js done — a close
 * without a green verifier is refused by the subprocess, not by convention.
 *
 * Tools
 *   harness_list        registered harnesses from $HANDYMAN_ROOT/registry.json
 *   preflight           read-only stability report (preflight.js)
 *   feature_next        claimable pending features (feature.js ready --json)
 *   feature_add         intake a new pending feature (feature.js add)
 *   feature_start       claim a feature and mark it in_progress (feature.js start)
 *   feature_log         append to the session log (feature.js log)
 *   feature_next_step   set the next step to resume on (feature.js next)
 *   feature_block       mark the active feature blocked (feature.js block)
 *   feature_unblock     return a blocked feature to pending (feature.js unblock)
 *   feature_acceptance  rewrite a feature's acceptance list (feature.js acceptance)
 *   backlog_review      stamp the reviewer's verdict (backlog.js review --status)
 *   feature_close       verifier-gated close (feature.js done)
 *   report_write        impl_/review_/explore_ report into <workspace>/backlog/
 *   verify              run the project verifier (init.sh) and report the exit
 *   sprint_status       open period + its features (sprint.js status, read-only)
 *   upgrade_check       harness version drift (upgrade_harness.js --check, read-only)
 *   metrics             derived workflow snapshot (metrics.js --json, read-only)
 *   fleet_status        registry-wide live report (toolbox.js status --json, read-only)
 *   fleet_health        derived fleet signals (toolbox.js health --json, read-only)
 *   fleet_timeline      merged fleet closure chronology (toolbox.js timeline --json, read-only)
 *
 * Resources
 *   handyman://{project}/current      progress/current.md
 *   handyman://{project}/docs/{doc}   files under <workspace>/docs/
 *
 * Every tool accepts `project`: a registered harness name (directory basename
 * in the registry), an absolute project root, or omitted for the server's cwd.
 * The registry-wide tools (harness_list, fleet_status, fleet_health,
 * fleet_timeline) take no `project` — they read $HANDYMAN_ROOT.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { handymanRoot, loadRegistry } from "@handyman/toolbox-core/registry";
import { resolveDocsDir, resolveWorkspace } from "@handyman/toolbox-core/workspace";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const DIST_DIR = dirname(fileURLToPath(import.meta.url));
const CHARACTER_LIMIT = 20000;
const SUBPROCESS_TIMEOUT_MS = 15 * 60 * 1000; // verify runs lint+build+tests

// --- project resolution ------------------------------------------------------

interface Project {
  name: string;
  root: string;
  workspace: string;
}

function listHarnesses(): { name: string; root: string; registered: string }[] {
  const [registry] = loadRegistry(handymanRoot(null));
  return registry.harnesses.map((entry) => ({
    name: basename(entry.project_root),
    root: entry.project_root,
    registered: entry.registered,
  }));
}

/** Resolve `project` (registry name | absolute root | omitted = cwd). Throws with the fix. */
export function resolveProject(project?: string): Project {
  let root: string;
  if (!project) {
    root = process.cwd();
  } else if (isAbsolute(project)) {
    root = resolve(project);
  } else {
    const match = listHarnesses().find((h) => h.name === project);
    if (!match) {
      const names = listHarnesses()
        .map((h) => h.name)
        .join(", ");
      throw new Error(
        `project '${project}' is not registered. Registered harnesses: ${names || "(none)"}. ` +
          `Pass a registered name, an absolute project root, or register it with ` +
          `'node handyman/dist/toolbox.js register <root>'.`,
      );
    }
    root = match.root;
  }
  const workspace = resolveWorkspace(root);
  if (!existsSync(join(workspace, "feature_list.json"))) {
    throw new Error(
      `no harness at ${root} (missing ${join(workspace, "feature_list.json")}). ` +
        `Bootstrap one first or pass a different project.`,
    );
  }
  return { name: basename(root), root, workspace };
}

// --- subprocess plumbing -----------------------------------------------------

interface RunResult {
  exit: number;
  output: string;
}

function truncateTail(text: string): string {
  if (text.length <= CHARACTER_LIMIT) {
    return text;
  }
  return `[... truncated to the last ${CHARACTER_LIMIT} characters ...]\n${text.slice(-CHARACTER_LIMIT)}`;
}

/** Run a command; never throws on non-zero exit — the exit code is the result. */
function run(command: string, args: string[], cwd: string): RunResult {
  try {
    const out = execFileSync(command, args, {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: SUBPROCESS_TIMEOUT_MS,
      maxBuffer: 32 * 1024 * 1024,
    });
    return { exit: 0, output: truncateTail(out) };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string; message?: string };
    const output = `${err.stdout ?? ""}${err.stderr ?? ""}` || (err.message ?? "subprocess failed");
    return { exit: typeof err.status === "number" ? err.status : 1, output: truncateTail(output) };
  }
}

/** Run a sibling dist CLI (same build the roles use) against a project root. */
function runCli(script: string, args: string[], project: Project): RunResult {
  return run(
    process.execPath,
    [join(DIST_DIR, script), "--root", project.root, ...args],
    project.root,
  );
}

/**
 * Run a fleet-wide toolbox verb WITHOUT `--root`: status/health/timeline are
 * registry-wide (the registry comes from $HANDYMAN_ROOT, inherited by the
 * subprocess). toolbox.ts parseFlags would silently accept --root as a
 * value-option and ignore it (only `heartbeat` reads it), so injecting it
 * would produce fleet output that looks per-project — worse than erroring.
 */
function runToolbox(args: string[]): RunResult {
  return run(process.execPath, [join(DIST_DIR, "toolbox.js"), ...args], process.cwd());
}

/**
 * Parse a `--json` CLI payload into the structured result; on non-JSON output
 * fall back to the raw { exit, output } shape so nothing is swallowed.
 */
function parseJsonResult(result: RunResult): Record<string, unknown> {
  try {
    return { exit: result.exit, ...(JSON.parse(result.output) as Record<string, unknown>) };
  } catch {
    return { exit: result.exit, output: result.output };
  }
}

// --- tool handlers (exported for the black-box suite in tests/test_mcp.js) ---

export function harnessList(): {
  handyman_root: string;
  harnesses: { name: string; root: string; registered: string; harness: boolean }[];
} {
  return {
    handyman_root: handymanRoot(null),
    harnesses: listHarnesses().map((h) => ({
      ...h,
      harness: existsSync(join(resolveWorkspace(h.root), "feature_list.json")),
    })),
  };
}

export function featureNext(project: Project): { drained: boolean; ready: unknown[] } {
  const result = runCli("feature.js", ["ready", "--json"], project);
  // feature.js ready: exit 0 = claimable work, exit 3 = backlog drained.
  let ready: unknown[] = [];
  try {
    ready = JSON.parse(result.output) as unknown[];
  } catch {
    /* non-JSON output falls through as empty */
  }
  return { drained: result.exit === 3, ready };
}

export function featureAdd(
  project: Project,
  name: string,
  options: {
    title?: string;
    description?: string;
    acceptance?: string[];
    dependsOn?: number[];
  } = {},
): RunResult {
  const args = ["add", "--name", name];
  if (options.title) {
    args.push("--title", options.title);
  }
  if (options.description) {
    args.push("--description", options.description);
  }
  for (const line of options.acceptance ?? []) {
    args.push("--acceptance", line);
  }
  for (const id of options.dependsOn ?? []) {
    args.push("--depends-on", String(id));
  }
  return runCli("feature.js", args, project);
}

export function featureClose(project: Project, name: string, verifier?: string): RunResult {
  const args = ["done", name];
  if (verifier) {
    args.push("--verifier", verifier);
  }
  return runCli("feature.js", args, project);
}

export function featureStart(project: Project, name: string, noPreflight = false): RunResult {
  const args = ["start", name];
  if (noPreflight) {
    args.push("--no-preflight");
  }
  return runCli("feature.js", args, project);
}

export function featureLog(project: Project, line: string): RunResult {
  return runCli("feature.js", ["log", line], project);
}

export function featureNextStep(project: Project, step: string): RunResult {
  return runCli("feature.js", ["next", step], project);
}

export function featureBlock(project: Project, name: string, reason: string): RunResult {
  return runCli("feature.js", ["block", name, "--reason", reason], project);
}

export function featureUnblock(project: Project, name: string): RunResult {
  return runCli("feature.js", ["unblock", name], project);
}

export function featureAcceptance(project: Project, name: string, acceptance: string[]): RunResult {
  const args = ["acceptance", name];
  for (const line of acceptance) {
    args.push("--acceptance", line);
  }
  return runCli("feature.js", args, project);
}

export function backlogReview(
  project: Project,
  name: string,
  status: "approved" | "changes_requested",
): RunResult {
  return runCli("backlog.js", ["review", name, "--status", status], project);
}

const REPORT_KINDS = {
  impl: { type: "Implementation Log", role: "implementer", defaultStatus: "implemented" },
  review: { type: "Review Log", role: "reviewer", defaultStatus: "approved" },
  explore: { type: "Explore Report", role: "explorer", defaultStatus: null },
} as const;

export function reportWrite(
  project: Project,
  kind: keyof typeof REPORT_KINDS,
  feature: string,
  content: string,
  status?: string,
): { path: string; action: "created" | "updated" } {
  const spec = REPORT_KINDS[kind];
  const today = new Date().toISOString().slice(0, 10);
  const lines = ["---", `type: ${spec.type}`];
  if (kind === "explore") {
    lines.push(`topic: ${feature}`, `role: ${spec.role}`);
  } else {
    lines.push(
      `feature: ${feature}`,
      `status: ${status ?? spec.defaultStatus}`,
      `role: ${spec.role}`,
      `updated: ${today}`,
      `tags: [handyman/role/${spec.role}, handyman/feature/${feature}]`,
    );
  }
  lines.push("---", "", content.trimEnd(), "");
  const dir = join(project.workspace, "backlog");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${kind}_${feature}.md`);
  const action = existsSync(path) ? "updated" : "created";
  writeFileSync(path, lines.join("\n"), "utf-8");
  return { path, action };
}

export function verify(project: Project, verifier?: string): RunResult {
  const script = verifier ?? join(project.root, "init.sh");
  if (!existsSync(script)) {
    return { exit: 1, output: `verifier not found: ${script}` };
  }
  return run("bash", [script], project.root);
}

export function sprintStatus(project: Project): RunResult {
  return runCli("sprint.js", ["status"], project);
}

export function upgradeCheck(project: Project): RunResult {
  // upgrade_harness.js --check is read-only: reports drift, exits non-zero when
  // behind or unsealed. The apply/default mode rewrites harness.config.json and
  // is deliberately NOT exposed here.
  return runCli("upgrade_harness.js", ["--check"], project);
}

export function metrics(project: Project): Record<string, unknown> {
  // metrics.js exits 0 always (read-only observation); the --json payload
  // (status_counts, throughput, review_verdicts, coverage) is the data.
  return parseJsonResult(runCli("metrics.js", ["--json"], project));
}

export function fleetStatus(): Record<string, unknown> {
  return parseJsonResult(runToolbox(["status", "--json"]));
}

export function fleetHealth(strict = false): Record<string, unknown> {
  // health --strict exits 1 when at least one signal is present; the JSON is
  // still printed, so the payload carries both the exit and total_signals.
  return parseJsonResult(runToolbox(["health", "--json", ...(strict ? ["--strict"] : [])]));
}

export function fleetTimeline(): Record<string, unknown> {
  return parseJsonResult(runToolbox(["timeline", "--json"]));
}

// --- MCP surface -------------------------------------------------------------

const projectField = z
  .string()
  .optional()
  .describe(
    "Target harness: a registered name from harness_list, an absolute project root, or omit for the server's working directory.",
  );

const featureNameField = z
  .string()
  .regex(/^[A-Za-z0-9_-]+$/, "feature name must be [A-Za-z0-9_-]+")
  .describe("Feature name as listed in feature_list.json (e.g. 'handyman_mcp_server').");

function textResult(structured: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(structured, null, 2) }],
    structuredContent: structured,
  };
}

function errorResult(e: unknown) {
  return {
    content: [
      { type: "text" as const, text: `Error: ${e instanceof Error ? e.message : String(e)}` },
    ],
    isError: true,
  };
}

// --- tool registration helpers ----------------------------------------------
//
// Two layers cut the per-tool boilerplate (resolveProject -> run/handler ->
// textResult/errorResult) that every tool repeats:
//
//   registerTool     wraps the project resolution + try/catch envelope.
//                    For tools that don't need a project (harness_list), pass
//                    `needsProject: false`.
//   registerCliTool  adds the runCli shell-out on top, for tools that wrap a
//                    sibling dist/*.js CLI (the common case: preflight,
//                    feature_*, verify helpers, etc.). Custom-shape tools
//                    (report_write, verify with its bash + existence check)
//                    use registerTool directly and call their own handler.

type Annotations = ToolAnnotations;
type InputSchema = Record<string, z.ZodTypeAny>;

interface ToolSpec {
  name: string;
  title: string;
  description: string;
  inputSchema: InputSchema;
  annotations?: Annotations;
  /** Returns the structured payload (without `project`). */
  run: (target: Project, input: Record<string, unknown>) => Record<string, unknown>;
  /** Set false for project-agnostic tools (e.g. harness_list). Default true. */
  needsProject?: boolean;
}

function registerTool(server: McpServer, spec: ToolSpec): void {
  server.registerTool(
    spec.name,
    {
      title: spec.title,
      description: spec.description,
      inputSchema: spec.inputSchema,
      annotations: spec.annotations,
    },
    async (input) => {
      try {
        if (spec.needsProject === false) {
          return textResult(spec.run({} as Project, input));
        }
        const target = resolveProject(input.project as string | undefined);
        const payload = spec.run(target, input);
        return textResult({ project: target.name, ...payload });
      } catch (e) {
        return errorResult(e);
      }
    },
  );
}

interface CliToolSpec {
  name: string;
  title: string;
  description: string;
  inputSchema: InputSchema;
  annotations?: Annotations;
  /** Sibling dist script, e.g. "feature.js". */
  script: string;
  /** CLI args after the injected `--root <project.root>`. */
  args: (input: Record<string, unknown>) => string[];
  /** Override the default `{ ...runResult }` payload. */
  format?: (result: RunResult, target: Project, input: Record<string, unknown>) => Record<string, unknown>;
}

function registerCliTool(server: McpServer, spec: CliToolSpec): void {
  registerTool(server, {
    name: spec.name,
    title: spec.title,
    description: spec.description,
    inputSchema: spec.inputSchema,
    annotations: spec.annotations,
    run: (target, input) => {
      const result = runCli(spec.script, spec.args(input), target);
      return spec.format ? spec.format(result, target, input) : { ...result };
    },
  });
}

export function buildServer(): McpServer {
  const server = new McpServer({ name: "handyman-mcp-server", version: "1.0.0" });

  registerTool(server, {
    name: "harness_list",
    title: "List registered harnesses",
    description:
      "List every Handyman harness registered in $HANDYMAN_ROOT/registry.json (the multi-repo hub). " +
      "Returns name (use it as `project` in the other tools), project root, registration date, and " +
      "whether a harness workspace actually exists on disk.",
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    needsProject: false,
    run: () => harnessList(),
  });

  registerCliTool(server, {
    name: "preflight",
    title: "Run the preflight stability report",
    description:
      "Read-only stability report for a harness (validate + upgrade check + tools discovery + context " +
      "freshness). Exits 0 unless strict mode finds a problem. Run it before starting feature work.",
    inputSchema: {
      project: projectField,
      strict: z
        .boolean()
        .default(false)
        .describe("Fail (non-zero exit) on findings instead of reporting only."),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    script: "preflight.js",
    args: (input) => (input.strict ? ["--strict"] : []),
  });

  registerCliTool(server, {
    name: "feature_next",
    title: "List claimable features",
    description:
      "List pending features whose depends_on are all satisfied (feature.js ready --json). " +
      "`drained: true` means the backlog has no claimable work. Claim the lowest id with the CLI " +
      "(node handyman/dist/feature.js start <name>) before implementing.",
    inputSchema: { project: projectField },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    script: "feature.js",
    args: () => ["ready", "--json"],
    format: (result) => {
      // feature.js ready: exit 0 = claimable work, exit 3 = backlog drained.
      let ready: unknown[] = [];
      try {
        ready = JSON.parse(result.output) as unknown[];
      } catch {
        /* non-JSON output falls through as empty */
      }
      return { drained: result.exit === 3, ready };
    },
  });

  registerCliTool(server, {
    name: "feature_add",
    title: "Intake a new pending feature",
    description:
      "Append a new pending feature to feature_list.json (feature.js add). Writes only the contract " +
      "keys (id, name, title, description, acceptance, status) validated against the schema — the " +
      "leader's intake verb, so feature_list.json is never hand-edited.",
    inputSchema: {
      project: projectField,
      name: featureNameField,
      title: z.string().optional().describe("Short human title."),
      description: z.string().optional().describe("What the feature is and why."),
      acceptance: z
        .array(z.string().min(1))
        .optional()
        .describe("Acceptance criteria; each entry is one criterion."),
      depends_on: z
        .array(z.number().int().positive())
        .optional()
        .describe("Feature ids that must be done before this one is claimable."),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    script: "feature.js",
    args: (input) => {
      const argv = ["add", "--name", String(input.name)];
      if (input.title) {
        argv.push("--title", String(input.title));
      }
      if (input.description) {
        argv.push("--description", String(input.description));
      }
      for (const line of (input.acceptance as string[] | undefined) ?? []) {
        argv.push("--acceptance", line);
      }
      for (const id of (input.depends_on as number[] | undefined) ?? []) {
        argv.push("--depends-on", String(id));
      }
      return argv;
    },
  });

  registerCliTool(server, {
    name: "feature_start",
    title: "Claim a feature and mark it in_progress",
    description:
      "Mark a feature in_progress and reset progress/current.md for it (feature.js start). Enforces the " +
      "single-in_progress rule (refuses if another feature is active) and runs preflight unless `no_preflight` " +
      "is set. The natural pair of feature_next: claimable-list and claim-take are two faces of the same step.",
    inputSchema: {
      project: projectField,
      name: featureNameField,
      no_preflight: z
        .boolean()
        .default(false)
        .describe("Skip the preflight stability check before claiming (default: runs it)."),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    script: "feature.js",
    args: (input) => {
      const argv = ["start", String(input.name)];
      if (input.no_preflight) {
        argv.push("--no-preflight");
      }
      return argv;
    },
  });

  registerCliTool(server, {
    name: "feature_log",
    title: "Append a line to the session log",
    description:
      "Append a line to the `## Log` section of progress/current.md (feature.js log). The implementer's " +
      "per-step operation; without this the agent would edit the file by hand — the exact pattern feature.ts " +
      "exists to prevent.",
    inputSchema: {
      project: projectField,
      line: z.string().min(1).describe("Line to append to the `## Log` section."),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    script: "feature.js",
    args: (input) => ["log", String(input.line)],
  });

  registerCliTool(server, {
    name: "feature_next_step",
    title: "Set the next step to resume on",
    description:
      "Set the `## Next Step` section of progress/current.md (feature.js next). Marks where the next " +
      "session picks up.",
    inputSchema: {
      project: projectField,
      step: z.string().min(1).describe("Next step description."),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    script: "feature.js",
    args: (input) => ["next", String(input.step)],
  });

  registerCliTool(server, {
    name: "feature_block",
    title: "Mark a feature blocked",
    description:
      "Mark a feature blocked with a reason (feature.js block). Use it when a required tool, file, " +
      "test, or decision is missing: the reason lands in feature_list.json so the next session (or " +
      "the preflight worklist report) surfaces why the work stopped.",
    inputSchema: {
      project: projectField,
      name: featureNameField,
      reason: z.string().min(1).describe("Why the feature is blocked and what unblocks it."),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    script: "feature.js",
    args: (input) => ["block", String(input.name), "--reason", String(input.reason)],
  });

  registerCliTool(server, {
    name: "feature_unblock",
    title: "Return a blocked feature to pending",
    description:
      "Return a blocked feature to pending (feature.js unblock) once its blocker clears, so it " +
      "becomes claimable by feature_next again.",
    inputSchema: {
      project: projectField,
      name: featureNameField,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    script: "feature.js",
    args: (input) => ["unblock", String(input.name)],
  });

  registerCliTool(server, {
    name: "feature_acceptance",
    title: "Rewrite a feature's acceptance list",
    description:
      "Replace a feature's acceptance criteria wholesale (feature.js acceptance). Refused on a done " +
      "feature — the reviewed contract stays immutable; the --force override is deliberately NOT " +
      "exposed here and stays on the CLI where the operator records it in history.md.",
    inputSchema: {
      project: projectField,
      name: featureNameField,
      acceptance: z
        .array(z.string().min(1))
        .min(1)
        .describe("The full new acceptance list; replaces the previous one."),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    script: "feature.js",
    args: (input) => {
      const argv = ["acceptance", String(input.name)];
      for (const line of (input.acceptance as string[] | undefined) ?? []) {
        argv.push("--acceptance", line);
      }
      return argv;
    },
  });

  registerCliTool(server, {
    name: "backlog_review",
    title: "Stamp the reviewer's verdict",
    description:
      "Write backlog/review_<feature>.md with the reviewer's verdict (backlog.js review --status), " +
      "the workflow stage-5 artifact. A second, different verdict on the same feature is refused: " +
      "the non-zero exit and the CLI's conflict message land in the payload — nothing is silently " +
      "flipped. The --force re-stamp is deliberately NOT exposed here and stays on the CLI, like " +
      "feature_acceptance --force.",
    inputSchema: {
      project: projectField,
      name: featureNameField,
      status: z
        .enum(["approved", "changes_requested"])
        .describe("Reviewer verdict stamped into the report frontmatter."),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    script: "backlog.js",
    args: (input) => ["review", String(input.name), "--status", String(input.status)],
  });

  registerCliTool(server, {
    name: "feature_close",
    title: "Close a feature (verifier-gated)",
    description:
      "Run the project verifier and, only on exit 0, mark the feature done, append the history entry, " +
      "and reset progress/current.md (feature.js done). A red verifier REFUSES the close and keeps the " +
      "feature in_progress — fix the failure and call again. There is no force flag by design.",
    inputSchema: {
      project: projectField,
      name: featureNameField,
      verifier: z
        .string()
        .optional()
        .describe("Absolute path to an alternative verifier script (default: <root>/init.sh)."),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    script: "feature.js",
    args: (input) => {
      const argv = ["done", String(input.name)];
      if (input.verifier) {
        argv.push("--verifier", String(input.verifier));
      }
      return argv;
    },
    format: (result) => ({
      closed: result.exit === 0,
      ...result,
      ...(result.exit !== 0
        ? {
            hint: "verifier or state check failed; the feature stays in_progress until it passes",
          }
        : {}),
    }),
  });

  registerTool(server, {
    name: "report_write",
    title: "Write a backlog report",
    description:
      "Write an implementation, review, or exploration report to <workspace>/backlog/<kind>_<name>.md " +
      "with the house frontmatter (type/feature/status/role/updated/tags). Overwrites an existing report " +
      "for the same feature — reports are living documents. Pass only the markdown body; frontmatter is added.",
    inputSchema: {
      project: projectField,
      kind: z
        .enum(["impl", "review", "explore"])
        .describe("Report kind: impl_, review_ or explore_ prefix."),
      feature: featureNameField,
      content: z.string().min(1).describe("Markdown body of the report (without frontmatter)."),
      status: z
        .string()
        .optional()
        .describe("Frontmatter status (default: 'implemented' for impl, 'approved' for review)."),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    run: (target, input) =>
      reportWrite(
        target,
        input.kind as keyof typeof REPORT_KINDS,
        String(input.feature),
        String(input.content),
        input.status as string | undefined,
      ),
  });

  registerTool(server, {
    name: "verify",
    title: "Run the project verifier",
    description:
      "Run the executable verifier (<root>/init.sh: state checks, lint, build, tests). Exit 0 is the only " +
      "green. Output is tail-truncated; the failing gate is always at the end. May take several minutes.",
    inputSchema: {
      project: projectField,
      verifier: z
        .string()
        .optional()
        .describe("Absolute path to an alternative verifier script."),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    run: (target, input) => {
      const result = verify(target, input.verifier as string | undefined);
      return { green: result.exit === 0, ...result };
    },
  });

  registerCliTool(server, {
    name: "sprint_status",
    title: "Report the open period and its features",
    description:
      "Read-only snapshot of the open work period (sprint.js status): the branch slug, open/close " +
      "timestamps when present, and every feature attached to it with its status. Safe to call anytime; " +
      "does not touch disk. Deliberately does NOT expose `sprint open` or `sprint close` — those archive " +
      "features, compact history, and derive the period doc, so they stay on the CLI where the operator " +
      "runs them at branch milestones.",
    inputSchema: { project: projectField },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    script: "sprint.js",
    args: () => ["status"],
  });

  registerCliTool(server, {
    name: "upgrade_check",
    title: "Check harness version drift (read-only)",
    description:
      "Read-only drift report (upgrade_harness.js --check): resolves the workspace, reads the installed " +
      "harness_version, compares it to the current skill's metadata.version, and reports pending " +
      "migrations. Exits non-zero when behind or unsealed. Deliberately does NOT expose the apply/default " +
      "mode (rewrites harness.config.json and managed files); use the CLI directly for that with a backup.",
    inputSchema: { project: projectField },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    script: "upgrade_harness.js",
    args: () => ["--check"],
  });

  registerCliTool(server, {
    name: "metrics",
    title: "Derived workflow metrics (read-only)",
    description:
      "Per-harness derived snapshot (metrics.js --json): status_counts from feature_list.json, " +
      "throughput (closures per date from history.md), review_verdicts with approval_rate (from " +
      "backlog review frontmatter), and coverage (done features with their impl+review reports). " +
      "The JSON arrives parsed in structuredContent. Observes, never gates: exits 0 always.",
    inputSchema: { project: projectField },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    script: "metrics.js",
    args: () => ["--json"],
    format: (result) => parseJsonResult(result),
  });

  registerTool(server, {
    name: "fleet_status",
    title: "Fleet-wide live status (read-only)",
    description:
      "Registry-wide live report (toolbox.js status --json) over every harness in " +
      "$HANDYMAN_ROOT/registry.json: per-harness metrics, session, and version drift, plus the " +
      "fleet rollup. Registry-wide, not per-project — takes no `project`; the JSON arrives " +
      "parsed in structuredContent.",
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    needsProject: false,
    run: () => fleetStatus(),
  });

  registerTool(server, {
    name: "fleet_health",
    title: "Fleet-wide derived health signals (read-only)",
    description:
      "Derived health signals (toolbox.js health --json) for every registered harness: " +
      "INVARIANT, STALE_WIP, BEHIND, IDLE, UNREADABLE, with total_signals across the fleet. " +
      "Registry-wide, not per-project — takes no `project`. `strict` plumbs the CLI's --strict: " +
      "exit is 1 exactly when at least one signal is present (the JSON is still returned).",
    inputSchema: {
      strict: z
        .boolean()
        .default(false)
        .describe("Exit non-zero when at least one health signal is present."),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    needsProject: false,
    run: (_target, input) => fleetHealth(input.strict === true),
  });

  registerTool(server, {
    name: "fleet_timeline",
    title: "Fleet-wide closure timeline (read-only)",
    description:
      "Merged closure chronology (toolbox.js timeline --json) across every registered harness: " +
      "dated history closures plus pushed heartbeat events, newest first. Registry-wide, not " +
      "per-project — takes no `project`; the JSON arrives parsed in structuredContent.",
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    needsProject: false,
    run: () => fleetTimeline(),
  });

  server.registerResource(
    "current",
    new ResourceTemplate("handyman://{project}/current", {
      list: async () => ({
        resources: listHarnesses().map((h) => ({
          uri: `handyman://${h.name}/current`,
          name: `${h.name} current session`,
          mimeType: "text/markdown",
        })),
      }),
    }),
    {
      title: "Current session state",
      description: "progress/current.md of a harness: active feature, next step, and session log.",
      mimeType: "text/markdown",
    },
    async (uri, { project }) => {
      const target = resolveProject(String(project));
      const path = join(target.workspace, "progress", "current.md");
      return {
        contents: [{ uri: uri.href, mimeType: "text/markdown", text: readFileSync(path, "utf-8") }],
      };
    },
  );

  server.registerResource(
    "docs",
    new ResourceTemplate("handyman://{project}/docs/{doc}", {
      list: async () => ({
        resources: listHarnesses().flatMap((h) => {
          const docsDir = resolveDocsDir(resolveWorkspace(h.root));
          let entries: string[] = [];
          try {
            entries = readdirSync(docsDir).filter((f) => f.endsWith(".md"));
          } catch {
            /* project without docs */
          }
          return entries.map((f) => ({
            uri: `handyman://${h.name}/docs/${f}`,
            name: `${h.name} ${f}`,
            mimeType: "text/markdown",
          }));
        }),
      }),
    }),
    {
      title: "Harness docs",
      description:
        "Files in the workspace knowledge dir (memory/, legacy docs/): business, architecture, conventions, verification.",
      mimeType: "text/markdown",
    },
    async (uri, { project, doc }) => {
      const target = resolveProject(String(project));
      const docsDir = resolveDocsDir(target.workspace);
      const path = resolve(docsDir, String(doc));
      if (!path.startsWith(`${docsDir}/`)) {
        throw new Error(`doc path escapes ${docsDir}`);
      }
      return {
        contents: [{ uri: uri.href, mimeType: "text/markdown", text: readFileSync(path, "utf-8") }],
      };
    },
  );

  return server;
}

async function main(): Promise<void> {
  const server = buildServer();
  await server.connect(new StdioServerTransport());
  console.error("handyman-mcp-server running on stdio");
}

// Only start the transport when executed as a program, so tests can import the
// handlers and buildServer() without hijacking stdio.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error("handyman-mcp-server fatal:", e);
    process.exit(1);
  });
}

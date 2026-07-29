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
 *   feature_acceptance  rewrite a feature's acceptance list (feature.js acceptance);
 *                       the --force override on a done feature is gated by human
 *                       confirmation (elicitation, or confirm:true as fallback)
 *   backlog_review      stamp the reviewer's verdict (backlog.js review --status)
 *   feature_close       verifier-gated close (feature.js done), blocking
 *   feature_close_async detached verifier-gated close: returns task_id at once,
 *                       poll with task_result (state lives in <workspace>/run/)
 *   task_result         poll a detached task by id; reconciles from the feature
 *                       state machine if the server died mid-run
 *   report_write        impl_/review_/explore_ report into <workspace>/backlog/
 *   verify              run the project verifier (init.sh) and report the exit
 *   sprint_status       open period + its features (sprint.js status, read-only)
 *   sprint_close        period close gated by human confirmation: dry-run preview
 *                       first, execute only after elicitation/confirm accepts
 *   handoff_submit      record a role-to-role artifact handoff (disk queue in
 *                       <workspace>/handoffs/, pending ones surface in /resume)
 *   handoff_claim       claim the oldest pending handoff for a role
 *   upgrade_check       harness version drift (upgrade_harness.js --check, read-only)
 *   metrics             derived workflow snapshot (metrics.js --json, read-only)
 *   fleet_status        registry-wide live report (toolbox.js status --json, read-only)
 *   fleet_health        derived fleet signals (toolbox.js health --json, read-only)
 *   fleet_timeline      merged fleet closure chronology (toolbox.js timeline --json, read-only)
 *
 * Transports
 *   stdio (default)     node dist/mcp.js
 *   Streamable HTTP     node dist/mcp.js --http [--host 127.0.0.1] [--port 8177]
 *                       stateful sessions via Mcp-Session-Id (one McpServer per
 *                       session), unknown session ids get a 404 so the client
 *                       re-initializes per spec; DNS-rebinding protection on.
 *                       Loopback only: no auth layer — front it if you expose it.
 *
 * Resources
 *   handyman://{project}/current      progress/current.md
 *   handyman://{project}/docs/{doc}   files under <workspace>/docs/
 *   handyman://{project}/resume       one-call restart briefing (branch check,
 *                                     session, queue, history tail, memory index)
 *
 * Prompts
 *   role_leader / role_implementer / role_reviewer / role_explorer
 *                                     the role protocol from assets/role-*.template.md
 *                                     with the invocation context (project, feature)
 *                                     resolved and appended.
 *
 * Every tool accepts `project`: a registered harness name (directory basename
 * in the registry), an absolute project root, or omitted for the server's cwd.
 * The registry-wide tools (harness_list, fleet_status, fleet_health,
 * fleet_timeline) take no `project` — they read $HANDYMAN_ROOT.
 */

import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { handymanRoot, loadRegistry } from "@handyman/toolbox-core/registry";
import { resolveDocsDir, resolveWorkspace } from "@handyman/toolbox-core/workspace";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
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
    const matches = listHarnesses().filter((h) => h.name === project);
    const match = matches[0];
    if (!match) {
      const names = listHarnesses()
        .map((h) => h.name)
        .join(", ");
      throw new Error(
        `project '${project}' is not registered. Registered harnesses: ${names || "(none)"}. ` +
          `Pass a registered name, an absolute project root, or register it with ` +
          `'npx handyman-harness@3 toolbox register <root>'.`,
      );
    }
    if (matches.length > 1) {
      const candidates = matches.map((h) => h.root).join(", ");
      throw new Error(
        `project name '${project}' is ambiguous: ${matches.length} registered harnesses share it: ` +
          `${candidates}. Pass the absolute project root instead of the name.`,
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

// --- resume briefing (P1: session restart in one read) -----------------------

/** The current git branch of the project root, or null outside a repo. */
export function gitBranch(root: string): string | null {
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

/** The branch the active session recorded in current.md (mirrors feature.ts sessionBranch). */
function sessionBranch(workspace: string): string | null {
  const current = join(workspace, "progress", "current.md");
  if (!existsSync(current)) {
    return null;
  }
  for (const line of readFileSync(current, "utf-8").split("\n")) {
    const stripped = line.trim();
    if (stripped.startsWith("- **Branch:**")) {
      const value = stripped.slice("- **Branch:**".length).trim();
      return value && value !== "_-_" ? value : null;
    }
  }
  return null;
}

const RESUME_HISTORY_ENTRIES = 5;

/**
 * The session-restart briefing as a single markdown document. Starting a
 * session used to mean orchestrating five reads by hand (AGENTS.md, feature
 * queue, current.md, history, memory index); this composes the harness-owned
 * slice of that context in one call. Memory bodies stay out on purpose — the
 * index says what exists, the docs/* resource reads what is relevant.
 */
export function buildResume(project: Project): string {
  const out: string[] = [`# Resume — ${project.name}`, ""];

  const actual = gitBranch(project.root);
  const recorded = sessionBranch(project.workspace);
  out.push("## Branch", "");
  out.push(`- checked out: ${actual ?? "(none / not a repo)"}`);
  out.push(`- session recorded: ${recorded ?? "(none)"}`);
  if (recorded && actual && recorded !== actual) {
    out.push(
      `- **MISMATCH**: the session belongs to '${recorded}' but '${actual}' is checked out — ` +
        `resume there, block the session, or use a git worktree.`,
    );
  }
  out.push("");

  const currentPath = join(project.workspace, "progress", "current.md");
  out.push("## Active session (progress/current.md)", "");
  out.push(existsSync(currentPath) ? readFileSync(currentPath, "utf-8").trim() : "(no session)");
  out.push("");

  out.push("## Queue", "");
  const counts: Record<string, number> = {};
  try {
    const data = JSON.parse(
      readFileSync(join(project.workspace, "feature_list.json"), "utf-8"),
    ) as {
      features?: { status?: string }[];
    };
    for (const f of data.features ?? []) {
      const status = f.status ?? "unknown";
      counts[status] = (counts[status] ?? 0) + 1;
    }
  } catch {
    /* unreadable queue: counts stay empty */
  }
  out.push(
    `- status counts: ${
      Object.entries(counts)
        .map(([status, n]) => `${status}=${n}`)
        .join(", ") || "(unavailable)"
    }`,
  );
  try {
    const next = featureNext(project);
    const names = (next.ready as { id?: number; name?: string }[]).map(
      (f) => `${f.id ?? "?"}:${f.name ?? "?"}`,
    );
    out.push(
      `- claimable now: ${names.join(", ") || (next.drained ? "(backlog drained)" : "(none)")}`,
    );
  } catch {
    out.push("- claimable now: (unavailable)");
  }
  out.push("");

  const pendingHandoffs = readHandoffs(project).filter((h) => h.status === "pending");
  out.push("## Pending handoffs", "");
  out.push(
    pendingHandoffs.length > 0
      ? pendingHandoffs
          .map((h) => `- ${h.from} -> ${h.to}: ${h.artifact}${h.summary ? ` — ${h.summary}` : ""}`)
          .join("\n")
      : "(none)",
  );
  out.push("");

  const historyPath = join(project.workspace, "progress", "history.md");
  const entries = existsSync(historyPath)
    ? readFileSync(historyPath, "utf-8")
        .split(/(?=^## )/m)
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
  out.push(`## Recent history (last ${RESUME_HISTORY_ENTRIES} closures)`, "");
  out.push(
    entries.length > 0 ? entries.slice(-RESUME_HISTORY_ENTRIES).join("\n\n") : "(no history yet)",
  );
  out.push("");

  const docsDir = resolveDocsDir(project.workspace);
  let memory: string[] = [];
  try {
    memory = readdirSync(docsDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => `- ${f} (${statSync(join(docsDir, f)).size} B)`);
  } catch {
    /* project without memory dir */
  }
  out.push("## Memory index (read bodies via handyman://{project}/docs/{doc})", "");
  out.push(memory.length > 0 ? memory.join("\n") : "(no memory files)");
  out.push("");
  return out.join("\n");
}

// --- role prompts (P1: role protocol as MCP prompts) -------------------------

const ROLE_NAMES = ["leader", "implementer", "reviewer", "explorer"] as const;
type RoleName = (typeof ROLE_NAMES)[number];

interface RoleTemplate {
  description: string;
  body: string;
}

/**
 * Read the canonical role protocol from the packaged assets (the same
 * templates update_harness --sync renders into .github/agents/). The YAML
 * frontmatter (model/tools for the agent host) is stripped; its description
 * becomes the prompt's.
 */
function roleTemplate(role: RoleName): RoleTemplate {
  const path = join(DIST_DIR, "..", "assets", `role-${role}.template.md`);
  const text = readFileSync(path, "utf-8");
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { description: `Handyman ${role} role protocol`, body: text.trim() };
  }
  const descLine = match[1]!.split("\n").find((l) => l.startsWith("description:"));
  return {
    description: descLine
      ? descLine.slice("description:".length).trim()
      : `Handyman ${role} role protocol`,
    body: match[2]!.trim(),
  };
}

// --- async tasks (P2: call-now, fetch-later) ---------------------------------
//
// `feature_close` pays the full verifier (lint+build+tests, up to 15 min) as a
// blocking subprocess. The async variant detaches it: the tool call returns a
// task_id immediately and the state lives in <workspace>/run/<task_id>.{json,
// log} so it survives the server. When the server dies mid-run the exit
// handler never fires, so task_result reconciles a stale "running" record
// from the durable truth — the feature state machine (done means the gate
// passed).

const TASK_ID_PATTERN = /^[a-z0-9-]+$/;

interface TaskRecord {
  task_id: string;
  kind: string;
  feature?: string;
  status: "running" | "completed" | "failed";
  pid: number;
  started_at: string;
  finished_at?: string;
  exit?: number;
  reconciled?: boolean;
  command: string[];
}

function taskDir(project: Project): string {
  const dir = join(project.workspace, "run");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function featureCloseAsync(
  project: Project,
  name: string,
  verifier?: string,
): { task_id: string; status: string; log: string; poll: string } {
  const id = `close-${name}-${Date.now().toString(36)}`;
  const dir = taskDir(project);
  const log = join(dir, `${id}.log`);
  const command = [
    join(DIST_DIR, "feature.js"),
    "--root",
    project.root,
    "done",
    name,
    ...(verifier ? ["--verifier", verifier] : []),
  ];
  const outFd = openSync(log, "a");
  const child = spawn(process.execPath, command, {
    cwd: project.root,
    detached: true,
    stdio: ["ignore", outFd, outFd],
  });
  closeSync(outFd);
  const recordPath = join(dir, `${id}.json`);
  const record: TaskRecord = {
    task_id: id,
    kind: "feature_close",
    feature: name,
    status: "running",
    pid: child.pid ?? -1,
    started_at: new Date().toISOString(),
    command: [process.execPath, ...command],
  };
  writeFileSync(recordPath, JSON.stringify(record, null, 2), "utf-8");
  child.on("exit", (code) => {
    record.status = code === 0 ? "completed" : "failed";
    record.exit = typeof code === "number" ? code : 1;
    record.finished_at = new Date().toISOString();
    try {
      writeFileSync(recordPath, JSON.stringify(record, null, 2), "utf-8");
    } catch {
      /* workspace vanished mid-run */
    }
  });
  child.unref();
  return { task_id: id, status: "running", log, poll: `task_result { task_id: "${id}" }` };
}

function pidAlive(pid: number): boolean {
  if (pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function taskResult(project: Project, taskId: string): Record<string, unknown> {
  if (!TASK_ID_PATTERN.test(taskId)) {
    throw new Error(`invalid task_id '${taskId}' (expected [a-z0-9-]+)`);
  }
  const dir = join(project.workspace, "run");
  const recordPath = join(dir, `${taskId}.json`);
  if (!existsSync(recordPath)) {
    throw new Error(`unknown task '${taskId}' (no ${recordPath})`);
  }
  const record = JSON.parse(readFileSync(recordPath, "utf-8")) as TaskRecord;
  if (record.status === "running" && !pidAlive(record.pid)) {
    // The writer died with the server: reconcile from the feature state.
    record.reconciled = true;
    record.finished_at = new Date().toISOString();
    let closed = false;
    if (record.kind === "feature_close" && record.feature) {
      try {
        const data = JSON.parse(
          readFileSync(join(project.workspace, "feature_list.json"), "utf-8"),
        ) as { features?: { name?: string; status?: string }[] };
        closed = (data.features ?? []).find((f) => f.name === record.feature)?.status === "done";
      } catch {
        /* unreadable queue: closed stays false */
      }
    }
    record.status = closed ? "completed" : "failed";
    record.exit = closed ? 0 : 1;
    try {
      writeFileSync(recordPath, JSON.stringify(record, null, 2), "utf-8");
    } catch {
      /* read-only workspace: report without persisting */
    }
  }
  const logPath = join(dir, `${taskId}.log`);
  const logTail = existsSync(logPath) ? readFileSync(logPath, "utf-8").slice(-4000) : "";
  return {
    ...record,
    log_tail: logTail,
    ...(record.kind === "feature_close" && record.status !== "running"
      ? { closed: record.exit === 0 }
      : {}),
  };
}

// --- human confirmation for destructive verbs (P2: elicitation) ---------------

type ConfirmOutcome =
  | { decided: true; confirmed: boolean; via: "elicitation" | "param" }
  | { decided: false };

/**
 * The human gate that lets a destructive verb live in the MCP. Preferred path
 * is elicitation: the client asks the user mid-call and the tool acts on the
 * answer. Clients that cannot elicit fall back to an explicit `confirm: true`
 * argument — the tool never executes on the agent's say-so alone, and a call
 * without either path returns the preview so the human can decide.
 */
async function confirmDestructive(
  server: McpServer,
  message: string,
  confirmParam: boolean,
): Promise<ConfirmOutcome> {
  if (server.server.getClientCapabilities()?.elicitation) {
    try {
      const result = await server.server.elicitInput({
        message,
        requestedSchema: {
          type: "object",
          properties: {
            confirm: { type: "boolean", title: "Confirm", description: "Execute the operation." },
          },
          required: ["confirm"],
        },
      });
      return {
        decided: true,
        confirmed: result.action === "accept" && result.content?.confirm === true,
        via: "elicitation",
      };
    } catch {
      // Elicitation failed mid-call; fall through to the param path.
    }
  }
  if (confirmParam) {
    return { decided: true, confirmed: true, via: "param" };
  }
  return { decided: false };
}

function sprintCloseRun(project: Project, dryRun: boolean): RunResult {
  return runCli("sprint.js", dryRun ? ["close", "--dry-run"] : ["close"], project);
}

// --- handoff queue (P3: structured role handoffs) -----------------------------
//
// The anti-telephone rule moves artifacts through backlog/ and chat carries
// only short references; the handoff queue makes that pass-of-the-baton a
// recorded state transition: who handed what artifact to which role, and when
// it was claimed. One JSON file per handoff in <workspace>/handoffs/ — submit,
// claim, done; no broker, same single-writer assumption as the workspace.

const HANDOFF_ROLES = ["leader", "implementer", "reviewer", "explorer"] as const;
type HandoffRole = (typeof HANDOFF_ROLES)[number];

interface Handoff {
  id: string;
  from: HandoffRole;
  to: HandoffRole;
  artifact: string;
  summary?: string;
  status: "pending" | "claimed";
  submitted_at: string;
  claimed_at?: string;
}

function handoffDir(project: Project): string {
  const dir = join(project.workspace, "handoffs");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function readHandoffs(project: Project): Handoff[] {
  let files: string[] = [];
  try {
    files = readdirSync(handoffDir(project));
  } catch {
    return [];
  }
  return files
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        return JSON.parse(readFileSync(join(handoffDir(project), f), "utf-8")) as Handoff;
      } catch {
        return null;
      }
    })
    .filter((h): h is Handoff => h !== null)
    .sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
}

export function handoffSubmit(
  project: Project,
  from: HandoffRole,
  to: HandoffRole,
  artifact: string,
  summary?: string,
): Handoff {
  const now = new Date().toISOString();
  const id = `${now.replace(/[:.]/g, "-")}-${from}-to-${to}-` + `${randomUUID().slice(0, 8)}`;
  const handoff: Handoff = {
    id,
    from,
    to,
    artifact,
    ...(summary ? { summary } : {}),
    status: "pending",
    submitted_at: now,
  };
  writeFileSync(join(handoffDir(project), `${id}.json`), JSON.stringify(handoff, null, 2), "utf-8");
  return handoff;
}

export function handoffClaim(
  project: Project,
  role: HandoffRole,
): { claimed: boolean; handoff?: Handoff } {
  const pending = readHandoffs(project).find((h) => h.to === role && h.status === "pending");
  if (!pending) {
    return { claimed: false };
  }
  pending.status = "claimed";
  pending.claimed_at = new Date().toISOString();
  writeFileSync(
    join(handoffDir(project), `${pending.id}.json`),
    JSON.stringify(pending, null, 2),
    "utf-8",
  );
  return { claimed: true, handoff: pending };
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

/** Context handed to tool handlers that need the server itself (elicitation). */
interface ToolContext {
  server: McpServer;
}

interface ToolSpec {
  name: string;
  title: string;
  description: string;
  inputSchema: InputSchema;
  annotations?: Annotations;
  /** Returns the structured payload (without `project`). May be async. */
  run: (
    target: Project,
    input: Record<string, unknown>,
    ctx: ToolContext,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
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
          return textResult(await spec.run({} as Project, input, { server }));
        }
        const target = resolveProject(input.project as string | undefined);
        const payload = await spec.run(target, input, { server });
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
  format?: (
    result: RunResult,
    target: Project,
    input: Record<string, unknown>,
  ) => Record<string, unknown>;
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
      "(npx handyman-harness@3 feature start <name>) before implementing.",
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

  registerTool(server, {
    name: "feature_acceptance",
    title: "Rewrite a feature's acceptance list",
    description:
      "Replace a feature's acceptance criteria wholesale (feature.js acceptance). Refused on a done " +
      "feature — the reviewed contract stays immutable. The --force override for that case IS exposed " +
      "here but gated by human confirmation (elicitation, or confirm:true when the client cannot " +
      "elicit): the override appends its own history.md entry, so the rewrite is a recorded fact.",
    inputSchema: {
      project: projectField,
      name: featureNameField,
      acceptance: z
        .array(z.string().min(1))
        .min(1)
        .describe("The full new acceptance list; replaces the previous one."),
      force: z
        .boolean()
        .default(false)
        .describe(
          "Rewrite the contract of a DONE feature (feature.js acceptance --force). Requires human confirmation.",
        ),
      confirm: z
        .boolean()
        .default(false)
        .describe("Explicit confirmation for force when the client cannot elicit mid-call."),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    run: async (target, input, ctx) => {
      const argv = ["acceptance", String(input.name)];
      for (const line of (input.acceptance as string[] | undefined) ?? []) {
        argv.push("--acceptance", line);
      }
      if (input.force !== true) {
        return { ...runCli("feature.js", argv, target) };
      }
      const decision = await confirmDestructive(
        ctx.server,
        `Rewrite the ACCEPTED contract of done feature '${String(input.name)}' via --force? ` +
          `The rewrite lands in history.md and the signed review (backlog/review_${String(input.name)}.md) ` +
          `attests to the previous contract.`,
        input.confirm === true,
      );
      if (!decision.decided) {
        return {
          forced: false,
          hint: "human confirmation required; re-call with confirm: true to execute the --force rewrite",
        };
      }
      if (!decision.confirmed) {
        return { forced: false, aborted: true, confirmed_via: decision.via };
      }
      argv.push("--force");
      return { forced: true, confirmed_via: decision.via, ...runCli("feature.js", argv, target) };
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
    name: "feature_close_async",
    title: "Close a feature in the background (verifier-gated)",
    description:
      "The call-now, fetch-later variant of feature_close for the slow path: detaches feature.js done " +
      "(which runs the full verifier, up to 15 min) and returns a task_id immediately. State lives in " +
      "<workspace>/run/<task_id>.{json,log}, so it survives this server; poll with task_result. The " +
      "verifier gate is unchanged — a red verifier still refuses the close, you just learn it later.",
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
    run: (target, input) =>
      featureCloseAsync(target, String(input.name), input.verifier as string | undefined),
  });

  registerTool(server, {
    name: "task_result",
    title: "Poll a background task",
    description:
      "Read the state of a task started by feature_close_async (or any future async verb) from " +
      "<workspace>/run/<task_id>.json plus the tail of its log. A stale 'running' record whose " +
      "process is gone (server died mid-run) is reconciled from the feature state machine: done " +
      "means the verifier gate passed.",
    inputSchema: {
      project: projectField,
      task_id: z
        .string()
        .regex(/^[a-z0-9-]+$/, "task_id must be [a-z0-9-]+")
        .describe("The task_id returned by feature_close_async."),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    run: (target, input) => taskResult(target, String(input.task_id)),
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
      verifier: z.string().optional().describe("Absolute path to an alternative verifier script."),
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
      "does not touch disk. `sprint open` stays CLI-only (branch milestone); `sprint close` is the " +
      "sprint_close tool, gated by human confirmation.",
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

  registerTool(server, {
    name: "sprint_close",
    title: "Close the open period (human-confirmed)",
    description:
      "Close the open work period (sprint.js close): archives done features, compacts their history.md " +
      "entries, and derives memory/sprints/sprint.<id>.md. Because that is destructive, the call always " +
      "runs the --dry-run preview first and executes only after explicit human confirmation — MCP " +
      "elicitation when the client supports it, otherwise re-call with confirm: true after reviewing " +
      "the preview. `sprint open` stays on the CLI by design.",
    inputSchema: {
      project: projectField,
      confirm: z
        .boolean()
        .default(false)
        .describe(
          "Execute the close after reviewing the preview (fallback when the client cannot elicit mid-call).",
        ),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
    run: async (target, input, ctx) => {
      const preview = sprintCloseRun(target, true);
      if (preview.exit !== 0) {
        return { closed: false, ...preview, hint: "dry-run refused; nothing was written" };
      }
      const decision = await confirmDestructive(
        ctx.server,
        `sprint close will archive done features, compact history.md, and derive the period doc.\n\n` +
          `Dry-run preview:\n${preview.output.slice(-3000)}\n\nExecute the close?`,
        input.confirm === true,
      );
      if (!decision.decided) {
        return {
          closed: false,
          preview: preview.output,
          hint: "review the dry-run preview and re-call with confirm: true to execute",
        };
      }
      if (!decision.confirmed) {
        return { closed: false, aborted: true, confirmed_via: decision.via };
      }
      const applied = sprintCloseRun(target, false);
      return { closed: applied.exit === 0, confirmed_via: decision.via, ...applied };
    },
  });

  registerTool(server, {
    name: "handoff_submit",
    title: "Hand an artifact to another role",
    description:
      "Record a role-to-role handoff in <workspace>/handoffs/ — the structured form of the " +
      "anti-telephone rule: the artifact travels by reference (e.g. backlog/impl_<feature>.md), " +
      "never as a chat diff. The target role picks it up with handoff_claim; pending handoffs " +
      "also surface in the resume briefing.",
    inputSchema: {
      project: projectField,
      from: z.enum(HANDOFF_ROLES).describe("Role handing the work off."),
      to: z.enum(HANDOFF_ROLES).describe("Role the work is addressed to."),
      artifact: z
        .string()
        .min(1)
        .describe("Reference to the artifact (path or URI), not its content."),
      summary: z.string().optional().describe("One-line context for the receiver."),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    run: (target, input) => ({
      ...handoffSubmit(
        target,
        input.from as HandoffRole,
        input.to as HandoffRole,
        String(input.artifact),
        input.summary as string | undefined,
      ),
    }),
  });

  registerTool(server, {
    name: "handoff_claim",
    title: "Claim the oldest pending handoff for a role",
    description:
      "Claim the oldest pending handoff addressed to `role`, marking it claimed on disk so a second " +
      "claim never hands the same work twice (the handoff event becomes a fact in the workspace, " +
      "like a feature state transition). claimed:false means the queue has nothing for that role.",
    inputSchema: {
      project: projectField,
      role: z.enum(HANDOFF_ROLES).describe("Role claiming its next handoff."),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    run: (target, input) => ({ ...handoffClaim(target, input.role as HandoffRole) }),
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

  server.registerResource(
    "resume",
    new ResourceTemplate("handyman://{project}/resume", {
      list: async () => ({
        resources: listHarnesses().map((h) => ({
          uri: `handyman://${h.name}/resume`,
          name: `${h.name} resume briefing`,
          mimeType: "text/markdown",
        })),
      }),
    }),
    {
      title: "Session resume briefing",
      description:
        "One-call session restart: branch check, active session, feature queue, recent history, memory index.",
      mimeType: "text/markdown",
    },
    async (uri, { project }) => {
      const target = resolveProject(String(project));
      return {
        contents: [{ uri: uri.href, mimeType: "text/markdown", text: buildResume(target) }],
      };
    },
  );

  for (const role of ROLE_NAMES) {
    const template = roleTemplate(role);
    server.registerPrompt(
      `role_${role}`,
      {
        title: `Handyman ${role} role`,
        description: template.description,
        argsSchema: {
          project: z
            .string()
            .optional()
            .describe(
              "Registered harness name or absolute project root (omit for the server's cwd).",
            ),
          feature: z
            .string()
            .optional()
            .describe("Feature name to work on (from feature_list.json)."),
        },
      },
      (args) => {
        const context: string[] = [];
        try {
          const target = resolveProject(args.project);
          context.push(
            `- PROJECT_ROOT: ${target.root}`,
            `- HARNESS_WORKSPACE: ${target.workspace}`,
          );
        } catch {
          context.push("- (project unresolved: resolve HARNESS_WORKSPACE per AGENTS.md)");
        }
        if (args.feature) {
          context.push(`- Feature: ${args.feature}`);
        }
        const text = `${template.body}\n\n## Invocation context\n${context.join("\n")}\n`;
        return { messages: [{ role: "user" as const, content: { type: "text" as const, text } }] };
      },
    );
  }

  return server;
}

// --- Streamable HTTP transport (P2: multi-client stateful sessions) ----------

const DEFAULT_HTTP_PORT = 8177;

interface HttpArgs {
  http: boolean;
  host: string;
  port: number;
}

function parseHttpArgs(argv: string[]): HttpArgs {
  let http = false;
  let host = "127.0.0.1";
  let port = DEFAULT_HTTP_PORT;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--http") {
      http = true;
    } else if (arg === "--host") {
      host = argv[++i] ?? host;
    } else if (arg.startsWith("--host=")) {
      host = arg.slice("--host=".length);
    } else if (arg === "--port") {
      port = Number(argv[++i]);
    } else if (arg.startsWith("--port=")) {
      port = Number(arg.slice("--port=".length));
    }
  }
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    process.stderr.write(`invalid --port (expected 0-65535)\n`);
    process.exit(2);
  }
  return { http, host, port };
}

/**
 * Stateful Streamable HTTP mode: one McpServer+transport per Mcp-Session-Id.
 * The state that matters (features, session, history) lives on disk, so the
 * per-session server instances are disposable coordinators, not state owners.
 * Unknown session ids get a 404 — per spec the client then re-initializes.
 * Binds loopback by default and enforces DNS-rebinding protection; there is
 * no auth layer, so a non-loopback bind needs a fronting proxy that adds one.
 */
async function runHttp(host: string, port: number): Promise<void> {
  const sessions = new Map<string, { transport: StreamableHTTPServerTransport }>();
  let allowedHosts: string[] = [];
  let allowedOrigins: string[] = [];

  const httpServer = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      if (url.pathname !== "/mcp") {
        res
          .writeHead(404, { "content-type": "application/json" })
          .end(JSON.stringify({ error: "not found; the MCP endpoint is /mcp" }));
        return;
      }
      const sessionId = req.headers["mcp-session-id"];
      const sessionKey = Array.isArray(sessionId) ? sessionId[0] : sessionId;
      if (sessionKey) {
        const session = sessions.get(sessionKey);
        if (!session) {
          // Spec: an unknown session id is a 404, and the client MUST start a
          // new session (initialize without the dead id).
          res.writeHead(404, { "content-type": "application/json" }).end(
            JSON.stringify({
              jsonrpc: "2.0",
              error: { code: -32001, message: "session not found; re-initialize" },
              id: null,
            }),
          );
          return;
        }
        await session.transport.handleRequest(req, res);
        return;
      }
      if (req.method !== "POST") {
        res
          .writeHead(400, { "content-type": "application/json" })
          .end(JSON.stringify({ error: "GET/DELETE require an Mcp-Session-Id header" }));
        return;
      }
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          sessions.set(id, { transport });
          console.error(`handyman-mcp-server session initialized: ${id} (${sessions.size} active)`);
        },
        onsessionclosed: (id) => {
          sessions.delete(id);
          console.error(`handyman-mcp-server session closed: ${id} (${sessions.size} active)`);
        },
        enableDnsRebindingProtection: true,
        allowedHosts,
        allowedOrigins,
      });
      transport.onclose = () => {
        if (transport.sessionId) {
          sessions.delete(transport.sessionId);
        }
      };
      const server = buildServer();
      await server.connect(transport);
      await transport.handleRequest(req, res);
    })().catch((e) => {
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
      }
      res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
    });
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    httpServer.once("error", rejectListen);
    httpServer.listen(port, host, resolveListen);
  });
  const address = httpServer.address();
  const boundPort = typeof address === "object" && address !== null ? address.port : port;
  allowedHosts = [
    ...new Set([`${host}:${boundPort}`, `localhost:${boundPort}`, `127.0.0.1:${boundPort}`]),
  ];
  allowedOrigins = [
    ...new Set([
      `http://${host}:${boundPort}`,
      `http://localhost:${boundPort}`,
      `http://127.0.0.1:${boundPort}`,
      `https://${host}:${boundPort}`,
      `https://localhost:${boundPort}`,
      `https://127.0.0.1:${boundPort}`,
    ]),
  ];
  console.error(
    `handyman-mcp-server listening on http://${host}:${boundPort}/mcp ` +
      `(streamable HTTP, stateful sessions, loopback-only)`,
  );
}

async function main(): Promise<void> {
  const args = parseHttpArgs(process.argv.slice(2));
  if (args.http) {
    await runHttp(args.host, args.port);
    return;
  }
  const server = buildServer();
  await server.connect(new StdioServerTransport());
  console.error("handyman-mcp-server running on stdio");
}

// Only start the transport when executed as a program, so tests can import the
// handlers and buildServer() without hijacking stdio. Basename check, not
// import.meta.url: bundle-proof (see toolbox.ts).
if (basename(process.argv[1] ?? "") === "mcp.js") {
  main().catch((e) => {
    console.error("handyman-mcp-server fatal:", e);
    process.exit(1);
  });
}

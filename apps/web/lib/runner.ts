/**
 * Agent runner for the toolBox panel (feature 70, panel_agent_runner; engines
 * + env sanitization + history + continue mode added in feature 72,
 * runner_observer).
 *
 * This is the panel's first surface that SPAWNS A PROCESS - the line every
 * write route before it explicitly did not cross (/api/feature replies
 * `spawned_process: false` and its suite pins that). Crossing it is a
 * declared product decision, not drift: docs/business.md's "no es un runner"
 * clause was rewritten by this feature (see analisis-mcp-toolbox.md section
 * 6.5, which demanded exactly that).
 *
 * The boundary, in order of defense:
 *  1. OFF by default. Every entry point checks TOOLBOX_RUNNER === "1" at
 *     request time; without the opt-in the panel stays a pure observer.
 *  2. Registry allowlist. Runs launch only inside a root the fleet registry
 *     already trusts (isRegisteredRoot) - same guard as /api/intake and
 *     /api/feature.
 *  3. Server-side prompt. The browser sends {root, feature, engine?, mode?};
 *     the prompt the agent receives is built HERE from the validated feature
 *     name (same ^[A-Za-z0-9_-]+$ contract as `feature.js add`). No free text
 *     from the browser reaches the child process, and spawn() gets an argv
 *     array - no shell interpolation anywhere.
 *  4. One run at a time, globally. The panel exposes the harness discipline
 *     (one feature in progress), it does not multiply it.
 *
 * Engines: RUNNER_ENGINES is a declarative table (PROVIDER_REGISTRY's
 * pattern in packages/toolbox-core/src/llm.ts) - one entry per engine id,
 * data only, startRun never branches on id. `claude` is the local CLI,
 * always available. `glm` reuses the existing Z.ai integration by pointing
 * the same `claude` CLI at Z.ai's Anthropic-compatible endpoint via env vars
 * (ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN / ANTHROPIC_MODEL) - no new
 * binary, no new adapter. TOOLBOX_RUNNER_CMD swaps the binary for a fixture
 * script so the suites exercise the full lifecycle (including which env vars
 * reached the child) without ever launching a real agent or calling Z.ai.
 *
 * Disk stays the source of truth: stdout+stderr append to
 * <workspace>/progress/run-<feature>.log inside the TARGET harness, which
 * the runtime's fs.watch hub already covers - so every log write becomes an
 * /events tick and the panel refetches without polling.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { appendFileSync, closeSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isRegisteredRoot, resolveWorkspace } from "@handyman/toolbox-core";

export const RUN_FEATURE_RE = /^[A-Za-z0-9_-]+$/;
const LOG_TAIL_BYTES = 4096;
/** In-memory run history cap (per acceptance 3); the process losing it on
 * reboot is documented and accepted - disk (the per-feature run log) stays
 * the durable record. */
const RUN_HISTORY_CAP = 20;

export interface RunExit {
  code: number | null;
  signal: string | null;
  at: string;
}

export type RunnerEngineId = string;

export interface RunnerEngineInfo {
  id: RunnerEngineId;
  label: string;
  available: boolean;
}

interface RunnerEngineEntry {
  id: RunnerEngineId;
  label: string;
  /** Cheap, synchronous check against the server's own env - never a network
   * call (mirrors PROVIDER_REGISTRY's available()). */
  available: (env: NodeJS.ProcessEnv) => boolean;
  /** Extra env vars merged onto the sanitized base for this engine's child.
   * Data only: startRun never branches on `id`. */
  childEnv: (env: NodeJS.ProcessEnv) => Record<string, string>;
  /** Hint returned in the 422 body when available() is false. */
  unavailableHint: string;
}

/**
 * Declarative engine table. Adding an engine = adding one entry here;
 * startRun/composeChildEnv never branch on id. `glm` is GLM-5.2 via the same
 * Z.ai integration llm.ts's PROVIDER_REGISTRY "zai" entry already uses (the
 * Anthropic-compatible baseUrl + bearer auth), just handed to the `claude`
 * CLI child as env instead of to an in-process fetch adapter.
 */
export const RUNNER_ENGINES: RunnerEngineEntry[] = [
  {
    id: "claude",
    label: "Claude (local CLI)",
    available: () => true,
    childEnv: () => ({}),
    unavailableHint: "",
  },
  {
    id: "glm",
    label: "GLM-5.2 (Z.ai)",
    available: (env) => (env.Z_AI_API_KEY ?? "").length > 0,
    childEnv: (env) => ({
      ANTHROPIC_BASE_URL: "https://api.z.ai/api/anthropic",
      ANTHROPIC_AUTH_TOKEN: env.Z_AI_API_KEY ?? "",
      ANTHROPIC_MODEL: env.Z_AI_MODEL ?? "glm-5.2",
    }),
    unavailableHint: "engine not available: set Z_AI_API_KEY",
  },
];

const DEFAULT_ENGINE_ID = "claude";

function findEngine(id: RunnerEngineId): RunnerEngineEntry | undefined {
  return RUNNER_ENGINES.find((entry) => entry.id === id);
}

export function listEngines(env: NodeJS.ProcessEnv): RunnerEngineInfo[] {
  return RUNNER_ENGINES.map((entry) => ({
    id: entry.id,
    label: entry.label,
    available: entry.available(env),
  }));
}

/** Engine secrets never travel in the sanitized base: each engine's
 * childEnv() injects its own (glm re-injects Z_AI_API_KEY as
 * ANTHROPIC_AUTH_TOKEN when chosen). Otherwise the real key would reach
 * children that do not need it (the claude engine, and every agent's own
 * subprocesses). */
const ENGINE_SECRET_ENV_KEYS = new Set(["Z_AI_API_KEY"]);

/** Strips the dev-server contamination a panel session running under
 * `next dev` would otherwise leak into every spawned agent: NODE_ENV, and
 * any NEXT_ or __NEXT_ var Next injects for its own runtime. Without this,
 * a run launched from the panel inherits NODE_ENV=development and breaks
 * `next build` inside the child (the gap documented in
 * progress/run-new_feataure_view.log). Engine secrets are stripped too
 * (ENGINE_SECRET_ENV_KEYS above). Everything else in process.env passes
 * through unchanged. */
function sanitizedBaseEnv(env: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    if (
      key === "NODE_ENV" ||
      key.startsWith("NEXT_") ||
      key.startsWith("__NEXT_") ||
      ENGINE_SECRET_ENV_KEYS.has(key)
    ) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

interface CurrentRun {
  root: string;
  feature: string;
  engine: RunnerEngineId;
  startedAt: string;
  logPath: string;
  child: ChildProcess;
  exit: RunExit | null;
}

/** One entry per startRun call (the current run included), most recent
 * first when read out via runHistory(). */
export interface RunHistoryEntry {
  feature: string;
  root: string;
  engine: RunnerEngineId;
  started_at: string;
  phase: "running" | "exited";
  exit?: RunExit;
}

export type StartRunResult =
  | { status: "disabled" }
  | { status: "root_required" }
  | { status: "root_not_registered" }
  | { status: "invalid_feature" }
  | { status: "unknown_engine" }
  | { status: "engine_not_available"; hint: string }
  | { status: "feature_not_pending" }
  | { status: "feature_not_in_progress" }
  | { status: "run_in_progress" }
  | { status: "workspace_error" }
  | { status: "spawn_error"; message: string }
  | { status: "started"; logPath: string };

export interface RunnerStatus {
  enabled: boolean;
  phase: "idle" | "running" | "exited";
  root?: string;
  feature?: string;
  engine?: RunnerEngineId;
  started_at?: string;
  exit?: RunExit;
  log_tail?: string;
  engines: RunnerEngineInfo[];
  runs: RunHistoryEntry[];
}

type RunnerStore = { current: CurrentRun | null; history: RunHistoryEntry[] };

const globalStore = globalThis as typeof globalThis & {
  __handymanToolboxRunner?: RunnerStore;
};

function getStore(): RunnerStore {
  globalStore.__handymanToolboxRunner ??= { current: null, history: [] };
  return globalStore.__handymanToolboxRunner;
}

export function runnerEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.TOOLBOX_RUNNER === "1";
}

/** The one prompt the spawned agent ever receives for a fresh start. Built
 *  server-side from a name that already matched RUN_FEATURE_RE; nothing
 *  browser-typed lands in it. */
export function buildRunPrompt(feature: string): string {
  return (
    `Eres el leader de este harness handyman. Trabaja unicamente la feature ` +
    `'${feature}': ejecuta el flujo run-feature de la skill handyman ` +
    `(implementacion con tests, verificador ./init.sh en verde, review con ` +
    `veredicto real, cierre con feature done). Deja los reportes en el ` +
    `workspace del harness y no toques ninguna otra feature.`
  );
}

/** The prompt for `mode: "continue"`: the feature is already `in_progress`,
 *  so the agent resumes from disk state instead of starting the
 *  run-feature flow over. Same validated-name contract as buildRunPrompt. */
export function buildContinuePrompt(feature: string): string {
  return (
    `Eres el leader de este harness handyman. La feature '${feature}' ya esta ` +
    `in_progress: RETOMALA desde el estado en disco (progress/current.md, ` +
    `backlog/) en vez de reiniciar el flujo. Continua desde donde quedo y ` +
    `cierra el ciclo: review con veredicto real y, si corresponde, feature ` +
    `done con el verificador en verde. No toques ninguna otra feature.`
  );
}

/** TOOLBOX_RUNNER_CMD is the test seam: same argv, different binary. */
export function buildRunCommand(
  env: NodeJS.ProcessEnv,
  prompt: string,
): { cmd: string; args: string[] } {
  return {
    cmd: env.TOOLBOX_RUNNER_CMD ?? "claude",
    args: ["-p", prompt, "--dangerously-skip-permissions"],
  };
}

/** Reads the target harness's feature_list.json and returns the named
 *  feature's status ("" when the feature is not present, so callers treat
 *  "unknown feature" the same as "wrong status" - both are 422, same as
 *  before this feature's rewrite), or null only when the file itself could
 *  not be read/parsed (a 400, the harness itself is unreadable). */
function findFeatureStatus(workspace: string, feature: string): string | null {
  try {
    const raw = readFileSync(join(workspace, "feature_list.json"), "utf8");
    const data = JSON.parse(raw) as { features?: Array<{ name?: unknown; status?: unknown }> };
    const features = Array.isArray(data.features) ? data.features : [];
    const entry = features.find((item) => item.name === feature);
    if (entry === undefined || typeof entry.status !== "string") {
      return "";
    }
    return entry.status;
  } catch {
    return null;
  }
}

export interface StartRunOptions {
  engine?: string;
  mode?: "start" | "continue";
}

export function startRun(
  hroot: string,
  root: string,
  feature: string,
  env: NodeJS.ProcessEnv,
  options: StartRunOptions = {},
): StartRunResult {
  if (!runnerEnabled(env)) {
    return { status: "disabled" };
  }
  if (root.length === 0) {
    return { status: "root_required" };
  }
  if (!isRegisteredRoot(hroot, root)) {
    return { status: "root_not_registered" };
  }
  if (!RUN_FEATURE_RE.test(feature)) {
    return { status: "invalid_feature" };
  }
  const engineId = options.engine ?? DEFAULT_ENGINE_ID;
  const engine = findEngine(engineId);
  if (engine === undefined) {
    return { status: "unknown_engine" };
  }
  if (!engine.available(env)) {
    return { status: "engine_not_available", hint: engine.unavailableHint };
  }
  const store = getStore();
  if (store.current !== null && store.current.exit === null) {
    return { status: "run_in_progress" };
  }
  let workspace: string;
  try {
    workspace = resolveWorkspace(root);
  } catch {
    return { status: "workspace_error" };
  }
  const mode = options.mode ?? "start";
  const featureStatus = findFeatureStatus(workspace, feature);
  if (featureStatus === null) {
    return { status: "workspace_error" };
  }
  if (mode === "continue") {
    if (featureStatus !== "in_progress") {
      return { status: "feature_not_in_progress" };
    }
  } else if (featureStatus !== "pending") {
    return { status: "feature_not_pending" };
  }

  const startedAt = new Date().toISOString();
  const logPath = join(workspace, "progress", `run-${feature}.log`);
  const prompt = mode === "continue" ? buildContinuePrompt(feature) : buildRunPrompt(feature);
  const { cmd, args } = buildRunCommand(env, prompt);
  const childEnv: Record<string, string | undefined> = {
    ...sanitizedBaseEnv(env),
    ...engine.childEnv(env),
  };
  let fd: number;
  try {
    mkdirSync(join(workspace, "progress"), { recursive: true });
    fd = openSync(logPath, "a");
    appendFileSync(fd, `==> run ${feature} @ ${startedAt} (panel, ${cmd}, engine=${engineId}, mode=${mode})\n`);
  } catch (error) {
    return { status: "spawn_error", message: error instanceof Error ? error.message : "log open failed" };
  }
  let child: ChildProcess;
  try {
    // detached: the agent spawns its own children (bash, tests); a stop must
    // reach the whole process group, not just the CLI.
    child = spawn(cmd, args, {
      cwd: root,
      // @types/node's ProcessEnv marks NODE_ENV as required even though
      // spawn() accepts any string-keyed env at runtime; sanitizedBaseEnv
      // deliberately omits it (that is the point of the sanitization).
      env: childEnv as NodeJS.ProcessEnv,
      detached: true,
      stdio: ["ignore", fd, fd],
    });
  } catch (error) {
    closeSync(fd);
    return { status: "spawn_error", message: error instanceof Error ? error.message : "spawn failed" };
  }
  closeSync(fd); // the child holds its own descriptor

  const run: CurrentRun = { root, feature, engine: engineId, startedAt, logPath, child, exit: null };
  const historyEntry: RunHistoryEntry = {
    feature,
    root,
    engine: engineId,
    started_at: startedAt,
    phase: "running",
  };
  store.history.unshift(historyEntry);
  if (store.history.length > RUN_HISTORY_CAP) {
    store.history.length = RUN_HISTORY_CAP;
  }
  child.on("error", (error) => {
    run.exit = { code: null, signal: "SPAWN_ERROR", at: new Date().toISOString() };
    historyEntry.phase = "exited";
    historyEntry.exit = run.exit;
    try {
      appendFileSync(logPath, `==> run ${feature} spawn error: ${error.message}\n`);
    } catch {
      // log directory vanished: the exit record above still tells the story
    }
  });
  child.on("exit", (code, signal) => {
    run.exit = { code, signal, at: new Date().toISOString() };
    historyEntry.phase = "exited";
    historyEntry.exit = run.exit;
    try {
      appendFileSync(logPath, `==> run ${feature} exited code=${code ?? "null"} signal=${signal ?? "none"}\n`);
    } catch {
      // same: state is authoritative, the footer is a courtesy
    }
  });
  store.current = run;
  return { status: "started", logPath };
}

export function stopRun(): { stopped: boolean } {
  const store = getStore();
  const run = store.current;
  if (run === null || run.exit !== null) {
    return { stopped: false };
  }
  const pid = run.child.pid;
  try {
    if (typeof pid === "number") {
      process.kill(-pid, "SIGTERM"); // whole detached process group
    } else {
      run.child.kill("SIGTERM");
    }
  } catch {
    run.child.kill("SIGTERM");
  }
  return { stopped: true };
}

export function runnerStatus(env: NodeJS.ProcessEnv): RunnerStatus {
  const store = getStore();
  const run = store.current;
  const engines = listEngines(env);
  const runs = store.history;
  if (run === null) {
    return { enabled: runnerEnabled(env), phase: "idle", engines, runs };
  }
  let tail: string | undefined;
  try {
    tail = readFileSync(run.logPath, "utf8").slice(-LOG_TAIL_BYTES);
  } catch {
    tail = undefined;
  }
  return {
    enabled: runnerEnabled(env),
    phase: run.exit === null ? "running" : "exited",
    root: run.root,
    feature: run.feature,
    engine: run.engine,
    started_at: run.startedAt,
    ...(run.exit === null ? {} : { exit: run.exit }),
    ...(tail === undefined ? {} : { log_tail: tail }),
    engines,
    runs,
  };
}

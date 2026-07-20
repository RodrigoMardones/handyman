/**
 * /api/run (feature 70, panel_agent_runner; engine/mode/history added in
 * feature 72, runner_observer): the panel's runner surface.
 *
 * POST launches a headless agent session (the local `claude` CLI, or the
 * TOOLBOX_RUNNER_CMD fixture in tests) on one feature of one registered
 * harness, on a chosen `engine` (default "claude"; see RUNNER_ENGINES in
 * lib/runner.ts). `mode: "continue"` relaunches a feature that is already
 * `in_progress` with a resume prompt instead of the fresh-start prompt.
 * GET reports the single global run plus the engine list and run history.
 * DELETE stops the current run (SIGTERM to the whole process group).
 *
 * This is the first route whose success reply says `spawned_process: true` -
 * the exact inversion of /api/feature's pinned `spawned_process: false`.
 * Everything that makes that acceptable lives in lib/runner.ts: off by
 * default (TOOLBOX_RUNNER=1 opt-in, checked per request), registry
 * allowlist, server-side prompt, one run at a time. The HTTP layer here only
 * maps results, mirroring app/api/feature/route.ts.
 */
import { readJsonObject } from "../../../lib/relay";
import { sendJson } from "../../../lib/respond";
import { runnerStatus, startRun, type StartRunResult, stopRun } from "../../../lib/runner";
import { getRuntime } from "../../../lib/runtime";

export const dynamic = "force-dynamic";

/** Body cap: a filesystem path plus a feature name. */
const RUN_MAX_BYTES = 4 * 1024;

function runHttp(result: StartRunResult): { status: number; body: unknown } {
  switch (result.status) {
    case "disabled":
      return {
        status: 403,
        body: { ok: false, error: "runner disabled: start the observer with TOOLBOX_RUNNER=1" },
      };
    case "root_required":
      return { status: 400, body: { ok: false, error: "root is required" } };
    case "root_not_registered":
      return { status: 400, body: { ok: false, error: "root not registered" } };
    case "invalid_feature":
      return {
        status: 422,
        body: { ok: false, error: "feature must match ^[A-Za-z0-9_-]+$" },
      };
    case "unknown_engine":
      return { status: 422, body: { ok: false, error: "unknown engine" } };
    case "engine_not_available":
      return { status: 422, body: { ok: false, error: result.hint } };
    case "feature_not_pending":
      return { status: 422, body: { ok: false, error: "feature is not pending in that harness" } };
    case "feature_not_in_progress":
      return { status: 422, body: { ok: false, error: "feature is not in_progress in that harness" } };
    case "run_in_progress":
      return { status: 409, body: { ok: false, error: "a run is already in progress" } };
    case "workspace_error":
      return { status: 400, body: { ok: false, error: "could not read the harness workspace" } };
    case "spawn_error":
      return { status: 500, body: { ok: false, error: `could not spawn the agent: ${result.message}` } };
    default:
      return { status: 200, body: { ok: true, spawned_process: true } };
  }
}

export async function GET(): Promise<Response> {
  return sendJson(200, runnerStatus(process.env));
}

export async function POST(request: Request): Promise<Response> {
  const runtime = getRuntime();
  const body = await readJsonObject(request, RUN_MAX_BYTES);
  if (body === null) {
    return sendJson(400, { ok: false, error: "invalid body: expects {root, feature}" });
  }
  const root = typeof body.root === "string" ? body.root : "";
  const feature = typeof body.feature === "string" ? body.feature : "";
  const engine = typeof body.engine === "string" ? body.engine : undefined;
  const mode = body.mode === "continue" ? "continue" : "start";
  const { status, body: responseBody } = runHttp(
    startRun(runtime.hroot, root, feature, process.env, { engine, mode }),
  );
  return sendJson(status, responseBody);
}

export async function DELETE(): Promise<Response> {
  if (!runnerStatus(process.env).enabled) {
    return sendJson(403, {
      ok: false,
      error: "runner disabled: start the observer with TOOLBOX_RUNNER=1",
    });
  }
  return sendJson(200, { ok: true, ...stopRun() });
}

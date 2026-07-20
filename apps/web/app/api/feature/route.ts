/**
 * POST /api/feature (feature 60): the panel's first write of harness STATE.
 *
 * /api/intake already wrote a *document* (feature-request.md). This writes the
 * state machine itself, which is why it goes through the one validated append
 * the CLI uses - handyman's core/featureWrite.ts, reached via addFeatureForRoot
 * - instead of re-implementing it or shelling out to `feature.js add`. Like
 * intake, it never spawns a process: the reply says so, and the suites pin it.
 *
 * The handyman entry is loaded at RUNTIME (lib/toolboxState.ts) rather than
 * statically imported, because both Next bundlers rewrite import.meta.url when
 * they inline a symlinked workspace package - and featureWrite.ts's schema
 * validation resolves assets/schemas/feature_list.schema.json exactly that way
 * (the constraint feature 43 documented in next.config.ts).
 *
 * Validation order is addFeatureForRoot's and is contract:
 *   root required -> registered root -> name -> acceptance -> workspace -> write
 */
import type { AddFeatureForRootResult } from "../../../lib/toolboxState";
import { readJsonObject } from "../../../lib/relay";
import { sendJson } from "../../../lib/respond";
import { getRuntime } from "../../../lib/runtime";
import { getToolboxEntry } from "../../../lib/toolboxState";

export const dynamic = "force-dynamic";

/** Body cap: a feature is a name plus a handful of acceptance lines. */
const FEATURE_MAX_BYTES = 64 * 1024;

/** The HTTP mapping of an AddFeatureForRootResult. One consumer, so it lives
 *  here; if a second surface ever needs it, it moves beside the result type. */
function featureHttp(result: AddFeatureForRootResult): { status: number; body: unknown } {
  switch (result.status) {
    case "root_required":
      return { status: 400, body: { ok: false, error: "root is required" } };
    case "root_not_registered":
      return { status: 400, body: { ok: false, error: "root not registered" } };
    case "invalid_name":
      return {
        status: 422,
        body: { ok: false, error: "name must match ^[A-Za-z0-9_-]+$" },
      };
    case "empty_acceptance":
      return { status: 422, body: { ok: false, error: "acceptance must not be empty" } };
    case "duplicate_name":
      return { status: 409, body: { ok: false, error: "feature already exists" } };
    case "workspace_error":
      return { status: 400, body: { ok: false, error: "could not resolve harness workspace" } };
    case "invalid_state":
      return {
        status: 422,
        body: { ok: false, error: `refusing to write invalid feature_list.json: ${result.errors.join("; ")}` },
      };
    case "write_error":
      return { status: 500, body: { ok: false, error: "could not write feature_list.json" } };
    default:
      return { status: 200, body: { ok: true, id: result.id, spawned_process: false } };
  }
}

export async function POST(request: Request): Promise<Response> {
  const runtime = getRuntime();
  const body = await readJsonObject(request, FEATURE_MAX_BYTES);
  if (body === null) {
    return sendJson(400, {
      ok: false,
      error: "invalid body: expects {root, name, acceptance}",
    });
  }
  const root = typeof body.root === "string" ? body.root : "";
  const name = typeof body.name === "string" ? body.name : "";
  const acceptance = Array.isArray(body.acceptance)
    ? body.acceptance.filter((line): line is string => typeof line === "string")
    : [];
  const title = typeof body.title === "string" ? body.title : null;
  const description = typeof body.description === "string" ? body.description : null;

  const { addFeatureForRoot } = await getToolboxEntry();
  const { status, body: responseBody } = featureHttp(
    addFeatureForRoot(runtime.hroot, root, name, acceptance, { title, description }),
  );
  return sendJson(status, responseBody);
}

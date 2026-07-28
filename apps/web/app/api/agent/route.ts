/**
 * GET /api/agent?feature= (feature 95 web_live_agent_view): the live Flue
 * agent status for one feature, served natively by Next. The read itself
 * lives in ./loadAgentState.ts (shared with the /agent Server Component):
 * the flue-handyman telemetry JSONL plus an HTTP liveness probe. Byte-parity
 * headers come from lib/respond.ts's sendJson, same as the other native
 * route handlers.
 *
 * Never throws: internal failures degrade to runtime:"offline" and/or
 * telemetry:null inside a 200; only a missing/invalid feature is a 400.
 * force-dynamic: the JSONL grows on every agent event and the probe is a
 * live check; nothing here may be prerendered or cached.
 */
import { sendJson } from "../../../lib/respond";
import { isValidFeatureName, loadAgentState } from "./loadAgentState";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const feature = new URL(request.url).searchParams.get("feature") ?? "";
  if (!isValidFeatureName(feature)) {
    return sendJson(400, { ok: false, error: "invalid feature" });
  }
  try {
    const state = await loadAgentState(feature);
    return sendJson(200, { ok: true, ...state });
  } catch {
    // loadAgentState is designed not to throw; this last-resort degradation
    // keeps the "never a 500" contract even if that ever changes.
    return sendJson(200, { ok: true, runtime: "offline", feature, telemetry: null });
  }
}

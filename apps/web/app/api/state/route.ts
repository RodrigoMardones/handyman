/**
 * GET /api/state (feature 43): the observer state document, served natively
 * by Next via a direct buildState() import - no HTTP hop to the Node server.
 *
 * Byte-parity with toolbox_serve.ts's sendJson: same JSON.stringify payload
 * and the same four headers (content-type, no-store, nosniff, CSP).
 * force-dynamic: the document reads the registry and every workspace from
 * disk on each request; nothing here may be prerendered or cached.
 */
import { sendJson } from "../../../lib/respond";
import { getRuntime } from "../../../lib/runtime";
import { getBuildState } from "../../../lib/toolboxState";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const runtime = getRuntime();
  const buildState = await getBuildState();
  return sendJson(200, buildState(runtime.hroot));
}

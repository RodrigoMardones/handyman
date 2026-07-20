/**
 * GET /graph/NAME/graph.(html|json) (feature 44): the harness's graphify
 * export, natively served. Lookup by project_name and the same-origin
 * vis-network rewrite live in handyman/src/toolbox_assets.ts, reached
 * through the runtime loader (never bundled: resolution is relative to the
 * handyman package). Catch-all so non-matching /graph/* paths return the
 * observer's generic JSON 404, exactly like the Node server.
 */
import { send, sendJson } from "../../../lib/respond";
import { getRuntime } from "../../../lib/runtime";
import { getToolboxEntry } from "../../../lib/toolboxState";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const runtime = getRuntime();
  const path = new URL(request.url).pathname;
  const graphMatch = /^\/graph\/([^/]+)\/graph\.(html|json)$/.exec(path);
  if (!graphMatch) {
    return sendJson(404, { ok: false, error: "not found" });
  }
  const wanted = decodeURIComponent(graphMatch[1] as string);
  const { graphFile } = await getToolboxEntry();
  const result = graphFile(runtime.hroot, wanted, graphMatch[2] as "html" | "json");
  if (result.status === "unknown_harness") {
    return sendJson(404, { ok: false, error: "unknown harness" });
  }
  if (result.status === "no_export") {
    return sendJson(404, { ok: false, error: "no graphify export for this harness" });
  }
  return send(200, result.text, result.type);
}

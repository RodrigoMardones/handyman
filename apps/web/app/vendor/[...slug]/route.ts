/**
 * GET /vendor/<name>.js (feature 44): browser UMDs served same-origin from
 * the handyman package's node_modules (strict CSP blocks any CDN). The
 * whitelist + resolution live in handyman/src/toolbox_assets.ts, reached
 * through the runtime loader so require.resolve keeps running relative to
 * the handyman package. Catch-all so non-matching /vendor/* paths return
 * the observer's generic JSON 404, exactly like the Node server.
 */
import { send, sendJson } from "../../../lib/respond";
import { getToolboxEntry } from "../../../lib/toolboxState";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;
  const vendorMatch = /^\/vendor\/([\w.-]+)$/.exec(path);
  if (!vendorMatch) {
    return sendJson(404, { ok: false, error: "not found" });
  }
  const { vendorText } = await getToolboxEntry();
  const text = vendorText(vendorMatch[1] as string);
  if (text === null) {
    return sendJson(404, { ok: false, error: "vendor lib not installed" });
  }
  return send(200, text, "application/javascript; charset=utf-8");
}

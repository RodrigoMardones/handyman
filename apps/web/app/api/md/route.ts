/**
 * GET /api/md?root=&file= (feature 44): whitelisted raw markdown from a
 * REGISTERED root. The registry is the read allowlist and resolveMd carries
 * the whitelist + traversal containment (moved to the core in feature 42);
 * error codes and bodies are byte-identical to the Node observer.
 */
import { readText, resolveMd } from "@handyman/toolbox-core";
import { send, sendJson } from "../../../lib/respond";
import { getRuntime } from "../../../lib/runtime";

export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  const runtime = getRuntime();
  const url = new URL(request.url);
  const root = url.searchParams.get("root") ?? "";
  const file = url.searchParams.get("file") ?? "";
  const resolved = resolveMd(runtime.hroot, root, file);
  if (resolved === null) {
    return sendJson(400, { ok: false, error: "root not registered or file not whitelisted" });
  }
  const text = readText(resolved);
  if (text === null) {
    return sendJson(404, { ok: false, error: "file not found" });
  }
  return send(200, text, "text/markdown; charset=utf-8");
}

/**
 * GET /api/files?root= (feature 44): taggable workspace files (relative
 * paths) inside a REGISTERED root - the picker for the intake tags. Guard,
 * caps and walk live in the core (feature 42); parity with the Node
 * observer.
 */
import { isRegisteredRoot, listTagFiles } from "@handyman/toolbox-core";
import { sendJson } from "../../../lib/respond";
import { getRuntime } from "../../../lib/runtime";

export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  const runtime = getRuntime();
  const root = new URL(request.url).searchParams.get("root") ?? "";
  if (!root || !isRegisteredRoot(runtime.hroot, root)) {
    return sendJson(400, { ok: false, error: "root not registered" });
  }
  return sendJson(200, { root, files: listTagFiles(root) });
}

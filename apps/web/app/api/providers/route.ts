/**
 * GET /api/providers (feature 44): LLM provider availability from the
 * runtime singleton's provider set (keys never leave the server). Same
 * shape as the Node observer: {id, available, model} plus the declared
 * future ids (copilot).
 */
import { providersInfo } from "@handyman/toolbox-core";
import { sendJson } from "../../../lib/respond";
import { getRuntime } from "../../../lib/runtime";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const runtime = getRuntime();
  try {
    const infos = await providersInfo(runtime.providers);
    return sendJson(200, { providers: infos });
  } catch {
    return sendJson(500, { ok: false, error: "provider check failed" });
  }
}

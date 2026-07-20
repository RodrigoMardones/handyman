/**
 * POST /api/intake (feature 46): the ONLY disk write of the observer
 * surface, served natively. The write itself (validation order, footer,
 * single allowlisted feature-request.md inside a REGISTERED workspace) is
 * @handyman/toolbox-core's writeIntake - the same function behind the Node
 * observer and the submitIntake server action - and intakeHttp maps it to
 * the byte-identical historical statuses and bodies. Never spawns a
 * process.
 */
import { INTAKE_MAX_BYTES, intakeHttp, writeIntake } from "@handyman/toolbox-core";
import { readJsonObject } from "../../../lib/relay";
import { sendJson } from "../../../lib/respond";
import { getRuntime } from "../../../lib/runtime";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const runtime = getRuntime();
  const body = await readJsonObject(request, INTAKE_MAX_BYTES);
  if (body === null) {
    return sendJson(400, { ok: false, error: "invalid body: expects {root, draft_md}" });
  }
  const root = typeof body.root === "string" ? body.root : "";
  const draftMd = typeof body.draft_md === "string" ? body.draft_md : "";
  const fileRels = Array.isArray(body.files)
    ? body.files.filter((f): f is string => typeof f === "string")
    : [];
  const { status, body: responseBody } = intakeHttp(
    writeIntake(runtime.hroot, root, draftMd, fileRels),
  );
  return sendJson(status, responseBody);
}

/**
 * toolBox intake write (feature 46): the ONLY disk write of the whole
 * observer surface, extracted verbatim from toolbox_serve.ts's
 * handleIntakeRequest so the Node observer, the Next route handler and the
 * submitIntake server action share ONE function.
 *
 * Contract (unchanged): persist the human-reviewed draft as the target
 * harness's feature-request.md - one allowlisted file inside a REGISTERED
 * workspace, never spawning a process. Tagged files are recorded as a
 * reference footer (capped) so the selected context travels with the
 * document. Validation ORDER matters and is part of the parity oracle:
 * root required -> empty draft -> registered root -> workspace -> write.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { isRegisteredRoot, TAG_MAX_IN_DRAFT } from "./state.js";
import { resolveWorkspace } from "./workspace.js";
export function writeIntake(hroot, root, draftMd, fileRels) {
    if (!root) {
        return { status: "root_required" };
    }
    if (!draftMd.trim()) {
        return { status: "empty_draft" };
    }
    if (!isRegisteredRoot(hroot, root)) {
        return { status: "root_not_registered" };
    }
    let workspace;
    try {
        workspace = resolveWorkspace(root);
    }
    catch {
        return { status: "workspace_error" };
    }
    // Record the tagged files as a reference footer so the submitted intake
    // carries its selected context without embedding potentially large bodies.
    const rels = fileRels.slice(0, TAG_MAX_IN_DRAFT);
    const footer = rels.length > 0 ? `\n\n<!-- intake context files: ${rels.join(", ")} -->\n` : "";
    const dest = join(workspace, "feature-request.md");
    try {
        writeFileSync(dest, `${draftMd.trim()}${footer}\n`, "utf-8");
    }
    catch {
        return { status: "write_error" };
    }
    return { status: "ok", path: dest, files: rels.length };
}
/**
 * The HTTP mapping of an IntakeResult, byte-identical to the observer's
 * historical responses. Shared by toolbox_serve.ts and the Next route
 * handler so status codes and bodies can never drift.
 */
export function intakeHttp(result) {
    switch (result.status) {
        case "root_required":
            return { status: 400, body: { ok: false, error: "root is required" } };
        case "empty_draft":
            return { status: 422, body: { ok: false, error: "draft_md must not be empty" } };
        case "root_not_registered":
            return { status: 400, body: { ok: false, error: "root not registered" } };
        case "workspace_error":
            return { status: 400, body: { ok: false, error: "could not resolve harness workspace" } };
        case "write_error":
            return { status: 500, body: { ok: false, error: "could not write feature-request.md" } };
        default:
            return {
                status: 200,
                body: { ok: true, path: result.path, files: result.files, spawned_process: false },
            };
    }
}
//# sourceMappingURL=intake.js.map
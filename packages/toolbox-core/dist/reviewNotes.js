/**
 * Review-notes seed (feature 34, item 2.5 of
 * docs/analisis-tareas-llm-toolbox.md).
 *
 * Given backlog/impl_<feature>.md plus the working diff, produce a CHECKLIST
 * the reviewer uses as a starting point: critical points, invariants at risk,
 * questions to answer. Deliberately NOT a verdict and NOT a patch - the
 * harness rule is "the reviewer never edits code", and the signature
 * (APPROVED / CHANGES_REQUESTED) has to rest on real evidence (the verifier
 * and the diff), never on a model's summary. Nothing here writes disk.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { LlmError } from "./llm.js";
import { readText } from "./state.js";
import { resolveWorkspace } from "./workspace.js";
/** Diff budget for the prompt. Big enough for a normal feature, small enough
 *  that a stray lockfile churn cannot blow the context window. */
export const REVIEW_DIFF_MAX_CHARS = 60_000;
/** backlog/impl_<feature>.md, or null when the implementer left no report. */
export function readImplReport(workspace, feature) {
    return readText(join(workspace, "backlog", `impl_${feature}.md`));
}
/**
 * `git diff HEAD` inside the registered root: staged + unstaged, i.e. what an
 * in-progress feature actually looks like.
 *
 * execFile (never a shell) with the root as cwd, so nothing here can be
 * turned into command injection by a crafted body - `root` is already
 * registry-validated by the caller, and no field of the request reaches argv.
 * A non-repo, a git failure or a missing binary all degrade to an empty diff:
 * the impl report alone still makes a usable checklist.
 */
export function readFeatureDiff(root, maxChars = REVIEW_DIFF_MAX_CHARS) {
    let raw;
    try {
        raw = execFileSync("git", ["diff", "HEAD"], {
            cwd: root,
            encoding: "utf-8",
            maxBuffer: 32 * 1024 * 1024,
            stdio: ["ignore", "pipe", "ignore"],
        });
    }
    catch {
        return { diff: "", truncated: false };
    }
    if (raw.length <= maxChars) {
        return { diff: raw, truncated: false };
    }
    return { diff: raw.slice(0, maxChars), truncated: true };
}
export function composeReviewNotesSystem() {
    return [
        "Eres un asistente que prepara la revision de una feature en un harness Handyman.",
        "Produces un CHECKLIST de revision en markdown: puntos criticos, invariantes en",
        "riesgo y preguntas concretas que el reviewer debe verificar contra la evidencia.",
        "",
        "Reglas duras:",
        "- Tu salida es un BORRADOR: el reviewer verifica TODO. Dilo en la primera linea.",
        "- Escribes PREGUNTAS y PUNTOS A VERIFICAR, no conclusiones.",
        "  Ej: '- invariante X respetada?', '- hay test que cubra el caso Y?'.",
        "- NUNCA emites un veredicto: no escribas APPROVED ni CHANGES_REQUESTED ni",
        "  equivalentes ('esta listo', 'se puede cerrar'). No es tu decision.",
        "- NUNCA propongas un patch ni escribas codigo de reemplazo.",
        "- Si el diff o el reporte no alcanzan para juzgar algo, dilo explicitamente",
        "  ('no hay evidencia suficiente para X') en vez de suponer.",
    ].join("\n");
}
export function composeReviewNotesPrompt(feature, implReport, diff, truncated) {
    const parts = [`Feature bajo revision: ${feature}`, ""];
    parts.push("---- reporte del implementer (backlog/impl_" + feature + ".md)");
    parts.push(implReport ?? "(no hay reporte del implementer para esta feature)");
    parts.push("");
    parts.push("---- diff de trabajo (git diff HEAD)");
    parts.push(diff.length > 0 ? diff : "(diff vacio o el root no es un repo git)");
    if (truncated) {
        parts.push("");
        parts.push("[el diff fue truncado por tamano: senala que quedo sin revisar]");
    }
    return parts.join("\n");
}
/**
 * Resolve workspace -> read impl report -> read diff -> compose system+prompt.
 *
 * Extracted when the SECOND consumer appeared (feature 53's CLI subcommand),
 * not the seventh: `POST /api/review-notes` and `toolbox.js review-notes` now
 * share this verbatim, so the two can never drift into asking the model
 * different questions about the same feature. What stays outside is only the
 * framing each one owns - SSE events for the route, stdout for the CLI - plus
 * provider selection, which the two resolve from genuinely different places
 * (a request body vs. argv).
 */
export function composeReviewNotesRequest(root, feature) {
    const implReport = readImplReport(resolveWorkspace(root), feature);
    const { diff, truncated } = readFeatureDiff(root);
    return {
        system: composeReviewNotesSystem(),
        prompt: composeReviewNotesPrompt(feature, implReport, diff, truncated),
        diffTruncated: truncated,
    };
}
/** Same shape as relaySummary/relayTriage: HTTP-agnostic, never throws. */
export async function relayReviewNotes(options) {
    const { system, prompt, draft, diffTruncated, onDelta, onResult, onError } = options;
    try {
        const result = await draft({ prompt, system }, onDelta);
        onResult({ checklist_md: result.text, model: result.model, diff_truncated: diffTruncated });
    }
    catch (error) {
        if (error instanceof LlmError) {
            onError(error);
            return;
        }
        onError(new LlmError("provider_error", error instanceof Error ? error.message : String(error)));
    }
}
//# sourceMappingURL=reviewNotes.js.map
/**
 * Pure HTML renderer for the /ask answer region (feature 48).
 *
 * Mirrors the same string-renderer pattern as fleetHtml.ts / searchHtml.ts:
 * a plain TS module that turns state into HTML, importable directly by a
 * Node test. The AskClient component streams the answer into a live region
 * painted by renderAnswerHtml so server markup and post-stream markup agree
 * by construction.
 *
 * Citation handling: BEFORE this renderer ever runs, AskClient applies
 * `linkCitations` (rewrites viewable `[fuente: <ref>]` to a markdown link
 * with `#cite=<ref>`) and then `renderSanitized` (marked + DOMPurify with
 * the panel's FORBID policy). This renderer slots the ALREADY-sanitized
 * HTML into the answer body; it never touches marked/DOMPurify itself,
 * keeping this module pure and transpiled-deterministic. ONE delegated
 * click handler in AskClient reads the href and opens the source through
 * the shared /api/md dialog.
 *
 * Security: every dynamic value is HTML-escaped via `esc()`. The answer
 * body is the only slot that trusts pre-sanitized HTML, and that is solely
 * because lib/md.ts already stripped anything executable.
 */
import { escapeHtml } from "../../lib/md";

/** Fragment returned in the SSE `result` event of POST /api/ask, used to
 *  render the "grounded on" line under the answer. Loose on purpose. */
export interface AskFragment {
  ref: string;
  kind: string;
}

/** Phase of the ask machine (mirrors AskClient state). */
export type AskPhase = "idle" | "streaming" | "done" | "error";

/**
 * Render the streamed answer region. The answer body is already sanitized
 * upstream (AskClient calls linkCitations + renderSanitized), so the body
 * slot is the ONLY place that trusts pre-sanitized HTML. The grounded-on
 * line lists the top-k fragments the server actually grounded the answer
 * on (for linking / validation), all escaped.
 *
 * Pure: same inputs => same HTML.
 */
export function renderAnswerHtml(
  sanitizedHtml: string,
  phase: AskPhase,
  model: string,
  fragments: AskFragment[],
): string {
  const busy = phase === "streaming";
  if (!sanitizedHtml && !busy) {
    return "";
  }
  const head =
    phase === "done" && model
      ? `<span class="ask-answer__model">model: ${escapeHtml(model)}</span>`
      : "";
  const grounded =
    fragments && fragments.length > 0
      ? `<div class="ask-answer__grounded">grounded on: ${escapeHtml(
          fragments.map((f) => `${f.ref} (${f.kind})`).join(", "),
        )}</div>`
      : "";
  return `<section class="ask-answer" aria-label="Answer">
    <div class="ask-answer__head">${head}</div>
    <div class="md-body ask-answer__body">${sanitizedHtml}</div>
    ${grounded}
  </section>`;
}

/**
 * Render the small outcome line for an ask error (assertive-announced). The
 * message is escaped; only rendered when phase is "error".
 */
export function renderAskErrorHtml(phase: AskPhase, message: string): string {
  if (phase !== "error") {
    return "";
  }
  return `<p class="ask-error" role="alert">ask failed: ${escapeHtml(message)}</p>`;
}

/**
 * Pure HTML renderer for the FleetSummary card (feature 48), mounted at the
 * bottom of /fleet.
 *
 * Mirrors the string-renderer pattern of fleetHtml.ts / searchHtml.ts: a
 * plain TS module that turns state into HTML, importable directly by a Node
 * test. The FleetSummaryClient component streams the summary into a live
 * region painted by renderSummaryHtml, so server markup and post-stream
 * markup agree by construction.
 *
 * Scope: the renderer only owns the read-only parts of the card (the
 * streamed markdown body, the cached/model indicators, the empty / streaming
 * / error states). The provider select + Summarize button stay as real
 * React inputs so the form keeps working without JS (progressive
 * enhancement: the button POSTs to /api/summarize; the streamed live render
 * is JS-only).
 *
 * Security: every dynamic value is HTML-escaped via `esc()`. The summary
 * body is already sanitized upstream (FleetSummaryClient calls
 * renderSanitized with marked+DOMPurify + the panel's FORBID policy), so
 * that slot is the only one that trusts pre-sanitized HTML. This renderer
 * never touches marked/DOMPurify itself, keeping it pure.
 */
import { escapeHtml } from "../../lib/md";

/** Phase of the summary machine (mirrors FleetSummaryClient state). */
export type SummaryPhase = "idle" | "streaming" | "done" | "error";

/**
 * Render the summary body + the (cached) / model indicators. The summary
 * markdown is already sanitized upstream, so the body slot is the only one
 * that trusts pre-sanitized HTML. The cached/model indicators are escaped.
 *
 * Pure: same inputs => same HTML.
 */
export function renderSummaryHtml(
  sanitizedHtml: string,
  phase: SummaryPhase,
  cached: boolean,
  model: string,
): string {
  const busy = phase === "streaming";
  if (!sanitizedHtml && !busy) {
    return "";
  }
  if (busy && !sanitizedHtml) {
    return `<p class="fleet-summary__streaming" role="status">summarizing...</p>`;
  }
  const cachedChip =
    phase === "done" && cached ? `<span class="fleet-summary__cached">(cached)</span>` : "";
  const modelChip =
    phase === "done" && model
      ? `<span class="fleet-summary__model">model: ${escapeHtml(model)}</span>`
      : "";
  return `<section class="fleet-summary" aria-label="Fleet summary">
    <div class="fleet-summary__head">${cachedChip}${modelChip}</div>
    <div class="md-body fleet-summary__body">${sanitizedHtml}</div>
  </section>`;
}

/**
 * Render the small outcome line for a summary error. Only rendered when
 * phase is "error".
 */
export function renderSummaryErrorHtml(phase: SummaryPhase, message: string): string {
  if (phase !== "error") {
    return "";
  }
  return `<p class="fleet-summary__error" role="alert">summary failed: ${escapeHtml(message)}</p>`;
}

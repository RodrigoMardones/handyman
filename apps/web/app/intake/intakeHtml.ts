/**
 * Pure HTML renderer for the /intake draft region (feature 48).
 *
 * Why a string renderer and not JSX: mirrors the same pattern as
 * fleetHtml.ts / timelineHtml.ts / searchHtml.ts - a plain TS module that
 * turns a state object into an HTML string is importable directly by a Node
 * test, without running the whole apps/web toolchain. The client
 * (IntakeClient.tsx) keeps the live state in React but renders the streamed
 * preview through this same renderer, so server markup and post-update
 * markup agree by construction.
 *
 * Scope of this renderer: only the read-only / preview regions of /intake
 * (the draft preview, the result footer, the empty / streaming / error /
 * submitted states). The form fields themselves stay as real React inputs -
 * they have to, so progressive enhancement (the form POSTs through the
 * submitIntake server action even with JS off) keeps working. The preview
 * is a derived display surface only.
 *
 * Security: every dynamic value is HTML-escaped via `esc()`. The markdown
 * body itself is ALREADY sanitized by the client (lib/md.ts renderSanitized,
 * marked+DOMPurify with the panel's FORBID policy) before it reaches this
 * renderer's `previewHtml` slot - intakeHtml never calls marked/DOMPurify
 * itself, keeping this module pure (zero deps, transpiled deterministically
 * by tests/test_web_intake_ask.sh).
 */
import { escapeHtml } from "../../lib/md";

/** Subset of the SSE `result` event from POST /api/draft that the intake
 *  preview surfaces. Loose on purpose: the relay adds more fields over time
 *  and we only read what we display. */
export interface IntakeResult {
  archetype?: string;
  possible_duplicates?: Array<{ name: string }>;
}

/** Phase of the draft machine (mirrors IntakeClient state). */
export type IntakePhase = "idle" | "streaming" | "done" | "error";

/** Submit machine phase (also mirrors IntakeClient). */
export type SubmitPhase = "idle" | "submitting" | "submitted" | "submit-error";

/**
 * Render the live draft preview region. The markdown body is already
 * sanitized upstream (IntakeClient calls renderSanitized), so this slot is
 * the ONLY place that trusts pre-sanitized HTML; every other dynamic value
 * is escaped.
 *
 * Pure: same inputs => same HTML.
 */
export function renderIntakePreviewHtml(
  draftMd: string,
  sanitizedHtml: string,
  phase: IntakePhase,
  result: IntakeResult | null,
): string {
  const busy = phase === "streaming";
  if (!draftMd && !busy) {
    return `<p class="intake-preview__empty" role="note">draft a feature request to see it streamed here.</p>`;
  }
  if (busy && !draftMd) {
    return `<p class="intake-preview__streaming" role="status">streaming...</p>`;
  }
  const archetype =
    result && result.archetype
      ? `<span class="intake-preview__archetype">archetype: ${escapeHtml(result.archetype)}</span>`
      : "";
  const dupes =
    result && Array.isArray(result.possible_duplicates) && result.possible_duplicates.length > 0
      ? `<span class="intake-preview__dupes">possible duplicates: ${escapeHtml(
          result.possible_duplicates.map((d) => d.name).join(", "),
        )}</span>`
      : "";
  return `<section class="intake-preview" aria-label="Draft preview">
    <div class="intake-preview__head">
      <strong>Draft</strong>
      ${archetype}
      ${dupes}
    </div>
    <div class="md-body intake-preview__body">${sanitizedHtml}</div>
  </section>`;
}

/**
 * Render the (small) outcome line after the intake is submitted through the
 * server action. Both branches are escaped; the path is only what
 * submitIntake returned.
 */
export function renderIntakeSubmitHtml(phase: SubmitPhase, message: string): string {
  if (phase === "submitted") {
    return `<p class="intake-submit__ok" role="status">${escapeHtml(message)}</p>`;
  }
  if (phase === "submit-error") {
    return `<p class="intake-submit__err" role="alert">${escapeHtml(message)}</p>`;
  }
  return "";
}

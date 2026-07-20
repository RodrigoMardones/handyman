/**
 * Pure HTML renderer for the /timeline view (feature
 * toolbox_next_timeline_search). Migrates the legacy panel's TimelineView
 * (handyman/assets/toolbox_panel.js) to the same string-renderer pattern
 * used by /fleet and /harness/[name] (fleetHtml.ts / harnessHtml.ts).
 *
 * Why a string renderer and not JSX? Same two load-bearing reasons as the
 * sibling renderers:
 *
 *  1. Testability without a Next build: a plain TS module that turns
 *     state.timeline into an HTML string is importable directly by the
 *     transpiled Node test (tests/test_web_timeline_search.sh).
 *  2. SSE live updates without React reconciliation: the /events feed
 *     signals a change; TimelineLive re-fetches /api/state and swaps the
 *     rendered region via the exact same renderer the server used.
 *
 * Determinism: no Date.now(), no locale formatting. Timeline dates are the
 * "YYYY-MM-DD" strings toolboxTimeline() derives from history.md closures
 * and heartbeat events; they render as-is (escaped). Unlike the legacy
 * panel's relative dates ("3d ago", which depend on the render instant),
 * absolute dates keep this renderer pure, which is what the acceptance
 * pins.
 *
 * Security: every dynamic value is HTML-escaped via esc(). No attribute is
 * built from raw text, no <script>, no external src (the only links are
 * same-origin /harness/<name> pages).
 */

/** One dated closure, as built by toolboxTimeline() (handyman/src/toolbox.ts):
 *  history closures win over pushed heartbeat events; feature_id is null for
 *  heartbeats. */
export interface TimelineEntry {
  date: string;
  project_name: string;
  project_root: string;
  feature: string;
  feature_id: number | null;
  source?: string;
}

/** Subset of /api/state that /timeline renders. */
export interface TimelineState {
  generated_at?: string;
  timeline?: TimelineEntry[];
}

/** HTML-escape every interpolated value. Mirrors the panel contract: harness
 *  text never becomes markup. */
function esc(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** One timeline row: date, harness link, feature name and its id (or the
 *  heartbeat marker when the closure came from a pushed event). */
function timelineItem(entry: TimelineEntry): string {
  const idText =
    entry.feature_id === null ? "heartbeat" : `feature ${entry.feature_id}`;
  const idClass =
    entry.feature_id === null ? "timeline__badge timeline__badge--heartbeat" : "timeline__badge";
  return `<li class="timeline__item">
    <time class="timeline__date" datetime="${esc(entry.date)}">${esc(entry.date)}</time>
    <span class="timeline__body">
      <a class="timeline__project" href="/harness/${encodeURIComponent(
        entry.project_name,
      )}" title="${esc(entry.project_root)}">${esc(entry.project_name)}</a>
      <span class="timeline__feature">${esc(entry.feature)}</span>
      <span class="${idClass}">${esc(idText)}</span>
    </span>
  </li>`;
}

/**
 * Render the /timeline body from a parsed /api/state document. Pure: same
 * input always yields the same HTML, no I/O, no clock. Degrades to a calm
 * empty state when no harness has recorded a dated closure yet.
 */
export function renderTimelineHtml(state: TimelineState): string {
  const entries = Array.isArray(state.timeline) ? state.timeline : [];
  const header = `<header class="timeline-header">
      <p class="timeline-header__eyebrow">handyman toolBox</p>
      <h1 class="timeline-header__title">Timeline</h1>
      <p class="timeline-header__meta">${esc(entries.length)} dated closure(s) across the fleet</p>
    </header>`;
  if (entries.length === 0) {
    return `${header}
    <p class="empty" role="note">no dated closures yet: close a feature (node dist/feature.js done) to record the first</p>`;
  }
  const items = entries.map((entry) => timelineItem(entry)).join("");
  return `${header}
    <ol class="timeline">${items}</ol>`;
}

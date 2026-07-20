/**
 * Pure HTML renderer for the /search results region (feature
 * toolbox_next_timeline_search). Migrates the legacy panel's SearchView hit
 * list (handyman/assets/toolbox_panel.js) to the string-renderer pattern of
 * fleetHtml.ts / harnessHtml.ts / timelineHtml.ts.
 *
 * The INDEX side of search is client-only by design (MiniSearch builds a
 * BM25 index from /api/corpus in the browser and answers per keystroke with
 * zero network); this module only turns the ranked hits into markup, which
 * keeps the deterministic, transpile-testable surface separate from the
 * stateful index.
 *
 * Security: every dynamic value is HTML-escaped via esc(). Non-feature hits
 * carry data-md-* attributes (root + ref + title) that the client's ONE
 * delegated click listener reads to open the source through the shared
 * /api/md dialog; no inline handlers, no <script>, no external src. The
 * refs come from the corpus (current | history | checkpoints |
 * backlog:*.md | docs:*.md) and are 1:1 with what /api/md resolves;
 * feature:* refs exist only in the corpus, so feature hits render without
 * an open button (same rule as the legacy panel).
 */

/** One ranked hit: the corpus doc fields MiniSearch stores plus its score.
 *  id is "<project_root>::<ref-ish>" (buildCorpus), which is where the
 *  /api/md root comes from. */
export interface SearchHit {
  id: string;
  project: string;
  kind: string;
  title: string;
  ref: string;
  score: number;
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

/** The registered project_root a hit belongs to (corpus id contract). */
export function hitRoot(id: string): string {
  return String(id).split("::")[0] ?? "";
}

/** One result card. Feature hits are context-only (no /api/md file behind
 *  them); every other kind gets an open button wired by data attributes. */
function searchHitHtml(hit: SearchHit): string {
  const openButton =
    hit.kind === "feature"
      ? ""
      : `<button type="button" class="search__open" data-md-root="${esc(
          hitRoot(hit.id),
        )}" data-md-file="${esc(hit.ref)}" data-md-title="${esc(hit.title)}">open</button>`;
  return `<li class="search__hit">
    <p class="search__hit-title">${esc(hit.title)}</p>
    <p class="search__hit-where">${esc(hit.project)} · ${esc(hit.kind)} · score ${esc(
      hit.score.toFixed(2),
    )}</p>
    ${openButton}
  </li>`;
}

/**
 * Render the results region. Pure: same inputs, same HTML.
 *
 *  - index not ready yet: building note (also the failure fallback, the
 *    client keeps retrying on the next /events tick).
 *  - ready + empty query: usage hint.
 *  - ready + query + no hits: no-matches note (prefix/fuzzy are on).
 *  - hits: capped upstream by the client (SEARCH_MAX_HITS).
 */
export function renderSearchResultsHtml(
  hits: SearchHit[],
  query: string,
  ready: boolean,
): string {
  if (!ready) {
    return `<p class="empty" role="note">building index...</p>`;
  }
  if (!query) {
    return `<p class="empty" role="note">type to search features, backlog, progress and docs (BM25, local, per keystroke)</p>`;
  }
  if (hits.length === 0) {
    return `<p class="empty" role="note">no matches: try a shorter term (prefix and fuzzy matching are on)</p>`;
  }
  return `<ul class="search__hits">${hits.map((hit) => searchHitHtml(hit)).join("")}</ul>`;
}

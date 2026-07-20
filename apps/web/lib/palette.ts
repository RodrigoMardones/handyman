/**
 * Command palette actions + ranking for the unified observer (feature
 * toolbox_next_timeline_search). Pure module: no imports, no DOM, so the
 * transpiled-suite tests can cover build + rank deterministically.
 *
 * Actions are DATA (an id, a label, keywords and a serializable command);
 * ToolboxShell executes the command (navigate or open a markdown doc in the
 * shared /api/md dialog). This mirrors the legacy panel's buildActions()
 * (handyman/assets/toolbox_panel.js) with two deliberate changes:
 *
 *  - Views are real pages now (location pathnames, not hash routes). The
 *    intake/ask entries arrive with feature 48.
 *  - Ranking is a hand-rolled deterministic scorer instead of a per-key
 *    MiniSearch index. The panel already shipped a substring fallback for
 *    when the vendor was missing; over tens of actions a prefix/word scorer
 *    gives the same "type a few letters, best action first" behavior with
 *    zero imports, which keeps this module testable by plain transpilation
 *    (MiniSearch stays where BM25 earns its keep: the /search corpus index).
 */

export interface PaletteHarness {
  name: string;
  root: string;
}

export type PaletteCommand =
  | { type: "navigate"; href: string }
  | { type: "open-md"; root: string; file: string; title: string };

export interface PaletteAction {
  id: string;
  label: string;
  keywords: string;
  command: PaletteCommand;
}

/** Max rows the palette shows (same cap as the legacy panel). */
export const PALETTE_MAX_RESULTS = 12;

/** Global destinations shared with AppNav. */
export const PALETTE_VIEWS: ReadonlyArray<{ id: string; label: string; href: string }> = [
  { id: "view_fleet", label: "go to Fleet", href: "/fleet" },
  { id: "view_timeline", label: "go to Activity", href: "/timeline" },
  { id: "view_search", label: "go to Find", href: "/search" },
  { id: "view_intake", label: "go to Draft", href: "/intake" },
  { id: "view_ask", label: "go to Ask", href: "/ask" },
];

/** Workspace artifacts /api/md serves 1:1 (resolveMd whitelist tokens). */
export const PALETTE_MD_LINKS: ReadonlyArray<readonly [string, string]> = [
  ["current", "current.md"],
  ["history", "history.md"],
  ["checkpoints", "CHECKPOINTS.md"],
  ["index", "workspace MOC"],
];

/** Domain docs exposed per harness (docs:<name>.md tokens for /api/md). */
export const PALETTE_DOC_FILES = ["business", "architecture", "conventions", "verification"] as const;

/** Derive the full action list from the live harness list. */
export function buildPaletteActions(harnesses: PaletteHarness[]): PaletteAction[] {
  const actions: PaletteAction[] = PALETTE_VIEWS.map((view) => ({
    id: view.id,
    label: view.label,
    keywords: `view navigate ${view.href.slice(1)}`,
    command: { type: "navigate", href: view.href },
  }));
  for (const harness of harnesses) {
    actions.push({
      id: `go_${harness.name}`,
      label: `go to harness ${harness.name}`,
      keywords: "harness project",
      command: { type: "navigate", href: `/harness/${encodeURIComponent(harness.name)}` },
    });
    for (const [file, label] of PALETTE_MD_LINKS) {
      actions.push({
        id: `md_${harness.name}_${file}`,
        label: `open ${label}: ${harness.name}`,
        keywords: "markdown quick view",
        command: { type: "open-md", root: harness.root, file, title: label },
      });
    }
    for (const doc of PALETTE_DOC_FILES) {
      actions.push({
        id: `doc_${harness.name}_${doc}`,
        label: `open docs/${doc}.md: ${harness.name}`,
        keywords: "docs markdown",
        command: {
          type: "open-md",
          root: harness.root,
          file: `docs:${doc}.md`,
          title: `docs/${doc}.md`,
        },
      });
    }
  }
  return actions;
}

/** Score one action against the lowercased query tokens. 0 means "does not
 *  match" (a token found nowhere excludes the action, like a search would).
 *  Deterministic: pure arithmetic over the label/keyword strings. */
function scoreAction(action: PaletteAction, tokens: string[]): number {
  const label = action.label.toLowerCase();
  const words = label.split(/[^a-z0-9]+/).filter(Boolean);
  const keywordWords = action.keywords.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  let score = 0;
  for (const token of tokens) {
    let tokenScore = 0;
    if (label.startsWith(token)) {
      tokenScore += 8;
    }
    if (words.some((word) => word.startsWith(token))) {
      tokenScore += 4;
    }
    if (label.includes(token)) {
      tokenScore += 2;
    }
    if (keywordWords.some((word) => word.startsWith(token))) {
      tokenScore += 1;
    }
    if (tokenScore === 0) {
      return 0; // every query token must land somewhere
    }
    score += tokenScore;
  }
  return score;
}

/** Rank actions for a query. Empty query lists the first rows as-is (view
 *  navigation first, by construction). Ties keep build order (stable). */
export function rankPaletteActions(actions: PaletteAction[], query: string): PaletteAction[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return actions.slice(0, PALETTE_MAX_RESULTS);
  }
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const scored: Array<{ action: PaletteAction; score: number; index: number }> = [];
  actions.forEach((action, index) => {
    const score = scoreAction(action, tokens);
    if (score > 0) {
      scored.push({ action, score, index });
    }
  });
  scored.sort((a, b) => (a.score !== b.score ? b.score - a.score : a.index - b.index));
  return scored.slice(0, PALETTE_MAX_RESULTS).map((entry) => entry.action);
}

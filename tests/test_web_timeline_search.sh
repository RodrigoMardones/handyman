#!/usr/bin/env bash
# apps/web /timeline + /search + cross-view chrome tests (feature
# toolbox_next_timeline_search). Structural + render-contract, not a build:
# same pattern as test_web_fleet.sh / test_web_harness.sh. The render checks
# transpile the pure modules (timelineHtml.ts, searchHtml.ts, lib/palette.ts,
# lib/shortcuts.ts, lib/theme.ts, lib/announce.ts) with the project's own
# typescript, run them in-process against fixtures, and assert the outputs
# are deterministic and escaped. No network, no Next boot.
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
REPO_ROOT="$(cd "$SUITE_DIR/.." && pwd)"
WEB_DIR="$REPO_ROOT/apps/web"
TIMELINE_PAGE="$WEB_DIR/app/timeline/page.tsx"
TIMELINE_HTML="$WEB_DIR/app/timeline/timelineHtml.ts"
TIMELINE_LIVE="$WEB_DIR/components/TimelineLive.tsx"
LIVE_HOOK="$WEB_DIR/lib/useLiveHtml.ts"
SEARCH_PAGE="$WEB_DIR/app/search/page.tsx"
SEARCH_HTML="$WEB_DIR/app/search/searchHtml.ts"
SEARCH_CLIENT="$WEB_DIR/components/SearchClient.tsx"
SHELL_COMPONENT="$WEB_DIR/components/ToolboxShell.tsx"
MD_DIALOG="$WEB_DIR/components/MdDialog.tsx"
LAYOUT="$WEB_DIR/app/layout.tsx"
GLOBALS_CSS="$WEB_DIR/app/globals.css"
WEB_PKG="$WEB_DIR/package.json"
ARCH_DOC="$REPO_ROOT/.handyman/memory/architecture.md"
[ -f "$ARCH_DOC" ] || ARCH_DOC="$REPO_ROOT/.handyman/docs/architecture.md"

# Transpile a single pure module (no imports) to CommonJS and run a JS
# snippet against its exports. Usage: run_transpiled SRC_FILE 'js code using
# the `mod` binding'. Prints whatever the snippet prints; exit code is the
# snippet's.
run_transpiled() {
  node -e '
const fs = require("fs");
const path = require("path");
const os = require("os");
const ts = require(path.join(process.argv[1], "apps/web/node_modules/typescript"));
const code = fs.readFileSync(process.argv[2], "utf8");
const out = ts.transpileModule(code, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const tmp = path.join(os.tmpdir(), "tws." + path.basename(process.argv[2]) + "." + process.pid + ".cjs");
fs.writeFileSync(tmp, out);
try {
  const mod = require(tmp);
  const snippet = new Function("mod", process.argv[3]);
  snippet(mod);
  process.exit(0);
} finally {
  try { fs.unlinkSync(tmp); } catch {}
}
' "$REPO_ROOT" "$1" "$2" 2>&1
}

echo "apps/web /timeline + /search suite (test_web_timeline_search.sh)"

# --- TWS1: the view files exist ----------------------------------------------
start_case "timeline view files exist (page, pure renderer, live client, css)"
if [ -f "$TIMELINE_PAGE" ] && [ -f "$TIMELINE_HTML" ] && [ -f "$TIMELINE_LIVE" ] \
  && [ -f "$WEB_DIR/app/timeline/page.module.css" ]; then
  pass
else
  fail "a /timeline file is missing"
fi

start_case "search view files exist (page, pure renderer, client, css)"
if [ -f "$SEARCH_PAGE" ] && [ -f "$SEARCH_HTML" ] && [ -f "$SEARCH_CLIENT" ] \
  && [ -f "$WEB_DIR/app/search/page.module.css" ]; then
  pass
else
  fail "a /search file is missing"
fi

start_case "cross-view chrome files exist (ToolboxShell, MdDialog, lib modules)"
if [ -f "$SHELL_COMPONENT" ] && [ -f "$MD_DIALOG" ] \
  && [ -f "$WEB_DIR/lib/palette.ts" ] && [ -f "$WEB_DIR/lib/shortcuts.ts" ] \
  && [ -f "$WEB_DIR/lib/theme.ts" ] && [ -f "$WEB_DIR/lib/announce.ts" ]; then
  pass
else
  fail "a chrome/lib file is missing"
fi

# --- TWS2: renderTimelineHtml renders the fixture chronology -----------------
start_case "renderTimelineHtml renders dated closures (dates, links, badges, escaping)"
OUT="$(run_transpiled "$TIMELINE_HTML" '
const state = {
  timeline: [
    { date: "2026-07-15", project_name: "alpha", project_root: "/home/u/alpha",
      feature: "feat_x", feature_id: 12, source: "history" },
    { date: "2026-07-14", project_name: "beta <b>", project_root: "/home/u/beta",
      feature: "<script>alert(1)</script>", feature_id: null, source: "event" },
  ],
};
const html = mod.renderTimelineHtml(state);
const empty = mod.renderTimelineHtml({ timeline: [] });
const again = mod.renderTimelineHtml(state);
const checks = [
  ["header title", html.includes("timeline-header__title") && html.includes(">Timeline<")],
  ["entry count in meta", html.includes("2 dated closure(s)")],
  ["date rendered", html.includes("2026-07-15")],
  ["datetime attr", html.includes("datetime=\"2026-07-15\"")],
  ["harness link", html.includes("href=\"/harness/alpha\"")],
  ["feature id badge", html.includes("feature 12")],
  ["heartbeat badge", html.includes("heartbeat") && html.includes("timeline__badge--heartbeat")],
  ["harness text escaped", !html.includes("<script>") && html.includes("&lt;script&gt;")],
  ["project name escaped", html.includes("beta &lt;b&gt;")],
  ["no external src", !html.includes("src=\"http")],
  ["empty state", empty.includes("no dated closures yet")],
  ["deterministic", html === again],
];
const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) { console.log("FAILED: " + failed.join(", ")); process.exit(1); }
')"
CODE=$?
if [ "$CODE" -eq 0 ]; then pass; else fail "timeline render assertions failed: $OUT"; fi

# --- TWS3: renderSearchResultsHtml (states, open buttons, escaping) ----------
start_case "renderSearchResultsHtml renders hits, states and md-open wiring"
OUT="$(run_transpiled "$SEARCH_HTML" '
const hits = [
  { id: "/home/u/alpha::feature:feat_x", project: "alpha", kind: "feature",
    title: "#12 feat_x", ref: "feature:feat_x", score: 3.14159 },
  { id: "/home/u/alpha::docs:architecture.md", project: "alpha", kind: "docs",
    title: "architecture.md <i>", ref: "docs:architecture.md", score: 2 },
];
const html = mod.renderSearchResultsHtml(hits, "arch", true);
const again = mod.renderSearchResultsHtml(hits, "arch", true);
const building = mod.renderSearchResultsHtml([], "arch", false);
const hint = mod.renderSearchResultsHtml([], "", true);
const nomatch = mod.renderSearchResultsHtml([], "zzz", true);
const checks = [
  ["hit titles rendered", html.includes("#12 feat_x")],
  ["score formatted", html.includes("score 3.14") && !html.includes("3.14159")],
  ["feature hit has NO open button", html.split("search__open").length === 2],
  ["docs hit opens via /api/md data attrs",
    html.includes("data-md-root=\"/home/u/alpha\"") &&
    html.includes("data-md-file=\"docs:architecture.md\"")],
  ["title escaped in attr and body", html.includes("architecture.md &lt;i&gt;")],
  ["hitRoot extracts the corpus root", mod.hitRoot("/r::docs:a.md") === "/r"],
  ["building state", building.includes("building index...")],
  ["empty-query hint", hint.includes("type to search")],
  ["no-matches note", nomatch.includes("no matches")],
  ["no external src", !html.includes("src=\"http")],
  ["no script injected", !html.includes("<script")],
  ["deterministic", html === again],
];
const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) { console.log("FAILED: " + failed.join(", ")); process.exit(1); }
')"
CODE=$?
if [ "$CODE" -eq 0 ]; then pass; else fail "search render assertions failed: $OUT"; fi

# --- TWS4: palette actions build + deterministic ranking ---------------------
start_case "palette builds view/harness/doc actions and ranks deterministically"
OUT="$(run_transpiled "$WEB_DIR/lib/palette.ts" '
const actions = mod.buildPaletteActions([{ name: "alpha", root: "/home/u/alpha" }]);
const ids = actions.map((a) => a.id);
const ranked = mod.rankPaletteActions(actions, "timeline");
const rankedAgain = mod.rankPaletteActions(actions, "timeline");
const docHit = mod.rankPaletteActions(actions, "architecture");
const none = mod.rankPaletteActions(actions, "zzzznope");
const empty = mod.rankPaletteActions(actions, "");
const goDoc = actions.find((a) => a.id === "doc_alpha_architecture");
const checks = [
  ["view actions present", ids.includes("view_fleet") && ids.includes("view_timeline") && ids.includes("view_search")],
  ["go-to-harness action", ids.includes("go_alpha")],
  ["md link actions", ids.includes("md_alpha_current") && ids.includes("md_alpha_checkpoints")],
  ["doc actions", ids.includes("doc_alpha_architecture")],
  ["doc action opens via /api/md token",
    goDoc && goDoc.command.type === "open-md" && goDoc.command.file === "docs:architecture.md" &&
    goDoc.command.root === "/home/u/alpha"],
  ["navigate commands are hrefs",
    actions.find((a) => a.id === "view_timeline").command.href === "/timeline" &&
    actions.find((a) => a.id === "go_alpha").command.href === "/harness/alpha"],
  ["query ranks the right action first", ranked.length > 0 && ranked[0].id === "view_timeline"],
  ["doc query finds the doc action", docHit.some((a) => a.id === "doc_alpha_architecture")],
  ["unmatched query yields nothing", none.length === 0],
  ["empty query is capped", empty.length <= mod.PALETTE_MAX_RESULTS],
  ["ranking deterministic", JSON.stringify(ranked) === JSON.stringify(rankedAgain)],
];
const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) { console.log("FAILED: " + failed.join(", ")); process.exit(1); }
')"
CODE=$?
if [ "$CODE" -eq 0 ]; then pass; else fail "palette assertions failed: $OUT"; fi

# --- TWS5: keyboard interpreter (guard, chord, palette keys) -----------------
start_case "shortcut interpreter honors the text-field guard, chord and palette keys"
OUT="$(run_transpiled "$WEB_DIR/lib/shortcuts.ts" '
const base = { paletteOpen: false, inField: false, inPaletteInput: false, gArmedAt: null, now: 1000 };
const d = (key, mods, ctx) => mod.interpretKeydown(key, mods, { ...base, ...ctx });
const checks = [
  ["cmd+k toggles anywhere (even in a field)",
    d("k", { meta: true }, { inField: true }).action.kind === "toggle-palette"],
  ["ctrl+k toggles too", d("k", { ctrl: true }, {}).action.kind === "toggle-palette"],
  ["/ focuses search", d("/", {}, {}).action.kind === "focus-search"],
  ["/ is inert inside a text field", d("/", {}, { inField: true }).action.kind === "none"],
  ["? opens help", d("?", {}, {}).action.kind === "open-help"],
  ["? is inert inside a text field", d("?", {}, { inField: true }).action.kind === "none"],
  ["g arms the chord", d("g", {}, {}).gArmedAt === 1000],
  ["g then f navigates to /fleet within the window", (() => {
    const r = d("f", {}, { gArmedAt: 900, now: 1000 });
    return r.action.kind === "navigate" && r.action.href === "/fleet";
  })()],
  ["g then t navigates to /timeline", d("t", {}, { gArmedAt: 900, now: 1000 }).action.href === "/timeline"],
  ["expired chord does nothing", d("f", {}, { gArmedAt: 0, now: 5000 }).action.kind === "none"],
  ["palette open: ArrowDown moves",
    d("ArrowDown", {}, { paletteOpen: true }).action.kind === "palette-move"],
  ["palette open: j moves outside the input",
    d("j", {}, { paletteOpen: true }).action.kind === "palette-move"],
  ["palette open: j stays typeable in the input",
    d("j", {}, { paletteOpen: true, inPaletteInput: true }).action.kind === "none"],
  ["palette open: Enter runs", d("Enter", {}, { paletteOpen: true }).action.kind === "palette-run"],
  ["contenteditable counts as a text field", mod.isTextEntryTarget("div", true) === true],
  ["plain body is not a text field", mod.isTextEntryTarget("body", false) === false],
  ["input is a text field", mod.isTextEntryTarget("INPUT", false) === true],
];
const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) { console.log("FAILED: " + failed.join(", ")); process.exit(1); }
')"
CODE=$?
if [ "$CODE" -eq 0 ]; then pass; else fail "shortcut assertions failed: $OUT"; fi

# --- TWS6: theme contract (key, system-deletes, anti-flash snippet) ----------
start_case "theme keeps the hw-theme:1 contract and ships the anti-flash snippet"
OUT="$(run_transpiled "$WEB_DIR/lib/theme.ts" '
const checks = [
  ["versioned key", mod.THEME_KEY === "hw-theme:1"],
  ["modes", JSON.stringify([...mod.THEME_MODES]) === JSON.stringify(["light", "dark", "system"])],
  ["junk normalizes to system", mod.normalizeStoredTheme("purple") === "system" && mod.normalizeStoredTheme(null) === "system"],
  ["explicit modes persist", JSON.stringify(mod.themeDecision("dark")) === JSON.stringify({ store: "dark", dataTheme: "dark" })],
  ["system DELETES the key and the attribute",
    JSON.stringify(mod.themeDecision("system")) === JSON.stringify({ store: null, dataTheme: null })],
  ["anti-flash snippet reads the key and stamps data-theme",
    mod.THEME_ANTIFLASH_SNIPPET.includes("hw-theme:1") &&
    mod.THEME_ANTIFLASH_SNIPPET.includes("dataset.theme")],
];
const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) { console.log("FAILED: " + failed.join(", ")); process.exit(1); }
')"
CODE=$?
if [ "$CODE" -eq 0 ]; then pass; else fail "theme assertions failed: $OUT"; fi

start_case "layout injects the anti-flash snippet and globals.css has data-theme blocks"
if grep -q 'THEME_ANTIFLASH_SNIPPET' "$LAYOUT" \
  && grep -q ':root\[data-theme="dark"\]' "$GLOBALS_CSS" \
  && grep -q ':root\[data-theme="light"\]' "$GLOBALS_CSS"; then
  pass
else
  fail "anti-flash script or explicit theme token blocks missing"
fi

# --- TWS7: announce merge (debounced polite summaries) -----------------------
start_case "announce merges queued polite messages into one summary"
OUT="$(run_transpiled "$WEB_DIR/lib/announce.ts" '
const checks = [
  ["single message passes through", mod.mergeAnnouncements(["a"]) === "a"],
  ["burst collapses to last + count", mod.mergeAnnouncements(["a", "b", "c"]) === "c (3 updates)"],
  ["empty queue says nothing", mod.mergeAnnouncements([]) === ""],
];
const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) { console.log("FAILED: " + failed.join(", ")); process.exit(1); }
')"
CODE=$?
if [ "$CODE" -eq 0 ]; then pass; else fail "announce assertions failed: $OUT"; fi

# --- TWS8: shell structure (live regions, single listener, shared dialog) ----
start_case "ToolboxShell renders both static live regions and ONE document keydown listener"
LISTENER_COUNT="$(grep -rc 'document.addEventListener("keydown"' "$WEB_DIR/components" "$WEB_DIR/app" "$WEB_DIR/lib" 2>/dev/null | awk -F: '{ sum += $2 } END { print sum }')"
if grep -q 'id="live-polite"' "$SHELL_COMPONENT" && grep -q 'id="live-assertive"' "$SHELL_COMPONENT" \
  && grep -q 'aria-live="polite"' "$SHELL_COMPONENT" && grep -q 'aria-live="assertive"' "$SHELL_COMPONENT" \
  && [ "$LISTENER_COUNT" = "1" ]; then
  pass
else
  fail "live regions missing or keydown listeners != 1 (got ${LISTENER_COUNT:-0})"
fi

start_case "search + palette open sources through the shared /api/md dialog"
if grep -q 'MdDialog' "$SEARCH_CLIENT" && grep -q 'MdDialog' "$SHELL_COMPONENT" \
  && grep -q '/api/md' "$MD_DIALOG" \
  && grep -q 'mdUrl="/api/md"' "$SEARCH_PAGE"; then
  pass
else
  fail "shared MdDialog wiring missing"
fi

# --- TWS9: search is MiniSearch client-side over /api/corpus -----------------
start_case "SearchClient builds MiniSearch from /api/corpus and searches locally per key"
if grep -q 'from "minisearch"' "$SEARCH_CLIENT" \
  && grep -q '/api/corpus' "$SEARCH_PAGE" \
  && grep -q 'prefix: true' "$SEARCH_CLIENT" && grep -q 'fuzzy: 0.1' "$SEARCH_CLIENT" \
  && grep -q 'mini.search(query)' "$SEARCH_CLIENT"; then
  pass
else
  fail "MiniSearch client-side index wiring missing"
fi

start_case "minisearch is a declared apps/web dependency, justified in docs/architecture.md"
if grep -q '"minisearch"' "$WEB_PKG" && grep -q 'minisearch' "$ARCH_DOC" \
  && grep -q 'feature 47' "$ARCH_DOC"; then
  pass
else
  fail "minisearch dep or its C3 justification missing"
fi

# --- TWS10: live wiring + strangler ------------------------------------------
start_case "TimelineLive subscribes same-origin (/events + /api/state)"
if grep -q 'useLiveHtml' "$TIMELINE_LIVE" \
  && grep -q 'new EventSource(eventsUrl)' "$LIVE_HOOK" \
  && grep -q 'eventsUrl="/events"' "$TIMELINE_PAGE" \
  && grep -q 'stateUrl="/api/state"' "$TIMELINE_PAGE"; then
  pass
else
  fail "TimelineLive is not wired to the same-origin /events + /api/state"
fi

# --- TWS10b: the region is DERIVED state, never a hand-written innerHTML swap -
# Regression guard for the bug class fixed in the useLiveHtml extraction (it
# already broke /search once; see components/SearchClient.tsx).
start_case "TimelineLive renders derived HTML (no manual innerHTML swap)"
if ! grep -q 'innerHTML *=' "$TIMELINE_LIVE" \
  && grep -q 'dangerouslySetInnerHTML' "$TIMELINE_LIVE"; then
  pass
else
  fail "TimelineLive writes innerHTML by hand: derived-state contract broken"
fi

# --- TWS10c: the hook announces reconnect/disconnect on the assertive channel -
# The reconnect path had no coverage before the extraction, which is exactly
# the scenario where the old manual swap was latent.
start_case "useLiveHtml drives the a11y channels and re-arms on error"
if grep -q 'onReconnect' "$LIVE_HOOK" && grep -q 'onDisconnect' "$LIVE_HOOK" \
  && grep -q 'onRefresh' "$LIVE_HOOK" \
  && grep -q 'setTimeout(connect, 3000)' "$LIVE_HOOK" \
  && grep -q 'onReconnect' "$TIMELINE_LIVE" && grep -q 'announce.assertive' "$TIMELINE_LIVE"; then
  pass
else
  fail "useLiveHtml lost the reconnect/announce contract"
fi

# Feature 50 removed proxy.ts's route manifest along with the Node upstream it
# used to guard, so the honest assertion is the route files themselves.
start_case "/timeline and /search are native Next routes"
if [ -f "$WEB_DIR/app/timeline/page.tsx" ] && [ -f "$WEB_DIR/app/search/page.tsx" ]; then
  pass
else
  fail "app/timeline/page.tsx or app/search/page.tsx is missing: not served natively"
fi

summary

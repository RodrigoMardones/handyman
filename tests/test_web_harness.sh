#!/usr/bin/env bash
# apps/web /harness/[name] view tests (feature toolbox_next_harness_view).
# Structural + render-contract, not a build: pnpm --filter @handyman/web build
# is kept out of the default suite (same call as test_web_fleet.sh). The
# render check transpiles the pure renderer (app/harness/harnessHtml.ts) with
# the project's own typescript, runs renderHarnessHtml against a state fixture
# in-process, and asserts the markup carries the real harness data: meta-list,
# KPIs, signals, docs buttons, the Queue/Kanban by status (the "features
# corriendo"), and the graphify iframe when has_graph. No network, no Next boot.
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
REPO_ROOT="$(cd "$SUITE_DIR/.." && pwd)"
WEB_DIR="$REPO_ROOT/apps/web"
HARNESS_PAGE="$WEB_DIR/app/harness/[name]/page.tsx"
HARNESS_HTML="$WEB_DIR/app/harness/harnessHtml.ts"
HARNESS_LIVE="$WEB_DIR/components/HarnessLive.tsx"
RUN_PANEL="$WEB_DIR/components/RunPanel.tsx"
LIVE_HOOK="$WEB_DIR/lib/useLiveHtml.ts"
HARNESS_CSS="$WEB_DIR/app/harness/[name]/page.module.css"

echo "apps/web /harness suite (test_web_harness.sh)"

# --- TWH1: the /harness/[name] view files exist -----------------------------
start_case "apps/web/app/harness/[name]/page.tsx exists"
if [ -f "$HARNESS_PAGE" ]; then pass; else fail "missing $HARNESS_PAGE"; fi

start_case "apps/web/app/harness/harnessHtml.ts (pure renderer) exists"
if [ -f "$HARNESS_HTML" ]; then pass; else fail "missing $HARNESS_HTML"; fi

start_case "apps/web/components/HarnessLive.tsx (SSE client) exists"
if [ -f "$HARNESS_LIVE" ]; then pass; else fail "missing $HARNESS_LIVE"; fi

start_case "apps/web/app/harness/[name]/page.module.css exists"
if [ -f "$HARNESS_CSS" ]; then pass; else fail "missing $HARNESS_CSS"; fi

start_case "React page owns the harness header and Add feature action before HarnessLive"
PAGE_STRUCTURE_OUT="$(node -e '
const fs = require("fs");
const source = fs.readFileSync(process.argv[1], "utf8");
const runPanelSource = fs.readFileSync(process.argv[2], "utf8");
const emptyStart = runPanelSource.indexOf("if (!hasPending)");
const emptyEnd = runPanelSource.indexOf("const running", emptyStart);
const emptyBranch = runPanelSource.slice(emptyStart, emptyEnd);
const checks = [
  ["breadcrumb", source.includes("aria-label=\"Breadcrumb\"") && source.includes(">Fleet</a>")],
  ["h1", source.includes("<h1") && source.includes("{name}</h1>")],
  ["Add feature CTA", source.includes("/new`}") && source.includes(">Add feature</a>")],
  ["exactly one Add feature CTA", (source.match(/>Add feature<\/a>/g) ?? []).length === 1 && !runPanelSource.includes("addFeatureHref")],
  ["empty RunPanel has no link or select", emptyBranch.includes("No work ready") && emptyBranch.includes("make work available to the runner") && !emptyBranch.includes("<a") && !emptyBranch.includes("<select")],
  ["AddFeatureForm absent", !source.includes("AddFeatureForm")],
];
const header = source.indexOf("<header");
const runner = source.indexOf("<RunPanel");
const live = source.indexOf("<HarnessLive");
checks.push(["header and runner precede HarnessLive", header !== -1 && runner > header && live > runner]);
const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) { console.log("FAILED: " + failed.join(", ")); process.exit(1); }
' "$HARNESS_PAGE" "$RUN_PANEL" 2>&1)"
PAGE_STRUCTURE_CODE=$?
if [ "$PAGE_STRUCTURE_CODE" -eq 0 ]; then pass; else fail "page structure assertions failed: $PAGE_STRUCTURE_OUT"; fi

# --- TWH2: zero em-dashes / en-dashes in apps/web still holds ---------------
start_case "apps/web has zero em-dashes (U+2014) and zero en-dashes (U+2013)"
DASH_OUT="$(node -e '
const fs = require("fs");
const path = require("path");
const root = process.argv[1];
const skipDirs = new Set(["node_modules", ".next"]);
const textExt = new Set([".ts", ".tsx", ".js", ".jsx", ".css", ".md", ".mjs", ".cjs"]);
const hits = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      walk(path.join(dir, entry.name));
      continue;
    }
    if (!textExt.has(path.extname(entry.name))) continue;
    const full = path.join(dir, entry.name);
    const text = fs.readFileSync(full, "utf8");
    text.split("\n").forEach((line, i) => {
      if (line.indexOf("\u2014") !== -1 || line.indexOf("\u2013") !== -1) {
        hits.push(full + ":" + (i + 1));
      }
    });
  }
}
walk(root);
if (hits.length) { console.log(hits.join("\n")); process.exit(1); }
process.exit(0);
' "$WEB_DIR" 2>&1)"
DASH_CODE=$?
if [ "$DASH_CODE" -eq 0 ]; then pass; else fail "em-dash or en-dash found: $DASH_OUT"; fi

# --- TWH3: renderHarnessHtml renders the fixture harness data ---------------
# Transpiles harnessHtml.ts (no imports, pure) to a temp CommonJS module with
# the project's own typescript, requires it, and runs renderHarnessHtml against
# a state fixture with a known harness. Asserts: harness name + meta-list, KPI
# values (approval rate, coverage, closures), the signals pill, the docs +
# workspace buttons, every Kanban column header, the in_progress feature
# ("features corriendo"), the graphify iframe when has_graph, and the
# no-external-asset + no-script invariants.
start_case "renderHarnessHtml renders fixture harness (meta, kpis, signals, docs, queue, graph)"
RENDER_OUT="$(node -e '
const fs = require("fs");
const path = require("path");
const os = require("os");
const ts = require(path.join(process.argv[1], "apps/web/node_modules/typescript"));
const src = path.join(process.argv[1], "apps/web/app/harness/harnessHtml.ts");
const code = fs.readFileSync(src, "utf8");
const out = ts.transpileModule(code, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const tmp = path.join(os.tmpdir(), "harnessHtml.test." + process.pid + ".cjs");
fs.writeFileSync(tmp, out);
try {
  const { renderHarnessHtml } = require(tmp);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  const key = today.getUTCFullYear() + "-" + pad(today.getUTCMonth() + 1) + "-" + pad(today.getUTCDate());
  const state = {
    generated_at: "2026-07-18T08:30:00.000Z",
    harnesses: [
      {
        project_root: "/home/u/proj/alpha",
        project_name: "alpha",
        error: null,
        workspace: ".handyman",
        status_counts: { pending: 2, in_progress: 1, done: 8, blocked: 1 },
        signals: [{ signal: "STALE_WIP", detail: "in_progress idle > 7 days" }],
        has_graph: true,
        last_closure: "2026-07-15T12:00:00.000Z",
        version: { installed: "2.1.1", current: "2.1.1", behind: false },
        session: { feature: "feat-x", status: "in_progress", role: "implementer", updated: "2026-07-18" },
        metrics: {
          throughput: { [key]: 2 },
          review_verdicts: { approved: 4, changes_requested: 1, approval_rate: 0.8 },
          coverage: { done: 8, with_reports: 2, missing: ["feat-z"] },
        },
        features: [
          { id: 10, name: "feat_a", title: "Feature A", status: "pending", sprint: "2026-SP6", depends_on: [] },
          { id: 14, name: "feat_a2", title: "Feature A2", status: "pending", sprint: "2026-SP6", depends_on: [] },
          { id: 11, name: "feat_b", title: "Feature B running", status: "in_progress", sprint: "2026-SP6", depends_on: [] },
          { id: 101, name: "done_101", title: "Done 101", status: "done", sprint: "2026-SP6", depends_on: [] },
          { id: 108, name: "done_108", title: "Done 108", status: "done", sprint: "2026-SP6", depends_on: [] },
          { id: null, name: "done_null", title: "Done null", status: "done", sprint: null, depends_on: [] },
          { id: 104, name: "done_104", title: "Done 104", status: "done", sprint: "2026-SP6", depends_on: [] },
          { id: 107, name: "done_107", title: "Done 107", status: "done", sprint: "2026-SP6", depends_on: [] },
          { id: 102, name: "done_102", title: "Done 102", status: "done", sprint: "2026-SP6", depends_on: [] },
          { id: 106, name: "done_106", title: "Done 106", status: "done", sprint: "2026-SP6", depends_on: [] },
          { id: 105, name: "done_105", title: "Done 105", status: "done", sprint: "2026-SP6", depends_on: [] },
          { id: 13, name: "feat_d", title: "Feature D blocked", status: "blocked", sprint: null, blocked_reason: "waiting on upstream", depends_on: [] },
        ],
      },
    ],
  };
  const html = renderHarnessHtml(state, "alpha");
  const graphMissing = renderHarnessHtml(
    { harnesses: [{ project_root: "/p", project_name: "beta", error: null, status_counts: {}, features: [], has_graph: false }] },
    "beta",
  );
  const compact = renderHarnessHtml(
    {
      harnesses: [{
        project_root: "/p",
        project_name: "compact",
        error: null,
        status_counts: { pending: 0, in_progress: 0, done: 5, blocked: 0 },
        features: [1, 2, 3, 4, 5].map((id) => ({
          id,
          name: "done_" + id,
          title: "Done " + id,
          status: "done",
          sprint: null,
          depends_on: [],
        })),
        has_graph: false,
      }],
    },
    "compact",
  );
  const css = fs.readFileSync(path.join(process.argv[1], "apps/web/app/harness/[name]/page.module.css"), "utf8");
  const queueIndex = html.indexOf(">Queue<");
  const workspaceIndex = html.indexOf(">Workspace<");
  const docsIndex = html.indexOf(">Docs<");
  const graphIndex = html.indexOf(">Knowledge graph<");
  const doneColumn = html.match(/<section class="kanban__column kanban__column--done"[\s\S]*?<\/section>/)?.[0] ?? "";
  const doneIds = [108, 107, 106, 105, 104].map((id) => doneColumn.indexOf("#" + id));
  const checks = [
    ["renderer does not duplicate React h1", html.indexOf("harness-header__title") === -1],
    ["meta-list present", html.indexOf("meta-list") !== -1],
    ["meta root value", html.indexOf("/home/u/proj/alpha") !== -1],
    ["meta version 2.1.1", html.indexOf("2.1.1") !== -1],
    ["meta session feat-x", html.indexOf("feat-x") !== -1],
    ["last closure 2026-07-15", html.indexOf("2026-07-15") !== -1],
    ["kpi approval rate 80%", html.indexOf("80%") !== -1],
    ["kpi coverage 2/8", html.indexOf("2/8") !== -1],
    ["kpi closures 14d value 2", html.indexOf("closures (14d)") !== -1],
    ["throughput sparkline svg", html.indexOf("<svg") !== -1],
    ["signal STALE_WIP pill", html.indexOf("STALE_WIP") !== -1 && html.indexOf("pill--warn") !== -1],
    ["workspace current button", html.indexOf("data-api-md=\"current\"") !== -1],
    ["docs business button", html.indexOf("data-api-md=\"docs:business.md\"") !== -1],
    ["docs architecture button", html.indexOf("docs:architecture.md") !== -1],
    ["kanban pending column", html.indexOf("kanban__column--pending") !== -1],
    ["kanban in_progress column", html.indexOf("kanban__column--in_progress") !== -1],
    ["kanban done column", html.indexOf("kanban__column--done") !== -1],
    ["kanban blocked column", html.indexOf("kanban__column--blocked") !== -1],
    ["Queue precedes Workspace, Docs and Knowledge graph", queueIndex !== -1 && queueIndex < workspaceIndex && workspaceIndex < docsIndex && docsIndex < graphIndex],
    ["pending features remain complete", html.indexOf("Feature A") !== -1 && html.indexOf("Feature A2") !== -1],
    ["running feature title present", html.indexOf("Feature B running") !== -1],
    ["blocked reason present", html.indexOf("waiting on upstream") !== -1],
    ["Done header preserves total 8", doneColumn.indexOf("kanban__column-count\">8</bdi>") !== -1],
    ["Done renders exactly five cards", (doneColumn.match(/class="card card--done"/g) ?? []).length === 5],
    ["Done uses descending recent ids", doneIds.every((index) => index !== -1) && doneIds.every((index, i) => i === 0 || doneIds[i - 1] < index)],
    ["Done omits older and null ids", !doneColumn.includes("#102") && !doneColumn.includes("#101") && !doneColumn.includes("Done null")],
    ["Done links total to Activity", doneColumn.includes("href=\"/timeline\"") && doneColumn.includes("View all 8 in Activity")],
    ["empty active columns carry compact modifier", ["pending", "in_progress", "blocked"].every((status) => compact.includes(`class="kanban__column kanban__column--${status} kanban__column--empty"`))],
    ["Done column remains normal", compact.includes("class=\"kanban__column kanban__column--done\"") && !compact.includes("kanban__column--done kanban__column--empty")],
    ["empty column CSS opts out of grid stretch", /kanban__column--empty[^}]*align-self:\s*start/s.test(css)],
    ["graphify iframe present when has_graph", html.indexOf("graph__frame") !== -1 && html.indexOf("/graph/alpha/graph.html") !== -1],
    ["graphify empty when no graph", graphMissing.indexOf("graph--empty") !== -1 && graphMissing.indexOf("/graph/") === -1],
    ["no external http src asset", html.indexOf("src=\"http") === -1],
    ["no inline script injected", html.indexOf("<script") === -1],
  ];
  const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
  if (failed.length) { console.log("FAILED: " + failed.join(", ")); process.exit(1); }
  process.exit(0);
} finally {
  try { fs.unlinkSync(tmp); } catch {}
}
' "$REPO_ROOT" 2>&1)"
RENDER_CODE=$?
if [ "$RENDER_CODE" -eq 0 ]; then
  pass
else
  fail "render assertions failed: $RENDER_OUT"
fi

# --- TWH4: renderHarnessHtml degrades on unknown / errored harness ----------
start_case "renderHarnessHtml degrades on unknown and errored harness"
DEGRADE_OUT="$(node -e '
const fs = require("fs");
const path = require("path");
const os = require("os");
const ts = require(path.join(process.argv[1], "apps/web/node_modules/typescript"));
const code = fs.readFileSync(path.join(process.argv[1], "apps/web/app/harness/harnessHtml.ts"), "utf8");
const out = ts.transpileModule(code, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const tmp = path.join(os.tmpdir(), "harnessHtml.deg." + process.pid + ".cjs");
fs.writeFileSync(tmp, out);
try {
  const { renderHarnessHtml } = require(tmp);
  const empty = { harnesses: [], fleet: { harnesses: 0, unreadable: 0, status_counts: {} } };
  const unknown = renderHarnessHtml(empty, "ghost");
  const errored = renderHarnessHtml(
    { harnesses: [{ project_root: "/p", project_name: "boom", error: "feature_list.json missing", status_counts: {} }] },
    "boom",
  );
  const checks = [
    ["unknown -> empty state", unknown.indexOf("unknown harness: ghost") !== -1],
    ["errored -> ERROR note", errored.indexOf("ERROR:") !== -1 && errored.indexOf("feature_list.json missing") !== -1],
  ];
  const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
  if (failed.length) { console.log("FAILED: " + failed.join(", ")); process.exit(1); }
  process.exit(0);
} finally {
  try { fs.unlinkSync(tmp); } catch {}
}
' "$REPO_ROOT" 2>&1)"
DEGRADE_CODE=$?
if [ "$DEGRADE_CODE" -eq 0 ]; then pass; else fail "degrade assertions failed: $DEGRADE_OUT"; fi

# --- TWH5: renderHarnessHtml is pure (stable for identical input) -----------
start_case "renderHarnessHtml is deterministic across calls"
DETERMINISM_OUT="$(node -e '
const fs = require("fs");
const path = require("path");
const os = require("os");
const ts = require(path.join(process.argv[1], "apps/web/node_modules/typescript"));
const code = fs.readFileSync(path.join(process.argv[1], "apps/web/app/harness/harnessHtml.ts"), "utf8");
const out = ts.transpileModule(code, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const tmp = path.join(os.tmpdir(), "harnessHtml.det." + process.pid + ".cjs");
fs.writeFileSync(tmp, out);
try {
  const { renderHarnessHtml } = require(tmp);
  const state = { harnesses: [{ project_root: "/p", project_name: "p", error: null, status_counts: { pending: 1, in_progress: 0, done: 0, blocked: 0 }, features: [], has_graph: false }] };
  const a = renderHarnessHtml(state, "p");
  const b = renderHarnessHtml(state, "p");
  if (a !== b) { console.log("output differs across calls"); process.exit(1); }
  process.exit(0);
} finally {
  try { fs.unlinkSync(tmp); } catch {}
}
' "$REPO_ROOT" 2>&1)"
DETERMINISM_CODE=$?
if [ "$DETERMINISM_CODE" -eq 0 ]; then pass; else fail "renderer is not deterministic: $DETERMINISM_OUT"; fi

# --- TWH5b: the /api/md buttons speak the core's token vocabulary -----------
# harnessHtml.ts renders data-api-md="<token>" buttons; resolveMd() in
# @handyman/toolbox-core decides which tokens are real. The two lists drifting
# (filenames rendered where tokens were expected) 404'd the current/history/
# checkpoints/workspace tabs. The renderer stays import-free so the transpile
# harness above keeps working, so the coupling is pinned here instead: every
# bare token it emits must be in the core's exported MD_TOKENS, and every
# prefixed one must use a kind resolveMd accepts.
start_case "harnessHtml /api/md tokens are all accepted by core resolveMd (MD_TOKENS)"
TOKENS_OUT="$(node -e '
const fs = require("fs");
const path = require("path");
const os = require("os");
const root = process.argv[1];
const { MD_TOKENS } = require(path.join(root, "packages/toolbox-core/dist/state.js"));
const ts = require(path.join(root, "apps/web/node_modules/typescript"));
const code = fs.readFileSync(path.join(root, "apps/web/app/harness/harnessHtml.ts"), "utf8");
const out = ts.transpileModule(code, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const tmp = path.join(os.tmpdir(), "harnessHtml.tokens." + process.pid + ".cjs");
fs.writeFileSync(tmp, out);
try {
  const { renderHarnessHtml } = require(tmp);
  const html = renderHarnessHtml(
    { harnesses: [{ project_root: "/p", project_name: "alpha", error: null, status_counts: {}, features: [], has_graph: false }] },
    "alpha",
  );
  const emitted = [...html.matchAll(/data-api-md="([^"]+)"/g)].map((m) => m[1]);
  if (!emitted.length) { console.log("no data-api-md buttons rendered"); process.exit(1); }
  const bad = emitted.filter((t) =>
    t.includes(":") ? !["backlog", "docs"].includes(t.split(":", 1)[0]) : !MD_TOKENS.includes(t));
  if (bad.length) {
    console.log("tokens resolveMd rejects: " + bad.join(", ") + " (MD_TOKENS: " + MD_TOKENS.join(", ") + ")");
    process.exit(1);
  }
  process.exit(0);
} finally {
  try { fs.unlinkSync(tmp); } catch {}
}
' "$REPO_ROOT" 2>&1)"
TOKENS_CODE=$?
if [ "$TOKENS_CODE" -eq 0 ]; then pass; else fail "md token drift: $TOKENS_OUT"; fi

# --- TWH6: /harness/<name> is served natively by Next (strangler complete) --
# Feature 50 removed proxy.ts's route manifest along with the Node upstream it
# used to guard, so the honest assertion is the route file itself.
start_case "/harness/<name> is a native Next route (app/harness/[name]/page.tsx)"
if [ -f "$WEB_DIR/app/harness/[name]/page.tsx" ]; then
  pass
else
  fail "app/harness/[name]/page.tsx is missing: /harness/* is not served natively"
fi

# --- TWH7: HarnessLive subscribes same-origin (feature 43: /events is served
# natively by Next as an unbuffered ReadableStream route handler; the old
# direct-to-Node-port wiring is gone). Deliberate contract update.
start_case "HarnessLive subscribes to the same-origin /events feed via useLiveHtml"
if grep -q 'useLiveHtml' "$HARNESS_LIVE" \
  && grep -q 'new EventSource(eventsUrl)' "$LIVE_HOOK" \
  && grep -q 'eventsUrl="/events"' "$HARNESS_PAGE" \
  && grep -q 'stateUrl="/api/state"' "$HARNESS_PAGE"; then
  pass
else
  fail "HarnessLive is not wired to the same-origin /events + /api/state"
fi

# --- TWH8: the region is DERIVED state, never a hand-written innerHTML swap ---
# Regression guard for the bug class fixed in the useLiveHtml extraction. This
# view is the sharpest case: the markdown dialog re-renders the component on
# every open/close, and a ref-held innerHTML write is exactly what React would
# clobber there.
start_case "HarnessLive renders derived HTML (no manual innerHTML swap)"
if ! grep -q 'innerHTML *=' "$HARNESS_LIVE" \
  && grep -q 'dangerouslySetInnerHTML' "$HARNESS_LIVE"; then
  pass
else
  fail "HarnessLive writes innerHTML by hand: derived-state contract broken"
fi

# --- TWH8: HarnessLive fetches /api/md for the markdown dialog (no new deps)
start_case "HarnessLive fetches /api/md and renders body as escaped text (no markdown dep)"
if grep -q '/api/md' "$HARNESS_LIVE" && grep -q 'harness-live__dialog-pre' "$HARNESS_LIVE"; then
  pass
else
  fail "HarnessLive does not wire the /api/md dialog"
fi

summary

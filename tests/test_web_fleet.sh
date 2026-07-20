#!/usr/bin/env bash
# apps/web /fleet view tests (feature toolbox_next_fleet_view). Structural +
# render-contract, not a build: pnpm --filter @handyman/web build is kept out
# of the default suite (too slow for the run_tests.sh loop). The render check
# transpiles the pure renderer (app/fleet/fleetHtml.ts) with the project's own
# typescript, runs renderFleetHtml against a state fixture in-process, and
# asserts the markup carries the real fleet data. No network, no Next boot.
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
REPO_ROOT="$(cd "$SUITE_DIR/.." && pwd)"
WEB_DIR="$REPO_ROOT/apps/web"
FLEET_PAGE="$WEB_DIR/app/fleet/page.tsx"
FLEET_HTML="$WEB_DIR/app/fleet/fleetHtml.ts"
FLEET_LIVE="$WEB_DIR/components/FleetLive.tsx"
LIVE_HOOK="$WEB_DIR/lib/useLiveHtml.ts"
FLEET_CSS="$WEB_DIR/app/fleet/page.module.css"

echo "apps/web /fleet suite (test_web_fleet.sh)"

# --- TWF1: the /fleet view files exist --------------------------------------
start_case "apps/web/app/fleet/page.tsx exists"
if [ -f "$FLEET_PAGE" ]; then pass; else fail "missing $FLEET_PAGE"; fi

start_case "apps/web/app/fleet/fleetHtml.ts (pure renderer) exists"
if [ -f "$FLEET_HTML" ]; then pass; else fail "missing $FLEET_HTML"; fi

start_case "apps/web/components/FleetLive.tsx (SSE client) exists"
if [ -f "$FLEET_LIVE" ]; then pass; else fail "missing $FLEET_LIVE"; fi

start_case "apps/web/app/fleet/page.module.css exists"
if [ -f "$FLEET_CSS" ]; then pass; else fail "missing $FLEET_CSS"; fi

# --- TWF2: zero em-dashes / en-dashes in apps/web still holds ---------------
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

# --- TWF3: renderFleetHtml renders the fixture fleet data -------------------
# Transpiles fleetHtml.ts (no imports, pure) to a temp CommonJS module with
# the project's own typescript, requires it, and runs renderFleetHtml against
# a state fixture. Asserts: harness names, status counts, signal tags, kanban
# aggregate, and the no-external-asset invariant (no src="http in output).
start_case "renderFleetHtml renders fixture fleet (harnesses, counts, signals)"
RENDER_OUT="$(node -e '
const fs = require("fs");
const path = require("path");
const os = require("os");
const ts = require(path.join(process.argv[1], "apps/web/node_modules/typescript"));
const src = path.join(process.argv[1], "apps/web/app/fleet/fleetHtml.ts");
const code = fs.readFileSync(src, "utf8");
const out = ts.transpileModule(code, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const tmp = path.join(os.tmpdir(), "fleetHtml.test." + process.pid + ".cjs");
fs.writeFileSync(tmp, out);
try {
  const { renderFleetHtml } = require(tmp);
  const state = {
    generated_at: "2026-07-18T08:30:00.000Z",
    fleet: { harnesses: 2, unreadable: 1, status_counts: { pending: 3, in_progress: 1, done: 5, blocked: 0 } },
    harnesses: [
      {
        project_root: "/home/u/proj/alpha",
        project_name: "alpha",
        error: null,
        status_counts: { pending: 2, in_progress: 1, done: 3, blocked: 0 },
        signals: [{ signal: "STALE_WIP", detail: "in_progress updated 2026-07-01 (> 7 days ago)" }],
        features: [],
        has_graph: false,
      },
      {
        project_root: "/home/u/proj/beta",
        project_name: "beta-suite",
        error: "feature_list.json missing",
        status_counts: { pending: 0, in_progress: 0, done: 0, blocked: 0 },
        signals: [{ signal: "UNREADABLE", detail: "feature_list.json missing" }],
        features: [],
        has_graph: false,
      },
    ],
  };
  const html = renderFleetHtml(state);
  const checks = [
    ["harness name alpha", html.indexOf("alpha") !== -1],
    ["harness name beta-suite", html.indexOf("beta-suite") !== -1],
    ["harness root alpha", html.indexOf("/home/u/proj/alpha") !== -1],
    ["kanban pending count 3", html.indexOf(">3<") === -1 ? html.indexOf("3</bdi>") !== -1 : true],
    ["status chip in_progress", html.indexOf("chip--in_progress") !== -1],
    ["status chip done", html.indexOf("chip--done") !== -1],
    ["signal STALE_WIP tag", html.indexOf("STALE_WIP") !== -1],
    ["signal UNREADABLE tag", html.indexOf("UNREADABLE") !== -1],
    ["fleet unreadable 1", html.indexOf("unreadable") !== -1],
    ["generated timestamp", html.indexOf("2026-07-18 08:30 UTC") !== -1],
    ["kanban section present", html.indexOf("kanban") !== -1],
    ["harness table present", html.indexOf("harness-table") !== -1],
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

# --- TWF4: renderFleetHtml is pure (stable for identical input) -------------
start_case "renderFleetHtml is deterministic across calls"
DETERMINISM_OUT="$(node -e '
const fs = require("fs");
const path = require("path");
const os = require("os");
const ts = require(path.join(process.argv[1], "apps/web/node_modules/typescript"));
const code = fs.readFileSync(path.join(process.argv[1], "apps/web/app/fleet/fleetHtml.ts"), "utf8");
const out = ts.transpileModule(code, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const tmp = path.join(os.tmpdir(), "fleetHtml.det." + process.pid + ".cjs");
fs.writeFileSync(tmp, out);
try {
  const { renderFleetHtml } = require(tmp);
  const state = { harnesses: [{ project_root: "/p", project_name: "p", error: null, status_counts: { pending: 1, in_progress: 0, done: 0, blocked: 0 } }], fleet: { harnesses: 1, unreadable: 0, status_counts: { pending: 1, in_progress: 0, done: 0, blocked: 0 } }, generated_at: "2026-07-18T00:00:00.000Z" };
  const a = renderFleetHtml(state);
  const b = renderFleetHtml(state);
  if (a !== b) { console.log("output differs across calls"); process.exit(1); }
  process.exit(0);
} finally {
  try { fs.unlinkSync(tmp); } catch {}
}
' "$REPO_ROOT" 2>&1)"
DETERMINISM_CODE=$?
if [ "$DETERMINISM_CODE" -eq 0 ]; then pass; else fail "renderer is not deterministic: $DETERMINISM_OUT"; fi

# --- TWF5: /fleet is served natively by Next (strangler complete) -----------
# Feature 50 removed proxy.ts's route manifest along with the Node upstream it
# used to guard, so the honest assertion is the route file itself.
start_case "/fleet is a native Next route (app/fleet/page.tsx)"
if [ -f "$WEB_DIR/app/fleet/page.tsx" ]; then
  pass
else
  fail "app/fleet/page.tsx is missing: /fleet is not served natively"
fi

# --- TWF6: FleetLive subscribes same-origin (feature 43: /events is served
# natively by Next as an unbuffered ReadableStream route handler; the old
# direct-to-Node-port wiring is gone). Deliberate contract update: the
# EventSource itself now lives in the shared lib/useLiveHtml.ts hook, so the
# assertion checks the wiring (page -> component -> hook) end to end.
start_case "FleetLive subscribes to the same-origin /events feed via useLiveHtml"
if grep -q 'useLiveHtml' "$FLEET_LIVE" \
  && grep -q 'new EventSource(eventsUrl)' "$LIVE_HOOK" \
  && grep -q 'eventsUrl="/events"' "$FLEET_PAGE" \
  && grep -q 'stateUrl="/api/state"' "$FLEET_PAGE"; then
  pass
else
  fail "FleetLive is not wired to the same-origin /events + /api/state"
fi

# --- TWF7: the region is DERIVED state, never a hand-written innerHTML swap ---
# Regression guard for the bug class fixed in the useLiveHtml extraction: a
# ref-held innerHTML write fights React's reconciliation and gets clobbered on
# re-render (it already broke /search). React must own the node.
start_case "FleetLive renders derived HTML (no manual innerHTML swap)"
if ! grep -q 'innerHTML *=' "$FLEET_LIVE" \
  && grep -q 'dangerouslySetInnerHTML' "$FLEET_LIVE"; then
  pass
else
  fail "FleetLive writes innerHTML by hand: derived-state contract broken"
fi

summary

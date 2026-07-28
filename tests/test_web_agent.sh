#!/usr/bin/env bash
# apps/web /agent view tests (feature 95 web_live_agent_view). Structural +
# render-contract, not a build: pnpm --filter @handyman/web build is kept out
# of the default suite (same call as test_web_landing.sh / test_web_fleet.sh).
# The render checks transpile the pure renderer (app/agent/agentHtml.ts, zero
# imports) with the project's own typescript, run renderAgentHtml against
# state fixtures in-process, and assert the markup is escaped, deterministic
# and free of external assets. No network, no Next boot.
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
REPO_ROOT="$(cd "$SUITE_DIR/.." && pwd)"
WEB_DIR="$REPO_ROOT/apps/web"
AGENT_PAGE="$WEB_DIR/app/agent/page.tsx"
AGENT_HTML="$WEB_DIR/app/agent/agentHtml.ts"
AGENT_CSS="$WEB_DIR/app/agent/page.module.css"
AGENT_LIVE="$WEB_DIR/components/AgentLive.tsx"
AGENT_ROUTE="$WEB_DIR/app/api/agent/route.ts"
AGENT_LOADER="$WEB_DIR/app/api/agent/loadAgentState.ts"

# Transpile a single pure module (no imports) to CommonJS and run a JS
# snippet against its exports. Usage: run_transpiled SRC_FILE 'js code using
# the `mod` binding'. Prints whatever the snippet prints; exit code is the
# snippet's. Copied verbatim from tests/test_web_timeline_search.sh.
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

echo "apps/web /agent suite (test_web_agent.sh)"

# --- TWA1: the /agent view files exist ---------------------------------------
start_case "apps/web /agent view files exist (page, renderer, live client, css, route, loader)"
if [ -f "$AGENT_PAGE" ] && [ -f "$AGENT_HTML" ] && [ -f "$AGENT_LIVE" ] \
  && [ -f "$AGENT_CSS" ] && [ -f "$AGENT_ROUTE" ] && [ -f "$AGENT_LOADER" ]; then
  pass
else
  fail "a /agent file is missing"
fi

# --- TWA2: route handler contract --------------------------------------------
# The route stays thin on purpose (shared loader, same as the RSC): the
# validation regex and the Flue env vars live in loadAgentState.ts.
start_case "route.ts: force-dynamic + sendJson + try/catch degradation"
if grep -q 'export const dynamic = "force-dynamic"' "$AGENT_ROUTE" \
  && grep -q 'sendJson' "$AGENT_ROUTE" \
  && grep -q 'catch' "$AGENT_ROUTE"; then
  pass
else
  fail "route.ts lost the force-dynamic/sendJson/try-catch contract"
fi

start_case "loadAgentState.ts: feature regex + telemetry dir + probe env + slow-op mirror"
if grep -q '\^\[A-Za-z0-9_-\]' "$AGENT_LOADER" \
  && grep -q 'FLUE_AGENT_LOGS_DIR' "$AGENT_LOADER" \
  && grep -q 'FLUE_BASE_URL' "$AGENT_LOADER" \
  && grep -q 'SLOW_OPERATION_MS = 300_000' "$AGENT_LOADER"; then
  pass
else
  fail "loadAgentState.ts lost the validation regex, env vars or slow-op mirror"
fi

# --- TWA3: renderAgentHtml renders the fixture state --------------------------
start_case "renderAgentHtml renders fixture telemetry (counts, types, outcomes, escaping)"
OUT="$(run_transpiled "$AGENT_HTML" '
const state = {
  runtime: "online",
  feature: "95_web_live_agent_view",
  telemetry: {
    total: 42,
    byType: { tool: 30, operation: 10, submission_settled: 2 },
    lastType: "operation",
    lastTimestamp: "2026-07-27T10:15:00.000Z",
    outcomes: [
      { submissionId: "sub-1", outcome: "completed" },
      { submissionId: "sub-<script>alert(1)</script>", outcome: "failed" },
    ],
    toolErrors: 3,
    slowOps: 1,
  },
};
const html = mod.renderAgentHtml(state);
const again = mod.renderAgentHtml(state);
const checks = [
  ["header title", html.includes("agent-header__title")],
  ["feature name", html.includes("95_web_live_agent_view")],
  ["runtime online chip", html.includes("runtime online") && html.includes("agent-chip--online")],
  ["total events", html.includes("42") && html.includes("eventos")],
  ["last type", html.includes("operation")],
  ["last timestamp formatted", html.includes("2026-07-27 10:15 UTC")],
  ["byType table", html.includes("agent-table") && html.includes("submission_settled")],
  ["byType sorted", html.indexOf(">operation<") < html.indexOf(">submission_settled<") && html.indexOf(">submission_settled<") < html.indexOf(">tool<")],
  ["tool errors count", html.includes("errores de herramienta")],
  ["slow ops count", html.includes("operaciones lentas")],
  ["outcome completed", html.includes("completed")],
  ["outcome failed", html.includes("failed")],
  ["newest outcome first", html.indexOf("sub-&lt;script&gt;") < html.indexOf("sub-1")],
  ["submission id escaped", !html.includes("<script>alert") && html.includes("sub-&lt;script&gt;")],
  ["no external http src asset", !html.includes("src=\"http")],
  ["no inline script injected", !html.includes("<script")],
  ["deterministic", html === again],
];
const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) { console.log("FAILED: " + failed.join(", ")); process.exit(1); }
')"
CODE=$?
if [ "$CODE" -eq 0 ]; then pass; else fail "agent render assertions failed: $OUT"; fi

# --- TWA4: degraded states (offline, no telemetry, no feature) ---------------
start_case "renderAgentHtml renders offline and no-feature states"
OUT="$(run_transpiled "$AGENT_HTML" '
const offline = mod.renderAgentHtml({ runtime: "offline", feature: "feat_x", telemetry: null });
const noTelemetry = mod.renderAgentHtml({ runtime: "online", feature: "feat_x", telemetry: null });
const noFeature = mod.renderAgentHtml({ runtime: "offline", feature: null, telemetry: null });
const checks = [
  ["offline section", offline.includes("Runtime offline") && offline.includes("agent-section--down")],
  ["offline chip", offline.includes("runtime offline") && offline.includes("agent-chip--offline")],
  ["no-telemetry state", noTelemetry.includes("Sin telemetr") && noTelemetry.includes("sin telemetr")],
  ["no-feature invite", noFeature.includes("Elige una feature")],
  ["no-feature has no status chips", !noFeature.includes("agent-chip--offline")],
  ["no external src anywhere", !offline.includes("src=\"http") && !noFeature.includes("src=\"http")],
];
const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failed.length) { console.log("FAILED: " + failed.join(", ")); process.exit(1); }
')"
CODE=$?
if [ "$CODE" -eq 0 ]; then pass; else fail "degraded-state assertions failed: $OUT"; fi

# --- TWA5: AgentLive is a polling client with derived-state rendering ---------
start_case "AgentLive: use client + polling + dangerouslySetInnerHTML"
if grep -q '"use client"' "$AGENT_LIVE" \
  && grep -q 'setInterval' "$AGENT_LIVE" \
  && grep -q 'clearInterval' "$AGENT_LIVE" \
  && grep -q 'dangerouslySetInnerHTML' "$AGENT_LIVE" \
  && grep -q '/api/agent?feature=' "$AGENT_LIVE"; then
  pass
else
  fail "AgentLive lost the polling / derived-HTML contract"
fi

start_case "AgentLive: no manual innerHTML swap, no document keydown listener"
if ! grep -q 'innerHTML *=' "$AGENT_LIVE" \
  && ! grep -q 'keydown' "$AGENT_LIVE"; then
  pass
else
  fail "AgentLive writes innerHTML by hand or adds a keydown listener"
fi

# --- TWA6: /agent is served natively by Next ----------------------------------
start_case "/agent is a native Next route (app/agent/page.tsx)"
if [ -f "$WEB_DIR/app/agent/page.tsx" ]; then
  pass
else
  fail "app/agent/page.tsx is missing: /agent is not served natively"
fi

# --- TWA7: zero em-dashes / en-dashes in the new files ------------------------
start_case "the /agent files have zero em-dashes (U+2014) and zero en-dashes (U+2013)"
DASH_OUT="$(node -e '
const fs = require("fs");
const hits = [];
for (const file of process.argv.slice(1)) {
  const text = fs.readFileSync(file, "utf8");
  text.split("\n").forEach((line, i) => {
    if (line.indexOf("—") !== -1 || line.indexOf("–") !== -1) {
      hits.push(file + ":" + (i + 1));
    }
  });
}
if (hits.length) { console.log(hits.join("\n")); process.exit(1); }
process.exit(0);
' "$AGENT_PAGE" "$AGENT_HTML" "$AGENT_CSS" "$AGENT_LIVE" "$AGENT_ROUTE" "$AGENT_LOADER" 2>&1)"
DASH_CODE=$?
if [ "$DASH_CODE" -eq 0 ]; then pass; else fail "em-dash or en-dash found: $DASH_OUT"; fi

# --- TWA8: the client never references the Flue origin ------------------------
# CSP connect-src is 'self': the runtime probe lives server-side in
# loadAgentState.ts; the client (component + page) only calls same-origin
# /api/* routes.
start_case "client files reference neither 127.0.0.1 nor the Flue port"
if ! grep -qE '127\.0\.0\.1|3583' "$AGENT_LIVE" "$AGENT_PAGE"; then
  pass
else
  fail "AgentLive.tsx or page.tsx references the Flue origin directly"
fi

summary

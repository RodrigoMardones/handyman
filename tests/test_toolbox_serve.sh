#!/usr/bin/env bash
# toolBox observer tests: boots the toolbox serve wrapper (Next standalone,
# `node dist/toolbox.js serve`) on an ephemeral port against a temporary
# HANDYMAN_ROOT fixture (the real $HOME/HANDYMAN is never
# touched) and exercises the read-only HTTP surface: panel, state, markdown
# allowlist, corpus, graph passthrough, vendor libs, SSE and the security
# guards (GET-only, Host check), plus the POST /api/draft intake relay, the
# POST /api/summarize fleet-summary relay and the POST /api/ask grounded Q&A
# relay (text only, no disk writes). The summarize and ask cases run against
# a local mock OpenAI-compatible LLM server bound to 127.0.0.1 (exported as
# OLLAMA_BASE_URL, so provider "ollama" is the deterministic fake); no test
# touches the network.
#
# Parity-oracle knobs (Next.js migration, feature toolbox_parity_oracle):
#   TOOLBOX_SERVE_CMD  alternative boot command replacing the default
#                      `node dist/toolbox.js serve` (the Next standalone
#                      wrapper). Unset: the wrapper is the default.
#   TOOLBOX_BASE_URL   URL of an already-running server; when set, this
#                      suite boots nothing and kills nothing at the end. See
#                      .handyman/docs/verification.md for the shared-fixture
#                      requirement (HANDYMAN_ROOT / OLLAMA_BASE_URL) this
#                      mode relies on.
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
TOOLBOX="$SUITE_DIR/../handyman/dist/toolbox.js"
SERVE="$SUITE_DIR/../handyman/dist/toolbox.js"
SERVE_SUBCMD="serve"

echo "toolBox observer suite (test_toolbox_serve.sh)"

# --- fixture -----------------------------------------------------------------
T="$(mktemp -d)"
if [ -n "${TOOLBOX_BASE_URL:-}" ] && [ -n "${HANDYMAN_ROOT:-}" ]; then
  # Parity-oracle mode (TOOLBOX_BASE_URL): share the registry root with the
  # already-running server under test instead of the suite's own throwaway
  # one, so the fixture this suite registers below becomes visible to it
  # (the registry is read fresh from disk on every request — see
  # .handyman/docs/verification.md). Default (no env vars) is untouched.
  FR="$HANDYMAN_ROOT"
else
  FR="$T/toolboxroot"
fi
H1="$T/proj1"
ws="$H1/.handyman"
mkdir -p "$ws/progress" "$ws/backlog" "$ws/docs" "$H1/graphify-out"
printf '{"install_mode":"local","project_name":"proj1","project_root":".","harness_workspace":".handyman","harness_version":"1.0.0"}\n' \
  > "$H1/harness.config.json"
printf '{"project":"proj1","features":[
  {"id":1,"name":"alpha","title":"Alpha feature","status":"done"},
  {"id":2,"name":"beta","title":"Beta feature","status":"pending","sprint":"2026-SP1"},
  {"id":3,"name":"gamma","title":"Gamma feature","status":"blocked","blocked_reason":"waiting on infra"}
]}\n' > "$ws/feature_list.json"
printf -- '---\nfeature: none\nstatus: idle\nrole: leader\nupdated: 2026-06-01\ntags: [x]\n---\n# Current\nsearchable_marker_current\n' \
  > "$ws/progress/current.md"
printf -- '---\ntags: [x]\n---\n# History\n\n## 2026-06-01 - Feature 1: alpha\n- **Closure:** done\n' \
  > "$ws/progress/history.md"
printf -- '---\nfeature: alpha\nstatus: implemented\nrole: implementer\nupdated: 2026-06-01\ntags: [x]\n---\n# Impl\nsearchable_marker_backlog\n' \
  > "$ws/backlog/impl_alpha.md"
printf -- '---\nfeature: alpha\nstatus: approved\nrole: reviewer\nupdated: 2026-06-01\ntags: [x]\n---\n# Review\nsearchable_marker_review\n' \
  > "$ws/backlog/review_alpha.md"
printf '# Business\nsearchable_marker_docs\n' > "$ws/docs/business.md"
printf '<!DOCTYPE html><html><body>fixture graph</body></html>\n' > "$H1/graphify-out/graph.html"
printf '{"nodes":[],"edges":[]}\n' > "$H1/graphify-out/graph.json"
printf '# CHECKPOINTS\n- C1 ok\n' > "$H1/CHECKPOINTS.md"
mkdir -p "$H1/src"
printf 'export const X = 1;\n' > "$H1/src/cli.ts"
printf 'binary\x00data' > "$H1/blob.bin"
HANDYMAN_ROOT="$FR" node "$TOOLBOX" register "$H1" --date 2026-07-01 >/dev/null 2>&1

# --- mock OpenAI-compatible LLM server (deterministic fake provider) ---------
# Booted BEFORE the observer and exported as OLLAMA_BASE_URL so provider
# "ollama" (always instantiated; health check hits GET /models on the base)
# becomes a deterministic local fake. GET /v1/calls exposes how many
# completion calls were served — the cache-hit assertion reads it.
MOCK_PID=""
if [ -n "${TOOLBOX_BASE_URL:-}" ] && [ -n "${OLLAMA_BASE_URL:-}" ]; then
  # Parity-oracle mode: the already-running server was booted with its own
  # OLLAMA_BASE_URL (ambient here too) — reuse that same fake instead of
  # spinning up a second, disconnected one the target server never talks to
  # (see .handyman/docs/verification.md). The cache-hit assertion's /v1/calls
  # readback then targets the instance the server actually calls.
  MOCK_PORT="$(printf '%s' "$OLLAMA_BASE_URL" | sed -E 's#^https?://[^:/]+:([0-9]+).*#\1#')"
else
cat > "$T/mockllm.js" <<'MOCKEOF'
const http = require("http");
let calls = 0;
const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/v1/models") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end("{}");
    return;
  }
  if (req.method === "GET" && req.url === "/v1/calls") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ calls }));
    return;
  }
  if (req.method === "POST" && req.url === "/v1/chat/completions") {
    calls += 1;
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const frame = (obj) => res.write("data: " + JSON.stringify(obj) + "\n\n");
      // Prompt routing: ask prompts carry the "---- user question" marker
      // (composeAskPrompt) and get a deterministic cited answer; everything
      // else keeps the summarize reply so those cases pass unchanged.
      if (body.includes("---- user question")) {
        frame({ choices: [{ delta: { content: "the alpha feature is done " }, finish_reason: null }] });
        frame({ choices: [{ delta: { content: "[fuente: backlog:impl_alpha.md]" }, finish_reason: null }] });
      } else if (body.includes("Documentos del backlog")) {
        // Triage prompts (composeTriagePrompt) get a deterministic report the
        // suite can parse back. Fenced on purpose: parseTriageReport must
        // survive the code block models emit even when told not to.
        frame({ choices: [{ delta: { content: '```json\n{"report":[' }, finish_reason: null }] });
        frame({ choices: [{ delta: { content: '{"id":"impl_alpha.md","categoria":"impl","confianza":0.8}]}\n```' }, finish_reason: null }] });
      } else if (body.includes("Features cerradas")) {
        // retro prompts (composeRetroPrompt). Two patterns on purpose: one
        // properly backed by 2 features, one anecdote backed by 1 that the
        // server must DROP and count in `discarded`.
        frame({ choices: [{ delta: { content: '{"patterns":[' }, finish_reason: null }] });
        frame({ choices: [{ delta: { content: '{"titulo":"shims por paquete","tipo":"patron","features":["alpha","beta"],"detalle":"d"},{"titulo":"anecdota","tipo":"patron","features":["alpha"],"detalle":"d"}]}' }, finish_reason: null }] });
      } else if (body.includes("deduce que cambio") || body.includes("deduce los criterios")) {
        // acceptance prompts (composeAcceptancePrompt): observable bullets
        // ending in the green gate, so gate_last must come back true.
        frame({ choices: [{ delta: { content: "- POST /api/x responde 400 sin root\n" }, finish_reason: null }] });
        frame({ choices: [{ delta: { content: "- bash tests/run_tests.sh passes y ./init.sh exits 0." }, finish_reason: null }] });
      } else if (body.includes("Feature bajo revision")) {
        // review-notes prompts (composeReviewNotesPrompt): a checklist of
        // questions, deliberately carrying NO verdict token.
        frame({ choices: [{ delta: { content: "borrador: verificar todo\n" }, finish_reason: null }] });
        frame({ choices: [{ delta: { content: "- invariante de solo-lectura respetada?" }, finish_reason: null }] });
      } else {
        frame({ choices: [{ delta: { content: "fleet " }, finish_reason: null }] });
        frame({ choices: [{ delta: { content: "summary ok" }, finish_reason: null }] });
      }
      frame({ choices: [{ delta: {}, finish_reason: "stop" }] });
      res.write("data: [DONE]\n\n");
      res.end();
    });
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end("{}");
});
server.listen(0, "127.0.0.1", () => {
  console.log("PORT=" + server.address().port);
});
MOCKEOF
MOCK_OUT="$T/mockllm.out"
node "$T/mockllm.js" > "$MOCK_OUT" 2>&1 &
MOCK_PID=$!
MOCK_PORT=""
for _ in $(seq 1 50); do
  MOCK_PORT="$(sed -n 's/^PORT=//p' "$MOCK_OUT" | tr -d '[:space:]')"
  [ -n "$MOCK_PORT" ] && break
  sleep 0.1
done
fi

# --- boot one server for the whole suite (or reuse an already-running one) --
# The default boot is the new single-process wrapper: `node dist/toolbox.js
# serve` spawns the Next standalone server (apps/web/.next/standalone/apps/web/
# server.js), resolves its own repo root by walking up from cwd, and prints
# `toolBox observer: <URL>`. TOOLBOX_SERVE_CMD: alternative boot command
# standing in for that default (parity target: an equivalent Next.js
# entrypoint). TOOLBOX_BASE_URL: URL of an already-running server; when set,
# this suite boots nothing and — since it never started it — kills nothing at
# the end either.
SERVER_PID=""
if [ -n "${TOOLBOX_BASE_URL:-}" ]; then
  URL="$TOOLBOX_BASE_URL"
  case "$URL" in
    */) ;;
    *) URL="$URL/" ;;
  esac
else
  SERVER_OUT="$T/server.out"
  if [ -n "${TOOLBOX_SERVE_CMD:-}" ]; then
    HANDYMAN_ROOT="$FR" OLLAMA_BASE_URL="http://127.0.0.1:$MOCK_PORT/v1" \
      bash -c "exec $TOOLBOX_SERVE_CMD --port 0" > "$SERVER_OUT" 2>&1 &
  else
    HANDYMAN_ROOT="$FR" OLLAMA_BASE_URL="http://127.0.0.1:$MOCK_PORT/v1" \
      node "$SERVE" $SERVE_SUBCMD --port 0 > "$SERVER_OUT" 2>&1 &
  fi
  SERVER_PID=$!
  URL=""
  for _ in $(seq 1 50); do
    URL="$(sed -n 's/^toolBox observer: //p' "$SERVER_OUT" | tr -d '[:space:]')"
    [ -n "$URL" ] && break
    sleep 0.1
  done
fi
cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" >/dev/null 2>&1
    wait "$SERVER_PID" 2>/dev/null
  fi
  if [ -n "$MOCK_PID" ]; then
    kill "$MOCK_PID" >/dev/null 2>&1
    wait "$MOCK_PID" 2>/dev/null
  fi
  rm -rf "$T"
}
trap cleanup EXIT

start_case "serve boots on an ephemeral port and prints the URL"
if [ -n "$URL" ]; then
  pass
else
  fail "no URL in server output: $(cat "$SERVER_OUT")"
fi

# --- TS0: DNS-rebinding host guard (apps/web/proxy.ts) -----------------------
# proxy() is the single request-level guard left after feature 50 decommissioned
# the Node observer: a browser lured to a hostname that resolves to 127.0.0.1
# must not be able to read this process. Loopback Hosts pass, anything else is
# 403. Previously verified by hand only; pinned here so removing the guard
# fails the suite.
# The positive control probes /fleet (a page that renders 200); `/` is a
# redirect since feature web_exp_revision, which would couple this case to
# the redirect status instead of the guard.
start_case "a non-loopback Host header is rejected with 403 (DNS-rebinding guard)"
EVIL_CODE="$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: evil.example' "${URL}fleet")"
LOOPBACK_CODE="$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: localhost' "${URL}fleet")"
if [ "$EVIL_CODE" = "403" ] && [ "$LOOPBACK_CODE" = "200" ]; then
  pass
else
  fail "host guard drifted: evil.example -> $EVIL_CODE (want 403), localhost -> $LOOPBACK_CODE (want 200)"
fi

# --- TS1: GET / (root redirect, feature web_exp_revision) --------------------
# Feature 50 (toolbox_serve_decommission) made the Next standalone process
# the single entrypoint; feature web_exp_revision then retired the marketing
# landing that lived at `/` (a localhost observer has one visitor, its
# operator), so `/` now redirects to /fleet, the panel's home view. The
# structural security contract the landing case carried (no UMD
# React/htm/marked/dompurify/minisearch vendors, no external scripts, no
# legacy `id="root"` UMD mount) is preserved against the FOLLOWED body, the
# page `/` actually lands on. The migrated panel-asset cases these used to
# point at still live in the Next-app suites below.
#   - panel asset JS / sparkline / fmt helpers   -> test_web_fleet.sh (renderFleetHtml)
#   - anti-flash theme script + 3-state control  -> test_web_timeline_search.sh (theme keeps hw-theme:1 + layout injects anti-flash snippet)
#   - two static live regions / reduced-motion   -> test_web_timeline_search.sh (ToolboxShell renders both static live regions)
#   - SSE summary queue + connection announce    -> test_web_intake_ask.sh (FleetSummaryClient) + test_web_timeline_search.sh (announce)
#   - actionable empty-state hints               -> test_web_fleet.sh / test_web_harness.sh (render*Html fixtures)
#   - command palette (cmdk, MiniSearch-ranked)  -> test_web_timeline_search.sh (palette builds view/harness/doc actions)
#   - single document keydown listener + guard   -> test_web_timeline_search.sh (shortcut interpreter) + test_web_intake_ask.sh (exactly ONE document.addEventListener('keydown'))
start_case "GET / redirects to /fleet and the home body keeps the security contract"
ROOT_CODE="$(curl -s -o /dev/null -w '%{http_code}' "$URL")"
ROOT_LOC="$(curl -s -D - -o /dev/null "$URL" | tr -d '\r' | grep -i '^location:' | awk '{print $2}')"
BODY="$(curl -sL "$URL")"
case "$ROOT_CODE" in
  307|308) REDIR_OK=yes ;;
  *) REDIR_OK=no ;;
esac
printf '%s' "$ROOT_LOC" | grep -q '/fleet$' || REDIR_OK=no
if [ "$REDIR_OK" = "yes" ] \
  && printf '%s' "$BODY" | grep -qi '<html' \
  && ! printf '%s' "$BODY" | grep -q '/vendor/react.js' \
  && ! printf '%s' "$BODY" | grep -q '/vendor/react-dom.js' \
  && ! printf '%s' "$BODY" | grep -q '/vendor/htm.js' \
  && ! printf '%s' "$BODY" | grep -q '/vendor/minisearch.js' \
  && ! printf '%s' "$BODY" | grep -q '/vendor/marked.js' \
  && ! printf '%s' "$BODY" | grep -q '/vendor/dompurify.js' \
  && ! printf '%s' "$BODY" | grep -q 'id="root"' \
  && ! printf '%s' "$BODY" | grep -qE '<script[^>]*src="https?://'; then
  pass
else
  fail "root redirect broken: code=$ROOT_CODE loc=$ROOT_LOC body: $(printf '%s' "$BODY" | head -5)"
fi

# --- TS2: state --------------------------------------------------------------
start_case "/api/state carries snapshots, signals, features, fleet and timeline"
OK="$(curl -s "${URL}api/state" | node -e "
let raw = '';
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  const d = JSON.parse(raw);
  const h = d.harnesses[0];
  const ok = d.harnesses.length === 1 &&
    Array.isArray(h.signals) && Array.isArray(h.features) &&
    h.features.length === 3 && h.has_graph === true &&
    h.features.some((f) => f.blocked_reason === 'waiting on infra') &&
    d.fleet.harnesses === 1 && Array.isArray(d.timeline);
  console.log(ok ? 'yes' : 'no');
});
" 2>/dev/null)"
if [ "$OK" = "yes" ]; then
  pass
else
  fail "state shape wrong: $(curl -s "${URL}api/state" | head -c 300)"
fi

# --- TS2b: per-harness metrics (Plan A) --------------------------------------
start_case "/api/state carries per-harness metrics (throughput, verdicts, coverage)"
OK="$(curl -s "${URL}api/state" | node -e "
let raw = '';
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  const m = JSON.parse(raw).harnesses[0].metrics;
  const ok = m !== null && typeof m === 'object' &&
    ['throughput', 'review_verdicts', 'coverage'].every((k) => k in m) &&
    m.throughput['2026-06-01'] === 1 &&
    m.review_verdicts.approved === 1 &&
    m.review_verdicts.approval_rate === 1 &&
    m.coverage.done === 1 && m.coverage.with_reports === 1;
  console.log(ok ? 'yes' : 'no');
});
" 2>/dev/null)"
if [ "$OK" = "yes" ]; then
  pass
else
  fail "metrics shape wrong: $(curl -s "${URL}api/state" | head -c 300)"
fi

# --- TS3: markdown allowlist -------------------------------------------------
start_case "/api/md serves whitelisted files and refuses everything else"
C_OK="$(curl -s -o /dev/null -w '%{http_code}' "${URL}api/md?root=$H1&file=current")"
BODY_OK="$(curl -s "${URL}api/md?root=$H1&file=backlog:impl_alpha.md")"
C_CHECK="$(curl -s -o /dev/null -w '%{http_code}' "${URL}api/md?root=$H1&file=checkpoints")"
C_UNREG="$(curl -s -o /dev/null -w '%{http_code}' "${URL}api/md?root=/etc&file=current")"
C_TRAV="$(curl -s -o /dev/null -w '%{http_code}' "${URL}api/md?root=$H1&file=backlog:../../secrets.md")"
C_ABS="$(curl -s -o /dev/null -w '%{http_code}' "${URL}api/md?root=$H1&file=random")"
if [ "$C_OK" = "200" ] && [ "$C_CHECK" = "200" ] \
  && printf '%s' "$BODY_OK" | grep -q "searchable_marker_backlog" \
  && [ "$C_UNREG" = "400" ] && [ "$C_TRAV" = "400" ] && [ "$C_ABS" = "400" ]; then
  pass
else
  fail "ok=$C_OK check=$C_CHECK unreg=$C_UNREG trav=$C_TRAV abs=$C_ABS"
fi

# --- TS3b: docs quick-view (Plan A) ------------------------------------------
start_case "/api/md serves docs:<name>.md and 404s a doc the harness lacks"
DOC_BODY="$(curl -s "${URL}api/md?root=$H1&file=docs:business.md")"
C_DOC_MISS="$(curl -s -o /dev/null -w '%{http_code}' "${URL}api/md?root=$H1&file=docs:architecture.md")"
if printf '%s' "$DOC_BODY" | grep -q "searchable_marker_docs" && [ "$C_DOC_MISS" = "404" ]; then
  pass
else
  fail "docs body=$(printf '%s' "$DOC_BODY" | head -1) miss=$C_DOC_MISS"
fi

# --- TS4: corpus -------------------------------------------------------------
start_case "/api/corpus indexes features, progress, backlog and docs"
OK="$(curl -s "${URL}api/corpus" | node -e "
let raw = '';
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  const d = JSON.parse(raw);
  const kinds = new Set(d.documents.map((x) => x.kind));
  const ok = ['feature', 'progress', 'backlog', 'docs'].every((k) => kinds.has(k)) &&
    d.documents.some((x) => x.text.includes('searchable_marker_docs'));
  console.log(ok ? 'yes' : 'no');
});
" 2>/dev/null)"
if [ "$OK" = "yes" ]; then
  pass
else
  fail "corpus incomplete"
fi

# --- TS4b: LLM provider availability ----------------------------------------
start_case "/api/providers reports id/available/model and declares copilot future"
OK="$(curl -s "${URL}api/providers" | node -e "
let raw = '';
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  const d = JSON.parse(raw);
  const byId = Object.fromEntries(d.providers.map((p) => [p.id, p]));
  const shape = d.providers.every(
    (p) => typeof p.id === 'string' && typeof p.available === 'boolean' && 'model' in p,
  );
  const ok = shape && 'ollama' in byId && byId.copilot &&
    byId.copilot.available === false && byId.copilot.model === null;
  console.log(ok ? 'yes' : 'no');
});
" 2>/dev/null)"
if [ "$OK" = "yes" ]; then
  pass
else
  fail "providers shape wrong: $(curl -s "${URL}api/providers" | head -c 300)"
fi

# --- TS5: graph passthrough --------------------------------------------------
start_case "/graph serves the harness graphify export and 404s the unknown"
G_HTML="$(curl -s "${URL}graph/proj1/graph.html")"
G_JSON="$(curl -s -o /dev/null -w '%{http_code}' "${URL}graph/proj1/graph.json")"
G_MISS="$(curl -s -o /dev/null -w '%{http_code}' "${URL}graph/nope/graph.html")"
if printf '%s' "$G_HTML" | grep -q "fixture graph" \
  && [ "$G_JSON" = "200" ] && [ "$G_MISS" = "404" ]; then
  pass
else
  fail "json=$G_JSON miss=$G_MISS html=$G_HTML"
fi

# --- TS6: vendors ------------------------------------------------------------
# Feature toolbox_panel_retirement: the React panel UMDs (react/react-dom/
# htm/marked/dompurify/minisearch) were deleted; only vis-network remains
# (graphify graph renderer, same-origin rewrite of unpkg). The retired panel
# vendors now 404; the unknown-vendor guard still holds.
start_case "vendor lib vis-network.js serves from node_modules; retired UMDs 404"
V_OK="$(curl -s -o /dev/null -w '%{http_code}' "${URL}vendor/vis-network.js")"
ALL_RETIRED=yes
for v in react.js react-dom.js htm.js minisearch.js marked.js dompurify.js; do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' "${URL}vendor/$v")"
  [ "$CODE" = "404" ] || ALL_RETIRED="no($v=$CODE)"
done
UNKNOWN="$(curl -s -o /dev/null -w '%{http_code}' "${URL}vendor/evil.js")"
if [ "$V_OK" = "200" ] && [ "$ALL_RETIRED" = "yes" ] && [ "$UNKNOWN" = "404" ]; then
  pass
else
  fail "vis=$V_OK retired=$ALL_RETIRED unknown=$UNKNOWN"
fi

# --- TS6b: CSP (Plan C) ------------------------------------------------------
# CSP constrains what a DOCUMENT may load, so the HTML pages are the surface
# that actually needs it. Probing only the JSON APIs, where CSP is near-inert,
# would keep this case green while every page went unprotected - which is
# exactly what happened between features 49 and 50, when the Node observer
# (whose send() applied CSP to its HTML) was retired and Next served the pages
# with no CSP at all. So both surfaces are asserted:
#   - pages  -> CSP_HEADER via apps/web/next.config.ts headers()
#   - JSON   -> the same CSP_HEADER from apps/web/lib/respond.ts
# Feature web_exp_revision retired the marketing landing and with it the
# picsum.photos img-src allowance (the old HTML_CSP_HEADER): the two
# constants collapsed back into one, so NO surface may carry picsum now.
# Two real pages are probed (/fleet and /timeline) instead of `/`, which is
# a redirect since that same feature.
start_case "HTML pages and API responses both carry Content-Security-Policy default-src 'self'"
csp_of() { curl -s -D - -o /dev/null "$1" | grep -i '^content-security-policy:'; }
CSP_TIMELINE="$(csp_of "${URL}timeline")"
CSP_FLEET="$(csp_of "${URL}fleet")"
CSP_API="$(csp_of "${URL}api/state")"
CSP_OK=yes
for header in "$CSP_TIMELINE" "$CSP_FLEET" "$CSP_API"; do
  printf '%s' "$header" | grep -qi "default-src 'self'" || CSP_OK=no
  printf '%s' "$header" | grep -qi "script-src" || CSP_OK=no
  printf '%s' "$header" | grep -qi "style-src" || CSP_OK=no
  printf '%s' "$header" | grep -qi "picsum" && CSP_OK=no
done
if [ "$CSP_OK" = "yes" ]; then
  pass
else
  fail "CSP gap: /timeline -> $(printf '%s' "$CSP_TIMELINE" | head -c 80) | /fleet -> $(printf '%s' "$CSP_FLEET" | head -c 80) | /api/state -> $(printf '%s' "$CSP_API" | head -c 80)"
fi

# --- TS6c: safe markdown render (Plan C) [RETIRED, feature ------------------
# toolbox_panel_retirement] — DOMPurify + marked now live in apps/web
# (lib/md.ts, D2): see test_web_intake_ask.sh "lib/md.ts exports the FORBID
# consts" and "marked + dompurify are declared apps/web deps".

# --- TS7: security guards ----------------------------------------------------
start_case "observer is read-only (POST 405) and refuses foreign Host headers"
C_POST="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${URL}api/state")"
C_HOST="$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: evil.example' "${URL}api/state")"
if [ "$C_POST" = "405" ] && [ "$C_HOST" = "403" ]; then
  pass
else
  fail "post=$C_POST host=$C_HOST"
fi

# --- TS7b: draft relay (POST /api/draft) -------------------------------------
# The draft relay is the sole non-GET route; it validates root against the
# registry and rejects an unregistered root with 400 before any LLM call.
start_case "POST /api/draft rejects an unregistered root with 400"
D_CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${URL}api/draft" \
  -H 'Content-Type: application/json' \
  -d '{"root":"/not/registered","prompt":"ship faster","provider":"zai"}')"
if [ "$D_CODE" = "400" ]; then
  pass
else
  fail "draft unregistered root got $D_CODE (want 400)"
fi

start_case "POST /api/draft rejects a malformed body with 400"
D_BAD="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${URL}api/draft" \
  -H 'Content-Type: application/json' \
  -d '{"root":"'"$H1"'","prompt":"ship faster"}')"
if [ "$D_BAD" = "400" ]; then
  pass
else
  fail "draft malformed body got $D_BAD (want 400)"
fi

# --- TS7b2: fleet summary relay (POST /api/summarize) -------------------------
# The summary relays the /api/state digest through the fake provider (the
# mock LLM behind OLLAMA_BASE_URL) and caches by the digest hash. The two
# summarize calls are adjacent ON PURPOSE, with no workspace mutation between
# them (TS8 mutates the workspace, which changes the hash): the second call
# must be a cache hit that never reaches the provider.
start_case "POST /api/summarize streams SSE delta + result from the fake provider"
S1="$T/sum1.out"
curl -s -X POST "${URL}api/summarize" \
  -H 'Content-Type: application/json' \
  -d '{"provider":"ollama"}' > "$S1"
awk '/^event: result/{getline; sub(/^data: /, ""); print; exit}' "$S1" > "$T/sum1.json"
SUM1="$(node "$SUITE_DIR/lib/jsonget.js" read "$T/sum1.json" 'd.summary_md' 2>/dev/null)"
CACHED1="$(node "$SUITE_DIR/lib/jsonget.js" read "$T/sum1.json" 'd.cached' 2>/dev/null)"
HASH1="$(node "$SUITE_DIR/lib/jsonget.js" read "$T/sum1.json" 'd.hash' 2>/dev/null)"
if grep -q '^event: delta' "$S1" && grep -q '^event: result' "$S1" \
  && [ "$SUM1" = "fleet summary ok" ] && [ "$CACHED1" = "False" ] && [ -n "$HASH1" ]; then
  pass
else
  fail "summarize stream wrong: cached=$CACHED1 summary=$SUM1 body=$(head -c 200 "$S1")"
fi

start_case "second identical POST /api/summarize is a cache hit (provider not called again)"
S2="$T/sum2.out"
curl -s -X POST "${URL}api/summarize" \
  -H 'Content-Type: application/json' \
  -d '{"provider":"ollama"}' > "$S2"
awk '/^event: result/{getline; sub(/^data: /, ""); print; exit}' "$S2" > "$T/sum2.json"
SUM2="$(node "$SUITE_DIR/lib/jsonget.js" read "$T/sum2.json" 'd.summary_md' 2>/dev/null)"
CACHED2="$(node "$SUITE_DIR/lib/jsonget.js" read "$T/sum2.json" 'd.cached' 2>/dev/null)"
HASH2="$(node "$SUITE_DIR/lib/jsonget.js" read "$T/sum2.json" 'd.hash' 2>/dev/null)"
curl -s "http://127.0.0.1:$MOCK_PORT/v1/calls" > "$T/calls.json"
CALLS="$(node "$SUITE_DIR/lib/jsonget.js" read "$T/calls.json" 'd.calls' 2>/dev/null)"
if [ "$CACHED2" = "True" ] && [ "$SUM2" = "fleet summary ok" ] \
  && [ "$HASH2" = "$HASH1" ] && [ "$CALLS" = "1" ]; then
  pass
else
  fail "cache hit wrong: cached=$CACHED2 summary=$SUM2 hash_match=$([ "$HASH2" = "$HASH1" ] && echo y) calls=$CALLS"
fi

start_case "POST /api/summarize rejects an unknown provider with 400"
S_CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${URL}api/summarize" \
  -H 'Content-Type: application/json' \
  -d '{"provider":"nope"}')"
if [ "$S_CODE" = "400" ]; then
  pass
else
  fail "summarize unknown provider got $S_CODE (want 400)"
fi

# [RETIRED, feature toolbox_panel_retirement] panel asset fleet Summarize
# control -> apps/web: test_web_intake_ask.sh "fleet summary files exist",
# "FleetSummaryClient is mounted on /fleet" and "FleetSummaryClient POSTs
# /api/summarize and surfaces (cached) + model from result".

# --- TS7b3: grounded fleet Q&A relay (POST /api/ask) -------------------------
# /api/ask retrieves the BM25 top-k fragments of the target harness corpus
# (reusing buildCorpus server-side) and relays the provider's cited answer
# over SSE; no disk writes, no cache. The mock LLM routes on the
# "---- user question" prompt marker (composeAskPrompt) and replies with a
# citation bound to a fixture backlog doc. These cases run AFTER the two
# summarize calls on purpose: the mock call counter is shared, and the
# summarize cache-hit assertion (calls=1) must have already been made.
start_case "POST /api/ask streams SSE delta + result with citation and top-k fragments"
A1="$T/ask1.out"
curl -s -X POST "${URL}api/ask" \
  -H 'Content-Type: application/json' \
  -d '{"root":"'"$H1"'","question":"which feature is done?","provider":"ollama"}' > "$A1"
awk '/^event: result/{getline; sub(/^data: /, ""); print; exit}' "$A1" > "$T/ask1.json"
ANS="$(node "$SUITE_DIR/lib/jsonget.js" read "$T/ask1.json" 'd.answer_md' 2>/dev/null)"
FRAGS="$(node "$SUITE_DIR/lib/jsonget.js" read "$T/ask1.json" 'd.fragments.length' 2>/dev/null)"
SHAPE="$(node "$SUITE_DIR/lib/jsonget.js" read "$T/ask1.json" 'd.fragments.length > 0 && d.fragments.every(f => typeof f.ref === "string" && typeof f.kind === "string" && typeof f.title === "string" && typeof f.score === "number")' 2>/dev/null)"
HIT="$(node "$SUITE_DIR/lib/jsonget.js" read "$T/ask1.json" 'd.fragments.some(f => f.ref === "feature:alpha")' 2>/dev/null)"
if grep -q '^event: delta' "$A1" && grep -q '^event: result' "$A1" \
  && printf '%s' "$ANS" | grep -qF '[fuente: backlog:impl_alpha.md]' \
  && [ "$SHAPE" = "True" ] && [ "$HIT" = "True" ]; then
  pass
else
  fail "ask stream wrong: frags=$FRAGS shape=$SHAPE hit=$HIT ans=$ANS body=$(head -c 200 "$A1")"
fi

start_case "POST /api/ask rejects an unregistered root with 400"
A_ROOT="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${URL}api/ask" \
  -H 'Content-Type: application/json' \
  -d '{"root":"/not/registered","question":"anything?","provider":"ollama"}')"
if [ "$A_ROOT" = "400" ]; then
  pass
else
  fail "ask unregistered root got $A_ROOT (want 400)"
fi

start_case "POST /api/ask rejects an empty or missing question with 400"
A_EMPTY="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${URL}api/ask" \
  -H 'Content-Type: application/json' \
  -d '{"root":"'"$H1"'","question":"   ","provider":"ollama"}')"
A_MISS="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${URL}api/ask" \
  -H 'Content-Type: application/json' \
  -d '{"root":"'"$H1"'","provider":"ollama"}')"
if [ "$A_EMPTY" = "400" ] && [ "$A_MISS" = "400" ]; then
  pass
else
  fail "ask empty=$A_EMPTY missing=$A_MISS (want 400/400)"
fi

# --- TS7b4: backlog triage relay (POST /api/triage, feature 32) ---------------
# /api/triage classifies the target harness's backlog/*.md through the cheap
# model and returns that report alongside the SERVER-COMPUTED evidence debt
# (features done with no review_<name>.md). The mock routes on the
# "Documentos del backlog" prompt marker (composeTriagePrompt) and answers
# with a FENCED json report, so this also pins that parseTriageReport survives
# the code block. No disk writes, no cache. Runs after the summarize cache
# assertion for the same reason the ask cases do: the mock counter is shared.
# The fixture harness has no done-without-review feature on purpose (that
# computation is unit-tested in tests/test_toolbox_triage.js), so here the
# contract asserted is that evidence_debt ships as an array on every reply.
start_case "POST /api/triage streams SSE delta + result with a parsed report and evidence_debt"
G1="$T/triage1.out"
curl -s -X POST "${URL}api/triage" \
  -H 'Content-Type: application/json' \
  -d '{"root":"'"$H1"'","provider":"ollama"}' > "$G1"
awk '/^event: result/{getline; sub(/^data: /, ""); print; exit}' "$G1" > "$T/triage1.json"
REP="$(node "$SUITE_DIR/lib/jsonget.js" read "$T/triage1.json" 'd.report.length > 0 && d.report.every(r => typeof r.id === "string" && typeof r.categoria === "string" && typeof r.confianza === "number")' 2>/dev/null)"
DEBT="$(node "$SUITE_DIR/lib/jsonget.js" read "$T/triage1.json" 'Array.isArray(d.evidence_debt)' 2>/dev/null)"
SEEN="$(node "$SUITE_DIR/lib/jsonget.js" read "$T/triage1.json" 'd.report.some(r => r.id === "impl_alpha.md")' 2>/dev/null)"
if grep -q '^event: delta' "$G1" && grep -q '^event: result' "$G1" \
  && [ "$REP" = "True" ] && [ "$DEBT" = "True" ] && [ "$SEEN" = "True" ]; then
  pass
else
  fail "triage stream wrong: report=$REP debt=$DEBT seen=$SEEN body=$(head -c 200 "$G1")"
fi

start_case "POST /api/triage rejects an unregistered root with 400"
G_ROOT="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${URL}api/triage" \
  -H 'Content-Type: application/json' \
  -d '{"root":"/not/registered","provider":"ollama"}')"
G_MISS="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${URL}api/triage" \
  -H 'Content-Type: application/json' \
  -d '{"provider":"ollama"}')"
if [ "$G_ROOT" = "400" ] && [ "$G_MISS" = "400" ]; then
  pass
else
  fail "triage unregistered=$G_ROOT missing-root=$G_MISS (want 400/400)"
fi

start_case "POST /api/triage rejects an unknown provider with 400"
G_PROV="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${URL}api/triage" \
  -H 'Content-Type: application/json' \
  -d '{"root":"'"$H1"'","provider":"nope"}')"
if [ "$G_PROV" = "400" ]; then
  pass
else
  fail "triage unknown provider got $G_PROV (want 400)"
fi

# --- TS7b5: review-notes relay (POST /api/review-notes, feature 34) -----------
# Seeds the reviewer with a checklist built from backlog/impl_<feature>.md plus
# the working diff. The fixture harness is NOT a git repo, which is deliberate
# here: it exercises the documented degradation (readFeatureDiff -> empty diff,
# never a throw) end to end, so a checklist still comes back from the impl
# report alone. The mock routes on the "Feature bajo revision" marker and
# answers with questions carrying no verdict token.
start_case "POST /api/review-notes streams a checklist with no verdict"
N1="$T/notes1.out"
curl -s -X POST "${URL}api/review-notes" \
  -H 'Content-Type: application/json' \
  -d '{"root":"'"$H1"'","feature":"alpha","provider":"ollama"}' > "$N1"
awk '/^event: result/{getline; sub(/^data: /, ""); print; exit}' "$N1" > "$T/notes1.json"
CL="$(node "$SUITE_DIR/lib/jsonget.js" read "$T/notes1.json" 'd.checklist_md' 2>/dev/null)"
TRUNC="$(node "$SUITE_DIR/lib/jsonget.js" read "$T/notes1.json" 'd.diff_truncated === false' 2>/dev/null)"
if grep -q '^event: delta' "$N1" && grep -q '^event: result' "$N1" \
  && printf '%s' "$CL" | grep -q 'invariante' \
  && ! printf '%s' "$CL" | grep -qE 'APPROVED|CHANGES_REQUESTED' \
  && [ "$TRUNC" = "True" ]; then
  pass
else
  fail "review-notes stream wrong: trunc=$TRUNC checklist=$CL body=$(head -c 200 "$N1")"
fi

start_case "POST /api/review-notes rejects a missing or malformed feature with 400"
N_MISS="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${URL}api/review-notes" \
  -H 'Content-Type: application/json' \
  -d '{"root":"'"$H1"'","provider":"ollama"}')"
N_BAD="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${URL}api/review-notes" \
  -H 'Content-Type: application/json' \
  -d '{"root":"'"$H1"'","feature":"../../etc/passwd","provider":"ollama"}')"
if [ "$N_MISS" = "400" ] && [ "$N_BAD" = "400" ]; then
  pass
else
  fail "review-notes missing=$N_MISS traversal=$N_BAD (want 400/400)"
fi

start_case "POST /api/review-notes rejects an unregistered root with 400"
N_ROOT="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${URL}api/review-notes" \
  -H 'Content-Type: application/json' \
  -d '{"root":"/not/registered","feature":"alpha","provider":"ollama"}')"
if [ "$N_ROOT" = "400" ]; then
  pass
else
  fail "review-notes unregistered root got $N_ROOT (want 400)"
fi

# --- TS7b6: acceptance relay (POST /api/acceptance, feature 33) ---------------
# Drafts observable acceptance from the working diff or a pasted spec. The mock
# answers with bullets ending in the green gate, so this pins the server-side
# gate_last check end to end (the model is reported, never censored).
start_case "POST /api/acceptance (source=spec) streams bullets and reports gate_last"
C1="$T/acc1.out"
curl -s -X POST "${URL}api/acceptance" \
  -H 'Content-Type: application/json' \
  -d '{"root":"'"$H1"'","source":"spec","spec":"quiero un endpoint nuevo","provider":"ollama"}' > "$C1"
awk '/^event: result/{getline; sub(/^data: /, ""); print; exit}' "$C1" > "$T/acc1.json"
AMD="$(node "$SUITE_DIR/lib/jsonget.js" read "$T/acc1.json" 'd.acceptance_md' 2>/dev/null)"
GATE_OK="$(node "$SUITE_DIR/lib/jsonget.js" read "$T/acc1.json" 'd.gate_last === true' 2>/dev/null)"
SRC="$(node "$SUITE_DIR/lib/jsonget.js" read "$T/acc1.json" 'd.source' 2>/dev/null)"
if grep -q '^event: delta' "$C1" && grep -q '^event: result' "$C1" \
  && printf '%s' "$AMD" | grep -q 'responde 400' \
  && [ "$GATE_OK" = "True" ] && [ "$SRC" = "spec" ]; then
  pass
else
  fail "acceptance spec stream wrong: gate=$GATE_OK src=$SRC md=$AMD body=$(head -c 200 "$C1")"
fi

start_case "POST /api/acceptance (source=diff) works without a spec field"
C2="$T/acc2.out"
curl -s -X POST "${URL}api/acceptance" \
  -H 'Content-Type: application/json' \
  -d '{"root":"'"$H1"'","source":"diff","provider":"ollama"}' > "$C2"
awk '/^event: result/{getline; sub(/^data: /, ""); print; exit}' "$C2" > "$T/acc2.json"
SRC2="$(node "$SUITE_DIR/lib/jsonget.js" read "$T/acc2.json" 'd.source' 2>/dev/null)"
TR2="$(node "$SUITE_DIR/lib/jsonget.js" read "$T/acc2.json" 'd.diff_truncated === false' 2>/dev/null)"
if grep -q '^event: result' "$C2" && [ "$SRC2" = "diff" ] && [ "$TR2" = "True" ]; then
  pass
else
  fail "acceptance diff stream wrong: src=$SRC2 trunc=$TR2 body=$(head -c 200 "$C2")"
fi

start_case "POST /api/acceptance rejects a bad source and a spec-mode empty spec with 400"
C_SRC="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${URL}api/acceptance" \
  -H 'Content-Type: application/json' \
  -d '{"root":"'"$H1"'","source":"nope","provider":"ollama"}')"
C_SPEC="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${URL}api/acceptance" \
  -H 'Content-Type: application/json' \
  -d '{"root":"'"$H1"'","source":"spec","spec":"   ","provider":"ollama"}')"
if [ "$C_SRC" = "400" ] && [ "$C_SPEC" = "400" ]; then
  pass
else
  fail "acceptance bad-source=$C_SRC empty-spec=$C_SPEC (want 400/400)"
fi

# --- TS7b7: retro relay (POST /api/retro, feature 35) -------------------------
# Mines history + the backlog of closed features for recurring patterns. The
# mock answers with TWO patterns, one of them backed by a single feature, so
# this pins end to end that the anti-generalisation bar is enforced by the
# SERVER (one survives, one lands in `discarded`) and not merely requested in
# the prompt. Suggestions only: docs/conventions.md is never written.
start_case "POST /api/retro streams patterns and drops the one-feature anecdote"
R1="$T/retro1.out"
curl -s -X POST "${URL}api/retro" \
  -H 'Content-Type: application/json' \
  -d '{"root":"'"$H1"'","provider":"ollama"}' > "$R1"
awk '/^event: result/{getline; sub(/^data: /, ""); print; exit}' "$R1" > "$T/retro1.json"
PN="$(node "$SUITE_DIR/lib/jsonget.js" read "$T/retro1.json" 'd.patterns.length' 2>/dev/null)"
PEV="$(node "$SUITE_DIR/lib/jsonget.js" read "$T/retro1.json" 'd.patterns.every(p => Array.isArray(p.features) && p.features.length >= 2 && typeof p.titulo === "string")' 2>/dev/null)"
PDIS="$(node "$SUITE_DIR/lib/jsonget.js" read "$T/retro1.json" 'd.discarded' 2>/dev/null)"
if grep -q '^event: delta' "$R1" && grep -q '^event: result' "$R1" \
  && [ "$PN" = "1" ] && [ "$PEV" = "True" ] && [ "$PDIS" = "1" ]; then
  pass
else
  fail "retro stream wrong: n=$PN evidence=$PEV discarded=$PDIS body=$(head -c 200 "$R1")"
fi

start_case "POST /api/retro rejects an unregistered root and an unknown provider with 400"
R_ROOT="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${URL}api/retro" \
  -H 'Content-Type: application/json' \
  -d '{"root":"/not/registered","provider":"ollama"}')"
R_PROV="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${URL}api/retro" \
  -H 'Content-Type: application/json' \
  -d '{"root":"'"$H1"'","provider":"nope"}')"
if [ "$R_ROOT" = "400" ] && [ "$R_PROV" = "400" ]; then
  pass
else
  fail "retro unregistered=$R_ROOT unknown-provider=$R_PROV (want 400/400)"
fi

# The whole tanda (32-35) must leave docs/conventions.md untouched: the retro
# output is a suggestion a human promotes, never a write.
start_case "no LLM relay wrote into the fixture workspace docs"
if [ ! -f "$ws/docs/conventions.md" ]; then
  pass
else
  fail "a relay created docs/conventions.md in the fixture: the layer must stay read-only"
fi

# [RETIRED, feature toolbox_panel_retirement] panel asset #/ask view ->
# apps/web: test_web_intake_ask.sh "ask view files exist" and "AskClient
# POSTs /api/ask, calls linkCitations+renderSanitized, delegates #cite= to
# MdDialog via /api/md".

# --- TS7c: intake view (Plan A panel) [RETIRED, feature ----------------------
# toolbox_panel_retirement] — the whole intake panel surface (route, SSE-over-
# POST client, provider/harness selectors, sanitized render, clipboard,
# assertive announce) moved to apps/web. Pointers:
#   - route / nav / palette action           -> test_web_intake_ask.sh "intake view files exist"
#   - posts to /api/draft + SSE parsing       -> test_web_relays.sh (draft route) + test_web_intake.sh
#   - fetches /api/providers + /api/state     -> test_web_intake_ask.sh "IntakeClient wires submitIntake, /api/providers + /api/files + /api/draft"
#   - renders draft sanitized + editable      -> test_web_intake_ask.sh "renderIntakePreviewHtml" + "renderSanitized"
#   - clipboard copy + fallback               -> apps/web IntakeClient (structural; cero-deps patron D1)
#   - assertive announce on provider error    -> test_web_timeline_search.sh "announce merges queued polite messages"

# --- TS7d: intake enhancements (file tags + direct submission) ---------------
# GET /api/files lists taggable workspace files (relative paths) inside a
# REGISTERED root, skipping junk dirs and non-text files; POST /api/intake is
# the direct-submit route that persists the reviewed draft to the harness's
# feature-request.md, rejecting invalid/empty payloads with 4xx.
start_case "GET /api/files lists taggable workspace files (relative paths)"
curl -s "${URL}api/files?root=$H1" > "$T/files.json"
FILES_COUNT="$(node "$SUITE_DIR/lib/jsonget.js" read "$T/files.json" 'd.files.length')"
HAS_CLI="$(node "$SUITE_DIR/lib/jsonget.js" read "$T/files.json" 'd.files.some(f=>f.path==="src/cli.ts")')"
HAS_MD="$(node "$SUITE_DIR/lib/jsonget.js" read "$T/files.json" 'd.files.some(f=>f.path==="CHECKPOINTS.md")')"
NO_BIN="$(node "$SUITE_DIR/lib/jsonget.js" read "$T/files.json" 'd.files.every(f=>!f.path.endsWith(".bin"))')"
if [ "$FILES_COUNT" != "None" ] && [ "$HAS_CLI" = "True" ] && [ "$HAS_MD" = "True" ] && [ "$NO_BIN" = "True" ]; then
  pass
else
  fail "files listing wrong: count=$FILES_COUNT cli=$HAS_CLI md=$HAS_MD no-bin=$NO_BIN"
fi

start_case "GET /api/files rejects an unregistered root with 400"
F_CODE="$(curl -s -o /dev/null -w '%{http_code}' "${URL}api/files?root=/not/registered")"
if [ "$F_CODE" = "400" ]; then
  pass
else
  fail "files unregistered root got $F_CODE (want 400)"
fi

start_case "POST /api/intake rejects an empty draft_md with 4xx"
I_EMPTY="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${URL}api/intake" \
  -H 'Content-Type: application/json' \
  -d '{"root":"'"$H1"'","draft_md":""}')"
if [ "$I_EMPTY" = "422" ]; then
  pass
else
  fail "intake empty draft got $I_EMPTY (want 422)"
fi

start_case "POST /api/intake rejects a malformed body with 400"
I_BAD="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${URL}api/intake" \
  -H 'Content-Type: application/json' \
  -d 'not-json-at-all')"
if [ "$I_BAD" = "400" ]; then
  pass
else
  fail "intake malformed body got $I_BAD (want 400)"
fi

start_case "POST /api/intake rejects an unregistered root with 400"
I_ROOT="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${URL}api/intake" \
  -H 'Content-Type: application/json' \
  -d '{"root":"/not/registered","draft_md":"## Feature"}')"
if [ "$I_ROOT" = "400" ]; then
  pass
else
  fail "intake unregistered root got $I_ROOT (want 400)"
fi

start_case "POST /api/intake writes feature-request.md on a valid payload"
curl -s -X POST "${URL}api/intake" \
  -H 'Content-Type: application/json' \
  -d '{"root":"'"$H1"'","draft_md":"## Feature\n- name: thing","files":["src/cli.ts"]}' > "$T/intake.json"
I_OK="$(node "$SUITE_DIR/lib/jsonget.js" read "$T/intake.json" 'd.ok')"
I_PROC="$(node "$SUITE_DIR/lib/jsonget.js" read "$T/intake.json" 'd.spawned_process')"
if [ "$I_OK" = "True" ] && [ "$I_PROC" = "False" ] && [ -f "$ws/feature-request.md" ] \
  && grep -q 'name: thing' "$ws/feature-request.md" \
  && grep -q 'intake context files: src/cli.ts' "$ws/feature-request.md"; then
  pass
else
  fail "intake write failed: ok=$I_OK proc=$I_PROC file-exists=$([ -f "$ws/feature-request.md" ] && echo y)"
fi

# [RETIRED, feature toolbox_panel_retirement] file-tag picker + direct Submit
# + submit notifications -> apps/web: test_web_intake.sh "submitIntake server
# action" and test_web_intake_ask.sh "IntakeClient wires submitIntake";
# announce -> test_web_timeline_search.sh "announce".

# --- TS8: SSE live change ----------------------------------------------------
start_case "SSE emits a change event when the workspace mutates"
SSE_OUT="$T/sse.out"
curl -s -N --max-time 5 "${URL}events" > "$SSE_OUT" 2>/dev/null &
SSE_PID=$!
sleep 0.6
printf '\n' >> "$ws/progress/current.md"
wait "$SSE_PID" 2>/dev/null
if grep -q '"type":"change"' "$SSE_OUT"; then
  pass
else
  fail "no change event: $(cat "$SSE_OUT")"
fi

summary

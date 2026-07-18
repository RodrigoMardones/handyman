#!/usr/bin/env bash
# toolBox observer tests: boots dist/toolbox_serve.js on an ephemeral port
# against a temporary HANDYMAN_ROOT fixture (the real $HOME/HANDYMAN is never
# touched) and exercises the read-only HTTP surface: panel, state, markdown
# allowlist, corpus, graph passthrough, vendor libs, SSE and the security
# guards (GET-only, Host check), plus the POST /api/draft intake relay (the
# sole non-GET route; text only, writes no disk).
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
TOOLBOX="$SUITE_DIR/../handyman/dist/toolbox.js"
SERVE="$SUITE_DIR/../handyman/dist/toolbox_serve.js"
PANEL="$SUITE_DIR/../handyman/assets/toolbox_panel.js"

echo "toolBox observer suite (test_toolbox_serve.sh)"

# --- fixture -----------------------------------------------------------------
T="$(mktemp -d)"; FR="$T/toolboxroot"; H1="$T/proj1"
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

# --- boot one server for the whole suite -------------------------------------
SERVER_OUT="$T/server.out"
HANDYMAN_ROOT="$FR" node "$SERVE" --port 0 > "$SERVER_OUT" 2>&1 &
SERVER_PID=$!
URL=""
for _ in $(seq 1 50); do
  URL="$(sed -n 's/^toolBox observer: //p' "$SERVER_OUT" | tr -d '[:space:]')"
  [ -n "$URL" ] && break
  sleep 0.1
done
cleanup() {
  kill "$SERVER_PID" >/dev/null 2>&1
  wait "$SERVER_PID" 2>/dev/null
  rm -rf "$T"
}
trap cleanup EXIT

start_case "serve boots on an ephemeral port and prints the URL"
if [ -n "$URL" ]; then
  pass
else
  fail "no URL in server output: $(cat "$SERVER_OUT")"
fi

# --- TS1: panel --------------------------------------------------------------
start_case "GET / returns the React panel with root div and the six vendor scripts"
BODY="$(curl -s "$URL")"
if printf '%s' "$BODY" | grep -q 'id="root"' \
  && printf '%s' "$BODY" | grep -q '/vendor/react.js' \
  && printf '%s' "$BODY" | grep -q '/vendor/react-dom.js' \
  && printf '%s' "$BODY" | grep -q '/vendor/htm.js' \
  && printf '%s' "$BODY" | grep -q '/vendor/minisearch.js' \
  && printf '%s' "$BODY" | grep -q '/vendor/marked.js' \
  && printf '%s' "$BODY" | grep -q '/vendor/dompurify.js' \
  && ! printf '%s' "$BODY" | grep -qE 'src="https?://'; then
  pass
else
  fail "panel body missing pieces: $(printf '%s' "$BODY" | head -3)"
fi

start_case "panel asset is valid JS (node --check)"
if node --check "$PANEL" >/dev/null 2>&1; then
  pass
else
  fail "node --check rejected assets/toolbox_panel.js"
fi

start_case "panel asset ships the sparkline (accessible polyline) and fmt helpers"
if grep -q '<polyline' "$PANEL" \
  && grep -q 'role="img"' "$PANEL" \
  && grep -q 'aria-label' "$PANEL" \
  && grep -q 'const fmt = {' "$PANEL"; then
  pass
else
  fail "panel asset missing sparkline/fmt markers"
fi

# --- TS1b: theme toggle (Plan B) ---------------------------------------------
start_case "panel <head> ships the synchronous anti-flash theme script"
# Positional on purpose: the inlined panel asset in <body> also mentions
# hw-theme:1, so a bare grep would pass without the head script. The first
# hw-theme:1 line must come strictly BEFORE the first <style> line — only
# the anti-flash <head> script can satisfy that.
THEME_LINE="$(printf '%s\n' "$BODY" | grep -n 'hw-theme:1' | head -1 | cut -d: -f1)"
STYLE_LINE="$(printf '%s\n' "$BODY" | grep -n '<style>' | head -1 | cut -d: -f1)"
if [ -n "$THEME_LINE" ] && [ -n "$STYLE_LINE" ] && [ "$THEME_LINE" -lt "$STYLE_LINE" ]; then
  pass
else
  fail "anti-flash script not before <style> in /: theme=${THEME_LINE:-none} style=${STYLE_LINE:-none}"
fi

start_case "panel asset ships the 3-state theme control (aria-pressed, system mode)"
if grep -q 'hw-theme:1' "$PANEL" \
  && grep -q 'aria-pressed' "$PANEL" \
  && grep -q 'prefers-color-scheme: dark' "$PANEL" \
  && grep -q 'removeItem' "$PANEL"; then
  pass
else
  fail "panel asset missing theme toggle markers"
fi

# --- TS1c: a11y live regions (Plan D) ----------------------------------------
start_case "panel ships exactly two static live regions, empty, before #root"
# Positional + exhaustive: both regions must be static HTML BEFORE the root
# div (present and empty from the first byte, outside the React tree), the
# polite one as role=status aria-live=polite, the assertive one as
# role=alert with NO aria-live attribute (the explicit combo double-announces
# on VoiceOver/iOS), and no other aria-live surface may exist anywhere in
# the served page (inlined panel asset included).
POLITE_LINE="$(printf '%s\n' "$BODY" | grep -n 'id="live-polite" class="visually-hidden" role="status" aria-live="polite"></div>' | head -1 | cut -d: -f1)"
ALERT_LINE="$(printf '%s\n' "$BODY" | grep -n 'id="live-assertive" class="visually-hidden" role="alert"></div>' | head -1 | cut -d: -f1)"
ROOT_LINE="$(printf '%s\n' "$BODY" | grep -n 'id="root"' | head -1 | cut -d: -f1)"
LIVE_COUNT="$(printf '%s' "$BODY" | grep -o 'aria-live' | wc -l | tr -d ' ')"
if [ -n "$POLITE_LINE" ] && [ -n "$ALERT_LINE" ] && [ -n "$ROOT_LINE" ] \
  && [ "$POLITE_LINE" -lt "$ROOT_LINE" ] && [ "$ALERT_LINE" -lt "$ROOT_LINE" ] \
  && [ "$LIVE_COUNT" = "1" ] \
  && ! printf '%s' "$BODY" | grep -q 'aria-live="assertive"'; then
  pass
else
  fail "live regions wrong: polite=${POLITE_LINE:-none} alert=${ALERT_LINE:-none} root=${ROOT_LINE:-none} aria_live_count=$LIVE_COUNT"
fi

start_case "served panel carries the prefers-reduced-motion guard"
if printf '%s' "$BODY" | grep -q 'prefers-reduced-motion: reduce'; then
  pass
else
  fail "no prefers-reduced-motion guard in served CSS"
fi

start_case "panel asset queues SSE summaries and announces connection changes"
if grep -q 'ANNOUNCE_DEBOUNCE_MS' "$PANEL" \
  && grep -q 'diffSummary' "$PANEL" \
  && grep -q 'live-polite' "$PANEL" \
  && grep -q 'live-assertive' "$PANEL" \
  && grep -q 'feature(s) updated in' "$PANEL" \
  && grep -q 'live updates disconnected' "$PANEL" \
  && grep -q 'live updates reconnected' "$PANEL" \
  && grep -q 'is-down' "$PANEL"; then
  pass
else
  fail "panel asset missing announcer markers"
fi

start_case "empty states are actionable hints, not bare dashes"
if grep -q 'register one with' "$PANEL" \
  && grep -q 'add one with' "$PANEL" \
  && grep -q 'close a feature' "$PANEL" \
  && grep -q 'try a shorter term' "$PANEL"; then
  pass
else
  fail "panel asset missing actionable empty-state hints"
fi

# --- TS1d: command palette + shortcuts (Plan E) --------------------------------
start_case "served panel ships the command palette dialog (⌘K, MiniSearch-ranked)"
# The palette dialog is rendered by the inlined panel asset, so the served
# page must carry its markup markers: the dialog class, the palette input id
# (the keydown listener's target guard), showModal usage and the ⌘K/Ctrl+K
# handling (metaKey), plus the MiniSearch ranking path.
if printf '%s' "$BODY" | grep -q 'class="palette"' \
  && printf '%s' "$BODY" | grep -q 'palette-input' \
  && printf '%s' "$BODY" | grep -q 'metaKey' \
  && printf '%s' "$BODY" | grep -q 'rankActions'; then
  pass
else
  fail "served panel missing palette markers"
fi

start_case "shortcuts ride a single document keydown listener with a field guard"
KD_COUNT="$(grep -c 'addEventListener("keydown"' "$PANEL" | tr -d ' ')"
if [ "$KD_COUNT" = "1" ] \
  && grep -q 'isContentEditable' "$PANEL" \
  && grep -q 'showModal' "$PANEL" \
  && grep -q 'global-search' "$PANEL" \
  && grep -q 'gArmedRef' "$PANEL" \
  && grep -q 'SHORTCUTS_HELP' "$PANEL"; then
  pass
else
  fail "keydown listeners=$KD_COUNT or missing guard/shortcut markers"
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
start_case "vendor libs (react, react-dom, htm, minisearch, marked, dompurify) serve from node_modules"
ALL_OK=yes
for v in react.js react-dom.js htm.js minisearch.js marked.js dompurify.js; do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' "${URL}vendor/$v")"
  [ "$CODE" = "200" ] || ALL_OK="no($v=$CODE)"
done
UNKNOWN="$(curl -s -o /dev/null -w '%{http_code}' "${URL}vendor/evil.js")"
if [ "$ALL_OK" = "yes" ] && [ "$UNKNOWN" = "404" ]; then
  pass
else
  fail "vendors=$ALL_OK unknown=$UNKNOWN"
fi

# --- TS6b: CSP (Plan C) ------------------------------------------------------
start_case "server responses carry Content-Security-Policy default-src 'self'"
CSP="$(curl -s -D - -o /dev/null "${URL}" | grep -i '^content-security-policy:' )"
if printf '%s' "$CSP" | grep -qi "default-src 'self'" \
  && printf '%s' "$CSP" | grep -qi "script-src" \
  && printf '%s' "$CSP" | grep -qi "style-src"; then
  pass
else
  fail "CSP missing/default-src absent: $(printf '%s' "$CSP" | head -c 200)"
fi

# --- TS6c: safe markdown render (Plan C) -------------------------------------
start_case "panel asset renders sanitized markdown (DOMPurify + FORBID_TAGS + marked)"
if grep -q 'DOMPurify.sanitize' "$PANEL" \
  && grep -q 'FORBID_TAGS' "$PANEL" \
  && grep -qi 'script' "$PANEL" \
  && grep -qi 'iframe' "$PANEL" \
  && grep -q 'marked.parse' "$PANEL" \
  && grep -q 'dangerouslySetInnerHTML' "$PANEL" \
  && grep -q 'javascript' "$PANEL"; then
  pass
else
  fail "panel asset missing safe-markdown markers (DOMPurify/FORBID_TAGS/marked/dangerouslySetInnerHTML/javascript-block)"
fi

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

# --- TS7c: intake view (Plan A panel) ----------------------------------------
# The intake view is browser JS; like the other panel assertions these are
# structural (the asset is the contract): the route, the SSE-over-POST client,
# the sanitized render + editable draft, the clipboard fallback, and the
# assertive announcement on a provider error.
start_case "panel asset ships the #/intake route, nav link and palette action"
if grep -q '#/intake' "$PANEL" \
  && grep -q 'href="#/intake"' "$PANEL" \
  && grep -q 'view_intake' "$PANEL"; then
  pass
else
  fail "intake route/nav/palette missing in panel asset"
fi

start_case "panel intake posts to /api/draft and parses the SSE stream"
if grep -q '"/api/draft"' "$PANEL" \
  && grep -q 'method: "POST"' "$PANEL" \
  && grep -q 'parseSseFrame' "$PANEL" \
  && grep -q 'getReader' "$PANEL" \
  && grep -q '"event:"' "$PANEL"; then
  pass
else
  fail "intake SSE-over-POST client missing markers"
fi

start_case "panel intake fetches /api/providers and /api/state for the selectors"
if grep -q '"/api/providers"' "$PANEL" \
  && grep -q 'p.available' "$PANEL" \
  && grep -q 'IntakeView' "$PANEL"; then
  pass
else
  fail "intake provider/harness selectors missing"
fi

start_case "panel intake renders the draft sanitized and keeps it editable"
if grep -q 'renderMd(draftMd)' "$PANEL" \
  && grep -q 'dangerouslySetInnerHTML' "$PANEL" \
  && grep -q 'DOMPurify' "$PANEL"; then
  pass
else
  fail "intake sanitized render missing"
fi

start_case "panel intake copy button uses the clipboard API with a fallback"
if grep -q 'copyToClipboard' "$PANEL" \
  && grep -q 'navigator.clipboard' "$PANEL" \
  && grep -q 'execCommand("copy")' "$PANEL"; then
  pass
else
  fail "intake clipboard copy/fallback missing"
fi

start_case "panel intake announces a provider error in the assertive region"
if grep -q 'announce.assertive' "$PANEL" \
  && grep -q 'draft failed' "$PANEL"; then
  pass
else
  fail "intake error -> assertive announcement missing"
fi

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

start_case "panel asset ships the file-tag picker and the direct Submit action"
if grep -q 'tag-picker' "$PANEL" \
  && grep -q 'toggleTag' "$PANEL" \
  && grep -q 'selectedTags' "$PANEL" \
  && grep -q '/api/files' "$PANEL" \
  && grep -q 'submitIntake' "$PANEL" \
  && grep -q '>Submit<' "$PANEL"; then
  pass
else
  fail "intake tag picker / submit markers missing in panel asset"
fi

start_case "panel intake announces submit success/failure in the live regions"
if grep -q 'intake submitted to harness' "$PANEL" \
  && grep -q 'submission failed' "$PANEL"; then
  pass
else
  fail "intake submit notifications missing in panel asset"
fi

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

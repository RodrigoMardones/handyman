#!/usr/bin/env bash
# apps/web /api/run + RunPanel tests (feature 70, panel_agent_runner; engines,
# sanitized child env, run history and mode continue added in feature 72,
# runner_observer).
#
# The runner is the panel's first process-spawning surface, so this suite
# never launches a real agent: TOOLBOX_RUNNER_CMD points at a fixture script
# that echoes its argv into the run log (proving the server-side prompt and
# the --dangerously-skip-permissions argv reach the child) and sleeps only
# when asked to (the `delta` feature), so stop/concurrency are testable.
# TOOLBOX_RUNNER_CMD never points at the real Z.ai API either: engine=glm
# only changes which env vars the (fixture) child receives, never a network
# call, so this suite never touches the network.
#
# Three boots on purpose, because the opt-in and the engine env are read per
# request from the server's own environment and a booted process cannot
# change either:
#   boot A: TOOLBOX_RUNNER=0 -> the disabled path: GET reports disabled,
#           POST is a guaranteed 403 before any other guard. Forced to "0"
#           explicitly (not merely unset) because Next auto-loads
#           apps/web/.env into the standalone, and an operator's opt-in
#           there would leak into the suite; a real environment variable
#           wins over .env, so =0 pins the != "1" path deterministically.
#           Z_AI_API_KEY is likewise pinned explicitly on every boot (see
#           boot_server()) for the same reason: apps/web/.env carries a real
#           key for interactive use.
#   boot B: TOOLBOX_RUNNER=1 + TOOLBOX_RUNNER_CMD=argv-fixture -> guards,
#           engines list, unknown/unavailable engine 422s, the full lifecycle
#           (launch, exit 0, log on disk, 409, SIGTERM stop), runs history,
#           and mode continue (guards + resume prompt in argv).
#   boot C: TOOLBOX_RUNNER=1 + TOOLBOX_RUNNER_CMD=env-dumping fixture +
#           Z_AI_API_KEY set -> glm becomes available, and the fixture dumps
#           its full env so the suite can assert the child got a sanitized
#           base (no NODE_ENV/NEXT_*/__NEXT_*) plus the right engine vars.
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
SERVE="$SUITE_DIR/../handyman/dist/toolbox.js"

echo "apps/web runner suite (test_web_run.sh)"

# --- fixture -----------------------------------------------------------------
T="$(mktemp -d)"
FR="$T/toolboxroot"
H1="$T/proj1"
ws="$H1/.handyman"
mkdir -p "$ws/progress" "$ws/backlog" "$ws/docs"
printf '{"install_mode":"local","project_name":"proj1","project_root":".","harness_workspace":".handyman","harness_version":"1.0.0"}\n' \
  > "$H1/harness.config.json"
printf '{"project":"proj1","features":[
  {"id":1,"name":"alpha","title":"Alpha feature","status":"done"},
  {"id":2,"name":"beta","title":"Beta feature","status":"pending"},
  {"id":3,"name":"delta","title":"Delta feature","status":"pending"},
  {"id":4,"name":"epsilon","title":"Epsilon feature","status":"in_progress"}
]}\n' > "$ws/feature_list.json"
printf -- '---\nfeature: none\nstatus: idle\nrole: leader\nupdated: 2026-07-20\ntags: [x]\n---\n# Current\n' \
  > "$ws/progress/current.md"
HANDYMAN_ROOT="$FR" node "$SERVE" register "$H1" --date 2026-07-20 >/dev/null 2>&1

FAKE="$T/fakerunner.sh"
cat > "$FAKE" <<'FAKEEOF'
#!/usr/bin/env bash
printf 'FAKE_RUNNER argv:%s\n' "$*"
case "$*" in
  *delta*) sleep 30 ;;
esac
printf 'FAKE_RUNNER done\n'
FAKEEOF
chmod +x "$FAKE"

# Env-dumping fixture for acceptance 2: proves the child got a sanitized base
# (no NODE_ENV/NEXT_*/__NEXT_*) plus whatever engine-specific vars startRun
# composed on top (acceptance 1's glm vars).
FAKE_ENV="$T/fakerunner_env.sh"
cat > "$FAKE_ENV" <<'FAKEEOF'
#!/usr/bin/env bash
printf 'FAKE_RUNNER argv:%s\n' "$*"
printf 'FAKE_RUNNER env:\n'
env | sort
printf 'FAKE_RUNNER done\n'
FAKEEOF
chmod +x "$FAKE_ENV"

SERVER_PID=""
SERVER_OUT="$T/server.out"

boot_server() {
  # $1: "off" (observer default), "on" (runner opt-in + argv fixture) or
  #     "on-env" (runner opt-in + env-dumping fixture, for acceptance 2/1).
  # Z_AI_API_KEY is always pinned explicitly (empty unless the caller passes
  # $2), same reasoning as the TOOLBOX_RUNNER=0 boot comment above: apps/web/
  # .env carries a real key for interactive use and loadDotEnv only fills
  # *unset* vars, so a real env var (even "") wins deterministically.
  : > "$SERVER_OUT"
  ZAI_KEY="${2:-}"
  if [ "$1" = "on" ]; then
    HANDYMAN_ROOT="$FR" TOOLBOX_RUNNER=1 TOOLBOX_RUNNER_CMD="$FAKE" Z_AI_API_KEY="$ZAI_KEY" \
      node "$SERVE" serve --port 0 > "$SERVER_OUT" 2>&1 &
  elif [ "$1" = "on-env" ]; then
    HANDYMAN_ROOT="$FR" TOOLBOX_RUNNER=1 TOOLBOX_RUNNER_CMD="$FAKE_ENV" Z_AI_API_KEY="$ZAI_KEY" \
      node "$SERVE" serve --port 0 > "$SERVER_OUT" 2>&1 &
  else
    HANDYMAN_ROOT="$FR" TOOLBOX_RUNNER=0 Z_AI_API_KEY="$ZAI_KEY" \
      node "$SERVE" serve --port 0 > "$SERVER_OUT" 2>&1 &
  fi
  SERVER_PID=$!
  URL=""
  for _ in $(seq 1 50); do
    URL="$(sed -n 's/^toolBox observer: //p' "$SERVER_OUT" | tr -d '[:space:]')"
    [ -n "$URL" ] && break
    sleep 0.1
  done
}

kill_server() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" >/dev/null 2>&1
    wait "$SERVER_PID" 2>/dev/null
    SERVER_PID=""
  fi
}

cleanup() {
  kill_server
  rm -rf "$T"
}
trap cleanup EXIT

# Parses field $2 out of the JSON on stdin (dot path, e.g. "phase").
json_field() {
  node -e '
let raw = "";
process.stdin.on("data", (c) => { raw += c; });
process.stdin.on("end", () => {
  try {
    let v = JSON.parse(raw);
    for (const k of process.argv[1].split(".")) v = v?.[k];
    console.log(typeof v === "object" ? JSON.stringify(v) : String(v));
  } catch { console.log("PARSE_ERROR"); }
});
' "$1"
}

# --- boot A: observer default, runner off ------------------------------------
boot_server off
start_case "boot A (TOOLBOX_RUNNER=0): server boots"
if [ -n "$URL" ]; then pass; else fail "no URL: $(cat "$SERVER_OUT")"; fi

start_case "GET /api/run reports the observer default: enabled=false, phase=idle"
STATUS_JSON="$(curl -s "${URL}api/run")"
ENABLED="$(printf '%s' "$STATUS_JSON" | json_field enabled)"
PHASE="$(printf '%s' "$STATUS_JSON" | json_field phase)"
if [ "$ENABLED" = "false" ] && [ "$PHASE" = "idle" ]; then
  pass
else
  fail "status: $STATUS_JSON"
fi

start_case "POST /api/run without the opt-in is 403 before any other guard"
CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d "{\"root\":\"$H1\",\"feature\":\"beta\"}" "${URL}api/run")"
if [ "$CODE" = "403" ]; then pass; else fail "want 403, got $CODE"; fi

kill_server

# --- boot B: runner opt-in with the fixture command --------------------------
boot_server on
start_case "boot B (TOOLBOX_RUNNER=1 + fixture cmd): server boots"
if [ -n "$URL" ]; then pass; else fail "no URL: $(cat "$SERVER_OUT")"; fi

start_case "GET /api/run lists engines: claude available, glm unavailable without Z_AI_API_KEY"
STATUS_JSON="$(curl -s "${URL}api/run")"
ENGINES="$(printf '%s' "$STATUS_JSON" | json_field engines)"
CLAUDE_AVAILABLE="$(printf '%s' "$ENGINES" | node -e '
let raw = ""; process.stdin.on("data", c => raw += c);
process.stdin.on("end", () => {
  try { const arr = JSON.parse(raw); const e = arr.find(x => x.id === "claude"); console.log(e ? e.available : "MISSING"); }
  catch { console.log("PARSE_ERROR"); }
});
')"
GLM_AVAILABLE="$(printf '%s' "$ENGINES" | node -e '
let raw = ""; process.stdin.on("data", c => raw += c);
process.stdin.on("end", () => {
  try { const arr = JSON.parse(raw); const e = arr.find(x => x.id === "glm"); console.log(e ? e.available : "MISSING"); }
  catch { console.log("PARSE_ERROR"); }
});
')"
if [ "$CLAUDE_AVAILABLE" = "true" ] && [ "$GLM_AVAILABLE" = "false" ]; then
  pass
else
  fail "claude=$CLAUDE_AVAILABLE glm=$GLM_AVAILABLE engines=$ENGINES"
fi

start_case "POST with an unknown engine is 422"
CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d "{\"root\":\"$H1\",\"feature\":\"beta\",\"engine\":\"nope\"}" "${URL}api/run")"
if [ "$CODE" = "422" ]; then pass; else fail "want 422, got $CODE"; fi

start_case "POST with engine=glm and no Z_AI_API_KEY is 422 with an install hint"
BODY="$(curl -s -X POST -H 'Content-Type: application/json' \
  -d "{\"root\":\"$H1\",\"feature\":\"beta\",\"engine\":\"glm\"}" "${URL}api/run")"
ERR="$(printf '%s' "$BODY" | json_field error)"
case "$ERR" in
  *Z_AI_API_KEY*) pass ;;
  *) fail "expected a Z_AI_API_KEY hint, got: $BODY" ;;
esac

start_case "POST guards: missing root 400, unregistered root 400"
C1="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d '{"feature":"beta"}' "${URL}api/run")"
C2="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d "{\"root\":\"$T/elsewhere\",\"feature\":\"beta\"}" "${URL}api/run")"
if [ "$C1" = "400" ] && [ "$C2" = "400" ]; then pass; else fail "got $C1/$C2 (want 400/400)"; fi

start_case "POST guards: bad feature name 422, done feature 422, unknown feature 422"
C1="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d "{\"root\":\"$H1\",\"feature\":\"../evil\"}" "${URL}api/run")"
C2="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d "{\"root\":\"$H1\",\"feature\":\"alpha\"}" "${URL}api/run")"
C3="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d "{\"root\":\"$H1\",\"feature\":\"nope\"}" "${URL}api/run")"
if [ "$C1" = "422" ] && [ "$C2" = "422" ] && [ "$C3" = "422" ]; then
  pass
else
  fail "got $C1/$C2/$C3 (want 422/422/422)"
fi

start_case "POST launches the fixture agent on 'beta' (ok, spawned_process:true)"
BODY="$(curl -s -X POST -H 'Content-Type: application/json' \
  -d "{\"root\":\"$H1\",\"feature\":\"beta\"}" "${URL}api/run")"
OK="$(printf '%s' "$BODY" | json_field ok)"
SPAWNED="$(printf '%s' "$BODY" | json_field spawned_process)"
if [ "$OK" = "true" ] && [ "$SPAWNED" = "true" ]; then pass; else fail "body: $BODY"; fi

start_case "GET reaches phase=exited code=0 and the tail proves prompt + flag argv"
PHASE=""
for _ in $(seq 1 50); do
  STATUS_JSON="$(curl -s "${URL}api/run")"
  PHASE="$(printf '%s' "$STATUS_JSON" | json_field phase)"
  [ "$PHASE" = "exited" ] && break
  sleep 0.1
done
EXIT_CODE="$(printf '%s' "$STATUS_JSON" | json_field exit.code)"
TAIL="$(printf '%s' "$STATUS_JSON" | json_field log_tail)"
case "$TAIL" in
  *FAKE_RUNNER\ done*) TAIL_OK=yes ;;
  *) TAIL_OK=no ;;
esac
case "$TAIL" in
  *beta*) PROMPT_OK=yes ;;
  *) PROMPT_OK=no ;;
esac
case "$TAIL" in
  *dangerously-skip-permissions*) FLAG_OK=yes ;;
  *) FLAG_OK=no ;;
esac
if [ "$PHASE" = "exited" ] && [ "$EXIT_CODE" = "0" ] \
  && [ "$TAIL_OK" = "yes" ] && [ "$PROMPT_OK" = "yes" ] && [ "$FLAG_OK" = "yes" ]; then
  pass
else
  fail "phase=$PHASE exit=$EXIT_CODE tail_ok=$TAIL_OK prompt_ok=$PROMPT_OK flag_ok=$FLAG_OK"
fi

start_case "the run log lives in the TARGET workspace (progress/run-beta.log)"
if [ -f "$ws/progress/run-beta.log" ] && grep -q "FAKE_RUNNER done" "$ws/progress/run-beta.log"; then
  pass
else
  fail "missing or empty $ws/progress/run-beta.log"
fi

start_case "one run at a time: a second POST while 'delta' runs is 409"
BODY="$(curl -s -X POST -H 'Content-Type: application/json' \
  -d "{\"root\":\"$H1\",\"feature\":\"delta\"}" "${URL}api/run")"
OK="$(printf '%s' "$BODY" | json_field ok)"
CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d "{\"root\":\"$H1\",\"feature\":\"beta\"}" "${URL}api/run")"
if [ "$OK" = "true" ] && [ "$CODE" = "409" ]; then pass; else fail "delta ok=$OK, second POST=$CODE (want 409)"; fi

start_case "DELETE stops the running agent (SIGTERM reaches the process group)"
BODY="$(curl -s -X DELETE "${URL}api/run")"
STOPPED="$(printf '%s' "$BODY" | json_field stopped)"
PHASE=""
for _ in $(seq 1 50); do
  STATUS_JSON="$(curl -s "${URL}api/run")"
  PHASE="$(printf '%s' "$STATUS_JSON" | json_field phase)"
  [ "$PHASE" = "exited" ] && break
  sleep 0.1
done
SIGNAL="$(printf '%s' "$STATUS_JSON" | json_field exit.signal)"
if [ "$STOPPED" = "true" ] && [ "$PHASE" = "exited" ] && [ "$SIGNAL" = "SIGTERM" ]; then
  pass
else
  fail "stopped=$STOPPED phase=$PHASE signal=$SIGNAL"
fi

start_case "DELETE with nothing running reports stopped:false"
BODY="$(curl -s -X DELETE "${URL}api/run")"
STOPPED="$(printf '%s' "$BODY" | json_field stopped)"
if [ "$STOPPED" = "false" ]; then pass; else fail "body: $BODY"; fi

start_case "GET /api/run exposes runs history (beta then delta, most recent first)"
STATUS_JSON="$(curl -s "${URL}api/run")"
RUNS="$(printf '%s' "$STATUS_JSON" | json_field runs)"
RUNS_OK="$(printf '%s' "$RUNS" | node -e '
let raw = ""; process.stdin.on("data", c => raw += c);
process.stdin.on("end", () => {
  try {
    const arr = JSON.parse(raw);
    const ok = Array.isArray(arr) && arr.length >= 2
      && arr[0].feature === "delta" && arr[0].phase === "exited"
      && arr[1].feature === "beta" && arr[1].phase === "exited";
    console.log(ok ? "yes" : "no");
  } catch { console.log("PARSE_ERROR"); }
});
')"
if [ "$RUNS_OK" = "yes" ]; then pass; else fail "runs: $RUNS"; fi

start_case "mode continue on a pending (not in_progress) feature is 422"
CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d "{\"root\":\"$H1\",\"feature\":\"beta\",\"mode\":\"continue\"}" "${URL}api/run")"
if [ "$CODE" = "422" ]; then pass; else fail "want 422, got $CODE"; fi

start_case "mode continue on an in_progress feature launches with the resume prompt in argv"
BODY="$(curl -s -X POST -H 'Content-Type: application/json' \
  -d "{\"root\":\"$H1\",\"feature\":\"epsilon\",\"mode\":\"continue\"}" "${URL}api/run")"
OK="$(printf '%s' "$BODY" | json_field ok)"
PHASE=""
for _ in $(seq 1 50); do
  STATUS_JSON="$(curl -s "${URL}api/run")"
  PHASE="$(printf '%s' "$STATUS_JSON" | json_field phase)"
  [ "$PHASE" = "exited" ] && break
  sleep 0.1
done
TAIL="$(printf '%s' "$STATUS_JSON" | json_field log_tail)"
case "$TAIL" in
  *RETOMALA*epsilon*|*epsilon*RETOMALA*) RESUME_OK=yes ;;
  *) RESUME_OK=no ;;
esac
if [ "$OK" = "true" ] && [ "$PHASE" = "exited" ] && [ "$RESUME_OK" = "yes" ]; then
  pass
else
  fail "ok=$OK phase=$PHASE resume_ok=$RESUME_OK tail=$TAIL"
fi

start_case "a normal (non-continue) start still requires pending: an in_progress feature is 422"
CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d "{\"root\":\"$H1\",\"feature\":\"epsilon\"}" "${URL}api/run")"
if [ "$CODE" = "422" ]; then pass; else fail "want 422, got $CODE"; fi

kill_server

# --- boot C: env-dumping fixture, proves acceptance 1 (glm childEnv) and
#     acceptance 2 (sanitized base: no NODE_ENV/NEXT_*/__NEXT_*) -------------
boot_server on-env "zai-test-key-123"
start_case "boot C (env-dumping fixture, Z_AI_API_KEY set): server boots"
if [ -n "$URL" ]; then pass; else fail "no URL: $(cat "$SERVER_OUT")"; fi

start_case "GET /api/run: glm is available once Z_AI_API_KEY is set"
STATUS_JSON="$(curl -s "${URL}api/run")"
ENGINES="$(printf '%s' "$STATUS_JSON" | json_field engines)"
GLM_AVAILABLE="$(printf '%s' "$ENGINES" | node -e '
let raw = ""; process.stdin.on("data", c => raw += c);
process.stdin.on("end", () => {
  try { const arr = JSON.parse(raw); const e = arr.find(x => x.id === "glm"); console.log(e ? e.available : "MISSING"); }
  catch { console.log("PARSE_ERROR"); }
});
')"
if [ "$GLM_AVAILABLE" = "true" ]; then pass; else fail "engines: $ENGINES"; fi

# The API's log_tail is capped (LOG_TAIL_BYTES=4096) and a full process env
# dump routinely exceeds that, which would make a "no NODE_ENV" assertion
# pass for the wrong reason (truncated out, not actually absent). Read the
# ON-DISK log instead: the full, untruncated record in the target workspace.
start_case "engine=claude child env is sanitized: no NODE_ENV, no NEXT_*/__NEXT_*, no glm vars, no Z_AI_API_KEY"
rm -f "$ws/progress/run-beta.log"
curl -s -X POST -H 'Content-Type: application/json' \
  -d "{\"root\":\"$H1\",\"feature\":\"beta\"}" "${URL}api/run" >/dev/null
PHASE=""
for _ in $(seq 1 50); do
  STATUS_JSON="$(curl -s "${URL}api/run")"
  PHASE="$(printf '%s' "$STATUS_JSON" | json_field phase)"
  [ "$PHASE" = "exited" ] && break
  sleep 0.1
done
LOG="$ws/progress/run-beta.log"
# Z_AI_API_KEY is a real engine credential and the server booted with it
# pinned to a known value: the claude engine's child must NOT receive it
# (only glm re-injects it, as ANTHROPIC_AUTH_TOKEN). Without this negative
# grep the secret-stripping fix could regress silently.
if [ "$PHASE" = "exited" ] && [ -f "$LOG" ] && grep -q "FAKE_RUNNER done" "$LOG" \
  && ! grep -qE '^NODE_ENV=' "$LOG" \
  && ! grep -qE '^NEXT_' "$LOG" \
  && ! grep -qE '^__NEXT_' "$LOG" \
  && ! grep -qE '^Z_AI_API_KEY=' "$LOG" \
  && ! grep -q 'ANTHROPIC_BASE_URL=https://api.z.ai' "$LOG"; then
  pass
else
  fail "phase=$PHASE log=$(cat "$LOG" 2>&1)"
fi

start_case "engine=glm child env carries the three ANTHROPIC_* vars from Z_AI_API_KEY"
rm -f "$ws/progress/run-delta.log"
curl -s -X POST -H 'Content-Type: application/json' \
  -d "{\"root\":\"$H1\",\"feature\":\"delta\",\"engine\":\"glm\"}" "${URL}api/run" >/dev/null
PHASE=""
for _ in $(seq 1 50); do
  STATUS_JSON="$(curl -s "${URL}api/run")"
  PHASE="$(printf '%s' "$STATUS_JSON" | json_field phase)"
  [ "$PHASE" = "exited" ] && break
  sleep 0.1
done
LOG="$ws/progress/run-delta.log"
if [ "$PHASE" = "exited" ] && [ -f "$LOG" ] \
  && grep -q 'ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic' "$LOG" \
  && grep -q 'ANTHROPIC_AUTH_TOKEN=zai-test-key-123' "$LOG" \
  && grep -q 'ANTHROPIC_MODEL=glm-5.2' "$LOG" \
  && ! grep -qE '^NODE_ENV=' "$LOG"; then
  pass
else
  fail "phase=$PHASE log=$(cat "$LOG" 2>&1)"
fi

start_case "the harness page offers the runner UI (RunPanel heading present)"
PAGE="$(curl -s "${URL}harness/proj1")"
if printf '%s' "$PAGE" | grep -q "Run an agent"; then
  pass
else
  fail "RunPanel heading missing from /harness/proj1"
fi

start_case "RunPanel with no pending work has no duplicate Add feature or empty select"
node -e '
const fs = require("fs");
const file = process.argv[1];
const data = JSON.parse(fs.readFileSync(file, "utf8"));
for (const feature of data.features) {
  if (feature.status === "pending") feature.status = "done";
}
fs.writeFileSync(file, JSON.stringify(data) + "\n");
' "$ws/feature_list.json"
EMPTY_PAGE="$(curl -s "${URL}harness/proj1")"
EMPTY_OUT="$(printf '%s' "$EMPTY_PAGE" | node -e '
let html = "";
process.stdin.on("data", (chunk) => { html += chunk; });
process.stdin.on("end", () => {
  const empty = html.indexOf("No work ready");
  const live = html.indexOf("harness-live", empty);
  const emptyPanel = html.slice(empty, live);
  const actions = html.match(/>Add feature<\/a>/g) ?? [];
  if (empty === -1 || live < empty || actions.length !== 1 || emptyPanel.includes(">Add feature</a>") || emptyPanel.includes("id=\"run-feature-select\"")) {
    console.log(`empty=${empty} live=${live} actions=${actions.length} emptyAction=${emptyPanel.includes(">Add feature</a>")} select=${emptyPanel.includes("id=\"run-feature-select\"")}`);
    process.exit(1);
  }
});
' 2>&1)"
EMPTY_CODE=$?
if [ "$EMPTY_CODE" -eq 0 ]; then pass; else fail "empty RunPanel contract failed: $EMPTY_OUT"; fi

summary

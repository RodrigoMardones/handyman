#!/usr/bin/env bash
# CLI LLM suite (feature 53): `toolbox.js review-notes` reachable WITHOUT a
# server. Every case runs against a local OpenAI-compatible mock bound to
# 127.0.0.1 via OLLAMA_BASE_URL; nothing here touches the network, and
# `toolbox serve` is never started.
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
TOOLBOX="$SUITE_DIR/../handyman/dist/toolbox.js"

echo "toolBox CLI LLM suite (test_toolbox_cli_llm.sh)"

T="$(mktemp -d)"
cleanup() {
  [ -n "${MOCK_PID:-}" ] && kill "$MOCK_PID" 2>/dev/null
  rm -rf "$T"
}
trap cleanup EXIT

# --- fixtures ----------------------------------------------------------------
# A harness root with one impl report, plus a private registry that declares it.
# HANDYMAN_ROOT is redirected at $T so the developer's real registry is never
# read or written by this suite.
ROOT="$T/proj"
mkdir -p "$ROOT/.handyman/backlog" "$ROOT/.handyman/progress"
cat > "$ROOT/.handyman/feature_list.json" <<'JSON'
{
  "project": "t",
  "features": [ { "id": 1, "name": "alpha", "status": "in_progress" } ]
}
JSON
cat > "$ROOT/.handyman/backlog/impl_alpha.md" <<'MD'
---
feature: alpha
id: 1
role: implementer
date: 2026-01-01
verdict: implemented
tags: [handyman/backlog/impl]
---

# Impl: alpha

Se agrego un lector de solo-lectura sobre el workspace.
MD
: > "$ROOT/.handyman/progress/current.md"
: > "$ROOT/.handyman/progress/history.md"

export HANDYMAN_ROOT="$T/hroot"
mkdir -p "$HANDYMAN_ROOT"
# Register the path in the SAME form the CLI computes it: `toolbox.js register`
# and `review-notes` both absolutize lexically (node's resolve) without
# following symlinks, so a `pwd -P` here would desync the two on macOS, where
# mktemp hands back /var/... for /private/var/...
cat > "$HANDYMAN_ROOT/registry.json" <<JSON
{ "harnesses": [ { "project_root": "$ROOT", "registered": "2026-01-01" } ] }
JSON

# --- local OpenAI-compatible mock (no network) -------------------------------
node "$SUITE_DIR/lib/mock_openai.js" > "$T/mock.out" 2>&1 &
MOCK_PID=$!
# Detach from job control so the cleanup kill does not print "Terminated: 15"
# into the suite output.
disown "$MOCK_PID" 2>/dev/null || true
MOCK_PORT=""
for _ in $(seq 1 100); do
  MOCK_PORT="$(sed -n 's/^PORT=//p' "$T/mock.out" 2>/dev/null | head -1)"
  [ -n "$MOCK_PORT" ] && break
  sleep 0.1
done
if [ -z "$MOCK_PORT" ]; then
  echo "  mock did not start; aborting suite" >&2
  exit 1
fi
export OLLAMA_BASE_URL="http://127.0.0.1:$MOCK_PORT/v1"
# Empty so buildProviders cannot construct a real cloud provider from a
# developer's ambient environment.
export ZAI_API_KEY=""
export ANTHROPIC_API_KEY=""

# --- C1: happy path, no server running ---------------------------------------
start_case "review-notes: prints the checklist on stdout with no server running"
OUT="$(node "$TOOLBOX" review-notes --root "$ROOT" --feature alpha --provider ollama 2>"$T/c1.err")"; CODE=$?
if [ "$CODE" -eq 0 ] && printf '%s' "$OUT" | grep -q "invariante de solo-lectura"; then
  pass
else
  fail "exit=$CODE stdout=$OUT stderr=$(cat "$T/c1.err")"
fi

# --- C2: the checklist is a draft, never a verdict ---------------------------
# Guards the harness rule the whole feature rests on: this output prepares a
# review, it does not sign one.
start_case "review-notes: output carries no APPROVED/CHANGES_REQUESTED verdict"
OUT="$(node "$TOOLBOX" review-notes --root "$ROOT" --feature alpha --provider ollama 2>/dev/null)"
if ! printf '%s' "$OUT" | grep -qE "APPROVED|CHANGES_REQUESTED"; then
  pass
else
  fail "the checklist emitted a verdict token: $OUT"
fi

# --- C3: --json emits exactly one object with the contract keys --------------
start_case "review-notes: --json emits one object with checklist_md, model, diff_truncated"
OUT="$(node "$TOOLBOX" review-notes --root "$ROOT" --feature alpha --provider ollama --json 2>/dev/null)"; CODE=$?
LINES="$(printf '%s\n' "$OUT" | grep -c .)"
KEYS="$(printf '%s' "$OUT" | node -e '
let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{
  const o=JSON.parse(s);
  const ok = typeof o.checklist_md==="string" && typeof o.model==="string" && typeof o.diff_truncated==="boolean";
  process.stdout.write(ok?"ok":"bad:"+Object.keys(o).join(","));
});')"
if [ "$CODE" -eq 0 ] && [ "$LINES" -eq 1 ] && [ "$KEYS" = "ok" ]; then
  pass
else
  fail "exit=$CODE lines=$LINES keys=$KEYS out=$OUT"
fi

# --- C4: unregistered root is rejected before any model call -----------------
start_case "review-notes: unregistered root exits != 0 with a stderr message"
UNREG="$T/stranger"
mkdir -p "$UNREG"
OUT="$(node "$TOOLBOX" review-notes --root "$UNREG" --feature alpha --provider ollama 2>&1 >/dev/null)"; CODE=$?
if [ "$CODE" -ne 0 ] && printf '%s' "$OUT" | grep -q "not registered"; then
  pass
else
  fail "exit=$CODE stderr=$OUT"
fi

# --- C5: unknown provider is rejected ----------------------------------------
start_case "review-notes: unknown provider exits != 0 with a stderr message"
OUT="$(node "$TOOLBOX" review-notes --root "$ROOT" --feature alpha --provider nosuch 2>&1 >/dev/null)"; CODE=$?
if [ "$CODE" -ne 0 ] && printf '%s' "$OUT" | grep -q "unknown provider"; then
  pass
else
  fail "exit=$CODE stderr=$OUT"
fi

# --- C6: missing --feature is rejected ---------------------------------------
start_case "review-notes: missing --feature exits != 0 with a stderr message"
OUT="$(node "$TOOLBOX" review-notes --root "$ROOT" --provider ollama 2>&1 >/dev/null)"; CODE=$?
if [ "$CODE" -ne 0 ] && printf '%s' "$OUT" | grep -q -- "--feature is required"; then
  pass
else
  fail "exit=$CODE stderr=$OUT"
fi

# --- C7: rejections cost no tokens -------------------------------------------
# The mock records every completion it serves; all three rejections above must
# have reached it zero times.
start_case "review-notes: every rejection fires before the model is called"
CALLS="$(grep -c "SERVED" "$T/mock.out" 2>/dev/null || true)"
UNREG_OUT="$(node "$TOOLBOX" review-notes --root "$UNREG" --feature alpha --provider ollama 2>&1 >/dev/null)"
BAD_NAME_OUT="$(node "$TOOLBOX" review-notes --root "$ROOT" --feature 'a/../b' --provider ollama 2>&1 >/dev/null)"
CALLS_AFTER="$(grep -c "SERVED" "$T/mock.out" 2>/dev/null || true)"
if [ "$CALLS" = "$CALLS_AFTER" ] \
  && printf '%s' "$BAD_NAME_OUT" | grep -q "invalid feature name"; then
  pass
else
  fail "mock calls went $CALLS -> $CALLS_AFTER; unreg=$UNREG_OUT badname=$BAD_NAME_OUT"
fi

# --- C8: the subcommand is advertised in the usage line ----------------------
start_case "review-notes: appears in the toolbox.js usage line"
OUT="$(node "$TOOLBOX" 2>&1)"
if printf '%s' "$OUT" | grep -q "review-notes"; then
  pass
else
  fail "usage line does not mention review-notes: $OUT"
fi

# --- C9: no server was ever started ------------------------------------------
# The whole point of the feature: the LLM layer is reachable from the CLI.
start_case "review-notes: no toolbox serve process was started by this suite"
if ! pgrep -f "toolbox.js serve" >/dev/null 2>&1; then
  pass
else
  fail "a toolbox serve process is running; this suite must never start one"
fi

summary

#!/usr/bin/env bash
# Hub smoke (feature 105, mastra_hub_command): rebuilds the bundle and boots
# the WHOLE review stack with one command from an alien cwd — MCP child on a
# high loopback port + `mastra dev` — then asserts the access banner, the MCP
# answering on its port, a clean SIGINT shutdown with NO orphan children, and
# the actionable error when the MCP port is already owned by another process.
#
#   bash agents/mastra-handyman/scripts/smoke_hub.sh
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=../../../tests/lib/assert.sh
. "$PKG_DIR/../../tests/lib/assert.sh"

TMP="$(mktemp -d)"
HUB_PID=""
DUMMY_PID=""
trap 'kill "$HUB_PID" "$DUMMY_PID" 2>/dev/null; rm -rf "$TMP"' EXIT

echo "Hub smoke (agents/mastra-handyman/scripts/smoke_hub.sh)"

# --- S1: the bundle builds and ships the hub runner ----------------------------
start_case "build:bundle emits run-hub.mjs"
BUILD_OUT="$(cd "$PKG_DIR" && pnpm build:bundle 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] && [ -f "$PKG_DIR/dist-bundle/run-hub.mjs" ] \
  && printf '%s' "$BUILD_OUT" | grep -q '^status: ok$'; then
  pass
else
  fail "exit=$CODE out=$BUILD_OUT"
fi

# --- Fixture: isolated HANDYMAN_ROOT + minimal registered harness --------------
PROJ="$TMP/hub-probe"
mkdir -p "$PROJ/.handyman"
printf '{"project_name":"hubprobe"}' > "$PROJ/harness.config.json"
printf '{"features":[]}' > "$PROJ/.handyman/feature_list.json"
printf '#!/usr/bin/env bash\nexit 0\n' > "$PROJ/init.sh"
chmod +x "$PROJ/init.sh"
HROOT="$TMP/HANDYMAN"
mkdir -p "$HROOT"
printf '{"version":1,"harnesses":[{"project_root":"%s","registered":"2026-07-29"}]}' \
  "$PROJ" > "$HROOT/registry.json"
ALIEN="$TMP/alien-cwd"
mkdir -p "$ALIEN"

MCP_PORT=18899
# Port-scoped patterns: never match the operator's own servers (8177 & co).
MCP_PAT="dist/mcp.js --http --host 127.0.0.1 --port $MCP_PORT"
STUDIO_PAT="mastra/dist/index.js dev"
count() { pgrep -f "$1" | wc -l | tr -d ' '; }
BEFORE_MCP="$(count "$MCP_PAT")"
BEFORE_STUDIO="$(count "$STUDIO_PAT")"

# --- S2/S3: one command boots the stack ----------------------------------------
# `exec` inside the subshell: $! IS the hub node process (a plain subshell
# would keep bash in between — SIGINT would land on the WRONG process and the
# hub would outlive the smoke).
(
  cd "$ALIEN" || exit 1
  exec env HANDYMAN_ROOT="$HROOT" \
    node "$PKG_DIR/dist-bundle/run-hub.mjs" --project hub-probe --mcp-port "$MCP_PORT"
) > "$TMP/hub.log" 2>&1 &
HUB_PID=$!

start_case "banner with the access URLs appears (mastra dev may take ~90s)"
DEADLINE=$((SECONDS + 90))
until grep -q '\[hub\] review stack up:' "$TMP/hub.log" 2>/dev/null || [ "$SECONDS" -ge "$DEADLINE" ]; do
  sleep 1
done
if grep -q '\[hub\]   Studio:  http://localhost:' "$TMP/hub.log" \
  && grep -q "\[hub\]   MCP:     http://127.0.0.1:$MCP_PORT/mcp" "$TMP/hub.log" \
  && grep -q "\[hub\]   project: $PROJ" "$TMP/hub.log"; then
  pass
else
  fail "no banner in 90s: $(tail -5 "$TMP/hub.log")"
fi

start_case "the MCP child answers on its port"
CODE_HTTP="$(curl -s -m 3 -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$MCP_PORT/mcp" \
  -H 'content-type: application/json' -d '{}' 2>/dev/null)"
if [ "$CODE_HTTP" != "000" ] && [ -n "$CODE_HTTP" ]; then
  pass
else
  fail "no HTTP answer on $MCP_PORT"
fi

# --- S4: SIGINT stops the whole stack, no orphans ------------------------------
start_case "SIGINT exits 0 and leaves no mcp/studio orphans"
kill -INT "$HUB_PID" 2>/dev/null
wait "$HUB_PID" 2>/dev/null; HUB_CODE=$?
HUB_PID=""
sleep 1
AFTER_MCP="$(count "$MCP_PAT")"
AFTER_STUDIO="$(count "$STUDIO_PAT")"
if [ "$HUB_CODE" -eq 0 ] && [ "$AFTER_MCP" = "$BEFORE_MCP" ] && [ "$AFTER_STUDIO" = "$BEFORE_STUDIO" ]; then
  pass
else
  fail "hub exit=$HUB_CODE mcp:${BEFORE_MCP}->${AFTER_MCP} studio:${BEFORE_STUDIO}->${AFTER_STUDIO}"
fi

# --- S5: an owned MCP port fails actionably ------------------------------------
BUSY_PORT=18901
node "$PKG_DIR/../../handyman/dist/mcp.js" --http --port "$BUSY_PORT" >/dev/null 2>&1 &
DUMMY_PID=$!
sleep 1
start_case "hub against an owned MCP port exits non-zero naming the port"
OUT="$(cd "$ALIEN" && HANDYMAN_ROOT="$HROOT" \
  node "$PKG_DIR/dist-bundle/run-hub.mjs" --project hub-probe --mcp-port "$BUSY_PORT" 2>&1)"; CODE=$?
kill "$DUMMY_PID" 2>/dev/null; DUMMY_PID=""
if [ "$CODE" -ne 0 ] && printf '%s' "$OUT" | grep -q "port $BUSY_PORT" \
  && printf '%s' "$OUT" | grep -q -- '--mcp-port'; then
  pass
else
  fail "exit=$CODE out=$(printf '%s' "$OUT" | tail -3)"
fi

summary

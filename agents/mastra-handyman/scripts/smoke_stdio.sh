#!/usr/bin/env bash
# Embedded-MCP stdio smoke (feature 104, mastra_embedded_mcp_stdio): rebuilds
# the bundle and boots a runner with PLAIN node from an ALIEN cwd with
# HANDYMAN_MCP_TRANSPORT=stdio and NO HTTP MCP running — the runtime must
# spawn the handyman MCP as a child, list and pin the tools through it, and
# leave NO orphan dist/mcp.js process behind after the exit. The runner is
# expected to fail AFTER the boot (no LLM keys — the assertion targets the
# MCP boot and the child lifecycle, never the model call).
#
#   bash agents/mastra-handyman/scripts/smoke_stdio.sh
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=../../../tests/lib/assert.sh
. "$PKG_DIR/../../tests/lib/assert.sh"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Embedded-MCP stdio smoke (agents/mastra-handyman/scripts/smoke_stdio.sh)"

# --- S1: the bundle builds ----------------------------------------------------
start_case "build:bundle emits the runner bundles"
BUILD_OUT="$(cd "$PKG_DIR" && pnpm build:bundle 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] && [ -f "$PKG_DIR/dist-bundle/run-feature.mjs" ] \
  && printf '%s' "$BUILD_OUT" | grep -q '^status: ok$'; then
  pass
else
  fail "exit=$CODE out=$BUILD_OUT"
fi

# --- Fixture: isolated HANDYMAN_ROOT + minimal registered harness --------------
PROJ="$TMP/stdio-probe"
mkdir -p "$PROJ/.handyman"
printf '{"project_name":"stdioprobe"}' > "$PROJ/harness.config.json"
printf '{"features":[]}' > "$PROJ/.handyman/feature_list.json"
printf '#!/usr/bin/env bash\nexit 0\n' > "$PROJ/init.sh"
chmod +x "$PROJ/init.sh"
HROOT="$TMP/HANDYMAN"
mkdir -p "$HROOT"
printf '{"version":1,"harnesses":[{"project_root":"%s","registered":"2026-07-29"}]}' \
  "$PROJ" > "$HROOT/registry.json"
ALIEN="$TMP/alien-cwd"
mkdir -p "$ALIEN"

# Count dist/mcp.js processes WITHOUT killing anything: pre-existing servers
# (e.g. an operator's HTTP MCP from this checkout) are fine — the assertion is
# the before/after DELTA, never the absolute count.
count_mcp() { pgrep -f "handyman/dist/mcp.js" | wc -l | tr -d ' '; }
BEFORE="$(count_mcp)"

# --- S2: stdio boot with no HTTP server anywhere --------------------------------
# HANDYMAN_LEADER_MODEL points at an unloaded local model so the run dies fast
# AFTER the MCP boot (no keys, no network): the boot log is the assertion.
start_case "stdio boot lists and pins the tools with no HTTP MCP running"
OUT="$(cd "$ALIEN" && HANDYMAN_ROOT="$HROOT" HANDYMAN_PROJECT_ROOT="stdio-probe" \
  HANDYMAN_MCP_TRANSPORT=stdio HANDYMAN_LEADER_MODEL=ollama/smoke \
  node "$PKG_DIR/dist-bundle/run-feature.mjs" smoke_stdio_probe 2>&1)"
if printf '%s' "$OUT" | grep -q '\[mcp\] connected via stdio (embedded ' \
  && printf '%s' "$OUT" | grep -q ': 25 tools, 21 pinned to '; then
  pass
else
  fail "$(printf '%s' "$OUT" | grep -E '\[mcp\]|\[pinning\]' | head -3)"
fi

# --- S3: the stdio child does not survive the runner exit -----------------------
sleep 0.5
start_case "no orphan dist/mcp.js child after the runner exits"
AFTER="$(count_mcp)"
if [ "$AFTER" = "$BEFORE" ]; then
  pass
else
  fail "dist/mcp.js processes: before=$BEFORE after=$AFTER"
fi

# --- S4: stdio with an unbuilt toolchain fails actionably -----------------------
mkdir -p "$TMP/empty-pkg"
start_case "stdio with a missing dist/mcp.js fails with an actionable error"
OUT="$(cd "$ALIEN" && HANDYMAN_ROOT="$HROOT" HANDYMAN_PROJECT_ROOT="stdio-probe" \
  HANDYMAN_MCP_TRANSPORT=stdio HANDYMAN_ASSETS_DIR="$TMP/empty-pkg" \
  node "$PKG_DIR/dist-bundle/run-feature.mjs" smoke_stdio_probe 2>&1)"; CODE=$?
if [ "$CODE" -ne 0 ] \
  && printf '%s' "$OUT" | grep -q 'cannot spawn the embedded MCP' \
  && printf '%s' "$OUT" | grep -q 'HANDYMAN_MCP_TRANSPORT=http'; then
  pass
else
  fail "exit=$CODE out=$(printf '%s' "$OUT" | tail -4)"
fi

summary

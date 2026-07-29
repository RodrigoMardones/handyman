#!/usr/bin/env bash
# Ordered local run of the agent platform (2026-07-28): ONE command boots
# everything Mastra Studio needs, in order, with experiment-safe defaults.
#
#   pnpm studio                      # from the repo root
#
# What it does, in order:
#   1. loads the repo .env (Z_AI_API_KEY, KIMI_API_KEY; GITHUB_TOKEN optional)
#   2. builds handyman/dist if missing (the MCP server runs from dist)
#   3. bootstraps the experiment project if missing (scaffold local — never
#      the monorepo by default, so experiments never touch the real .handyman)
#   4. brings the handyman MCP up on 127.0.0.1:8177 (reuses a live one)
#   5. execs `mastra dev` (Studio on http://localhost:4111) in the foreground
#
# Overrides (env):
#   HANDYMAN_PROJECT_ROOT   target project      (default /tmp/hm-studio)
#   HANDYMAN_LEADER_MODEL   leader model spec   (default kimi-coding/k3)
#   HANDYMAN_IMPLEMENTER_MODEL / HANDYMAN_REVIEWER_MODEL   (default zai/glm-5.2)
#   HANDYMAN_MCP_PORT       MCP port            (default 8177)
#
# Model specs: custom providers zai/* (Z_AI_API_KEY) and kimi-coding/*
# (KIMI_API_KEY); local servers from model-catalog.json (ollama/*, lmstudio/*
# — Anthropic-compatible, no key); anything else passes to Mastra's built-in
# model router (needs that provider's env key).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG_DIR="$REPO_ROOT/agents/mastra-handyman"
MCP_PORT="${HANDYMAN_MCP_PORT:-8177}"
PROJECT="${HANDYMAN_PROJECT_ROOT:-/tmp/hm-studio}"
LEADER_MODEL="${HANDYMAN_LEADER_MODEL:-kimi-coding/k3}"
IMPLEMENTER_MODEL="${HANDYMAN_IMPLEMENTER_MODEL:-zai/glm-5.2}"
REVIEWER_MODEL="${HANDYMAN_REVIEWER_MODEL:-zai/glm-5.2}"

echo "[studio-local] repo:        $REPO_ROOT"
echo "[studio-local] project:     $PROJECT"
echo "[studio-local] leader:      $LEADER_MODEL"
echo "[studio-local] implementer: $IMPLEMENTER_MODEL"
echo "[studio-local] reviewer:    $REVIEWER_MODEL"

# 1. Credentials ---------------------------------------------------------------
if [ -f "$REPO_ROOT/.env" ]; then
  set -a; . "$REPO_ROOT/.env"; set +a
fi
# Require only the keys the configured specs actually use.
missing=0
need_key() { # $1 = spec, $2 = provider prefix, $3 = env var
  case "$1" in
    "$2"/*) if [ -z "${!3:-}" ]; then echo "[studio-local] MISSING $3 for spec $1" >&2; missing=1; fi ;;
  esac
}
for spec in "$LEADER_MODEL" "$IMPLEMENTER_MODEL" "$REVIEWER_MODEL"; do
  need_key "$spec" zai Z_AI_API_KEY
  need_key "$spec" kimi-coding KIMI_API_KEY
  need_key "$spec" openrouter OPENROUTER_API_KEY
done
[ "$missing" -eq 0 ] || { echo "[studio-local] add the missing keys to $REPO_ROOT/.env" >&2; exit 1; }

# 2. Toolchain build -----------------------------------------------------------
if [ ! -f "$REPO_ROOT/handyman/dist/mcp.js" ]; then
  echo "[studio-local] building handyman/dist..."
  (cd "$REPO_ROOT/handyman" && npm run build)
fi

# 3. Experiment project --------------------------------------------------------
if [ ! -f "$PROJECT/init.sh" ]; then
  echo "[studio-local] scaffolding experiment project at $PROJECT"
  mkdir -p "$PROJECT"
  "$REPO_ROOT/handyman/scripts/scaffold.sh" local "$PROJECT" studio-lab
fi

# 4. MCP up --------------------------------------------------------------------
MCP_URL="http://127.0.0.1:$MCP_PORT/mcp"
probe_mcp() {
  # Any HTTP response means listening; 000 means nothing bound.
  [ "$(curl -s -m 2 -o /dev/null -w '%{http_code}' -X POST "$MCP_URL" \
      -H 'content-type: application/json' -d '{}' 2>/dev/null)" != "000" ]
}
if probe_mcp; then
  echo "[studio-local] MCP already live at $MCP_URL (reusing)"
else
  echo "[studio-local] starting MCP at $MCP_URL"
  node "$REPO_ROOT/handyman/dist/mcp.js" --http --port "$MCP_PORT" &
  MCP_PID=$!
  trap 'kill "$MCP_PID" 2>/dev/null || true' EXIT
  for _ in $(seq 1 25); do
    probe_mcp && break
    sleep 0.2
  done
  probe_mcp || { echo "[studio-local] MCP failed to start" >&2; exit 1; }
fi

# 5. Studio (foreground) -------------------------------------------------------
# HANDYMAN_REPO_ROOT is mandatory: `mastra dev` does not run with cwd = the
# package dir, so the cwd-relative anchor in the agent modules breaks.
cd "$PKG_DIR"
export HANDYMAN_REPO_ROOT="$REPO_ROOT"
export HANDYMAN_PROJECT_ROOT="$PROJECT"
export HANDYMAN_LEADER_MODEL="$LEADER_MODEL"
export HANDYMAN_IMPLEMENTER_MODEL="$IMPLEMENTER_MODEL"
export HANDYMAN_REVIEWER_MODEL="$REVIEWER_MODEL"
export HANDYMAN_MCP_URL="$MCP_URL"
echo "[studio-local] Studio -> http://localhost:4111 (Ctrl+C stops everything)"
exec pnpm exec mastra dev -d studio -e "$REPO_ROOT/.env"

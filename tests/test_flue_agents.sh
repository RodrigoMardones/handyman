#!/usr/bin/env bash
# agents/flue-handyman structural suite. No API calls, no dev server: checks
# the package contract only (files, manifest, workspace wiring, agent source
# contract). The live feature loop is verified manually against a scratch
# workspace and documented in agents/flue-handyman/README.md.
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
REPO_ROOT="$(cd "$SUITE_DIR/.." && pwd)"
AGENTS_DIR="$REPO_ROOT/agents/flue-handyman"
AGENT_FILE="$AGENTS_DIR/src/agents/handyman-leader.ts"

echo "agents/flue-handyman suite (test_flue_agents.sh)"

# --- TFA1: package files exist ----------------------------------------------
start_case "agents/flue-handyman package files exist"
MISSING=""
for f in package.json flue.config.ts src/app.ts src/agents/handyman-leader.ts run-feature.mjs README.md; do
  [ -f "$AGENTS_DIR/$f" ] || MISSING="$MISSING $f"
done
if [ -z "$MISSING" ]; then
  pass
else
  fail "missing:$MISSING"
fi

# --- TFA2: manifest contract (name, private, flue deps) ----------------------
start_case "package.json: private @handyman/flue-handyman with @flue/* deps"
if node -e '
const pkg = require(process.argv[1]);
const deps = Object.keys(pkg.dependencies ?? {});
const ok = pkg.name === "@handyman/flue-handyman"
  && pkg.private === true
  && ["@flue/cli", "@flue/runtime", "@flue/sdk", "hono"].every((d) => deps.includes(d));
process.exit(ok ? 0 : 1);
' "$AGENTS_DIR/package.json"; then
  pass
else
  fail "manifest drifted (name/private/deps)"
fi

# --- TFA3: workspace wiring ---------------------------------------------------
start_case "pnpm-workspace.yaml includes agents/*"
if grep -q '^  - "agents/\*"$' "$REPO_ROOT/pnpm-workspace.yaml"; then
  pass
else
  fail "agents/* glob missing from pnpm-workspace.yaml"
fi

# --- TFA4: agent contract: defineAgent default export + MCP via env ----------
start_case "agent: defineAgent default export, MCP endpoint from HANDYMAN_MCP_URL"
if grep -q 'export default defineAgent' "$AGENT_FILE" \
  && grep -q 'HANDYMAN_MCP_URL' "$AGENT_FILE" \
  && grep -q 'connectMcpServer' "$AGENT_FILE"; then
  pass
else
  fail "agent file lost the MCP wiring"
fi

# --- TFA5: project root parametrized -----------------------------------------
start_case "agent: handyman project root from HANDYMAN_PROJECT_ROOT (no hardcoded /tmp)"
if grep -q 'HANDYMAN_PROJECT_ROOT' "$AGENT_FILE" && ! grep -q "/tmp/" "$AGENT_FILE"; then
  pass
else
  fail "project root hardcoded or env var missing"
fi

# --- TFA6: per-role models via env -------------------------------------------
start_case "agent: per-role models via HANDYMAN_{LEADER,IMPLEMENTER,REVIEWER}_MODEL"
if grep -q 'HANDYMAN_LEADER_MODEL' "$AGENT_FILE" \
  && grep -q 'HANDYMAN_IMPLEMENTER_MODEL' "$AGENT_FILE" \
  && grep -q 'HANDYMAN_REVIEWER_MODEL' "$AGENT_FILE"; then
  pass
else
  fail "per-role model env vars missing"
fi

# --- TFA7: subagents + role templates ----------------------------------------
start_case "agent: implementer+reviewer profiles fed from handyman/assets role templates"
if [ "$(grep -c 'defineAgentProfile' "$AGENT_FILE")" -ge 2 ] \
  && grep -q "role-\${role}.template.md" "$AGENT_FILE" \
  && grep -q "handyman', 'assets'" "$AGENT_FILE"; then
  pass
else
  fail "subagent profiles or role-template loading missing"
fi

# --- TFA8: providers registered in app.ts ------------------------------------
start_case "app.ts: anthropic (Z.AI) and kimi-coding providers registered"
if grep -q "registerProvider('anthropic'" "$AGENTS_DIR/src/app.ts" \
  && grep -q 'api.z.ai/api/anthropic' "$AGENTS_DIR/src/app.ts" \
  && grep -q "registerProvider('kimi-coding'" "$AGENTS_DIR/src/app.ts"; then
  pass
else
  fail "provider registrations missing"
fi

# --- TFA9: root scripts -------------------------------------------------------
start_case "root package.json exposes agents:dev and agents:run scripts"
if node -e '
const pkg = require(process.argv[1]);
const s = pkg.scripts ?? {};
const ok = typeof s["agents:dev"] === "string" && typeof s["agents:run"] === "string";
process.exit(ok ? 0 : 1);
' "$REPO_ROOT/package.json"; then
  pass
else
  fail "agents:dev / agents:run missing in root package.json"
fi

summary

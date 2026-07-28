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
CATALOG="$AGENTS_DIR/src/ports/model-catalog.ts"

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
start_case "model catalog: per-role models via HANDYMAN_{LEADER,IMPLEMENTER,REVIEWER}_MODEL"
if [ -f "$CATALOG" ] \
  && grep -q 'HANDYMAN_LEADER_MODEL' "$CATALOG" \
  && grep -q 'HANDYMAN_IMPLEMENTER_MODEL' "$CATALOG" \
  && grep -q 'HANDYMAN_REVIEWER_MODEL' "$CATALOG" \
  && grep -q 'resolveRoleModels' "$AGENT_FILE"; then
  pass
else
  fail "per-role model resolution missing from the catalog or the agent"
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

# --- TFA8: providers registered via the model catalog -------------------------
start_case "app.ts registers providers via model catalog (Z.AI + kimi-coding, no MOONSHOT fallback)"
if grep -q "registerModelProviders" "$AGENTS_DIR/src/app.ts" \
  && grep -q "registerProvider('anthropic'" "$CATALOG" \
  && grep -q 'api.z.ai/api/anthropic' "$CATALOG" \
  && grep -q "registerProvider('kimi-coding'" "$CATALOG" \
  && ! grep -rq "MOONSHOT_API_KEY" "$AGENTS_DIR/src"; then
  pass
else
  fail "provider registrations missing from catalog, or MOONSHOT fallback still present"
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

# --- TFA10: anti-volatility barrel -------------------------------------------
start_case "src/flue/: only @flue/* importer under src/; consumers use the barrel"
OFFENDERS="$(grep -rln "from '@flue/" "$AGENTS_DIR/src" | grep -v "/src/flue/" || true)"
if [ -f "$AGENTS_DIR/src/flue/index.ts" ] \
  && [ -z "$OFFENDERS" ] \
  && grep -q "from './flue'" "$AGENTS_DIR/src/app.ts" \
  && grep -q "from '../flue'" "$AGENT_FILE" \
  && grep -q "Documented exception" "$AGENTS_DIR/run-feature.mjs"; then
  pass
else
  fail "barrel missing or @flue imports outside src/flue/:$OFFENDERS"
fi

# --- TFA11: telemetry sink ----------------------------------------------------
start_case "telemetry sink: observe() -> JSONL wired in app.ts, unit tests green"
if [ -f "$AGENTS_DIR/src/ports/telemetry-sink.ts" ] \
  && grep -q "installTelemetrySink" "$AGENTS_DIR/src/app.ts" \
  && grep -q "^logs/$" "$AGENTS_DIR/.gitignore" \
  && (cd "$AGENTS_DIR" && pnpm test:unit >/dev/null 2>&1); then
  pass
else
  fail "telemetry sink missing, unwired, or unit tests red"
fi

# --- TFA12: stable server (db.ts + build/start scripts) -----------------------
start_case "stable server: db.ts sqlite file + start script + root agents:build/start"
if [ -f "$AGENTS_DIR/src/db.ts" ] \
  && grep -q "sqlite('./data/flue.db')" "$AGENTS_DIR/src/db.ts" \
  && grep -q "^data/$" "$AGENTS_DIR/.gitignore" \
  && node -e '
const pkg = require(process.argv[1]);
const root = require(process.argv[2]);
const ok = typeof (pkg.scripts ?? {}).start === "string"
  && typeof (root.scripts ?? {})["agents:build"] === "string"
  && typeof (root.scripts ?? {})["agents:start"] === "string";
process.exit(ok ? 0 : 1);
' "$AGENTS_DIR/package.json" "$REPO_ROOT/package.json"; then
  pass
else
  fail "db.ts, data/ ignore, or build/start scripts missing"
fi

# --- TFA13: error taxonomy -----------------------------------------------------
start_case "error taxonomy: classify + retryPolicy, shared client table, driver reconnect"
if [ -f "$AGENTS_DIR/src/domain/errors.ts" ] \
  && grep -q "retryPolicy" "$AGENTS_DIR/src/domain/errors.ts" \
  && grep -q "client-error-classes.mjs" "$AGENTS_DIR/run-feature.mjs" \
  && grep -q "isTransientClientError" "$AGENTS_DIR/run-feature.mjs" \
  && (cd "$AGENTS_DIR" && pnpm test:unit >/dev/null 2>&1); then
  pass
else
  fail "error taxonomy missing, driver not reconnecting, or unit tests red"
fi

# --- TFA14: subagent grounding (feature 97) ------------------------------------
start_case "subagent grounding: sandbox local(PROJECT) + reviewer read-only tool set"
ROLE_TOOLS="$AGENTS_DIR/src/domain/role-tools.ts"
BLOCKS="$(sed -n '/READ_ONLY_PROBES/,/] as const/p;/REVIEWER_EXTRA/,/] as const/p' "$ROLE_TOOLS")"
if grep -q "sandbox: local({ cwd: PROJECT })" "$AGENT_FILE" \
  && grep -q "domain/role-tools" "$AGENT_FILE" \
  && grep -q "toolsForVerbs(handyman.tools, reviewerVerbs())" "$AGENT_FILE" \
  && grep -q "toolsForVerbs(handyman.tools, implementerVerbs())" "$AGENT_FILE" \
  && printf '%s' "$BLOCKS" | grep -q "'backlog_review'" \
  && ! printf '%s' "$BLOCKS" | grep -qE "'(feature_(add|start|close|close_async|block|unblock|acceptance|log|next_step)|sprint_close|report_write|handoff_(submit|claim))'" \
  && grep -q 'MCP_PREFIX}\${v}' "$ROLE_TOOLS" \
  && ! grep -q 'MCP_PREFIX}__\${v}' "$ROLE_TOOLS"; then
  pass
else
  fail "sandbox grounding, reviewer read-only set, or prefix building broken"
fi

summary

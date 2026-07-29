#!/usr/bin/env bash
# Bundle smoke (feature 102, mastra_runtime_pack): builds dist-bundle/ and
# boots a runner with PLAIN node (no tsx) from an ALIEN cwd against an
# isolated HANDYMAN_ROOT with a minimal registered fixture — MCP down on
# purpose. Asserts the run clears resource resolution (registry name /
# assets / catalog all resolve from the bundle's own location), fails ONLY
# at the MCP connect with an actionable message, and exits non-zero.
#
#   bash agents/mastra-handyman/scripts/smoke_bundle.sh
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=../../../tests/lib/assert.sh
. "$PKG_DIR/../../tests/lib/assert.sh"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Bundle smoke (agents/mastra-handyman/scripts/smoke_bundle.sh)"

# --- S1: the bundle builds and ships every runner ---------------------------
start_case "build:bundle emits the three runner bundles"
BUILD_OUT="$(cd "$PKG_DIR" && pnpm build:bundle 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] \
  && [ -f "$PKG_DIR/dist-bundle/run-feature.mjs" ] \
  && [ -f "$PKG_DIR/dist-bundle/run-workflow.mjs" ] \
  && [ -f "$PKG_DIR/dist-bundle/run-skill.mjs" ] \
  && printf '%s' "$BUILD_OUT" | grep -q '^status: ok$'; then
  pass
else
  fail "exit=$CODE out=$BUILD_OUT"
fi

# --- S2: third-party deps stay external -------------------------------------
start_case "bundles keep @mastra/* as runtime imports (nothing inlined)"
if grep -q 'from "@mastra/core"' "$PKG_DIR/dist-bundle/run-feature.mjs" \
  && ! grep -q 'require is not defined' "$PKG_DIR/dist-bundle/run-feature.mjs"; then
  pass
else
  fail "external list drifted — check build_bundle.mjs"
fi

# --- Fixture: isolated HANDYMAN_ROOT + minimal registered harness ------------
PROJ="$TMP/bundle-probe"
mkdir -p "$PROJ/.handyman"
printf '{"project_name":"bundleprobe"}' > "$PROJ/harness.config.json"
printf '{"features":[]}' > "$PROJ/.handyman/feature_list.json"
printf '#!/usr/bin/env bash\nexit 0\n' > "$PROJ/init.sh"
chmod +x "$PROJ/init.sh"
HROOT="$TMP/HANDYMAN"
mkdir -p "$HROOT"
printf '{"version":1,"harnesses":[{"project_root":"%s","registered":"2026-07-29"}]}' \
  "$PROJ" > "$HROOT/registry.json"
ALIEN="$TMP/alien-cwd"
mkdir -p "$ALIEN"

# --- S3: plain-node boot from the alien cwd, MCP down -------------------------
# The runner must clear resource resolution (project NAME from the isolated
# registry, role templates and model catalog via the handyman-harness package,
# data/logs under HANDYMAN_ROOT) and die ONLY at the MCP connect — no LLM
# keys are needed: buildApp connects the MCP before resolving any model.
start_case "node bundle boots from an alien cwd and fails ONLY at the MCP"
OUT="$(cd "$ALIEN" && HANDYMAN_ROOT="$HROOT" HANDYMAN_PROJECT_ROOT="bundle-probe" \
  HANDYMAN_MCP_URL="http://127.0.0.1:19999/mcp" \
  node "$PKG_DIR/dist-bundle/run-feature.mjs" smoke_bundle_probe 2>&1)"; CODE=$?
if [ "$CODE" -ne 0 ] \
  && printf '%s' "$OUT" | grep -q 'ECONNREFUSED' \
  && printf '%s' "$OUT" | grep -q 'handyman mcp --http' \
  && printf '%s' "$OUT" | grep -q 'http://127.0.0.1:19999/mcp' \
  && ! printf '%s' "$OUT" | grep -q 'cannot locate the handyman assets' \
  && ! printf '%s' "$OUT" | grep -q 'is not registered' \
  && ! printf '%s' "$OUT" | grep -qi 'Cannot find module'; then
  pass
else
  fail "exit=$CODE out=$(printf '%s' "$OUT" | tail -6)"
fi

# --- S4: the state dirs stay under the isolated HANDYMAN_ROOT ------------------
# The boot died BEFORE memory creation (MCP connect comes first), so nothing
# may leak into the alien cwd or the real ~/HANDYMAN — the isolated root is
# the only writable target and it must hold no agent dir yet.
start_case "no state leaks into the alien cwd (dirs default under HANDYMAN_ROOT)"
if [ -z "$(ls -A "$ALIEN")" ]; then
  pass
else
  fail "alien cwd gained files: $(ls -A "$ALIEN")"
fi

summary

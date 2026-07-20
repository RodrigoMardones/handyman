#!/usr/bin/env bash
# apps/web acceptance-from-diff relay tests (feature 33). Structural:
# /api/acceptance exists as a native route handler, goes through the shared
# D-B prelude (lib/relayTarget.ts), validates its own `source`, writes nothing
# to disk, and the /intake view gains the mode toggle that reuses the existing
# harness/provider selectors and the safe markdown preview.
#
# The logic is unit-tested without a server in tests/test_toolbox_acceptance.js;
# the wire contract (SSE frames + the 400s) is pinned by the black-box oracle
# in tests/test_toolbox_serve.sh.
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
REPO_ROOT="$(cd "$SUITE_DIR/.." && pwd)"
WEB_DIR="$REPO_ROOT/apps/web"
ACC="$WEB_DIR/app/api/acceptance/route.ts"
TARGET="$WEB_DIR/lib/relayTarget.ts"
CORE="$REPO_ROOT/packages/toolbox-core/src/acceptance.ts"
CLIENT="$WEB_DIR/components/IntakeClient.tsx"
PAGE="$WEB_DIR/app/intake/page.tsx"

echo "apps/web acceptance relay suite (test_web_acceptance.sh)"

# --- TWA1: native route handler ----------------------------------------------
start_case "/api/acceptance exists as a POST route handler (force-dynamic)"
if [ -f "$ACC" ] && grep -q 'force-dynamic' "$ACC" \
  && grep -q 'export async function POST' "$ACC"; then
  pass
else
  fail "$ACC missing or malformed"
fi

# --- TWA2: shared D-B prelude + the route's own source guard ------------------
start_case "/api/acceptance validates through relayTarget and guards source"
if grep -q 'resolveRelayTarget' "$ACC" \
  && grep -q 'instanceof Response' "$ACC" \
  && grep -q "source must be 'diff' or 'spec'" "$ACC" \
  && grep -q 'spec is required' "$ACC" \
  && grep -q 'isRegisteredRoot' "$TARGET" \
  && grep -q 'root not registered' "$TARGET"; then
  pass
else
  fail "acceptance lost the shared prelude or a source guard"
fi

# --- TWA3: the spec arrives in the body, never as a path ----------------------
# Deliberate: taking a filename would mean a second workspace-read allowlist
# next to /api/md's, for no gain. Nothing here reads a caller-named file.
start_case "the spec is taken from the body, not read from a caller-named path"
if grep -q 'body.spec' "$ACC" \
  && ! grep -qE 'readFileSync|resolveMd|readText' "$ACC"; then
  pass
else
  fail "acceptance reads a caller-named file: that needs an allowlist it does not have"
fi

# --- TWA4: the observable-verb contract lives in the system prompt ------------
start_case "the system prompt demands observable verbs and bans vague phrasing"
if grep -q 'composeAcceptanceSystem' "$CORE" \
  && grep -q 'OBSERVABLE' "$CORE" \
  && grep -q 'PROHIBIDO' "$CORE" \
  && grep -q 'deberia funcionar' "$CORE" \
  && grep -q 'ULTIMA bala' "$CORE"; then
  pass
else
  fail "the acceptance system prompt lost the observable/vague/gate rules"
fi

# --- TWA5: gate compliance is CHECKED server-side, not merely requested -------
# The prompt asking for it is not evidence. lastBulletIsGreenGate verifies it
# deterministically and the result reports gate_last.
start_case "the green gate as last bullet is verified server-side (gate_last)"
if grep -q 'lastBulletIsGreenGate' "$CORE" \
  && grep -q 'gate_last' "$CORE" \
  && grep -q './init.sh' "$CORE" \
  && grep -q 'tests/run_tests.sh' "$CORE"; then
  pass
else
  fail "gate compliance is no longer checked server-side"
fi

# --- TWA6: read-only -----------------------------------------------------------
start_case "/api/acceptance never writes disk"
if ! grep -qE 'writeFileSync|writeFile|appendFile|mkdirSync|rmSync' "$ACC" "$CORE"; then
  pass
else
  fail "the acceptance relay writes to disk: it must stay read-only"
fi

# --- TWA7: the /intake mode toggle reuses the existing machinery --------------
start_case "/intake gains an intake|aceptacion toggle wired to /api/acceptance"
if grep -q 'IntakeMode' "$CLIENT" \
  && grep -q 'acceptance-diff' "$CLIENT" \
  && grep -q 'acceptance-spec' "$CLIENT" \
  && grep -q 'acceptanceUrl' "$CLIENT" \
  && grep -q 'acceptanceUrl="/api/acceptance"' "$PAGE"; then
  pass
else
  fail "the /intake view has no mode toggle wired to /api/acceptance"
fi

# --- TWA8: the toggle reuses the safe preview, it does not add a second one ---
start_case "acceptance mode reuses the existing selectors and markdown preview"
if grep -q 'streamSseOverPost' "$CLIENT" \
  && [ "$(grep -c 'streamSseOverPost(' "$CLIENT")" -le 3 ] \
  && grep -q 'acceptance_md' "$CLIENT" \
  && grep -q 'gate_last' "$CLIENT"; then
  pass
else
  fail "acceptance mode grew its own streaming or rendering path"
fi

# --- TWA9: SSE framing comes from the shared helper ---------------------------
start_case "/api/acceptance streams through lib/relay.ts (delta|result|error)"
if grep -q 'relayResponse' "$ACC" \
  && grep -q 'sse("delta"' "$ACC" \
  && grep -q 'sse("result"' "$ACC" \
  && grep -q 'sse("error"' "$ACC"; then
  pass
else
  fail "acceptance does not use the byte-stable SSE framing helper"
fi

summary

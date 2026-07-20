#!/usr/bin/env bash
# apps/web retro/lessons relay tests (feature 35). Structural: /api/retro
# exists as a native route handler, goes through the shared D-B prelude
# (lib/relayTarget.ts), never writes docs/conventions.md, and enforces the
# anti-generalisation bar server-side rather than only asking for it.
#
# The logic is unit-tested without a server in tests/test_toolbox_retro.js; the
# wire contract (SSE frames + the 400s) is pinned by the black-box oracle in
# tests/test_toolbox_serve.sh.
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
REPO_ROOT="$(cd "$SUITE_DIR/.." && pwd)"
WEB_DIR="$REPO_ROOT/apps/web"
RETRO="$WEB_DIR/app/api/retro/route.ts"
TARGET="$WEB_DIR/lib/relayTarget.ts"
CORE="$REPO_ROOT/packages/toolbox-core/src/retro.ts"

echo "apps/web retro relay suite (test_web_retro.sh)"

# --- TWO1: native route handler ----------------------------------------------
start_case "/api/retro exists as a POST route handler (force-dynamic)"
if [ -f "$RETRO" ] && grep -q 'force-dynamic' "$RETRO" \
  && grep -q 'export async function POST' "$RETRO"; then
  pass
else
  fail "$RETRO missing or malformed"
fi

# --- TWO2: the shared D-B prelude ---------------------------------------------
start_case "/api/retro validates through the shared relayTarget prelude"
if grep -q 'resolveRelayTarget' "$RETRO" \
  && grep -q 'instanceof Response' "$RETRO" \
  && grep -q 'isRegisteredRoot' "$TARGET" \
  && grep -q 'root not registered' "$TARGET" \
  && grep -q 'unknown provider' "$TARGET"; then
  pass
else
  fail "retro does not go through lib/relayTarget.ts"
fi

# --- TWO3: only CLOSED features become lessons --------------------------------
start_case "the corpus is built from history plus the backlog of done features"
if grep -q 'readRetroCorpus' "$RETRO" \
  && grep -q 'history.md' "$CORE" \
  && grep -q 'status === "done"' "$CORE" \
  && grep -q 'closedSet.has' "$CORE"; then
  pass
else
  fail "retro no longer restricts the corpus to closed features"
fi

# --- TWO4: the evidence bar is ENFORCED, not merely requested -----------------
# A pattern backed by one feature is an anecdote. The prompt says so AND
# parseRetroPatterns drops it, so a model ignoring the rule cannot smuggle it.
start_case "the anti-generalisation bar is enforced server-side and counted"
if grep -q 'RETRO_MIN_EVIDENCE' "$CORE" \
  && grep -q 'features.length < RETRO_MIN_EVIDENCE' "$CORE" \
  && grep -q 'discarded' "$CORE" \
  && grep -q 'anecdota' "$CORE"; then
  pass
else
  fail "the evidence bar is no longer enforced when parsing"
fi

# --- TWO5: suggestions only, never a write ------------------------------------
start_case "/api/retro never writes docs/conventions.md or anything else"
if ! grep -qE 'writeFileSync|writeFile|appendFile|mkdirSync|rmSync' "$RETRO" "$CORE"; then
  pass
else
  fail "the retro relay writes to disk: it must stay read-only"
fi

# --- TWO6: SSE framing comes from the shared helper ---------------------------
start_case "/api/retro streams through lib/relay.ts (delta|result|error)"
if grep -q 'relayResponse' "$RETRO" \
  && grep -q 'sse("delta"' "$RETRO" \
  && grep -q 'sse("result"' "$RETRO" \
  && grep -q 'sse("error"' "$RETRO"; then
  pass
else
  fail "retro does not use the byte-stable SSE framing helper"
fi

summary

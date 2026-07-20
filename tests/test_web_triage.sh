#!/usr/bin/env bash
# apps/web backlog-triage relay tests (feature 32). Structural: /api/triage
# exists as a native route handler, goes through the shared D-B prelude
# (lib/relayTarget.ts) rather than re-deriving the validation, computes the
# evidence debt SERVER-side, and writes nothing to disk.
#
# The logic is unit-tested without a server in tests/test_toolbox_triage.js;
# the wire contract (SSE frames + the 400s) is pinned by the black-box oracle
# in tests/test_toolbox_serve.sh.
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
REPO_ROOT="$(cd "$SUITE_DIR/.." && pwd)"
WEB_DIR="$REPO_ROOT/apps/web"
TRIAGE="$WEB_DIR/app/api/triage/route.ts"
TARGET="$WEB_DIR/lib/relayTarget.ts"
CORE="$REPO_ROOT/packages/toolbox-core/src/triage.ts"

echo "apps/web triage relay suite (test_web_triage.sh)"

# --- TWT1: native route handler ----------------------------------------------
start_case "/api/triage exists as a POST route handler (force-dynamic)"
if [ -f "$TRIAGE" ] && grep -q 'force-dynamic' "$TRIAGE" \
  && grep -q 'export async function POST' "$TRIAGE"; then
  pass
else
  fail "$TRIAGE missing or malformed"
fi

# --- TWT2: the shared D-B prelude, not a re-derived validation ----------------
# Decision D-B (.handyman/docs/architecture.md): the four new relays share the
# root+provider+model prelude; the three original ones deliberately do not.
start_case "/api/triage validates through the shared relayTarget prelude"
if grep -q 'resolveRelayTarget' "$TRIAGE" \
  && grep -q 'instanceof Response' "$TRIAGE" \
  && grep -q 'isRegisteredRoot' "$TARGET" \
  && grep -q 'root not registered' "$TARGET" \
  && grep -q 'unknown provider' "$TARGET" \
  && grep -q 'resolveSummaryModel' "$TARGET"; then
  pass
else
  fail "triage does not go through lib/relayTarget.ts, or the prelude lost a guard"
fi

# --- TWT3: the registry stays the allowlist for the workspace read ------------
start_case "the prelude refuses an unregistered root before any LLM call"
if grep -q 'readJsonObject' "$TARGET" \
  && grep -B4 'unknown provider' "$TARGET" | grep -q 'providers.find'; then
  pass
else
  fail "relayTarget.ts stopped guarding the root/provider before resolving"
fi

# --- TWT4: evidence debt is COMPUTED, never inferred by the model -------------
# The whole point of the variant: "features done with no review_<name>.md" is
# a filesystem fact validate_harness does not check. A model must not guess it.
start_case "evidence_debt is computed server-side from disk, not asked of the LLM"
if grep -q 'computeEvidenceDebt' "$TRIAGE" \
  && grep -q 'evidenceDebt' "$TRIAGE" \
  && grep -q 'readFeatures' "$CORE" \
  && grep -q 'status === "done"' "$CORE"; then
  pass
else
  fail "evidence debt is not computed from feature_list.json + backlog/ on the server"
fi

# --- TWT5: the system prompt forbids auto-merge -------------------------------
start_case "the triage system prompt forbids auto-merge (human decides)"
if grep -q 'composeTriageSystem' "$CORE" \
  && grep -q 'un humano decide' "$CORE" \
  && grep -q 'confianza' "$CORE"; then
  pass
else
  fail "the triage system prompt lost the never-auto-merge rule"
fi

# --- TWT6: read-only -----------------------------------------------------------
start_case "/api/triage never writes disk"
if ! grep -qE 'writeFileSync|writeFile|appendFile|mkdirSync|rmSync' "$TRIAGE" "$CORE"; then
  pass
else
  fail "the triage relay writes to disk: it must stay read-only"
fi

# --- TWT7: SSE framing comes from the shared helper ---------------------------
start_case "/api/triage streams through lib/relay.ts (delta|result|error)"
if grep -q 'relayResponse' "$TRIAGE" \
  && grep -q 'sse("delta"' "$TRIAGE" \
  && grep -q 'sse("result"' "$TRIAGE" \
  && grep -q 'sse("error"' "$TRIAGE"; then
  pass
else
  fail "triage does not use the byte-stable SSE framing helper"
fi

summary

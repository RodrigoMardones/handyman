#!/usr/bin/env bash
# apps/web LLM-relay tests (feature toolbox_next_llm_relays). Structural:
# the three SSE-over-POST relays exist as native route handlers with the
# observer's exact validation bodies, the byte-stable SSE framing helper,
# the runtime SummaryCache contract, and the shared resolveSummaryModel.
# Behavior parity is pinned by the black-box oracle in default mode and by
# the documented TOOLBOX_BASE_URL dual run (SSE + cache-hit cases included).
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
REPO_ROOT="$(cd "$SUITE_DIR/.." && pwd)"
WEB_DIR="$REPO_ROOT/apps/web"
DRAFT="$WEB_DIR/app/api/draft/route.ts"
SUMMARIZE="$WEB_DIR/app/api/summarize/route.ts"
ASK="$WEB_DIR/app/api/ask/route.ts"
RELAY="$WEB_DIR/lib/relay.ts"
CORE_SUMMARY="$REPO_ROOT/packages/toolbox-core/src/summary.ts"
SERVE="$REPO_ROOT/apps/web/app/api/summarize/route.ts"

echo "apps/web LLM relays suite (test_web_relays.sh)"

# --- TWL1: the three native relay handlers exist as POST + force-dynamic -----
start_case "draft/summarize/ask route handlers exist (POST, force-dynamic)"
BAD=""
for f in "$DRAFT" "$SUMMARIZE" "$ASK"; do
  { [ -f "$f" ] && grep -q 'force-dynamic' "$f" && grep -q 'export async function POST' "$f"; } \
    || BAD="$BAD $f"
done
if [ -z "$BAD" ]; then pass; else fail "missing or malformed:$BAD"; fi

# --- TWL2: validation bodies are byte-identical to the observer --------------
start_case "relay validations carry the observer's exact 400 bodies"
if grep -q 'invalid body: expects {root, prompt, provider}' "$DRAFT" \
  && grep -q 'root not registered' "$DRAFT" && grep -q 'unknown provider' "$DRAFT" \
  && grep -q 'invalid body: expects {provider?, model?}' "$SUMMARIZE" \
  && grep -q 'unknown provider' "$SUMMARIZE" \
  && grep -q 'invalid body: expects {root, question, provider?}' "$ASK" \
  && grep -q 'root is required' "$ASK" && grep -q 'question is required' "$ASK" \
  && grep -q 'root not registered' "$ASK"; then
  pass
else
  fail "a validation body drifted from the observer contract"
fi

# --- TWL3: byte-stable SSE framing + relay headers ----------------------------
start_case "lib/relay.ts frames event/data pairs with the observer's relay headers"
if grep -q 'event: \${event}' "$RELAY" \
  && grep -q 'data: \${JSON.stringify(data)}' "$RELAY" \
  && grep -q 'text/event-stream' "$RELAY" && grep -q 'no-store' "$RELAY" \
  && grep -q 'X-Content-Type-Options' "$RELAY" && grep -q 'CSP_HEADER' "$RELAY" \
  && grep -q 'readJsonObject' "$RELAY" && grep -q '256 \* 1024' "$RELAY"; then
  pass
else
  fail "SSE framing, headers or the capped body reader drifted"
fi

# --- TWL4: summarize uses the runtime SummaryCache (hit replays, miss stores) -
start_case "summarize relays through the runtime SummaryCache (cached true/false + hash)"
if grep -q 'runtime.summaryCache.get(hash)' "$SUMMARIZE" \
  && grep -q 'cached: true' "$SUMMARIZE" && grep -q 'cached: false' "$SUMMARIZE" \
  && grep -q 'runtime.summaryCache.set(hash' "$SUMMARIZE"; then
  pass
else
  fail "summarize does not honor the SummaryCache contract"
fi

# --- TWL5: resolveSummaryModel is shared, not duplicated ----------------------
start_case "resolveSummaryModel lives in the core and is shared by serve + relays"
if grep -q 'export function resolveSummaryModel' "$CORE_SUMMARY" \
  && ! grep -q 'function resolveSummaryModel' "$SERVE" \
  && grep -q 'resolveSummaryModel' "$SUMMARIZE" && grep -q 'resolveSummaryModel' "$ASK"; then
  pass
else
  fail "resolveSummaryModel duplicated or not shared"
fi

# --- TWL6: the relays are served natively by Next -----------------------------
# Feature 50 removed proxy.ts's route manifest along with the Node upstream it
# used to guard, so the honest assertion is the route files themselves.
start_case "/api/draft, /api/summarize and /api/ask are native Next route handlers"
if [ -f "$WEB_DIR/app/api/draft/route.ts" ] && [ -f "$WEB_DIR/app/api/summarize/route.ts" ] \
  && [ -f "$WEB_DIR/app/api/ask/route.ts" ]; then
  pass
else
  fail "a relay route handler is missing: not served natively"
fi

summary

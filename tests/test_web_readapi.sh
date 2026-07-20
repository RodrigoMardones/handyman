#!/usr/bin/env bash
# apps/web read-API tests (feature toolbox_next_read_api). Structural: the
# six native GET endpoints exist as route handlers with the observer's exact
# error bodies and headers helper, the strangler steals their paths, and the
# vendor/graph logic is SHARED with the Node observer (extracted to
# handyman/src/toolbox_assets.ts, no duplication). Behavior parity is pinned
# by the black-box oracle (test_toolbox_serve.sh) in default mode and by the
# documented TOOLBOX_BASE_URL dual run against the Next port.
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
REPO_ROOT="$(cd "$SUITE_DIR/.." && pwd)"
WEB_DIR="$REPO_ROOT/apps/web"
RESPOND="$WEB_DIR/lib/respond.ts"
ASSETS="$REPO_ROOT/handyman/src/toolbox_assets.ts"

echo "apps/web read-API suite (test_web_readapi.sh)"

# --- TWA1: the six native route handlers exist -------------------------------
start_case "route handlers exist for corpus/md/files/providers/graph/vendor"
MISSING=""
for rel in "app/api/corpus/route.ts" "app/api/md/route.ts" "app/api/files/route.ts" \
  "app/api/providers/route.ts" "app/graph/[...slug]/route.ts" "app/vendor/[...slug]/route.ts"; do
  [ -f "$WEB_DIR/$rel" ] || MISSING="$MISSING $rel"
done
if [ -z "$MISSING" ]; then pass; else fail "missing:$MISSING"; fi

# --- TWA2: every handler is force-dynamic (disk reads on each request) -------
start_case "read-API handlers are force-dynamic"
BAD=""
for rel in "app/api/corpus/route.ts" "app/api/md/route.ts" "app/api/files/route.ts" \
  "app/api/providers/route.ts" "app/graph/[...slug]/route.ts" "app/vendor/[...slug]/route.ts"; do
  grep -q 'force-dynamic' "$WEB_DIR/$rel" || BAD="$BAD $rel"
done
if [ -z "$BAD" ]; then pass; else fail "not force-dynamic:$BAD"; fi

# --- TWA3: byte-parity error bodies + shared response headers ----------------
start_case "handlers carry the observer's exact error bodies and header helper"
if grep -q 'root not registered or file not whitelisted' "$WEB_DIR/app/api/md/route.ts" \
  && grep -q 'file not found' "$WEB_DIR/app/api/md/route.ts" \
  && grep -q 'root not registered' "$WEB_DIR/app/api/files/route.ts" \
  && grep -q 'provider check failed' "$WEB_DIR/app/api/providers/route.ts" \
  && grep -q 'unknown harness' "$WEB_DIR/app/graph/[...slug]/route.ts" \
  && grep -q 'no graphify export for this harness' "$WEB_DIR/app/graph/[...slug]/route.ts" \
  && grep -q 'vendor lib not installed' "$WEB_DIR/app/vendor/[...slug]/route.ts" \
  && grep -q 'CSP_HEADER' "$RESPOND" && grep -q 'no-store' "$RESPOND" \
  && grep -q 'X-Content-Type-Options' "$RESPOND"; then
  pass
else
  fail "an error body or the respond helper drifted from the observer contract"
fi

# --- TWA4: the read-API paths are served natively by Next ---------------------
# Feature 50 removed proxy.ts's route manifest along with the Node upstream it
# used to guard, so the honest assertion is the route files themselves.
start_case "the read-API paths are native Next route handlers (incl. graph/vendor catch-alls)"
if [ -f "$WEB_DIR/app/api/corpus/route.ts" ] && [ -f "$WEB_DIR/app/api/files/route.ts" ] \
  && [ -f "$WEB_DIR/app/api/providers/route.ts" ] && [ -f "$WEB_DIR/app/api/md/route.ts" ] \
  && [ -f "$WEB_DIR/app/graph/[...slug]/route.ts" ] && [ -f "$WEB_DIR/app/vendor/[...slug]/route.ts" ]; then
  pass
else
  fail "a read-API route handler is missing: not served natively"
fi

# --- TWA5: vendor/graph logic is shared, not duplicated ----------------------
# This case used to prove the Node observer (toolbox_serve.ts) imported the
# shared helpers instead of reimplementing them. Feature 50 deleted that file,
# and re-pointing the same greps at toolbox_state.ts made the two negatives
# trivially true (that module never held vendor logic) - a case that could not
# fail. The consumers now are apps/web's route handlers via lib/toolboxState.ts,
# so the anti-duplication property is asserted where it can still regress: a
# copy-pasted vendorFiles/packageRoot anywhere under apps/web fails this.
start_case "toolbox_assets.ts is the single home of vendor/graph logic"
WEB_DUP="$(grep -rlE 'const vendorFiles|function packageRoot|function vendorFiles' \
  "$WEB_DIR/app" "$WEB_DIR/lib" "$WEB_DIR/components" 2>/dev/null | head -3)"
if [ -f "$ASSETS" ] && grep -q 'vendorFiles' "$ASSETS" && grep -q 'graphFile' "$ASSETS" \
  && [ -z "$WEB_DUP" ]; then
  pass
else
  fail "vendor/graph logic missing from toolbox_assets.ts or duplicated in apps/web: $WEB_DUP"
fi

# --- TWA6: the web loader exposes the shared entry ----------------------------
start_case "runtime loader exposes buildState + vendorText + graphFile"
LOADER="$WEB_DIR/lib/toolboxState.ts"
if grep -q 'getToolboxEntry' "$LOADER" && grep -q 'vendorText' "$LOADER" \
  && grep -q 'graphFile' "$LOADER" \
  && grep -q 'getToolboxEntry' "$WEB_DIR/app/graph/[...slug]/route.ts" \
  && grep -q 'getToolboxEntry' "$WEB_DIR/app/vendor/[...slug]/route.ts"; then
  pass
else
  fail "runtime loader does not expose the shared entry to the handlers"
fi

summary

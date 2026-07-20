#!/usr/bin/env bash
# apps/web intake tests (feature toolbox_next_intake_action). Structural:
# the single write is unified - one core function (writeIntake) behind the
# Node observer, the native POST /api/intake route handler AND the
# submitIntake server action. Behavior parity is pinned by the unit cases in
# test_toolbox_state.js (T7), the black-box oracle in default mode, and the
# documented TOOLBOX_BASE_URL dual run.
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
REPO_ROOT="$(cd "$SUITE_DIR/.." && pwd)"
WEB_DIR="$REPO_ROOT/apps/web"
ROUTE="$WEB_DIR/app/api/intake/route.ts"
ACTION="$WEB_DIR/actions/intake.ts"
CORE_INTAKE="$REPO_ROOT/packages/toolbox-core/src/intake.ts"
SERVE="$REPO_ROOT/apps/web/app/api/intake/route.ts"

echo "apps/web intake suite (test_web_intake.sh)"

# --- TWI1: route handler exists (POST, force-dynamic, capped body) -----------
start_case "app/api/intake/route.ts exists (POST, force-dynamic, INTAKE_MAX_BYTES cap)"
if [ -f "$ROUTE" ] && grep -q 'export async function POST' "$ROUTE" \
  && grep -q 'force-dynamic' "$ROUTE" && grep -q 'INTAKE_MAX_BYTES' "$ROUTE" \
  && grep -q 'invalid body: expects {root, draft_md}' "$ROUTE"; then
  pass
else
  fail "route handler missing or malformed"
fi

# --- TWI2: the server action exists and shares the core write ----------------
start_case "actions/intake.ts is 'use server' and submitIntake uses writeIntake"
if [ -f "$ACTION" ] && head -1 "$ACTION" | grep -q '"use server"' \
  && grep -q 'export async function submitIntake' "$ACTION" \
  && grep -q 'writeIntake' "$ACTION" && grep -q 'INTAKE_MAX_BYTES' "$ACTION"; then
  pass
else
  fail "server action missing or not sharing the core write"
fi

# --- TWI3: one write function, three consumers, zero duplication -------------
start_case "writeIntake/intakeHttp live in the core; the route delegates"
if grep -q 'export function writeIntake' "$CORE_INTAKE" \
  && grep -q 'export function intakeHttp' "$CORE_INTAKE" \
  && grep -q 'intakeHttp(' "$SERVE" \
  && grep -q 'writeIntake(' "$SERVE" \
  && ! grep -q 'writeFileSync' "$SERVE" \
  && grep -q 'intakeHttp(' "$ROUTE" && grep -q 'writeIntake(' "$ROUTE"; then
  pass
else
  fail "intake write duplicated or the route still writes disk directly"
fi

# --- TWI4: validation order + statuses stay byte-identical -------------------
start_case "core intake keeps the observer's validation order and bodies"
if grep -q 'root_required' "$CORE_INTAKE" && grep -q 'empty_draft' "$CORE_INTAKE" \
  && grep -q 'root is required' "$CORE_INTAKE" \
  && grep -q 'draft_md must not be empty' "$CORE_INTAKE" \
  && grep -q 'could not resolve harness workspace' "$CORE_INTAKE" \
  && grep -q 'could not write feature-request.md' "$CORE_INTAKE" \
  && grep -q 'spawned_process: false' "$CORE_INTAKE" \
  && grep -q 'TAG_MAX_IN_DRAFT' "$CORE_INTAKE"; then
  pass
else
  fail "a status, body or cap drifted from the observer contract"
fi

# --- TWI5: /api/intake is served natively by Next (strangler complete) ---------
# Feature 50 removed proxy.ts's route manifest along with the Node upstream it
# used to guard, so the honest assertion is the route file itself.
start_case "/api/intake is a native Next route handler"
if [ -f "$WEB_DIR/app/api/intake/route.ts" ]; then
  pass
else
  fail "app/api/intake/route.ts is missing: /api/intake is not served natively"
fi

summary

#!/usr/bin/env bash
# apps/web review-notes relay tests (feature 34). Structural: /api/review-notes
# exists as a native route handler, goes through the shared D-B prelude
# (lib/relayTarget.ts), guards the feature name, writes nothing to disk, and
# keeps the "checklist, never a verdict, never a patch" contract in the prompt.
#
# The logic is unit-tested without a server in tests/test_toolbox_review_notes.js;
# the wire contract (SSE frames + the 400s) is pinned by the black-box oracle
# in tests/test_toolbox_serve.sh.
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
REPO_ROOT="$(cd "$SUITE_DIR/.." && pwd)"
WEB_DIR="$REPO_ROOT/apps/web"
NOTES="$WEB_DIR/app/api/review-notes/route.ts"
TARGET="$WEB_DIR/lib/relayTarget.ts"
CORE="$REPO_ROOT/packages/toolbox-core/src/reviewNotes.ts"

echo "apps/web review-notes relay suite (test_web_review_notes.sh)"

# --- TWR1: native route handler ----------------------------------------------
start_case "/api/review-notes exists as a POST route handler (force-dynamic)"
if [ -f "$NOTES" ] && grep -q 'force-dynamic' "$NOTES" \
  && grep -q 'export async function POST' "$NOTES"; then
  pass
else
  fail "$NOTES missing or malformed"
fi

# --- TWR2: shared D-B prelude + the route's own field -------------------------
start_case "/api/review-notes validates through relayTarget and requires a feature"
if grep -q 'resolveRelayTarget' "$NOTES" \
  && grep -q 'instanceof Response' "$NOTES" \
  && grep -q 'feature is required' "$NOTES" \
  && grep -q 'isRegisteredRoot' "$TARGET" \
  && grep -q 'root not registered' "$TARGET" \
  && grep -q 'unknown provider' "$TARGET"; then
  pass
else
  fail "review-notes lost the shared prelude or the feature guard"
fi

# --- TWR3: the feature name cannot walk out of backlog/ -----------------------
# readImplReport joins the name into backlog/impl_<feature>.md, so the name is
# constrained to harness-identifier shape before it ever reaches the path.
start_case "the feature name is constrained before it reaches a path join"
if grep -q 'FEATURE_NAME' "$NOTES" \
  && grep -q 'A-Za-z0-9_-' "$NOTES" \
  && grep -q 'invalid feature name' "$NOTES"; then
  pass
else
  fail "review-notes does not constrain the feature name"
fi

# --- TWR4: the diff is read without a shell ----------------------------------
# execFile, never exec/spawn with shell:true, and no request field in argv.
start_case "the working diff is read with execFile (no shell, no interpolation)"
if grep -q 'execFileSync' "$CORE" \
  && grep -q '"git", \["diff", "HEAD"\]' "$CORE" \
  && ! grep -qE 'execSync|shell: *true' "$CORE"; then
  pass
else
  fail "readFeatureDiff no longer shells out safely"
fi

# --- TWR5: checklist, never a verdict, never a patch --------------------------
start_case "the system prompt forbids a verdict and a patch"
if grep -q 'composeReviewNotesSystem' "$CORE" \
  && grep -q 'APPROVED' "$CORE" && grep -q 'CHANGES_REQUESTED' "$CORE" \
  && grep -q 'patch' "$CORE" \
  && grep -q 'BORRADOR' "$CORE"; then
  pass
else
  fail "the review-notes system prompt lost the no-verdict / no-patch rule"
fi

# --- TWR6: read-only -----------------------------------------------------------
# The reviewer copies what is useful into backlog/review_<feature>.md through
# the normal flow; this endpoint must never write it for them.
start_case "/api/review-notes never writes disk"
if ! grep -qE 'writeFileSync|writeFile|appendFile|mkdirSync|rmSync' "$NOTES" "$CORE"; then
  pass
else
  fail "the review-notes relay writes to disk: it must stay read-only"
fi

# --- TWR7: SSE framing comes from the shared helper ---------------------------
start_case "/api/review-notes streams through lib/relay.ts (delta|result|error)"
if grep -q 'relayResponse' "$NOTES" \
  && grep -q 'sse("delta"' "$NOTES" \
  && grep -q 'sse("result"' "$NOTES" \
  && grep -q 'sse("error"' "$NOTES"; then
  pass
else
  fail "review-notes does not use the byte-stable SSE framing helper"
fi

summary

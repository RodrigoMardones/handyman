#!/usr/bin/env bash
# Backlog-generator tests for the Handyman skill.
# Exercises scripts/backlog.py against a fixture harness: impl / review (both
# verdicts) / explore entries, the no-overwrite invariant, and input guards.
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
BACKLOG="$SUITE_DIR/../handyman/scripts/backlog.py"

echo "Backlog-generator suite (test_backlog.sh)"

# --- fixture builder ---------------------------------------------------------

# Build a minimal local harness in $1 so resolve_workspace picks .handyman.
write_harness() {
  root="$1"
  mkdir -p "$root/.handyman/progress"
  cat > "$root/.handyman/feature_list.json" <<'JSON'
{ "project": "t", "features": [ { "id": 1, "name": "a", "status": "pending" } ] }
JSON
  : > "$root/.handyman/progress/current.md"
  : > "$root/.handyman/progress/history.md"
}

# --- B1: impl creates a report with implementer frontmatter -----------------
start_case "impl: creates impl_<feature>.md with implementer frontmatter"
T="$(mktemp -d)"
write_harness "$T"
OUT="$(python3 "$BACKLOG" --root "$T" impl cli_edit --date 2026-01-01 2>&1)"; CODE=$?
F="$T/.handyman/backlog/impl_cli_edit.md"
if [ "$CODE" -eq 0 ] && [ -f "$F" ] \
  && grep -q "^feature: cli_edit$" "$F" \
  && grep -q "^role: implementer$" "$F" \
  && grep -q "^updated: 2026-01-01$" "$F" \
  && grep -q "handyman/role/implementer" "$F"; then
  pass
else
  fail "exit=$CODE file=$F output: $OUT"
fi
rm -rf "$T"

# --- B2: review (default approved) ------------------------------------------
start_case "review: default verdict is approved with the approved tag"
T="$(mktemp -d)"
write_harness "$T"
OUT="$(python3 "$BACKLOG" --root "$T" review cli_edit --date 2026-01-01 2>&1)"; CODE=$?
F="$T/.handyman/backlog/review_cli_edit.md"
if [ "$CODE" -eq 0 ] && [ -f "$F" ] \
  && grep -q "^status: approved$" "$F" \
  && grep -q "^role: reviewer$" "$F" \
  && grep -q "handyman/review/approved" "$F"; then
  pass
else
  fail "exit=$CODE file=$F output: $OUT"
fi
rm -rf "$T"

# --- B3: review --status changes_requested ----------------------------------
start_case "review: --status changes_requested flips status, tag, and verdict"
T="$(mktemp -d)"
write_harness "$T"
python3 "$BACKLOG" --root "$T" review cli_edit --status changes_requested --date 2026-01-01 >/dev/null 2>&1
F="$T/.handyman/backlog/review_cli_edit.md"
if grep -q "^status: changes_requested$" "$F" \
  && grep -q "handyman/review/changes_requested" "$F" \
  && grep -q "CHANGES_REQUESTED" "$F" \
  && ! grep -q "^status: approved$" "$F"; then
  pass
else
  fail "changes_requested not applied in $F"
fi
rm -rf "$T"

# --- B4: explore creates a report with explorer frontmatter -----------------
start_case "explore: creates explore_<topic>.md with explorer frontmatter"
T="$(mktemp -d)"
write_harness "$T"
OUT="$(python3 "$BACKLOG" --root "$T" explore di_wiring --date 2026-01-01 2>&1)"; CODE=$?
F="$T/.handyman/backlog/explore_di_wiring.md"
if [ "$CODE" -eq 0 ] && [ -f "$F" ] \
  && grep -q "^topic: di_wiring$" "$F" \
  && grep -q "^role: explorer$" "$F" \
  && grep -q "handyman/role/explorer" "$F"; then
  pass
else
  fail "exit=$CODE file=$F output: $OUT"
fi
rm -rf "$T"

# --- B5: never overwrites an existing entry ---------------------------------
start_case "impl: never overwrites an existing entry"
T="$(mktemp -d)"
write_harness "$T"
python3 "$BACKLOG" --root "$T" impl cli_edit --date 2026-01-01 >/dev/null 2>&1
F="$T/.handyman/backlog/impl_cli_edit.md"
printf '\nHAND EDITED\n' >> "$F"
OUT="$(python3 "$BACKLOG" --root "$T" impl cli_edit --date 2026-01-01 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] && grep -q "HAND EDITED" "$F" \
  && printf '%s' "$OUT" | grep -q "untouched"; then
  pass
else
  fail "exit=$CODE output: $OUT (file should keep the hand edit)"
fi
rm -rf "$T"

# --- B6: input guard rejects path traversal ---------------------------------
start_case "explore: rejects a path-traversal topic"
T="$(mktemp -d)"
write_harness "$T"
OUT="$(python3 "$BACKLOG" --root "$T" explore "../escape" --date 2026-01-01 2>&1)"; CODE=$?
if [ "$CODE" -ne 0 ] && [ ! -e "$T/.handyman/escape.md" ]; then
  pass
else
  fail "expected rejection, exit=$CODE output: $OUT"
fi
rm -rf "$T"

# --- B7: missing subcommand is a usage error --------------------------------
start_case "no subcommand is a usage error (exit 2)"
T="$(mktemp -d)"
write_harness "$T"
python3 "$BACKLOG" --root "$T" >/dev/null 2>&1; CODE=$?
assert_exit 2 "$CODE" "missing subcommand"
rm -rf "$T"

summary

#!/usr/bin/env bash
# Backlog-generator tests for the Handyman skill.
# Exercises dist/backlog.js against a fixture harness: impl / review (both
# verdicts) / explore entries, the no-overwrite invariant, and input guards.
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
DIST="$SUITE_DIR/../handyman/dist"
RUN=(node "$DIST/backlog.js")

# Self-contained: build the TS entrypoint so the suite runs from a fresh
# checkout (deps installed) with no stale-dist hazard. Cheap incremental tsc.
(cd "$SUITE_DIR/../handyman" && npm run build >/dev/null 2>&1)

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
OUT="$("${RUN[@]}" --root "$T" impl cli_edit --date 2026-01-01 2>&1)"; CODE=$?
F="$T/.handyman/backlog/impl_cli_edit.md"
if [ "$CODE" -eq 0 ] && [ -f "$F" ] \
  && grep -q "^type: Implementation Log$" "$F" \
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
OUT="$("${RUN[@]}" --root "$T" review cli_edit --date 2026-01-01 2>&1)"; CODE=$?
F="$T/.handyman/backlog/review_cli_edit.md"
if [ "$CODE" -eq 0 ] && [ -f "$F" ] \
  && grep -q "^type: Review Log$" "$F" \
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
"${RUN[@]}" --root "$T" review cli_edit --status changes_requested --date 2026-01-01 >/dev/null 2>&1
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
OUT="$("${RUN[@]}" --root "$T" explore di_wiring --date 2026-01-01 2>&1)"; CODE=$?
F="$T/.handyman/backlog/explore_di_wiring.md"
if [ "$CODE" -eq 0 ] && [ -f "$F" ] \
  && grep -q "^type: Explore Report$" "$F" \
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
"${RUN[@]}" --root "$T" impl cli_edit --date 2026-01-01 >/dev/null 2>&1
F="$T/.handyman/backlog/impl_cli_edit.md"
printf '\nHAND EDITED\n' >> "$F"
OUT="$("${RUN[@]}" --root "$T" impl cli_edit --date 2026-01-01 2>&1)"; CODE=$?
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
OUT="$("${RUN[@]}" --root "$T" explore "../escape" --date 2026-01-01 2>&1)"; CODE=$?
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
"${RUN[@]}" --root "$T" >/dev/null 2>&1; CODE=$?
assert_exit 2 "$CODE" "missing subcommand"
rm -rf "$T"

# --- B8: re-running review with the same verdict is idempotent --------------
# Re-running a command must not be an error: only a *contradicted* verdict is.
start_case "review: the same --status on an existing report exits 0 and leaves it alone"
T="$(mktemp -d)"
write_harness "$T"
"${RUN[@]}" --root "$T" review a --status changes_requested --date 2026-01-01 >/dev/null 2>&1
F="$T/.handyman/backlog/review_a.md"
BEFORE="$(md5 -q "$F" 2>/dev/null || md5sum "$F" | cut -d' ' -f1)"
OUT="$("${RUN[@]}" --root "$T" review a --status changes_requested --date 2026-01-01 2>&1)"; CODE=$?
AFTER="$(md5 -q "$F" 2>/dev/null || md5sum "$F" | cut -d' ' -f1)"
if [ "$CODE" -eq 0 ] && [ "$BEFORE" = "$AFTER" ] && printf '%s' "$OUT" | grep -q "untouched"; then
  pass
else
  fail "expected an idempotent no-op: exit=$CODE output: $OUT"
fi
rm -rf "$T"

# --- B9: a contradicted verdict without --force is an error -----------------
# This is the contract change: it used to print "left untouched" and exit 0, so
# a caller could not tell a discarded verdict from a write.
start_case "review: a differing --status without --force exits non-zero, naming both"
T="$(mktemp -d)"
write_harness "$T"
"${RUN[@]}" --root "$T" review a --status changes_requested --date 2026-01-01 >/dev/null 2>&1
F="$T/.handyman/backlog/review_a.md"
BEFORE="$(md5 -q "$F" 2>/dev/null || md5sum "$F" | cut -d' ' -f1)"
OUT="$("${RUN[@]}" --root "$T" review a --status approved --date 2026-01-01 2>&1)"; CODE=$?
AFTER="$(md5 -q "$F" 2>/dev/null || md5sum "$F" | cut -d' ' -f1)"
if [ "$CODE" -ne 0 ] && [ "$BEFORE" = "$AFTER" ] \
  && printf '%s' "$OUT" | grep -q "changes_requested" \
  && printf '%s' "$OUT" | grep -q "approved"; then
  pass
else
  fail "expected a refusal naming both verdicts with the file intact: exit=$CODE output: $OUT"
fi
rm -rf "$T"

# --- B10: --force reissues, keeping the body ---------------------------------
# The CHANGES_REQUESTED -> APPROVED cycle as a command. The reviewer's prose is
# the report; re-rendering from the template would discard the review while
# claiming to update it.
start_case "review: --force flips the verdict tokens and preserves the body"
T="$(mktemp -d)"
write_harness "$T"
"${RUN[@]}" --root "$T" review a --status changes_requested --date 2026-01-01 >/dev/null 2>&1
F="$T/.handyman/backlog/review_a.md"
printf '\n## Findings\n\nREVIEWER PROSE THAT MUST SURVIVE\n' >> "$F"
OUT="$("${RUN[@]}" --root "$T" review a --status approved --force --date 2026-01-01 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] \
  && grep -q "^status: approved" "$F" \
  && grep -q "handyman/review/approved" "$F" \
  && ! grep -q "changes_requested" "$F" \
  && grep -q "^APPROVED" "$F" \
  && grep -q "REVIEWER PROSE THAT MUST SURVIVE" "$F"; then
  pass
else
  fail "expected a reissued verdict with the body kept: exit=$CODE output: $OUT"
fi
rm -rf "$T"

# --- B11: a reissued report matches a freshly generated one ------------------
# The verdict hint comment names the *other* verdict, so flipping only the
# leading token would leave `APPROVED   <!-- or APPROVED -->`. Pin the shape
# against the generator itself rather than against a hand-written expectation.
start_case "review: a reissued report is byte-identical to a freshly generated one"
T="$(mktemp -d)"; T2="$(mktemp -d)"
write_harness "$T"; write_harness "$T2"
"${RUN[@]}" --root "$T" review a --status changes_requested --date 2026-01-01 >/dev/null 2>&1
"${RUN[@]}" --root "$T" review a --status approved --force --date 2026-01-01 >/dev/null 2>&1
"${RUN[@]}" --root "$T2" review a --status approved --date 2026-01-01 >/dev/null 2>&1
if diff -q "$T/.handyman/backlog/review_a.md" "$T2/.handyman/backlog/review_a.md" >/dev/null; then
  pass
else
  fail "reissued report drifted from the generated shape: $(diff "$T/.handyman/backlog/review_a.md" "$T2/.handyman/backlog/review_a.md")"
fi
rm -rf "$T" "$T2"

# --- B12: a hand-restructured report reissues, and says what it could not do -
# The structured keys still update; the missing body marker is reported instead
# of pretending the file came out coherent.
start_case "review: --force on a report with no verdict marker updates and NOTEs"
T="$(mktemp -d)"
write_harness "$T"
mkdir -p "$T/.handyman/backlog"
cat > "$T/.handyman/backlog/review_a.md" <<'MD'
---
feature: a
status: changes_requested
role: reviewer
tags: [handyman/role/reviewer, handyman/review/changes_requested]
---

# Review: a

## Verdict

Prose verdict with no marker token.
MD
F="$T/.handyman/backlog/review_a.md"
OUT="$("${RUN[@]}" --root "$T" review a --status approved --force --date 2026-01-01 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] \
  && grep -q "^status: approved" "$F" \
  && grep -q "handyman/review/approved" "$F" \
  && grep -q "Prose verdict with no marker token" "$F" \
  && printf '%s' "$OUT" | grep -q "NOTE: no verdict marker"; then
  pass
else
  fail "expected a reissue that reports the missing marker: exit=$CODE output: $OUT"
fi
rm -rf "$T"

summary

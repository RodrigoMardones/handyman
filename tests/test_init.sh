#!/usr/bin/env bash
# Verifier-contract tests for the Handyman skill.
# Exercises the documented init.sh resolution + validation logic using the
# reference implementation in tests/fixtures/init.reference.sh.
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/assert.sh
. "$SUITE_DIR/lib/assert.sh"
REF_INIT="$SUITE_DIR/fixtures/init.reference.sh"

echo "Verifier-contract suite (test_init.sh)"

# --- fixture builders ------------------------------------------------------

# Write the minimal harness state files into $1 (a workspace directory).
write_workspace_files() {
  ws="$1"
  inprog="${2:-1}" # how many features are in_progress
  mkdir -p "$ws/progress" "$ws/docs"
  : > "$ws/progress/current.md"
  : > "$ws/progress/history.md"
  : > "$ws/docs/business.md"
  : > "$ws/docs/architecture.md"
  : > "$ws/docs/conventions.md"
  : > "$ws/docs/verification.md"
  if [ "$inprog" -gt 1 ]; then
    cat > "$ws/feature_list.json" <<'JSON'
{
  "project": "t",
  "features": [
    { "id": 1, "name": "a", "status": "in_progress" },
    { "id": 2, "name": "b", "status": "in_progress" }
  ]
}
JSON
  else
    cat > "$ws/feature_list.json" <<'JSON'
{
  "project": "t",
  "features": [
    { "id": 1, "name": "a", "status": "in_progress" },
    { "id": 2, "name": "b", "status": "pending" }
  ]
}
JSON
  fi
}

write_bridge_files() {
  root="$1"
  : > "$root/AGENTS.md"
  : > "$root/CHECKPOINTS.md"
  cp "$REF_INIT" "$root/init.sh"
  chmod +x "$root/init.sh"
}

# --- T3: local install resolves .handyman and exits 0 ----------------------
start_case "local install: init.sh exits 0 and resolves .handyman"
T3="$(mktemp -d)"
write_bridge_files "$T3"
write_workspace_files "$T3/.handyman" 1
OUT="$("$T3/init.sh" 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] && printf '%s' "$OUT" | grep -q "HARNESS_WORKSPACE=$T3/.handyman"; then
  pass
else
  fail "exit=$CODE output: $OUT"
fi
rm -rf "$T3"

# --- T4: global install resolves harness_workspace from config -------------
start_case "global install: init.sh resolves harness_workspace from config"
T4ROOT="$(mktemp -d)"
T4WS="$(mktemp -d)"
write_bridge_files "$T4ROOT"
write_workspace_files "$T4WS" 1
cat > "$T4ROOT/harness.config.json" <<JSON
{
  "install_mode": "global",
  "project_name": "demo",
  "project_root": "$T4ROOT",
  "harness_workspace": "$T4WS"
}
JSON
OUT="$("$T4ROOT/init.sh" 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] && printf '%s' "$OUT" | grep -q "HARNESS_WORKSPACE=$T4WS"; then
  pass
else
  fail "exit=$CODE output: $OUT"
fi
rm -rf "$T4ROOT" "$T4WS"

# --- T5: more than one in_progress feature fails ---------------------------
start_case "invalid state: >1 in_progress feature fails (exit != 0)"
T5="$(mktemp -d)"
write_bridge_files "$T5"
write_workspace_files "$T5/.handyman" 2
OUT="$("$T5/init.sh" 2>&1)"; CODE=$?
if [ "$CODE" -ne 0 ] && printf '%s' "$OUT" | grep -q "in_progress"; then
  pass
else
  fail "expected failure, exit=$CODE output: $OUT"
fi
rm -rf "$T5"

# --- T6: missing required harness file fails -------------------------------
start_case "missing required harness file fails (exit != 0)"
T6="$(mktemp -d)"
write_bridge_files "$T6"
write_workspace_files "$T6/.handyman" 1
rm "$T6/.handyman/docs/verification.md"
OUT="$("$T6/init.sh" 2>&1)"; CODE=$?
if [ "$CODE" -ne 0 ] && printf '%s' "$OUT" | grep -q "missing harness file"; then
  pass
else
  fail "expected failure, exit=$CODE output: $OUT"
fi
rm -rf "$T6"

# --- T7: relative harness_workspace resolves against PROJECT_ROOT ----------
start_case "relative harness_workspace in config resolves against PROJECT_ROOT"
T7="$(mktemp -d)"
write_bridge_files "$T7"
write_workspace_files "$T7/.handyman" 1
cat > "$T7/harness.config.json" <<'JSON'
{
  "install_mode": "local",
  "project_name": "demo",
  "project_root": ".",
  "harness_workspace": ".handyman"
}
JSON
OUT="$("$T7/init.sh" 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] && printf '%s' "$OUT" | grep -q "HARNESS_WORKSPACE=$T7/.handyman"; then
  pass
else
  fail "exit=$CODE output: $OUT"
fi
rm -rf "$T7"

# --- validate_harness: deterministic structure validator (TS port) ----------
VALIDATOR="$SUITE_DIR/../handyman/dist/validate_harness.js"

# --- T8: validator exits 0 on a well-formed local harness ------------------
start_case "validate_harness: exits 0 on a well-formed local harness"
T8="$(mktemp -d)"
write_workspace_files "$T8/.handyman" 1
OUT="$(node "$VALIDATOR" --root "$T8" 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] && printf '%s' "$OUT" | grep -q "OK"; then
  pass
else
  fail "exit=$CODE output: $OUT"
fi
rm -rf "$T8"

# --- T9: validator fails and reports a gap when a core file is missing -----
start_case "validate_harness: missing core file fails with a gap report"
T9="$(mktemp -d)"
write_workspace_files "$T9/.handyman" 1
rm "$T9/.handyman/progress/history.md"
OUT="$(node "$VALIDATOR" --root "$T9" 2>&1)"; CODE=$?
if [ "$CODE" -ne 0 ] && printf '%s' "$OUT" | grep -q "missing harness file"; then
  pass
else
  fail "expected failure, exit=$CODE output: $OUT"
fi
rm -rf "$T9"

# --- T10: validator fails when >1 feature is in_progress -------------------
start_case "validate_harness: >1 in_progress feature fails (exit != 0)"
T10="$(mktemp -d)"
write_workspace_files "$T10/.handyman" 2
OUT="$(node "$VALIDATOR" --root "$T10" 2>&1)"; CODE=$?
if [ "$CODE" -ne 0 ] && printf '%s' "$OUT" | grep -q "in_progress"; then
  pass
else
  fail "expected failure, exit=$CODE output: $OUT"
fi
rm -rf "$T10"

# --- T11: validator flags a role file living inside the workspace ----------
start_case "validate_harness: role file inside workspace is flagged"
T11="$(mktemp -d)"
write_workspace_files "$T11/.handyman" 1
: > "$T11/.handyman/leader.agent.md"
OUT="$(node "$VALIDATOR" --root "$T11" 2>&1)"; CODE=$?
if [ "$CODE" -ne 0 ] && printf '%s' "$OUT" | grep -q "role file inside HARNESS_WORKSPACE"; then
  pass
else
  fail "expected failure, exit=$CODE output: $OUT"
fi
rm -rf "$T11"

# --- T12: scaffold stamps harness_version from SKILL.md --------------------
start_case "scaffold stamps harness_version from SKILL.md into new state"
T12="$(mktemp -d)"
SKILL_MD="$SUITE_DIR/../handyman/SKILL.md"
WANT="$(awk '
  /^---[[:space:]]*$/ { f++; if (f == 2) exit; next }
  f == 1 && /^[[:space:]]+version:[[:space:]]*/ {
    sub(/^[[:space:]]+version:[[:space:]]*/, ""); sub(/[[:space:]]*$/, ""); print; exit
  }' "$SKILL_MD")"
"$SUITE_DIR/../handyman/scripts/scaffold.sh" local "$T12" demo >/dev/null 2>&1
GOT_CFG="$(_json "$T12/harness.config.json" str harness_version 2>/dev/null)"
GOT_FL="$(_json "$T12/.handyman/feature_list.json" str config.harness_version 2>/dev/null)"
if [ -n "$WANT" ] && [ "$GOT_CFG" = "$WANT" ] && [ "$GOT_FL" = "$WANT" ]; then
  pass
else
  fail "want=$WANT config=$GOT_CFG feature_list=$GOT_FL"
fi
rm -rf "$T12"

# --- T13: validator rejects an out-of-contract feature field ---------------
# The schema sets additionalProperties:false, so an invented field such as the
# start_date the docs warn about must fail validation. Guarded by jsonschema
# availability: validate_harness degrades to a skip when it is absent.
if python3 -c "import jsonschema" >/dev/null 2>&1; then
  start_case "validate_harness: extra feature field rejected by schema"
  T13="$(mktemp -d)"
  write_workspace_files "$T13/.handyman" 1
  cat > "$T13/.handyman/feature_list.json" <<'JSON'
{
  "project": "t",
  "features": [
    { "id": 1, "name": "a", "status": "in_progress", "start_date": "2026-01-01" }
  ]
}
JSON
  OUT="$(node "$VALIDATOR" --root "$T13" 2>&1)"; CODE=$?
  if [ "$CODE" -ne 0 ] && printf '%s' "$OUT" | grep -q "schema violation"; then
    pass
  else
    fail "expected schema failure, exit=$CODE output: $OUT"
  fi
  rm -rf "$T13"
else
  echo "  NOTE jsonschema not installed - skipping schema rejection test (T13)"
fi

# --- T14: validator accepts a contract-complete feature_list ---------------
if python3 -c "import jsonschema" >/dev/null 2>&1; then
  start_case "validate_harness: contract-complete feature_list passes schema"
  T14="$(mktemp -d)"
  write_workspace_files "$T14/.handyman" 1
  cat > "$T14/.handyman/feature_list.json" <<'JSON'
{
  "project": "t",
  "description": "d",
  "config": {
    "install_mode": "local",
    "project_name": "t",
    "project_root": ".",
    "handyman_root": null,
    "harness_workspace": ".handyman",
    "harness_version": "1.0.0"
  },
  "rules": {
    "one_feature_at_a_time": true,
    "require_tests_to_close": true,
    "valid_status": ["pending", "in_progress", "done", "blocked"]
  },
  "features": [
    { "id": 1, "name": "a", "title": "A", "description": "x", "acceptance": ["y"], "status": "in_progress" }
  ]
}
JSON
  OUT="$(node "$VALIDATOR" --root "$T14" 2>&1)"; CODE=$?
  if [ "$CODE" -eq 0 ] && printf '%s' "$OUT" | grep -q "OK"; then
    pass
  else
    fail "expected pass, exit=$CODE output: $OUT"
  fi
  rm -rf "$T14"
else
  echo "  NOTE jsonschema not installed - skipping schema acceptance test (T14)"
fi

# --- T15: frontmatter advisory NOTEs an incomplete report (non-blocking) ----
start_case "validate_harness: frontmatter advisory NOTEs an incomplete report but stays green"
T15="$(mktemp -d)"
write_workspace_files "$T15/.handyman" 1
mkdir -p "$T15/.handyman/backlog"
cat > "$T15/.handyman/backlog/impl_x.md" <<'MD'
---
feature: x
---

# Implementation Report: x
MD
OUT="$(node "$VALIDATOR" --root "$T15" 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] && printf '%s' "$OUT" | grep -q "NOTE:" \
  && printf '%s' "$OUT" | grep -q "impl_x.md"; then
  pass
else
  fail "expected a non-blocking NOTE, exit=$CODE output: $OUT"
fi
rm -rf "$T15"

# --- T16: frontmatter advisory is silent on a well-formed report ------------
start_case "validate_harness: frontmatter advisory is silent on a well-formed report"
T16="$(mktemp -d)"
write_workspace_files "$T16/.handyman" 1
node "$SUITE_DIR/../handyman/dist/backlog.js" --root "$T16" impl wellformed --date 2026-01-01 >/dev/null 2>&1
OUT="$(node "$VALIDATOR" --root "$T16" 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] && ! printf '%s' "$OUT" | grep -q "impl_wellformed.md"; then
  pass
else
  fail "expected silence on a well-formed report, exit=$CODE output: $OUT"
fi
rm -rf "$T16"

# --- T17: branch advisory flags a session from another branch ----------------
start_case "validate_harness: foreign-branch session prints NOTE, exit stays 0"
T17="$(mktemp -d)"
write_workspace_files "$T17/.handyman" 1
git -C "$T17" init -q -b main 2>/dev/null || git -C "$T17" init -q
cat > "$T17/.handyman/progress/current.md" <<'MD'
---
feature: x
status: in_progress
role: leader
updated: 2026-01-01
tags: [handyman/session/current]
---

# Current Session

- **Feature in progress:** x (id 1)
- **Start:** 2026-01-01
- **Agent:** leader
- **Branch:** some-other-branch

## Log
MD
OUT="$(node "$VALIDATOR" --root "$T17" 2>&1)"; CODE=$?
# same fixture, branch line matching the checkout -> silent
ACTUAL="$(git -C "$T17" symbolic-ref --short -q HEAD)"
sed -i.bak "s/some-other-branch/$ACTUAL/" "$T17/.handyman/progress/current.md" && rm -f "$T17/.handyman/progress/current.md.bak"
OUT2="$(node "$VALIDATOR" --root "$T17" 2>&1)"; CODE2=$?
if [ "$CODE" -eq 0 ] && printf '%s' "$OUT" | grep -q "belongs to branch" \
  && [ "$CODE2" -eq 0 ] && ! printf '%s' "$OUT2" | grep -q "belongs to branch"; then
  pass
else
  fail "foreign=$CODE/$OUT same=$CODE2/$OUT2"
fi
rm -rf "$T17"

# --- T18: scaffold creates the sprint docs split ------------------------------
start_case "scaffold creates docs/current and docs/sprints in the workspace"
T18="$(mktemp -d)"
"$SUITE_DIR/../handyman/scripts/scaffold.sh" local "$T18" demo >/dev/null 2>&1
if [ -d "$T18/.handyman/docs/current" ] && [ -d "$T18/.handyman/docs/sprints" ]; then
  pass
else
  fail "missing docs split dirs under $T18/.handyman/docs"
fi
rm -rf "$T18"

# --- T19: validator flags dangling depends_on, accepts archived targets -------
start_case "validate_harness: flags dangling depends_on, accepts archived ids"
T19="$(mktemp -d)"
write_workspace_files "$T19/.handyman" 1
mkdir -p "$T19/.handyman/archive"
cat > "$T19/.handyman/archive/feature_archive.json" <<'JSON'
{ "sprints": { "2026-SP1": [ { "id": 7, "name": "old", "status": "done" } ] } }
JSON
cat > "$T19/.handyman/feature_list.json" <<'JSON'
{
  "project": "t",
  "features": [
    { "id": 1, "name": "a", "status": "pending", "depends_on": [99] },
    { "id": 2, "name": "b", "status": "pending", "depends_on": [7] }
  ]
}
JSON
OUT="$(node "$VALIDATOR" --root "$T19" 2>&1)"; CODE=$?
python3 - "$T19/.handyman/feature_list.json" <<'PY'
import json, sys
path = sys.argv[1]
d = json.load(open(path))
d["features"][0]["depends_on"] = [2]
json.dump(d, open(path, "w"), indent=2)
PY
OUT2="$(node "$VALIDATOR" --root "$T19" 2>&1)"; CODE2=$?
if [ "$CODE" -ne 0 ] && printf '%s' "$OUT" | grep -q "depends_on unknown feature id 99" \
  && ! printf '%s' "$OUT" | grep -q "'b' depends_on" \
  && [ "$CODE2" -eq 0 ]; then
  pass
else
  fail "dangling=$CODE/$OUT fixed=$CODE2/$OUT2"
fi
rm -rf "$T19"

summary

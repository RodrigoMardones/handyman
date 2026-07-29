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
# start_date the docs warn about must fail validation. validate_harness now
# validates with ajv (bundled in dist/), so this runs unconditionally.
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

# --- T14: validator accepts a contract-complete feature_list ---------------
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

# --- T18: scaffold creates the memory layout ---------------------------------
start_case "scaffold creates memory/ and memory/sprints in the workspace (no current/)"
T18="$(mktemp -d)"
"$SUITE_DIR/../handyman/scripts/scaffold.sh" local "$T18" demo >/dev/null 2>&1
if [ -d "$T18/.handyman/memory/sprints" ] && [ -f "$T18/.handyman/memory/business.md" ] \
  && [ ! -d "$T18/.handyman/memory/current" ] && [ ! -d "$T18/.handyman/docs" ]; then
  pass
else
  fail "expected memory layout under $T18/.handyman"
fi
rm -rf "$T18"

# --- T18b: legacy docs/ workspace still verifies (fallback) -------------------
start_case "legacy docs/ workspace passes the reference verifier via fallback"
T18B="$(mktemp -d)"
write_bridge_files "$T18B"
write_workspace_files "$T18B/.handyman" 1
CODE=0; "$T18B/init.sh" >/dev/null 2>&1 || CODE=$?
mkdir -p "$T18B/.handyman/memory"
for f in business architecture conventions verification; do
  : > "$T18B/.handyman/memory/$f.md"
done
rm -rf "$T18B/.handyman/docs"
CODE2=0; "$T18B/init.sh" >/dev/null 2>&1 || CODE2=$?
if [ "$CODE" -eq 0 ] && [ "$CODE2" -eq 0 ]; then
  pass
else
  fail "legacy=$CODE memory=$CODE2"
fi
rm -rf "$T18B"

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
node -e 'const fs=require("fs");const p=process.argv[1];const d=JSON.parse(fs.readFileSync(p,"utf8"));d.features[0].depends_on=[2];fs.writeFileSync(p,JSON.stringify(d,null,2))' "$T19/.handyman/feature_list.json"
OUT2="$(node "$VALIDATOR" --root "$T19" 2>&1)"; CODE2=$?
if [ "$CODE" -ne 0 ] && printf '%s' "$OUT" | grep -q "depends_on unknown feature id 99" \
  && ! printf '%s' "$OUT" | grep -q "'b' depends_on" \
  && [ "$CODE2" -eq 0 ]; then
  pass
else
  fail "dangling=$CODE/$OUT fixed=$CODE2/$OUT2"
fi
rm -rf "$T19"

# --- T20: evidence-debt advisory NOTEs a done feature with no review report ---
# The other direction of the frontmatter advisory: that one inspects the reports
# that exist, this one crosses feature_list.json to find the ones that do not.
start_case "validate_harness: done feature without review_<name>.md NOTEs, exit stays 0"
T20="$(mktemp -d)"
write_workspace_files "$T20/.handyman" 1
mkdir -p "$T20/.handyman/backlog"
cat > "$T20/.handyman/feature_list.json" <<'JSON'
{
  "project": "t",
  "features": [
    { "id": 1, "name": "closed_without_evidence", "status": "done" }
  ]
}
JSON
OUT="$(node "$VALIDATOR" --root "$T20" 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] && printf '%s' "$OUT" | grep -q "NOTE:" \
  && printf '%s' "$OUT" | grep -q "review_closed_without_evidence.md"; then
  pass
else
  fail "expected a non-blocking evidence-debt NOTE, exit=$CODE output: $OUT"
fi
rm -rf "$T20"

# --- T21: evidence-debt advisory is silent when the review report exists ------
start_case "validate_harness: evidence-debt advisory is silent when review_<name>.md exists"
T21="$(mktemp -d)"
write_workspace_files "$T21/.handyman" 1
mkdir -p "$T21/.handyman/backlog"
cat > "$T21/.handyman/feature_list.json" <<'JSON'
{
  "project": "t",
  "features": [
    { "id": 1, "name": "closed_with_evidence", "status": "done" }
  ]
}
JSON
cat > "$T21/.handyman/backlog/review_closed_with_evidence.md" <<'MD'
---
feature: closed_with_evidence
id: 1
role: reviewer
date: 2026-01-01
verdict: approved
tags: [handyman/backlog/review]
---

# Review: closed_with_evidence
MD
OUT="$(node "$VALIDATOR" --root "$T21" 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] && ! printf '%s' "$OUT" | grep -q "is done but"; then
  pass
else
  fail "expected silence with the review present, exit=$CODE output: $OUT"
fi
rm -rf "$T21"

# --- actor-collision advisory (feature 55) -----------------------------------
# Writes impl_/review_ reports for feature "alpha" into $1, with $2 as the
# impl actor and $3 as the review actor. An empty actor omits the line, which
# is how every historical report looks.
write_actor_reports() {
  ws="$1"; impl_actor="$2"; review_actor="$3"
  mkdir -p "$ws/backlog"
  for kind in impl review; do
    a="$impl_actor"
    [ "$kind" = "review" ] && a="$review_actor"
    {
      printf -- '---\nfeature: alpha\nstatus: ok\nrole: %s\nupdated: 2026-01-01\n' "$kind"
      [ -n "$a" ] && printf 'actor: %s\n' "$a"
      printf 'tags: [handyman/backlog/%s]\n---\n\n# %s alpha\n' "$kind" "$kind"
    } > "$ws/backlog/${kind}_alpha.md"
  done
}

# --- T22: same actor on both reports NOTEs the collision ---------------------
start_case "validate_harness: same actor on impl+review NOTEs, exit stays 0"
T22="$(mktemp -d)"
write_workspace_files "$T22/.handyman" 1
write_actor_reports "$T22/.handyman" "agent-x" "agent-x"
OUT="$(node "$VALIDATOR" --root "$T22" 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] && printf '%s' "$OUT" | grep -q "same actor" \
  && printf '%s' "$OUT" | grep -q "agent-x"; then
  pass
else
  fail "expected a non-blocking actor-collision NOTE, exit=$CODE output: $OUT"
fi
rm -rf "$T22"

# --- T23: different actors are silent ----------------------------------------
start_case "validate_harness: different actors on impl+review print no collision NOTE"
T23="$(mktemp -d)"
write_workspace_files "$T23/.handyman" 1
write_actor_reports "$T23/.handyman" "agent-x" "agent-y"
OUT="$(node "$VALIDATOR" --root "$T23" 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] && ! printf '%s' "$OUT" | grep -q "same actor"; then
  pass
else
  fail "expected silence with distinct actors, exit=$CODE output: $OUT"
fi
rm -rf "$T23"

# --- T24: reports without actor: are silent (historical reports stay valid) --
# The field is optional on purpose: harnesses installed before feature 55 have
# no actor: anywhere, and must not start emitting noise.
start_case "validate_harness: reports with no actor: field produce no collision NOTE"
T24="$(mktemp -d)"
write_workspace_files "$T24/.handyman" 1
write_actor_reports "$T24/.handyman" "" ""
OUT="$(node "$VALIDATOR" --root "$T24" 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] && ! printf '%s' "$OUT" | grep -q "same actor"; then
  pass
else
  fail "expected silence with no actor field, exit=$CODE output: $OUT"
fi
rm -rf "$T24"

# --- T25-T27: init.sh runs the validator as a blocking phase -----------------
# The wiring, not the validator: T9/T20 already pin validate_harness's own exit
# codes. What was missing is that ./init.sh acts on them -- before this, the
# validator reached the operator only through check_preflight, which swallows
# the exit code (`|| true`, and preflight itself always exits 0).
#
# The function is pulled out of the real init.sh rather than reimplemented here.
# Sourcing the whole file would execute the verifier -- lint, build and the test
# suite, recursively into this suite -- so `sed` lifts the one function out. The
# assertion still lands on production code, not on a copy that could drift.
REPO_INIT="$SUITE_DIR/../init.sh"
REPO_DIST="$SUITE_DIR/../handyman/dist"
eval "$(sed -n '/^run_validate_harness()/,/^}/p' "$REPO_INIT")"

# Give a fixture root the handyman/ layout where init.sh resolves the validator.
#
# dist/ is copied, not symlinked: these CLIs guard their entry with
# `import.meta.url === file://${process.argv[1]}`, which is false when the script
# is reached through a symlink -- main() never runs and the process exits 0 in
# silence, so a symlinked fixture would make every case here pass vacuously.
#
# assets/ is copied too: the validator loads feature_list.schema.json relative to
# its own location. node_modules is symlinked (cheap, and Node resolves deps
# through a symlink fine -- only the entry script may not be one), and
# package.json comes along for its `"type": "module"`.
copy_validator() {
  src="$SUITE_DIR/../handyman"
  mkdir -p "$1/handyman"
  cp -R "$REPO_DIST" "$1/handyman/dist"
  cp -R "$src/assets" "$1/handyman/assets"
  cp "$src/package.json" "$1/handyman/package.json"
  ln -sf "$src/node_modules" "$1/handyman/node_modules"
}

# A physical temp dir. On macOS `mktemp -d` hands back a /var/... path, and /var
# is a symlink to /private/var -- enough to break the same entry guard: argv[1]
# keeps /var while import.meta.url resolves to /private/var, so main() never runs
# and the validator exits 0 in silence. Every case below would then pass for the
# wrong reason.
phys_tmp() { (cd "$(mktemp -d)" && pwd -P); }

start_case "init.sh: the harness phase is wired into the blocking phase list"
if grep -q '^  run_phase "harness" run_validate_harness$' "$REPO_INIT" \
  && sed -n '/^# --- Execution/,/^fi$/p' "$REPO_INIT" | grep -q 'run_validate_harness'; then
  pass
else
  fail "run_validate_harness is not wired as a blocking phase in init.sh"
fi

start_case "init.sh: a blocking harness gap fails the phase and reports it"
T25="$(phys_tmp)"
write_workspace_files "$T25/.handyman" 1
rm "$T25/.handyman/progress/history.md"
copy_validator "$T25"
export PROJECT_ROOT="$T25"
OUT="$(run_validate_harness 2>&1)"; CODE=$?
if [ "$CODE" -ne 0 ] && printf '%s' "$OUT" | grep -q "missing harness file"; then
  pass
else
  fail "expected a failing phase naming the gap: exit=$CODE output: $OUT"
fi
rm -rf "$T25"

start_case "init.sh: evidence debt alone keeps the phase green and silent"
T26="$(phys_tmp)"
write_workspace_files "$T26/.handyman" 1
mkdir -p "$T26/.handyman/backlog"
cat > "$T26/.handyman/feature_list.json" <<'JSON'
{
  "project": "t",
  "features": [
    { "id": 1, "name": "closed_without_evidence", "status": "done" }
  ]
}
JSON
copy_validator "$T26"
export PROJECT_ROOT="$T26"
OUT="$(run_validate_harness 2>&1)"; CODE=$?
# Silent by design: check_preflight already prints validate_harness's whole
# output, NOTEs included, so echoing it here too would duplicate every advisory.
# T20 pins that the NOTE itself still reaches the operator.
if [ "$CODE" -eq 0 ] && [ -z "$OUT" ]; then
  pass
else
  fail "expected a green, silent phase on evidence debt: exit=$CODE output: $OUT"
fi
rm -rf "$T26"

start_case "init.sh: the harness phase skips cleanly when dist/ is absent"
T27="$(phys_tmp)"
write_workspace_files "$T27/.handyman" 1
export PROJECT_ROOT="$T27"
OUT="$(run_validate_harness 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] && [ -z "$OUT" ]; then
  pass
else
  fail "expected a clean skip with no built validator: exit=$CODE output: $OUT"
fi
rm -rf "$T27"

# --- T28: the installed-harness template inherits the same phase -------------
# Harnesses installed elsewhere get this on their next upgrade; the template
# resolves dist/ at its own root, not under handyman/.
start_case "init.template.sh carries the same blocking harness phase"
TPL="$SUITE_DIR/../handyman/assets/init.template.sh"
if grep -q '^run_validate_harness()' "$TPL" \
  && grep -q '^  run_phase "harness" run_validate_harness$' "$TPL" \
  && grep -q 'validator="\$PROJECT_ROOT/dist/validate_harness.js"' "$TPL"; then
  pass
else
  fail "init.template.sh does not carry the harness phase with a root-relative validator"
fi

# --- T29: frontmatter advisory accepts the pre-2.1 legacy convention ---------
# Legacy reports wrote verdict:/date:/reviewer: for status:/updated:/role:.
# `done` reads the legacy verdict (feature.ts); the advisory must agree with it.
start_case "validate_harness: frontmatter advisory is silent on a legacy-convention report"
T29="$(mktemp -d)"
write_workspace_files "$T29/.handyman" 1
mkdir -p "$T29/.handyman/backlog"
cat > "$T29/.handyman/backlog/review_legacy.md" <<'MD'
---
feature: 12
reviewer: reviewer
verdict: APPROVED
date: 2026-07-18
tags: [handyman/review]
---

# Review Report: legacy
MD
OUT="$(node "$VALIDATOR" --root "$T29" 2>&1)"; CODE=$?
if [ "$CODE" -eq 0 ] && ! printf '%s' "$OUT" | grep -q "review_legacy.md"; then
  pass
else
  fail "expected silence on a legacy-convention report, exit=$CODE output: $OUT"
fi
rm -rf "$T29"

# --- T30: scaffold creates .vscode/mcp.json with the handyman server ----------
start_case "scaffold creates .vscode/mcp.json with the handyman server entry"
T30="$(mktemp -d)"
"$SUITE_DIR/../handyman/scripts/scaffold.sh" local "$T30" demo >/dev/null 2>&1
if [ -f "$T30/.vscode/mcp.json" ] \
  && [ "$(_json "$T30/.vscode/mcp.json" str servers.handyman.type 2>/dev/null)" = "stdio" ] \
  && [ "$(_json "$T30/.vscode/mcp.json" str servers.handyman.command 2>/dev/null)" = "npx" ] \
  && [ "$(_json "$T30/.vscode/mcp.json" str servers.handyman.args.1 2>/dev/null)" = "handyman-harness@3" ]; then
  pass
else
  fail "expected .vscode/mcp.json with the handyman server under $T30"
fi
rm -rf "$T30"

# --- T31: pre-existing .vscode/mcp.json is kept and NOTE'd --------------------
start_case "scaffold keeps a pre-existing .vscode/mcp.json and prints a NOTE"
T31="$(mktemp -d)"
mkdir -p "$T31/.vscode"
cat > "$T31/.vscode/mcp.json" <<'JSON'
{
  "servers": {
    "other": { "type": "stdio", "command": "other" }
  }
}
JSON
BEFORE="$(cat "$T31/.vscode/mcp.json")"
OUT="$("$SUITE_DIR/../handyman/scripts/scaffold.sh" local "$T31" demo 2>&1)"
if [ "$(cat "$T31/.vscode/mcp.json")" = "$BEFORE" ] \
  && printf '%s' "$OUT" | grep -q "NOTE" \
  && printf '%s' "$OUT" | grep -q "add the handyman server"; then
  pass
else
  fail "file changed or NOTE missing: $OUT"
fi
rm -rf "$T31"

# --- T32: generated harness.config.json declares handyman (both scopes) -------
start_case "scaffold declares handyman in discovery.mcp (local and global)"
T32="$(mktemp -d)"
mkdir -p "$T32/local" "$T32/global"
"$SUITE_DIR/../handyman/scripts/scaffold.sh" local "$T32/local" demo >/dev/null 2>&1
HANDYMAN_ROOT="$T32/handyman-root" "$SUITE_DIR/../handyman/scripts/scaffold.sh" global "$T32/global" demo >/dev/null 2>&1
if [ "$(_json "$T32/local/harness.config.json" str discovery.mcp.0 2>/dev/null)" = "handyman" ] \
  && [ "$(_json "$T32/global/harness.config.json" str discovery.mcp.0 2>/dev/null)" = "handyman" ]; then
  pass
else
  fail "expected discovery.mcp[0]=handyman in both scopes"
fi
rm -rf "$T32"

# --- T33: pre-existing harness.config.json is kept and the declare NOTE printed
start_case "scaffold keeps a pre-existing harness.config.json and NOTEs the declare fallback"
T33="$(mktemp -d)"
cat > "$T33/harness.config.json" <<'JSON'
{ "install_mode": "local", "project_name": "demo", "project_root": ".", "harness_workspace": ".handyman" }
JSON
BEFORE="$(cat "$T33/harness.config.json")"
OUT="$("$SUITE_DIR/../handyman/scripts/scaffold.sh" local "$T33" demo 2>&1)"
if [ "$(cat "$T33/harness.config.json")" = "$BEFORE" ] \
  && printf '%s' "$OUT" | grep -q "tools_discovery declare mcp handyman"; then
  pass
else
  fail "config changed or declare NOTE missing: $OUT"
fi
rm -rf "$T33"

summary

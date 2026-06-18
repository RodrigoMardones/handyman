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

# --- validate_harness.py: deterministic structure validator ----------------
VALIDATOR="$SUITE_DIR/../scripts/validate_harness.py"

# --- T8: validator exits 0 on a well-formed local harness ------------------
start_case "validate_harness: exits 0 on a well-formed local harness"
T8="$(mktemp -d)"
write_workspace_files "$T8/.handyman" 1
OUT="$(python3 "$VALIDATOR" --root "$T8" 2>&1)"; CODE=$?
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
OUT="$(python3 "$VALIDATOR" --root "$T9" 2>&1)"; CODE=$?
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
OUT="$(python3 "$VALIDATOR" --root "$T10" 2>&1)"; CODE=$?
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
OUT="$(python3 "$VALIDATOR" --root "$T11" 2>&1)"; CODE=$?
if [ "$CODE" -ne 0 ] && printf '%s' "$OUT" | grep -q "role file inside HARNESS_WORKSPACE"; then
  pass
else
  fail "expected failure, exit=$CODE output: $OUT"
fi
rm -rf "$T11"

# --- T12: scaffold stamps harness_version from SKILL.md --------------------
start_case "scaffold stamps harness_version from SKILL.md into new state"
T12="$(mktemp -d)"
SKILL_MD="$SUITE_DIR/../SKILL.md"
WANT="$(awk '
  /^---[[:space:]]*$/ { f++; if (f == 2) exit; next }
  f == 1 && /^[[:space:]]+version:[[:space:]]*/ {
    sub(/^[[:space:]]+version:[[:space:]]*/, ""); sub(/[[:space:]]*$/, ""); print; exit
  }' "$SKILL_MD")"
"$SUITE_DIR/../scripts/scaffold.sh" local "$T12" demo >/dev/null 2>&1
GOT_CFG="$(jq -r '.harness_version // empty' "$T12/harness.config.json" 2>/dev/null)"
GOT_FL="$(jq -r '.config.harness_version // empty' "$T12/.handyman/feature_list.json" 2>/dev/null)"
if [ -n "$WANT" ] && [ "$GOT_CFG" = "$WANT" ] && [ "$GOT_FL" = "$WANT" ]; then
  pass
else
  fail "want=$WANT config=$GOT_CFG feature_list=$GOT_FL"
fi
rm -rf "$T12"

summary

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

summary

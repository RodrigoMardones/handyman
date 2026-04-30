#!/usr/bin/env bash
# =============================================================================
# tests/test_install.sh — Integration tests for the FOREMAN installer
# =============================================================================
# Run from the repository root:
#   bash tests/test_install.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL="$REPO_ROOT/install.sh"

PASS=0
FAIL=0

# ---------------------------------------------------------------------------
assert_file_exists() {
  local path="$1"
  if [[ -f "$path" ]]; then
    echo "  [PASS] exists: $path"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] missing: $path"
    FAIL=$((FAIL + 1))
  fi
}

assert_dir_exists() {
  local path="$1"
  if [[ -d "$path" ]]; then
    echo "  [PASS] dir: $path"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] missing dir: $path"
    FAIL=$((FAIL + 1))
  fi
}

assert_contains() {
  local file="$1"
  local pattern="$2"
  if grep -qF "$pattern" "$file"; then
    echo "  [PASS] '$pattern' found in $(basename "$file")"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] '$pattern' NOT found in $(basename "$file")"
    FAIL=$((FAIL + 1))
  fi
}

assert_not_contains() {
  local file="$1"
  local pattern="$2"
  if ! grep -qF "$pattern" "$file"; then
    echo "  [PASS] '$pattern' absent from $(basename "$file")"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] '$pattern' found (should be absent) in $(basename "$file")"
    FAIL=$((FAIL + 1))
  fi
}

assert_exit_nonzero() {
  local cmd=("$@")
  if ! "${cmd[@]}" > /dev/null 2>&1; then
    echo "  [PASS] command exited with error as expected"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] command should have failed but succeeded: ${cmd[*]}"
    FAIL=$((FAIL + 1))
  fi
}

# ---------------------------------------------------------------------------
echo "========================================"
echo " FOREMAN installer — integration tests"
echo "========================================"
echo ""

# ---------------------------------------------------------------------------
echo "Test: --help exits 0"
"$INSTALL" --help > /dev/null
echo "  [PASS] --help"
PASS=$((PASS + 1))

# ---------------------------------------------------------------------------
echo ""
echo "Test: invalid mode exits non-zero"
assert_exit_nonzero "$INSTALL" --mode invalid

# ---------------------------------------------------------------------------
echo ""
echo "Test: non-existent target exits non-zero"
assert_exit_nonzero "$INSTALL" --mode local --target /no/such/dir

# ---------------------------------------------------------------------------
echo ""
echo "Test: local mode — file structure"
LOCAL_DIR=$(mktemp -d /tmp/foreman-test-local-XXXXXX)
"$INSTALL" --mode local --target "$LOCAL_DIR" > /dev/null 2>&1

assert_file_exists "$LOCAL_DIR/AGENTS.md"
assert_file_exists "$LOCAL_DIR/CHECKPOINTS.md"
assert_dir_exists  "$LOCAL_DIR/progress/current"
assert_dir_exists  "$LOCAL_DIR/progress/history"
assert_dir_exists  "$LOCAL_DIR/progress/docs"
assert_file_exists "$LOCAL_DIR/progress/current/state.md"
assert_file_exists "$LOCAL_DIR/progress/history/index.md"

# AGENTS.md should use relative paths
assert_contains     "$LOCAL_DIR/AGENTS.md" "./progress"
assert_contains     "$LOCAL_DIR/AGENTS.md" "mode: local"
# AGENTS.md should NOT contain absolute ~/FOREMAN path
assert_not_contains "$LOCAL_DIR/AGENTS.md" "FOREMAN/"

rm -rf "$LOCAL_DIR"

# ---------------------------------------------------------------------------
echo ""
echo "Test: global mode — file structure"
GLOBAL_WS=$(mktemp -d /tmp/foreman-test-global-XXXXXX)
FAKE_HOME=$(mktemp -d /tmp/foreman-test-home-XXXXXX)
PROJECT_NAME="$(basename "$GLOBAL_WS")"
EXPECTED_PROGRESS="$FAKE_HOME/FOREMAN/$PROJECT_NAME/progress"

HOME="$FAKE_HOME" "$INSTALL" --mode global --target "$GLOBAL_WS" > /dev/null 2>&1

# Workspace should only have static config files (no progress dir)
assert_file_exists "$GLOBAL_WS/AGENTS.md"
assert_file_exists "$GLOBAL_WS/CHECKPOINTS.md"

# Progress structure must be in global location
assert_dir_exists  "$EXPECTED_PROGRESS/current"
assert_dir_exists  "$EXPECTED_PROGRESS/history"
assert_dir_exists  "$EXPECTED_PROGRESS/docs"
assert_file_exists "$EXPECTED_PROGRESS/current/state.md"
assert_file_exists "$EXPECTED_PROGRESS/history/index.md"

# AGENTS.md must reference the global path
assert_contains "$GLOBAL_WS/AGENTS.md" "$EXPECTED_PROGRESS"
assert_contains "$GLOBAL_WS/AGENTS.md" "mode: global"
assert_contains "$GLOBAL_WS/AGENTS.md" "Global mode"

# CHECKPOINTS.md must reference the global path
assert_contains "$GLOBAL_WS/CHECKPOINTS.md" "$EXPECTED_PROGRESS"
assert_contains "$GLOBAL_WS/CHECKPOINTS.md" "Global mode"

rm -rf "$GLOBAL_WS" "$FAKE_HOME"

# ---------------------------------------------------------------------------
echo ""
echo "Test: re-running install skips existing files with a warning"
RERUN_DIR=$(mktemp -d /tmp/foreman-test-rerun-XXXXXX)
"$INSTALL" --mode local --target "$RERUN_DIR" > /dev/null 2>&1
cp "$RERUN_DIR/AGENTS.md" "$RERUN_DIR/AGENTS.md.orig"

OUTPUT=$("$INSTALL" --mode local --target "$RERUN_DIR" 2>&1)
if echo "$OUTPUT" | grep -q "already exists"; then
  echo "  [PASS] re-run warns about existing AGENTS.md"
  PASS=$((PASS + 1))
else
  echo "  [FAIL] expected 'already exists' warning"
  FAIL=$((FAIL + 1))
fi

# File should be unchanged
if diff -q "$RERUN_DIR/AGENTS.md" "$RERUN_DIR/AGENTS.md.orig" > /dev/null; then
  echo "  [PASS] existing AGENTS.md was not overwritten"
  PASS=$((PASS + 1))
else
  echo "  [FAIL] AGENTS.md was overwritten on re-run"
  FAIL=$((FAIL + 1))
fi

rm -rf "$RERUN_DIR"

# ---------------------------------------------------------------------------
echo ""
echo "========================================"
echo " Results: $PASS passed, $FAIL failed"
echo "========================================"
[[ $FAIL -eq 0 ]]

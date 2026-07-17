#!/usr/bin/env bash
# Handyman verifier for the Handyman skill's own dev repo (dogfooding harness).
# Resolves the harness workspace, checks state, then runs lint -> build -> test.
#
# This project ships Python + Bash today and is migrating to TypeScript on
# Bun/Node. The verifier deliberately parses JSON with `python3` (a hard project
# dependency) instead of `jq`, so it needs no extra runtime. When a gate's tool
# is absent locally (shellcheck), it degrades to a non-blocking NOTE because CI
# still enforces it. Exits 0 only when the blocking gates pass.
set -u
EXIT_CODE=0

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HARNESS_WORKSPACE="$PROJECT_ROOT"

# Resolve HARNESS_WORKSPACE: harness.config.json (via python3) -> local
# .handyman/ install -> PROJECT_ROOT fallback.
if [ -f "$PROJECT_ROOT/harness.config.json" ]; then
  HARNESS_WORKSPACE="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("harness_workspace") or "")' "$PROJECT_ROOT/harness.config.json" 2>/dev/null)"
elif [ -f "$PROJECT_ROOT/.handyman/feature_list.json" ]; then
  HARNESS_WORKSPACE="$PROJECT_ROOT/.handyman"
fi

# Resolve a relative harness_workspace (e.g. ".handyman") against PROJECT_ROOT.
case "${HARNESS_WORKSPACE:-}" in
  /*) : ;;
  "") HARNESS_WORKSPACE="$PROJECT_ROOT" ;;
  *) HARNESS_WORKSPACE="$PROJECT_ROOT/$HARNESS_WORKSPACE" ;;
esac

# --- Phase runner -----------------------------------------------------------
run_phase() {
  phase_name="$1"; shift
  echo "==> ${phase_name}"
  if "$@"; then
    echo "    ${phase_name}: OK"
  else
    echo "    ${phase_name}: FAILED" >&2
    EXIT_CODE=1
  fi
}

# --- Checks -----------------------------------------------------------------

# 1. Required runtime tools. python3 runs the scripts and parses harness JSON.
check_tools() {
  missing=0
  for tool in python3; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      echo "    missing required tool: $tool" >&2
      missing=1
    fi
  done
  return $missing
}

# 2. Required harness files live in $HARNESS_WORKSPACE.
check_harness_files() {
  missing=0
  for rel in feature_list.json progress/current.md progress/history.md; do
    if [ ! -f "$HARNESS_WORKSPACE/$rel" ]; then
      echo "    missing harness file: $HARNESS_WORKSPACE/$rel" >&2
      missing=1
    fi
  done
  return $missing
}

# 3. At most one feature may be in_progress (parsed with python3, not jq).
check_feature_state() {
  list="$HARNESS_WORKSPACE/feature_list.json"
  [ -f "$list" ] || { echo "    feature_list.json not found" >&2; return 1; }
  n="$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(sum(1 for f in d.get("features",[]) if f.get("status")=="in_progress"))' "$list" 2>/dev/null)"
  if [ "${n:-0}" -gt 1 ]; then
    echo "    more than one feature is in_progress ($n)" >&2
    return 1
  fi
  return 0
}

# 4. Lint. shellcheck the shell surface (matches CI); degrade to a NOTE locally
#    when shellcheck is absent so the missing binary does not block the gate.
run_lint() {
  if command -v shellcheck >/dev/null 2>&1; then
    find handyman/scripts tests -name '*.sh' -print0 2>/dev/null | xargs -0 -r shellcheck -S warning
    return $?
  fi
  echo "    NOTE: shellcheck not installed - skipping shell lint locally (enforced in CI)." >&2
  return 0
}

# 5. Build. Python has no build step; byte-compile the scripts as a syntax gate.
#    (After the migration this becomes `bunx tsc --noEmit`.)
run_build() {
  python3 -m compileall -q handyman/scripts tests
  return $?
}

# 6. Test. The project's suite (bash black-box + test_docs.py). This is the
#    parity oracle the migration must keep green.
run_test() {
  bash tests/run_tests.sh
  return $?
}

# --- Advisory checks (non-blocking) -----------------------------------------
# Report status without ever changing EXIT_CODE.

check_harness_version() {
  ver=""
  if [ -f "$PROJECT_ROOT/harness.config.json" ]; then
    ver="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("harness_version") or "")' "$PROJECT_ROOT/harness.config.json" 2>/dev/null)"
  fi
  if [ -z "$ver" ]; then
    echo "NOTE: harness has no version stamp - created before harness versioning." >&2
    echo "      run node handyman/dist/upgrade_harness.js --check (or re-scaffold) to seal it." >&2
  fi
}

check_business_context() {
  biz="$HARNESS_WORKSPACE/docs/business.md"
  [ -f "$biz" ] || return 0
  if grep -qE 'Describe the business, the problem it solves|Define domain terms so code' "$biz"; then
    echo "NOTE: docs/business.md still matches the starter template - fill it with real domain context." >&2
  fi
}

# Read-only stability report. Points at this repo's nested handyman/dist.
check_preflight() {
  preflight="$PROJECT_ROOT/handyman/dist/preflight.js"
  [ -f "$preflight" ] || return 0
  command -v node >/dev/null 2>&1 || return 0
  node "$preflight" --root "$PROJECT_ROOT" >&2 || true
}

# --- Execution --------------------------------------------------------------
if [ "$EXIT_CODE" -eq 0 ]; then
  cd "$PROJECT_ROOT" || exit 1
  run_phase "tools" check_tools
  run_phase "files" check_harness_files
  run_phase "state" check_feature_state
  run_phase "lint"  run_lint
  run_phase "build" run_build
  run_phase "test"  run_test
fi

if [ "$EXIT_CODE" -eq 0 ]; then
  echo "VERIFIER: all gates passed"
else
  echo "VERIFIER: one or more gates failed" >&2
fi

# Advisory (never affect EXIT_CODE).
check_harness_version
check_business_context
check_preflight

exit $EXIT_CODE

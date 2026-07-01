#!/usr/bin/env bash
# Top-level test runner for the Handyman skill.
# Runs the documentation-structure suite and the verifier-contract suite,
# then aggregates their results.
set -u

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FAILED=0

run_suite() {
  echo "=============================================="
  if "$@"; then
    echo "-> suite OK"
  else
    echo "-> suite FAILED"
    FAILED=1
  fi
  echo
}

run_suite python3 "$SUITE_DIR/test_docs.py"
run_suite bash "$SUITE_DIR/test_init.sh"
run_suite bash "$SUITE_DIR/test_update.sh"
run_suite bash "$SUITE_DIR/test_feature.sh"
run_suite bash "$SUITE_DIR/test_backlog.sh"
run_suite bash "$SUITE_DIR/test_index.sh"
run_suite bash "$SUITE_DIR/test_upgrade.sh"
run_suite bash "$SUITE_DIR/test_tools_discovery.sh"
run_suite bash "$SUITE_DIR/test_evals.sh"
run_suite bash "$SUITE_DIR/test_preflight.sh"
run_suite bash "$SUITE_DIR/test_metrics.sh"

echo "=============================================="
if [ "$FAILED" -eq 0 ]; then
  echo "ALL SUITES PASSED"
else
  echo "SOME SUITES FAILED"
fi
exit "$FAILED"

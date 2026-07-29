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

# --- build prerequisites -------------------------------------------------------
# The suites run the handyman CLIs as node dist/*.js, so the TypeScript build
# must be fresh. A failure aborts the whole run with a clear message instead
# of producing cascading suite failures. (The apps/web standalone build is
# gone: the panel moved to Mastra Studio on 2026-07-28.)
REPO_ROOT="$(cd "$SUITE_DIR/.." && pwd)"
echo "=============================================="
echo "Building prerequisites (handyman dist)..."
if ! (cd "$REPO_ROOT/handyman" && npm run build); then
  echo "-> PREREQUISITE FAILED: handyman dist build"
  exit 1
fi
echo "-> prerequisites OK"
echo

cd "$REPO_ROOT" || exit 1
run_suite node "$SUITE_DIR/test_docs.js"
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
run_suite bash "$SUITE_DIR/test_npm_pack.sh"
run_suite bash "$SUITE_DIR/test_sprint.sh"
run_suite node "$SUITE_DIR/test_mcp.js"
run_suite bash "$SUITE_DIR/test_toolbox.sh"
run_suite node "$SUITE_DIR/test_toolbox_llm.js"
run_suite node "$SUITE_DIR/test_toolbox_draft.js"
run_suite node "$SUITE_DIR/test_toolbox_state.js"
run_suite node "$SUITE_DIR/test_toolbox_triage.js"
run_suite node "$SUITE_DIR/test_toolbox_review_notes.js"
run_suite node "$SUITE_DIR/test_toolbox_acceptance.js"
run_suite node "$SUITE_DIR/test_toolbox_retro.js"
run_suite bash "$SUITE_DIR/test_toolbox_cli_llm.sh"

echo "=============================================="
if [ "$FAILED" -eq 0 ]; then
  echo "ALL SUITES PASSED"
else
  echo "SOME SUITES FAILED"
fi
exit "$FAILED"

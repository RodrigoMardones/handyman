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
# The toolbox serve wrapper (`node dist/toolbox.js serve`) and the apps/web
# suites need the Next standalone output and the handyman dist. Build both
# once here so the suites can boot the unified single-process observer
# (feature toolbox_serve_decommission). A failure aborts the whole run with a
# clear message instead of producing cascading suite failures.
REPO_ROOT="$(cd "$SUITE_DIR/.." && pwd)"
echo "=============================================="
echo "Building prerequisites (handyman dist + apps/web standalone)..."
if ! (cd "$REPO_ROOT/handyman" && npm run build); then
  echo "-> PREREQUISITE FAILED: handyman dist build"
  exit 1
fi
if ! (cd "$REPO_ROOT" && pnpm run web:build); then
  echo "-> PREREQUISITE FAILED: apps/web build"
  exit 1
fi
# Next's standalone output does not copy static assets; mirror them into the
# standalone tree so the unified server serves /_next/static/* in production.
mkdir -p "$REPO_ROOT/apps/web/.next/standalone/apps/web/.next/static"
if ! cp -r "$REPO_ROOT/apps/web/.next/static/." \
      "$REPO_ROOT/apps/web/.next/standalone/apps/web/.next/static/"; then
  echo "-> PREREQUISITE FAILED: copying static assets into standalone"
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
run_suite bash "$SUITE_DIR/test_toolbox_serve.sh"
run_suite bash "$SUITE_DIR/test_web_landing.sh"
run_suite bash "$SUITE_DIR/test_web_fleet.sh"
run_suite bash "$SUITE_DIR/test_web_harness.sh"
run_suite bash "$SUITE_DIR/test_web_runtime.sh"
run_suite bash "$SUITE_DIR/test_web_readapi.sh"
run_suite bash "$SUITE_DIR/test_web_relays.sh"
run_suite bash "$SUITE_DIR/test_web_triage.sh"
run_suite bash "$SUITE_DIR/test_web_review_notes.sh"
run_suite bash "$SUITE_DIR/test_web_acceptance.sh"
run_suite bash "$SUITE_DIR/test_web_retro.sh"
run_suite bash "$SUITE_DIR/test_web_intake.sh"
run_suite bash "$SUITE_DIR/test_web_intake_ask.sh"
run_suite bash "$SUITE_DIR/test_web_feature.sh"
run_suite bash "$SUITE_DIR/test_web_timeline_search.sh"

echo "=============================================="
if [ "$FAILED" -eq 0 ]; then
  echo "ALL SUITES PASSED"
else
  echo "SOME SUITES FAILED"
fi
exit "$FAILED"

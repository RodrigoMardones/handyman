#!/usr/bin/env bash
# Handyman verifier. Resolves the harness workspace, checks state, then runs
# the quality gates lint -> build -> test. Exits 0 only when everything passes.
set -u
EXIT_CODE=0

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HARNESS_WORKSPACE="$PROJECT_ROOT"

if [ -f "$PROJECT_ROOT/harness.config.json" ]; then
  if command -v jq >/dev/null 2>&1; then
    HARNESS_WORKSPACE="$(jq -r '.harness_workspace // empty' "$PROJECT_ROOT/harness.config.json")"
  else
    echo "jq is required to parse harness.config.json" >&2
    EXIT_CODE=1
  fi
elif [ -f "$PROJECT_ROOT/.handyman/feature_list.json" ]; then
  # Local install: mutable state lives under .handyman/
  HARNESS_WORKSPACE="$PROJECT_ROOT/.handyman"
fi

# Resolve a relative harness_workspace (e.g. ".handyman") against PROJECT_ROOT.
case "${HARNESS_WORKSPACE:-}" in
  /*) : ;;
  "") : ;;
  *) HARNESS_WORKSPACE="$PROJECT_ROOT/$HARNESS_WORKSPACE" ;;
esac

if [ -z "${HARNESS_WORKSPACE:-}" ]; then
  echo "HARNESS_WORKSPACE could not be resolved" >&2
  EXIT_CODE=1
fi

# --- Phase runner -----------------------------------------------------------
# run_phase NAME COMMAND...   Runs a named gate, records failure, and keeps
# going so the summary reports every problem instead of stopping at the first.
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

# 1. Required runtime tools. Add the binaries this project needs.
check_tools() {
  missing=0
  for tool in jq; do
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

# 3. At most one feature may be in_progress.
check_feature_state() {
  list="$HARNESS_WORKSPACE/feature_list.json"
  [ -f "$list" ] || { echo "    feature_list.json not found" >&2; return 1; }
  in_progress="$(jq '[.features[] | select(.status == "in_progress")] | length' "$list")"
  if [ "$in_progress" -gt 1 ]; then
    echo "    more than one feature is in_progress ($in_progress)" >&2
    return 1
  fi
  return 0
}

# 4. Lint. Replace with the project linter (e.g. ruff, eslint, golangci-lint).
run_lint() {
  echo "    no lint command configured" >&2
  return 1
}

# 5. Build. Replace with the project build (e.g. make build, npm run build).
run_build() {
  echo "    no build command configured" >&2
  return 1
}

# 6. Test. Replace with the project test command (e.g. pytest, npm test).
run_test() {
  echo "    no test command configured" >&2
  return 1
}

# --- Advisory checks (non-blocking) -----------------------------------------
# graphify provides a persistent knowledge-graph context layer for agents.
# It is optional infrastructure: a missing or stale graph warns but never
# changes EXIT_CODE. See references/graphify.md.
check_graphify_context() {
  if ! command -v graphify >/dev/null 2>&1; then
    echo "NOTE: graphify not installed - agent context graph disabled." >&2
    echo "      install: uv tool install graphifyy  (or: pip install graphifyy)" >&2
    return 0
  fi
  graph="$PROJECT_ROOT/graphify-out/graph.json"
  if [ ! -f "$graph" ]; then
    echo "NOTE: no context graph yet - run /graphify to build graphify-out/graph.json" >&2
  elif [ -n "$(find "$PROJECT_ROOT" -type f \
        -not -path '*/graphify-out/*' -not -path '*/.git/*' \
        -not -path '*/.handyman/*' -not -path '*/node_modules/*' \
        -newer "$graph" -print 2>/dev/null | head -n 1)" ]; then
    echo "NOTE: context graph may be stale - rebuild with /graphify --update" >&2
    echo "      (or install the post-commit hook: graphify hook install)" >&2
  fi
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

# Advisory: report graphify context status without affecting EXIT_CODE.
check_graphify_context

exit $EXIT_CODE

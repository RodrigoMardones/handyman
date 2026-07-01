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
# A harness with no version stamp predates harness versioning; flag it so the
# user can seal and update it. A sealed harness stays silent here - explicit
# drift detection is scripts/upgrade_harness.py --check. Never changes EXIT_CODE.
check_harness_version() {
  ver=""
  if [ -f "$PROJECT_ROOT/harness.config.json" ] && command -v jq >/dev/null 2>&1; then
    ver="$(jq -r '.harness_version // empty' "$PROJECT_ROOT/harness.config.json")"
  fi
  if [ -z "$ver" ] && [ -f "$HARNESS_WORKSPACE/feature_list.json" ] && command -v jq >/dev/null 2>&1; then
    ver="$(jq -r '.config.harness_version // empty' "$HARNESS_WORKSPACE/feature_list.json")"
  fi
  if [ -z "$ver" ]; then
    echo "NOTE: harness has no version stamp - created before harness versioning." >&2
    echo "      run scripts/upgrade_harness.py --check (or re-scaffold) to seal and update it." >&2
  fi
}

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

# A docs/business.md that still matches the starter template means the mandatory
# bootstrap business interview was skipped. The business domain cannot be inferred
# from code, so flag it for the user to fill. Never changes EXIT_CODE.
check_business_context() {
  biz="$HARNESS_WORKSPACE/docs/business.md"
  [ -f "$biz" ] || return 0
  if grep -qE 'Describe the business, the problem it solves|Define domain terms so code' "$biz"; then
    echo "NOTE: docs/business.md still matches the starter template - the bootstrap business interview looks skipped." >&2
    echo "      interview the user and fill it with real domain context (see references/workflow.md Bootstrap Protocol)." >&2
  fi
}

# A harness that declares no skills or MCP servers under discovery in
# harness.config.json has not recorded what it relies on, so skill/MCP discovery
# stays implicit. Nudge the operator to declare them; never changes EXIT_CODE.
# See references/discovery.md.
check_tools_discovery() {
  config="$PROJECT_ROOT/harness.config.json"
  [ -f "$config" ] || return 0
  command -v jq >/dev/null 2>&1 || return 0
  skills="$(jq -r '(.discovery.skills // []) | length' "$config" 2>/dev/null)"
  mcp="$(jq -r '(.discovery.mcp // []) | length' "$config" 2>/dev/null)"
  agents="$(jq -r '(.discovery.agents // []) | length' "$config" 2>/dev/null)"
  if [ "${skills:-0}" -eq 0 ] && [ "${mcp:-0}" -eq 0 ] && [ "${agents:-0}" -eq 0 ]; then
    echo "NOTE: harness.config.json declares no skills, MCP servers, or agents under discovery." >&2
    echo "      record what the harness relies on (see references/discovery.md)." >&2
  fi
}

# A skill-authoring harness keeps a labeled trigger-eval set so the skill's
# description can be measured (evals/trigger-eval.json). The set's *contract* is
# deterministic, but the *measurement* of the real trigger is stochastic, so it
# stays out of the gate: this advisory only nudges. It stays silent for a harness
# with no eval set, NOTEs an empty set, and NOTEs when SKILL.md changed since the
# last measurement marker. Never changes EXIT_CODE. See references/evals.md.
check_evals() {
  eval_set="$PROJECT_ROOT/evals/trigger-eval.json"
  [ -f "$eval_set" ] || return 0
  command -v jq >/dev/null 2>&1 || return 0
  count="$(jq 'if type == "array" then length else 0 end' "$eval_set" 2>/dev/null)"
  if [ "${count:-0}" -eq 0 ]; then
    echo "NOTE: evals/trigger-eval.json has no labeled queries - the description trigger is unmeasured." >&2
    echo "      add positive and negative queries, then run scripts/evals.py measure (see references/evals.md)." >&2
    return 0
  fi
  marker="$PROJECT_ROOT/evals/.last-measured"
  desc="$PROJECT_ROOT/SKILL.md"
  if [ -f "$desc" ] && { [ ! -f "$marker" ] || [ "$desc" -nt "$marker" ]; }; then
    echo "NOTE: SKILL.md changed since the last trigger measurement (or it was never measured)." >&2
    echo "      re-run scripts/evals.py measure and refresh evals/.last-measured (see references/evals.md)." >&2
  fi
}

# Preflight: read-only stability report (format/drift/sync/discovery) that
# orchestrates validate_harness, upgrade_harness, update_harness and
# tools_discovery. It always exits 0 and never changes EXIT_CODE; it surfaces
# drift/sync as NOTEs for the operator to act on. See references/workflow.md.
check_preflight() {
  preflight="$PROJECT_ROOT/scripts/preflight.py"
  [ -f "$preflight" ] || return 0
  command -v python3 >/dev/null 2>&1 || return 0
  python3 "$preflight" --root "$PROJECT_ROOT" >&2 || true
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
check_harness_version
check_graphify_context
check_business_context
check_tools_discovery
check_evals
check_preflight

exit $EXIT_CODE

#!/usr/bin/env bash
# Reference implementation of the Handyman verifier (init.sh contract).
# Implements the resolution + validation logic documented in
# references/templates.md (init.sh Shape) and references/anatomy.md
# (Verification Contract). Used by the test suite to exercise the contract.
set -u
EXIT_CODE=0

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HARNESS_WORKSPACE="$PROJECT_ROOT"

# 1. Resolve HARNESS_WORKSPACE.
if [ -f "$PROJECT_ROOT/harness.config.json" ]; then
  if command -v jq >/dev/null 2>&1; then
    RESOLVED="$(jq -r '.harness_workspace // empty' "$PROJECT_ROOT/harness.config.json")"
    [ -n "$RESOLVED" ] && HARNESS_WORKSPACE="$RESOLVED"
  else
    echo "jq is required to parse harness.config.json" >&2
    EXIT_CODE=1
  fi
elif [ -f "$PROJECT_ROOT/.handyman/feature_list.json" ]; then
  HARNESS_WORKSPACE="$PROJECT_ROOT/.handyman"
fi

# Resolve a relative harness_workspace against PROJECT_ROOT.
case "${HARNESS_WORKSPACE:-}" in
  /*) : ;;
  "") : ;;
  *) HARNESS_WORKSPACE="$PROJECT_ROOT/$HARNESS_WORKSPACE" ;;
esac

if [ -z "${HARNESS_WORKSPACE:-}" ]; then
  echo "HARNESS_WORKSPACE could not be resolved" >&2
  EXIT_CODE=1
fi

# Expose the resolved value for tests/debugging.
echo "HARNESS_WORKSPACE=$HARNESS_WORKSPACE"

# 2. Required project-root bridge files.
for f in AGENTS.md CHECKPOINTS.md; do
  if [ ! -f "$PROJECT_ROOT/$f" ]; then
    echo "missing bridge file: $f" >&2
    EXIT_CODE=1
  fi
done

# 3. Required harness files in HARNESS_WORKSPACE.
for f in feature_list.json progress/current.md progress/history.md \
         docs/architecture.md docs/conventions.md docs/verification.md; do
  if [ ! -f "$HARNESS_WORKSPACE/$f" ]; then
    echo "missing harness file: $f" >&2
    EXIT_CODE=1
  fi
done

# 4. Parse feature_list.json and enforce at most one in_progress feature.
FL="$HARNESS_WORKSPACE/feature_list.json"
if [ -f "$FL" ] && command -v jq >/dev/null 2>&1; then
  if ! jq empty "$FL" >/dev/null 2>&1; then
    echo "feature_list.json is not valid JSON" >&2
    EXIT_CODE=1
  else
    IN_PROGRESS="$(jq '[.features[] | select(.status == "in_progress")] | length' "$FL")"
    if [ "$IN_PROGRESS" -gt 1 ]; then
      echo "more than one feature is in_progress ($IN_PROGRESS)" >&2
      EXIT_CODE=1
    fi
  fi
fi

# 5. Optional product test hook: run from PROJECT_ROOT if present.
if [ -x "$PROJECT_ROOT/verify_tests.sh" ]; then
  ( cd "$PROJECT_ROOT" && ./verify_tests.sh ) || EXIT_CODE=1
fi

exit $EXIT_CODE

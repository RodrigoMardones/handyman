#!/usr/bin/env bash
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

# 1. Check required runtime tools.
# 2. Check required harness files in $HARNESS_WORKSPACE.
# 3. Parse $HARNESS_WORKSPACE/feature_list.json and enforce at most one in_progress.
# 4. Run the test command from $PROJECT_ROOT.
# 5. Exit 0 only when all checks pass.

exit $EXIT_CODE

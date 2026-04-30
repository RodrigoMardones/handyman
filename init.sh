#!/usr/bin/env bash
set -u

EXIT_CODE=0
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_PATH="$PROJECT_ROOT/harness.config.json"
HARNESS_WORKSPACE="$PROJECT_ROOT"

fail() {
  echo "ERROR: $1" >&2
  EXIT_CODE=1
}

if ! command -v bun >/dev/null 2>&1; then
  fail "bun is required"
fi

if ! command -v npm >/dev/null 2>&1; then
  fail "npm is required for packaging verification"
fi

if [ -f "$CONFIG_PATH" ]; then
  HARNESS_WORKSPACE="$(bun -e 'const fs = require("node:fs"); const [path] = process.argv.slice(1); const config = JSON.parse(fs.readFileSync(path, "utf8")); process.stdout.write(config.harness_workspace || "");' "$CONFIG_PATH")"
fi

if [ -z "${HARNESS_WORKSPACE:-}" ]; then
  fail "HARNESS_WORKSPACE could not be resolved"
fi

echo "PROJECT_ROOT=$PROJECT_ROOT"
echo "HARNESS_WORKSPACE=$HARNESS_WORKSPACE"

for required_path in \
  "$PROJECT_ROOT/AGENTS.md" \
  "$PROJECT_ROOT/CHECKPOINTS.md" \
  "$PROJECT_ROOT/package.json" \
  "$PROJECT_ROOT/src/cli.ts" \
  "$PROJECT_ROOT/tests/cli.test.ts" \
  "$HARNESS_WORKSPACE/feature_list.json" \
  "$HARNESS_WORKSPACE/progress/current.md" \
  "$HARNESS_WORKSPACE/progress/history.md" \
  "$HARNESS_WORKSPACE/docs/architecture.md" \
  "$HARNESS_WORKSPACE/docs/conventions.md" \
  "$HARNESS_WORKSPACE/docs/verification.md"
do
  if [ ! -e "$required_path" ]; then
    fail "missing required path: $required_path"
  fi
done

if [ -e "$HARNESS_WORKSPACE/feature_list.json" ]; then
  bun -e '
    const fs = require("node:fs");
    const [path] = process.argv.slice(1);
    const data = JSON.parse(fs.readFileSync(path, "utf8"));
    if (!Array.isArray(data.features)) {
      console.error("feature_list.json must contain a features array");
      process.exit(1);
    }
    const valid = data.rules?.valid_status || ["pending", "in_progress", "done", "blocked"];
    const invalid = data.features.filter((feature) => !valid.includes(feature.status));
    const inProgress = data.features.filter((feature) => feature.status === "in_progress");
    if (invalid.length) {
      console.error(`invalid feature status: ${invalid.map((feature) => `${feature.id}:${feature.status}`).join(", ")}`);
      process.exit(1);
    }
    if (inProgress.length > 1) {
      console.error(`more than one feature in_progress: ${inProgress.map((feature) => feature.id).join(", ")}`);
      process.exit(1);
    }
  ' "$HARNESS_WORKSPACE/feature_list.json" || EXIT_CODE=1
fi

(cd "$PROJECT_ROOT" && bun run typecheck) || EXIT_CODE=1
(cd "$PROJECT_ROOT" && bun test) || EXIT_CODE=1
(cd "$PROJECT_ROOT" && bun run build) || EXIT_CODE=1
(cd "$PROJECT_ROOT" && bun run smoke:node) || EXIT_CODE=1
(cd "$PROJECT_ROOT" && bun run pack:dry) || EXIT_CODE=1

exit "$EXIT_CODE"

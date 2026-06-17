#!/usr/bin/env bash
# Handyman scaffold. Creates the harness directory skeleton and copies the
# starter templates from assets/ into a target repo so a bootstrap is
# deterministic instead of re-created by hand on every invocation.
#
# Usage:
#   scripts/scaffold.sh <local|global> <project_root> [project_name]
#
# - local:  HARNESS_WORKSPACE = <project_root>/.handyman
# - global: HARNESS_WORKSPACE = $HOME/HANDYMAN/<project_name>
#
# Existing files are never overwritten; they are reported and skipped so
# in-progress harness state stays intact. Fill the copied templates with
# project-specific content afterwards (see references/examples.md).
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ASSETS_DIR="$(cd "$SCRIPT_DIR/../assets" && pwd)"

usage() {
  echo "usage: scripts/scaffold.sh <local|global> <project_root> [project_name]" >&2
  exit 2
}

SCOPE="${1:-}"
PROJECT_ROOT_ARG="${2:-}"
PROJECT_NAME_ARG="${3:-}"

[ -n "$SCOPE" ] || usage
[ -n "$PROJECT_ROOT_ARG" ] || usage
case "$SCOPE" in
  local|global) : ;;
  *) echo "error: scope must be 'local' or 'global'" >&2; usage ;;
esac

if [ ! -d "$ASSETS_DIR" ]; then
  echo "error: assets directory not found at $ASSETS_DIR" >&2
  exit 1
fi

PROJECT_ROOT="$(cd "$PROJECT_ROOT_ARG" 2>/dev/null && pwd)" || {
  echo "error: project_root '$PROJECT_ROOT_ARG' does not exist" >&2
  exit 1
}

PROJECT_NAME="${PROJECT_NAME_ARG:-$(basename "$PROJECT_ROOT")}"

if [ "$SCOPE" = "local" ]; then
  HARNESS_WORKSPACE="$PROJECT_ROOT/.handyman"
  CONFIG_TEMPLATE="$ASSETS_DIR/harness.config.local.template.json"
else
  HANDYMAN_ROOT="${HANDYMAN_ROOT:-$HOME/HANDYMAN}"
  HARNESS_WORKSPACE="$HANDYMAN_ROOT/$PROJECT_NAME"
  CONFIG_TEMPLATE="$ASSETS_DIR/harness.config.global.template.json"
fi

echo "==> scope:             $SCOPE"
echo "==> project_root:      $PROJECT_ROOT"
echo "==> project_name:      $PROJECT_NAME"
echo "==> harness_workspace: $HARNESS_WORKSPACE"

# --- Helpers ----------------------------------------------------------------
# copy_template SRC DEST   Copy a template to DEST unless DEST already exists.
copy_template() {
  src="$1"; dest="$2"
  if [ ! -f "$src" ]; then
    echo "    SKIP (missing template): $src" >&2
    return 0
  fi
  if [ -e "$dest" ]; then
    echo "    KEEP (already exists):   $dest"
    return 0
  fi
  mkdir -p "$(dirname "$dest")"
  cp "$src" "$dest"
  echo "    NEW:  $dest"
}

make_dir() {
  if [ -d "$1" ]; then
    echo "    KEEP dir: $1"
  else
    mkdir -p "$1"
    echo "    NEW dir:  $1"
  fi
}

# --- Workspace skeleton -----------------------------------------------------
echo "==> creating workspace skeleton"
make_dir "$HARNESS_WORKSPACE"
make_dir "$HARNESS_WORKSPACE/progress"
make_dir "$HARNESS_WORKSPACE/backlog"
make_dir "$HARNESS_WORKSPACE/docs"

# --- Mutable state templates ------------------------------------------------
echo "==> copying harness state templates"
copy_template "$ASSETS_DIR/feature_list.template.json"   "$HARNESS_WORKSPACE/feature_list.json"
copy_template "$ASSETS_DIR/progress-current.template.md" "$HARNESS_WORKSPACE/progress/current.md"
copy_template "$ASSETS_DIR/progress-history.template.md" "$HARNESS_WORKSPACE/progress/history.md"
copy_template "$ASSETS_DIR/docs-business.template.md"     "$HARNESS_WORKSPACE/docs/business.md"
copy_template "$ASSETS_DIR/docs-architecture.template.md" "$HARNESS_WORKSPACE/docs/architecture.md"
copy_template "$ASSETS_DIR/docs-conventions.template.md"  "$HARNESS_WORKSPACE/docs/conventions.md"
copy_template "$ASSETS_DIR/docs-verification.template.md" "$HARNESS_WORKSPACE/docs/verification.md"
copy_template "$ASSETS_DIR/index.template.md"             "$HARNESS_WORKSPACE/index.md"
copy_template "$ASSETS_DIR/feature-request.template.md"   "$HARNESS_WORKSPACE/feature-request.md"

# --- Bridge files in the repo root ------------------------------------------
echo "==> copying repo-root bridge files"
copy_template "$ASSETS_DIR/AGENTS.template.md"      "$PROJECT_ROOT/AGENTS.md"
copy_template "$ASSETS_DIR/CHECKPOINTS.template.md" "$PROJECT_ROOT/CHECKPOINTS.md"
copy_template "$ASSETS_DIR/init.template.sh"        "$PROJECT_ROOT/init.sh"
copy_template "$CONFIG_TEMPLATE"                    "$PROJECT_ROOT/harness.config.json"
[ -f "$PROJECT_ROOT/init.sh" ] && chmod +x "$PROJECT_ROOT/init.sh"

cat <<EOF

==> scaffold complete
Next steps:
  1. Fill the copied templates with project-specific content (do not leave placeholders).
  2. Replace run_lint / run_build / run_test in init.sh with real commands.
  3. Materialize role files in the platform path (.github/agents/ or .claude/agents/), never in $HARNESS_WORKSPACE.
  4. Run ./init.sh from the project root and resolve any reported gaps.
See references/examples.md for a full walkthrough.
EOF

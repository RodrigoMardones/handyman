#!/usr/bin/env bash
# =============================================================================
# FOREMAN — Harness-Subagents Skill Installer
# =============================================================================
# Usage:
#   ./install.sh [--mode local|global] [--target <dir>]
#
# Modes:
#   local   Install all files (including progress data) inside the target
#           workspace directory (default).
#
#   global  Install static config files inside the target workspace, but store
#           all dynamic progress data under ~/FOREMAN/<project_name>/.
#           AGENTS.md and CHECKPOINTS.md will reference the global path so
#           every agent operation reads/writes there.
#
# Options:
#   --mode   <local|global>   Installation mode (default: local)
#   --target <path>           Directory to install into (default: current dir)
#   --help                    Show this help message
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
readonly FOREMAN_PROJECT_NAME="FOREMAN"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly LIB_DIR="$SCRIPT_DIR/lib"
readonly TEMPLATES_DIR="$SCRIPT_DIR/templates"

# ---------------------------------------------------------------------------
# Source shared helpers
# ---------------------------------------------------------------------------
# shellcheck source=lib/foreman.sh
source "$LIB_DIR/foreman.sh"

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
MODE="local"
TARGET_DIR="$(pwd)"

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      MODE="$2"
      shift 2
      ;;
    --mode=*)
      MODE="${1#*=}"
      shift
      ;;
    --target)
      TARGET_DIR="$2"
      shift 2
      ;;
    --target=*)
      TARGET_DIR="${1#*=}"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      foreman_error "Unknown option: $1. Run with --help for usage."
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Validate arguments
# ---------------------------------------------------------------------------
if [[ "$MODE" != "local" && "$MODE" != "global" ]]; then
  foreman_error "--mode must be 'local' or 'global'. Got: '$MODE'"
fi

if [[ ! -d "$TARGET_DIR" ]]; then
  foreman_error "Target directory does not exist: $TARGET_DIR"
fi

TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"  # resolve to absolute path
PROJECT_FOLDER="$(basename "$TARGET_DIR")"

# ---------------------------------------------------------------------------
# Determine progress directory
# ---------------------------------------------------------------------------
if [[ "$MODE" == "local" ]]; then
  PROGRESS_DIR="$TARGET_DIR/progress"
  PROGRESS_DIR_DISPLAY="./progress"
else
  GLOBAL_BASE="$HOME/$FOREMAN_PROJECT_NAME"
  PROGRESS_DIR="$GLOBAL_BASE/$PROJECT_FOLDER/progress"
  PROGRESS_DIR_DISPLAY="$PROGRESS_DIR"
fi

# ---------------------------------------------------------------------------
# Install
# ---------------------------------------------------------------------------
foreman_info "Installing FOREMAN skill in '$MODE' mode"
foreman_info "  Workspace : $TARGET_DIR"
foreman_info "  Project   : $PROJECT_FOLDER"
foreman_info "  Progress  : $PROGRESS_DIR"
echo ""

install_progress_structure "$PROGRESS_DIR"
install_agents_md "$TARGET_DIR" "$MODE" "$PROJECT_FOLDER" "$PROGRESS_DIR_DISPLAY"
install_checkpoints_md "$TARGET_DIR" "$MODE" "$PROJECT_FOLDER" "$PROGRESS_DIR_DISPLAY"

echo ""
foreman_success "FOREMAN skill installed successfully!"
if [[ "$MODE" == "global" ]]; then
  foreman_info "Dynamic progress data will be stored at:"
  foreman_info "  $PROGRESS_DIR"
  foreman_info ""
  foreman_info "Static config files were placed in your workspace:"
  foreman_info "  $TARGET_DIR/AGENTS.md"
  foreman_info "  $TARGET_DIR/CHECKPOINTS.md"
fi

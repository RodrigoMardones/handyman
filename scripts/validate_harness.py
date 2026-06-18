#!/usr/bin/env python3
"""Deterministic structure validator for a Handyman harness.

Turns the manual *Analysis Checklist* into reproducible checks: resolve
HARNESS_WORKSPACE, verify the required core files, parse feature_list.json,
enforce the "at most one in_progress" invariant, and confirm role files live
in the platform path instead of inside the harness workspace.

Usage:
    python scripts/validate_harness.py --root <project_root>

Exit codes:
    0  the harness is well-formed
    1  one or more gaps were found (a gap report is printed)
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Core files that must exist inside the resolved HARNESS_WORKSPACE.
REQUIRED_WORKSPACE_FILES = (
    "feature_list.json",
    "progress/current.md",
    "progress/history.md",
)

# Platform directories where role files are allowed to live.
PLATFORM_ROLE_DIRS = (".github/agents", ".claude/agents")

VALID_STATUS = ("pending", "in_progress", "done", "blocked")


def resolve_workspace(root: Path) -> Path:
    """Resolve HARNESS_WORKSPACE following the documented precedence.

    Order: harness.config.json -> feature_list.json config -> .handyman/
    -> legacy PROJECT_ROOT fallback.
    """
    config = root / "harness.config.json"
    if config.is_file():
        try:
            data = json.loads(config.read_text(encoding="utf-8"))
            ws = data.get("harness_workspace")
        except (ValueError, OSError):
            ws = None
        if ws:
            ws_path = Path(ws)
            return ws_path if ws_path.is_absolute() else (root / ws_path)

    root_feature_list = root / "feature_list.json"
    if root_feature_list.is_file():
        try:
            data = json.loads(root_feature_list.read_text(encoding="utf-8"))
            ws = (data.get("config") or {}).get("harness_workspace")
        except (ValueError, OSError):
            ws = None
        if ws:
            ws_path = Path(ws)
            return ws_path if ws_path.is_absolute() else (root / ws_path)

    if (root / ".handyman" / "feature_list.json").is_file():
        return root / ".handyman"

    return root


def check_required_files(workspace: Path, gaps: list[str]) -> None:
    for rel in REQUIRED_WORKSPACE_FILES:
        if not (workspace / rel).is_file():
            gaps.append(f"missing harness file: {workspace / rel}")


def check_feature_list(workspace: Path, gaps: list[str]) -> None:
    list_path = workspace / "feature_list.json"
    if not list_path.is_file():
        gaps.append(f"feature_list.json not found: {list_path}")
        return
    try:
        data = json.loads(list_path.read_text(encoding="utf-8"))
    except (ValueError, OSError) as exc:
        gaps.append(f"feature_list.json does not parse: {exc}")
        return

    features = data.get("features")
    if not isinstance(features, list):
        gaps.append("feature_list.json has no 'features' array")
        return

    in_progress = [f for f in features if f.get("status") == "in_progress"]
    if len(in_progress) > 1:
        names = ", ".join(str(f.get("name", f.get("id", "?"))) for f in in_progress)
        gaps.append(f"more than one feature is in_progress ({len(in_progress)}): {names}")

    for feature in features:
        status = feature.get("status")
        if status is not None and status not in VALID_STATUS:
            ident = feature.get("name", feature.get("id", "?"))
            gaps.append(f"feature '{ident}' has invalid status '{status}'")


def check_role_files(root: Path, workspace: Path, gaps: list[str]) -> None:
    """Role files must live in a platform path, never inside the workspace."""
    if not workspace.exists():
        return
    stray = sorted(
        str(p.relative_to(root)) if p.is_relative_to(root) else str(p)
        for p in workspace.rglob("*.agent.md")
    )
    for rel in stray:
        gaps.append(
            f"role file inside HARNESS_WORKSPACE: {rel} "
            f"(move to {' or '.join(PLATFORM_ROLE_DIRS)})"
        )


def validate(root: Path) -> list[str]:
    gaps: list[str] = []
    workspace = resolve_workspace(root)
    check_required_files(workspace, gaps)
    check_feature_list(workspace, gaps)
    check_role_files(root, workspace, gaps)
    return gaps


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        default=".",
        help="Project root that holds the harness (default: current directory).",
    )
    args = parser.parse_args(argv)

    root = Path(args.root).resolve()
    if not root.is_dir():
        print(f"validate_harness: root is not a directory: {root}", file=sys.stderr)
        return 1

    workspace = resolve_workspace(root)
    gaps = validate(root)

    if gaps:
        print(f"validate_harness: FAIL (HARNESS_WORKSPACE={workspace})", file=sys.stderr)
        for gap in gaps:
            print(f"    {gap}", file=sys.stderr)
        return 1

    print(f"validate_harness: OK (HARNESS_WORKSPACE={workspace})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

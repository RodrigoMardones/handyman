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
import re
import subprocess
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

# Required frontmatter keys per report type for the non-blocking advisory.
FRONTMATTER_REQUIRED = {
    "current": ("feature", "status", "role", "updated", "tags"),
    "impl": ("feature", "status", "role", "updated", "tags"),
    "review": ("feature", "status", "role", "updated", "tags"),
    "explore": ("topic", "role", "updated", "tags"),
}


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


def _feature_list_schema_path() -> Path:
    """Locate the bundled feature_list JSON Schema.

    The schema ships with the Handyman skill repo under assets/schemas/. In an
    installed target repo it may be absent; callers degrade to a skip then.
    """
    return (
        Path(__file__).resolve().parent.parent
        / "assets" / "schemas" / "feature_list.schema.json"
    )


def check_schema(workspace: Path, gaps: list[str]) -> None:
    """Validate the live feature_list.json against its JSON Schema.

    This is the gate that catches keys the contract does not define (the schema
    sets additionalProperties:false), e.g. invented start_date / close_date
    fields on a feature. It degrades gracefully: when jsonschema is missing or
    the schema file is unreachable it prints a NOTE and skips instead of
    failing, so installed target repos without the schema are not blocked.
    """
    list_path = workspace / "feature_list.json"
    if not list_path.is_file():
        return  # already reported by check_required_files / check_feature_list
    try:
        import jsonschema  # type: ignore
    except ImportError:
        print(
            "NOTE: jsonschema not installed - skipping feature_list schema validation.",
            file=sys.stderr,
        )
        return
    schema_path = _feature_list_schema_path()
    if not schema_path.is_file():
        print(
            f"NOTE: feature_list schema not found at {schema_path} - skipping schema validation.",
            file=sys.stderr,
        )
        return
    try:
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        data = json.loads(list_path.read_text(encoding="utf-8"))
    except (ValueError, OSError) as exc:
        gaps.append(f"could not load schema or feature_list for validation: {exc}")
        return
    validator = jsonschema.Draft7Validator(schema)
    for error in sorted(validator.iter_errors(data), key=lambda e: list(e.path)):
        location = "/".join(str(p) for p in error.path) or "(root)"
        gaps.append(f"feature_list.json schema violation at {location}: {error.message}")


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


def _frontmatter_keys(text: str):
    """Return (keys, tags_line) from the leading YAML frontmatter, or (None, '')."""
    lines = text.split("\n")
    if not lines or lines[0].strip() != "---":
        return None, ""
    keys: list[str] = []
    tags_line = ""
    for line in lines[1:]:
        if line.strip() == "---":
            break
        match = re.match(r"^([A-Za-z_][A-Za-z0-9_]*):", line)
        if match:
            keys.append(match.group(1))
            if match.group(1) == "tags":
                tags_line = line
    return keys, tags_line


def check_frontmatter_advisory(workspace: Path) -> None:
    """Non-blocking advisory over progress/ and backlog/ report frontmatter.

    Reports files missing the required keys for their type or the #handyman/ tag
    namespace. Like the other init.sh advisories it only prints NOTE lines and
    never contributes to the gap list, so it cannot change the exit code. Empty
    placeholder files are skipped (a missing report is a different concern).
    """
    targets: list[tuple[str, Path]] = []
    current = workspace / "progress" / "current.md"
    if current.is_file():
        targets.append(("current", current))
    backlog = workspace / "backlog"
    if backlog.is_dir():
        for kind, pattern in (("impl", "impl_*.md"),
                              ("review", "review_*.md"),
                              ("explore", "explore_*.md")):
            for path in sorted(backlog.glob(pattern)):
                targets.append((kind, path))

    for kind, path in targets:
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            continue
        if not text.strip():
            continue
        required = FRONTMATTER_REQUIRED[kind]
        keys, tags_line = _frontmatter_keys(text)
        if keys is None:
            print(f"NOTE: {path} has no YAML frontmatter "
                  f"(expected {', '.join(required)}).", file=sys.stderr)
            continue
        missing = [k for k in required if k not in keys]
        if missing:
            print(f"NOTE: {path} frontmatter is missing: "
                  f"{', '.join(missing)}.", file=sys.stderr)
        if "tags" in keys and "handyman/" not in tags_line:
            print(f"NOTE: {path} tags do not use the #handyman/ namespace.",
                  file=sys.stderr)


def check_branch_advisory(root: Path, workspace: Path) -> None:
    """Non-blocking advisory: the session in progress/current.md records the
    branch it started on; when that differs from the currently checked-out
    branch, the session belongs to another line of work (the workspace is one
    per checkout, shared across branches). Prints a NOTE and never contributes
    to the gap list. Resolution stays a human decision: resume on the original
    branch, `feature.py block` the stale session, or use git worktrees for
    real parallelism."""
    current = workspace / "progress" / "current.md"
    if not current.is_file():
        return
    try:
        text = current.read_text(encoding="utf-8")
    except OSError:
        return
    recorded = None
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("- **Branch:**"):
            value = stripped[len("- **Branch:**"):].strip()
            if value and value != "_-_":
                recorded = value
            break
    if recorded is None:
        return
    try:
        result = subprocess.run(
            ["git", "symbolic-ref", "--short", "-q", "HEAD"],
            cwd=str(root), capture_output=True, text=True, check=False,
        )
    except OSError:
        return
    actual = result.stdout.strip()
    if result.returncode != 0 or not actual:
        return
    if actual != recorded:
        print(f"NOTE: progress/current.md session belongs to branch "
              f"'{recorded}' but '{actual}' is checked out - resume there, "
              f"block the session (feature.py block), or use a git worktree.",
              file=sys.stderr)


def validate(root: Path) -> list[str]:
    gaps: list[str] = []
    workspace = resolve_workspace(root)
    check_required_files(workspace, gaps)
    check_feature_list(workspace, gaps)
    check_schema(workspace, gaps)
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
    check_frontmatter_advisory(workspace)
    check_branch_advisory(root, workspace)

    if gaps:
        print(f"validate_harness: FAIL (HARNESS_WORKSPACE={workspace})", file=sys.stderr)
        for gap in gaps:
            print(f"    {gap}", file=sys.stderr)
        return 1

    print(f"validate_harness: OK (HARNESS_WORKSPACE={workspace})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

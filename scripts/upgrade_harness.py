#!/usr/bin/env python3
"""Detect whether an installed Handyman harness lags the current skill version.

Read-only drift detector (Phase 1 of the harness-upgrade roadmap, see
docs/analisis-actualizacion-harness.md). Resolves the target harness workspace,
reads its `harness_version` stamp, and compares it against the version of the
skill that ships this script (SKILL.md `metadata.version`). It prints the gap
and the structural milestones the harness still needs, and exits non-zero when
the harness is behind or unsealed, so it can gate CI or a verifier phase.

Applying the migrations is a later phase; this command only reports.

Usage:
    python scripts/upgrade_harness.py --check [--root PATH]

Exit codes:
    0  the harness is at (or ahead of) the current skill version
    1  the harness is behind or has no version stamp
    2  usage error
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# scripts/ is on sys.path[0] when run as a script, so this resolves (the same
# import pattern feature.py uses to share one HARNESS_WORKSPACE resolver).
from validate_harness import resolve_workspace

# Releases that changed harness *structure*, newest last. A later phase attaches
# an idempotent migration to each; this command only lists those a harness still
# needs. Source: docs/analisis-actualizacion-harness.md (drift surface).
MILESTONES = (
    ("1.6.0", "docs/business.md layer + abstract harness gitignore"),
    ("1.7.0", "prompt-injection mitigation: security.md + role-file notes"),
    ("1.8.0", "deterministic tooling: validate_harness, schemas, feature CLI, init validate phase"),
)

SEMVER_RE = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")

Version = "tuple[int, int, int]"


def parse_version(value: str | None):
    """Parse 'X.Y.Z' into a comparable tuple, or None when it is not semver."""
    if not value:
        return None
    match = SEMVER_RE.match(value.strip())
    if not match:
        return None
    return tuple(int(part) for part in match.groups())


def current_skill_version() -> str:
    """metadata.version from the SKILL.md shipped beside this script."""
    skill_md = Path(__file__).resolve().parent.parent / "SKILL.md"
    try:
        text = skill_md.read_text(encoding="utf-8")
    except OSError:
        return ""
    match = re.search(r"^\s+version:\s*(.+)$", text, re.MULTILINE)
    return match.group(1).strip() if match else ""


def read_installed_version(root: Path, workspace: Path) -> str | None:
    """harness_version from harness.config.json, else feature_list.json config."""
    config = root / "harness.config.json"
    if config.is_file():
        try:
            data = json.loads(config.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            data = {}
        if data.get("harness_version"):
            return data["harness_version"]
    feature_list = workspace / "feature_list.json"
    if feature_list.is_file():
        try:
            data = json.loads(feature_list.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            data = {}
        version = (data.get("config") or {}).get("harness_version")
        if version:
            return version
    return None


def pending_milestones(installed, current) -> list:
    """Structural milestones newer than installed and within current."""
    floor = installed or (0, 0, 0)
    pending = []
    for version, summary in MILESTONES:
        parsed = parse_version(version)
        if parsed is not None and floor < parsed <= current:
            pending.append((version, summary))
    return pending


def _print_pending(pending: list) -> None:
    if pending:
        print("    pending structural upgrades:")
        for version, summary in pending:
            print(f"      {version}  {summary}")
    print("    apply them with the migrations phase, or re-scaffold to pull new files")


def check(root: Path) -> int:
    workspace = resolve_workspace(root)
    current_raw = current_skill_version()
    current = parse_version(current_raw)
    if current is None:
        print(f"error: cannot read current skill version (got {current_raw!r})",
              file=sys.stderr)
        return 2

    installed_raw = read_installed_version(root, workspace)
    installed = parse_version(installed_raw)

    print(f"==> harness: {root}")
    print(f"    workspace:          {workspace}")
    print(f"    installed version:  {installed_raw or '(unsealed)'}")
    print(f"    current version:    {current_raw}")

    if installed is None:
        print("==> harness has no valid version stamp "
              "(created before harness versioning; assume < 1.6.0)")
        _print_pending(pending_milestones(None, current))
        return 1

    if installed >= current:
        print("==> harness is up to date")
        return 0

    print(f"==> harness is behind: {installed_raw} -> {current_raw}")
    _print_pending(pending_milestones(installed, current))
    return 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="upgrade_harness.py",
        description="Detect harness version drift from the current skill.",
    )
    parser.add_argument("--root", default=".",
                        help="target project root (default: cwd)")
    parser.add_argument("--check", action="store_true",
                        help="report drift read-only; exit non-zero if behind")
    args = parser.parse_args(argv)

    root = Path(args.root).resolve()
    if not root.is_dir():
        print(f"error: root is not a directory: {root}", file=sys.stderr)
        return 2

    if not args.check:
        parser.print_usage(sys.stderr)
        print("error: pass --check (applying migrations arrives in a later phase)",
              file=sys.stderr)
        return 2

    return check(root)


if __name__ == "__main__":
    raise SystemExit(main())

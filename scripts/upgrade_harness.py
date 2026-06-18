#!/usr/bin/env python3
"""Detect and apply Handyman harness version upgrades.

Two operations over a target harness, built on the Phase 0 `harness_version`
seal (see docs/analisis-actualizacion-harness.md):

  --check    Read-only. Resolve the workspace, read the installed
             `harness_version`, compare it to the version of the skill that
             ships this script (SKILL.md `metadata.version`), and report the
             pending structural migrations. Exit non-zero when behind/unsealed.

  (default)  Apply the pending migrations from the installed version up to the
             current one: drop in missing *managed* scaffolding files, print the
             manual steps for *project-owned* content, back up the files it will
             change, then re-seal `harness_version`. `--dry-run` previews the
             diffs and writes nothing.

Migrations are idempotent: a managed file is created only when missing, and a
second run after a successful upgrade is a no-op. Project-owned state
(`feature_list.json`, `progress/`, `backlog/`, filled `docs/`) is never
overwritten - it is only reported.

Usage:
    python scripts/upgrade_harness.py --check [--root PATH]
    python scripts/upgrade_harness.py [--dry-run] [--root PATH]

Exit codes:
    0  up to date, or migrations applied (or previewed) successfully
    1  --check found the harness behind or unsealed
    2  usage error
"""
from __future__ import annotations

import argparse
import difflib
import json
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

# scripts/ is on sys.path[0] when run as a script, so this resolves (the same
# import pattern feature.py uses to share one HARNESS_WORKSPACE resolver).
from validate_harness import resolve_workspace

ASSETS = Path(__file__).resolve().parent.parent / "assets"

# Ordered, idempotent migration registry. Each entry upgrades a harness *to* its
# version. `ensures` are managed scaffolding files copied only when missing;
# `advisories` are project-owned content changes a human must apply.
# Source: docs/analisis-actualizacion-harness.md (drift surface).
MIGRATIONS = (
    {
        "version": "1.6.0",
        "summary": "docs/business.md layer + abstract harness gitignore",
        "ensures": (("docs/business.md", "docs-business.template.md"),),
        "advisories": (
            "gitignore: add `.handyman/*` + `!.handyman/docs/` (see references/templates.md)",
        ),
    },
    {
        "version": "1.7.0",
        "summary": "prompt-injection mitigation: security.md + role-file notes",
        "ensures": (),
        "advisories": (
            "role files: carry the data-not-instructions boundary (see references/security.md)",
        ),
    },
    {
        "version": "1.8.0",
        "summary": "deterministic tooling: validate_harness, schemas, feature CLI, init validate phase",
        "ensures": (),
        "advisories": (
            "verifier: add the `validate` phase; validate_harness.py / feature.py / schemas ship with the skill",
        ),
    },
)

SEMVER_RE = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")


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


def pending_migrations(installed, current) -> list:
    """Registry entries newer than installed and within current, in order."""
    floor = installed or (0, 0, 0)
    pending = []
    for migration in MIGRATIONS:
        version = parse_version(migration["version"])
        if version is not None and floor < version <= current:
            pending.append(migration)
    return pending


def _header(root: Path, workspace: Path, installed_raw, current_raw) -> None:
    print(f"==> harness: {root}")
    print(f"    workspace:          {workspace}")
    print(f"    installed version:  {installed_raw or '(unsealed)'}")
    print(f"    current version:    {current_raw}")


def _print_pending(pending: list) -> None:
    if pending:
        print("    pending structural upgrades:")
        for migration in pending:
            print(f"      {migration['version']}  {migration['summary']}")
    print("    apply: scripts/upgrade_harness.py --root <root> (use --dry-run to preview)")


# --- check (read-only) -------------------------------------------------------

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
    _header(root, workspace, installed_raw, current_raw)

    if installed is not None and installed >= current:
        print("==> harness is up to date")
        return 0

    if installed is None:
        print("==> harness has no valid version stamp "
              "(created before harness versioning; assume < 1.6.0)")
    else:
        print(f"==> harness is behind: {installed_raw} -> {current_raw}")
    _print_pending(pending_migrations(installed, current))
    return 1


# --- apply -------------------------------------------------------------------

def apply(root: Path, dry_run: bool) -> int:
    workspace = resolve_workspace(root)
    current_raw = current_skill_version()
    current = parse_version(current_raw)
    if current is None:
        print(f"error: cannot read current skill version (got {current_raw!r})",
              file=sys.stderr)
        return 2

    installed_raw = read_installed_version(root, workspace)
    installed = parse_version(installed_raw)
    _header(root, workspace, installed_raw, current_raw)

    if installed is not None and installed >= current:
        print("==> harness is up to date; nothing to apply")
        return 0

    pending = pending_migrations(installed, current)
    if not pending:
        print("==> no structural migrations for this gap; re-sealing the version only")

    if not dry_run:
        backup = make_backup(root, workspace)
        if backup is not None:
            print(f"    backup: {backup}")

    for migration in pending:
        print(f"==> migrate to {migration['version']}: {migration['summary']}")
        for dest_rel, template_name in migration["ensures"]:
            ensure_managed_file(workspace, dest_rel, template_name, dry_run)
        for advisory in migration["advisories"]:
            print(f"    manual: {advisory}")

    reseal_version(root, current_raw, installed_raw, dry_run)

    if dry_run:
        print("==> dry-run: nothing written")
    else:
        print("==> migration complete; run the verifier (./init.sh) to confirm")
    return 0


def ensure_managed_file(workspace: Path, dest_rel: str, template_name: str,
                        dry_run: bool) -> None:
    """Copy a managed template only when the destination is missing."""
    dest = workspace / dest_rel
    template = ASSETS / template_name
    if dest.exists():
        print(f"    ok (exists): {dest_rel}")
        return
    if not template.is_file():
        print(f"    skip (missing template): {template_name}")
        return
    if dry_run:
        print(f"    would create: {dest_rel}")
        content = template.read_text(encoding="utf-8").splitlines(keepends=True)
        sys.stdout.writelines(
            difflib.unified_diff([], content, fromfile="/dev/null",
                                 tofile=f"b/{dest_rel}")
        )
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(template, dest)
    print(f"    created: {dest_rel}")


def make_backup(root: Path, workspace: Path):
    """Back up the files a migration may modify (never the whole workspace)."""
    targets = [path for path in (root / "harness.config.json",) if path.is_file()]
    if not targets:
        return None
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_dir = workspace / ".upgrade-backups" / stamp
    backup_dir.mkdir(parents=True, exist_ok=True)
    for path in targets:
        shutil.copy2(path, backup_dir / path.name)
    return backup_dir


def _with_version(mapping: dict, version: str) -> dict:
    """Set harness_version, inserting it after harness_workspace when new."""
    if "harness_version" in mapping:
        mapping["harness_version"] = version
        return mapping
    rebuilt: dict = {}
    for key, value in mapping.items():
        rebuilt[key] = value
        if key == "harness_workspace":
            rebuilt["harness_version"] = version
    rebuilt.setdefault("harness_version", version)
    return rebuilt


def reseal_version(root: Path, version: str, installed_raw, dry_run: bool) -> None:
    """Re-stamp harness_version in harness.config.json (feature_list untouched)."""
    config = root / "harness.config.json"
    if not config.is_file():
        print("    note: no harness.config.json to seal; create one to record "
              "harness_version (feature_list.json left untouched)")
        return
    if dry_run:
        print(f"    would re-seal harness_version: "
              f"{installed_raw or '(unsealed)'} -> {version}")
        return
    try:
        data = json.loads(config.read_text(encoding="utf-8"))
    except (ValueError, OSError) as exc:
        print(f"    error: cannot read harness.config.json: {exc}", file=sys.stderr)
        return
    data = _with_version(data, version)
    config.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n",
                      encoding="utf-8")
    print(f"    re-sealed harness_version -> {version}")


# --- CLI ---------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="upgrade_harness.py",
        description="Detect or apply Handyman harness version upgrades.",
    )
    parser.add_argument("--root", default=".",
                        help="target project root (default: cwd)")
    parser.add_argument("--check", action="store_true",
                        help="report drift read-only; exit non-zero if behind")
    parser.add_argument("--dry-run", action="store_true",
                        help="apply-mode preview: show diffs, write nothing")
    args = parser.parse_args(argv)

    root = Path(args.root).resolve()
    if not root.is_dir():
        print(f"error: root is not a directory: {root}", file=sys.stderr)
        return 2

    if args.check:
        if args.dry_run:
            parser.print_usage(sys.stderr)
            print("error: --check and --dry-run are mutually exclusive",
                  file=sys.stderr)
            return 2
        return check(root)

    return apply(root, args.dry_run)


if __name__ == "__main__":
    raise SystemExit(main())

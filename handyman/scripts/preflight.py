#!/usr/bin/env python3
"""Handyman preflight: read-only stability gate run before feature work.

A thin orchestrator that reports harness stability by *reusing* the existing
deterministic scripts instead of reimplementing them:

  - format   : scripts/validate_harness.py   (structure + feature_list contract)
  - drift    : scripts/upgrade_harness.py --check  (version drift vs the skill)
  - sync     : scripts/update_harness.py --list    (config <-> role-file audit)
  - discovery: scripts/tools_discovery.py check    (declared skills + MCPs)

It writes nothing. It is a *stability* report, not a quality gate: the
blocking checks already live in `validate` (a phase of `init.sh`), so this
script ALWAYS exits 0 and surfaces drift/sync/discovery as `NOTE`s for the
operator to act on. Applying fixes (migrations, role-file rewrites) stays a
human decision (managed vs project-owned); the gate only makes instability
visible.

Usage:
    python scripts/preflight.py [--root PATH]

Exit codes:
    0  always (read-only stability report)
    2  usage error
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

# Resolve the script dir so preflight works regardless of cwd, like the other
# tools (which are self-locating for assets/ and SKILL.md).
SCRIPT_DIR = Path(__file__).resolve().parent


def _resolve_workspace(root: Path) -> Path:
    """Resolve HARNESS_WORKSPACE reusing validate_harness's precedence.

    Imported lazily so a broken sibling script does not crash preflight's own
    --help, and so the resolution rule stays in exactly one place.
    """
    sys.path.insert(0, str(SCRIPT_DIR))
    try:
        from validate_harness import resolve_workspace  # type: ignore
    except Exception:  # pragma: no cover - defensive fallback
        return root
    finally:
        if str(SCRIPT_DIR) in sys.path:
            sys.path.remove(str(SCRIPT_DIR))
    return resolve_workspace(root)


def _run(cmd: list[str]) -> tuple[int, str]:
    """Run a command, return (exit_code, combined_output). Never raises."""
    try:
        proc = subprocess.run(
            cmd, capture_output=True, text=True, timeout=60, check=False
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return 127, f"could not run {' '.join(cmd)}: {exc}"
    out = (proc.stdout or "") + (proc.stderr or "")
    return proc.returncode, out


def _block(title: str, status: str, detail: str) -> None:
    print(f"--> {title}: {status}")
    if detail.strip():
        for line in detail.strip().splitlines():
            print(f"    {line}")


def preflight(root: Path) -> int:
    workspace = _resolve_workspace(root)
    py = sys.executable
    print(f"==> harness: {root}")
    print(f"    workspace: {workspace}")
    print("==> preflight (read-only stability report)")

    # --- format: structure + feature_list contract --------------------------
    rc, out = _run([py, str(SCRIPT_DIR / "validate_harness.py"), "--root", str(root)])
    status = "OK" if rc == 0 else "GAPS"
    _block("format", status, out)

    # --- drift: version drift vs the current skill --------------------------
    rc, out = _run(
        [py, str(SCRIPT_DIR / "upgrade_harness.py"), "--check", "--root", str(root)]
    )
    status = "OK" if rc == 0 else "BEHIND"
    _block("drift", status, out)

    # --- sync: config <-> role-file audit ------------------------------------
    rc, out = _run([py, str(SCRIPT_DIR / "update_harness.py"), "--list", "--root", str(root)])
    status = "OK" if rc == 0 else "NOTE"
    _block("sync", status, out)

    # --- discovery: declared skills + MCPs -----------------------------------
    rc, out = _run(
        [py, str(SCRIPT_DIR / "tools_discovery.py"), "--root", str(root), "check"]
    )
    status = "OK" if rc == 0 else "NOTE"
    _block("discovery", status, out)

    print("==> preflight: stability report complete (read-only; exit 0)")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Read-only stability report run before feature work. Reuses "
            "validate_harness, upgrade_harness, update_harness and "
            "tools_discovery. Always exits 0."
        )
    )
    parser.add_argument("--root", default=".", help="Project root of the harness.")
    args = parser.parse_args(argv)
    root = Path(args.root).resolve()
    if not root.is_dir():
        print(f"root is not a directory: {root}", file=sys.stderr)
        return 2
    return preflight(root)


if __name__ == "__main__":
    sys.exit(main())

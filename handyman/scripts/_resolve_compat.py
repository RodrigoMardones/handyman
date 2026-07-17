#!/usr/bin/env python3
"""Workspace-resolution compatibility shim for the scripts still in Python.

The Handyman migration ports the Python scripts to TypeScript one at a time
(strangler fig). `validate_harness.py` was the home of `resolve_workspace`
(imported by `preflight.py`, `upgrade_harness.py`, and `tools_discovery.py`)
and of `PLATFORM_ROLE_DIRS`. Once it was ported and dropped, those three
callers lost their import target; `upgrade_harness.py` and `preflight.py`
have since been ported too (and dropped), leaving `tools_discovery.py` as the
only remaining Python sibling that still needs this shim.

Rather than duplicate the resolution rule in each script (or reach back into a
deleted module), this shim re-exports the two names they need:

* `PLATFORM_ROLE_DIRS` — the platform role-file roots, mirrored from the
  TypeScript core (`src/core/workspace.ts`). The single source of truth is the
  TS core; this constant is a stopgap until `tools_discovery` is ported (#13).
* `resolve_workspace(root)` — resolves `HARNESS_WORKSPACE` by running the
  *built* Node artifact `dist/validate_harness.js` and parsing the
  `HARNESS_WORKSPACE=<path>` token it always prints (OK on stdout, FAIL on
  stderr), with the same precedence the core implements. Falls back to `root`
  when the artifact is missing or the token is unparseable, so callers stay
  read-only and never crash.

This whole module is migration debt: it disappears once the last Python script
that needs it is ported to TypeScript and imports the names from the core.
"""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

# Mirrored from src/core/workspace.ts (PLATFORM_ROLE_DIRS). Single source of
# truth is the TS core; this constant is a stopgap for tools_discovery (#13).
PLATFORM_ROLE_DIRS = (".github/agents", ".claude/agents")

_DIST = Path(__file__).resolve().parent.parent / "dist" / "validate_harness.js"
# The Node artifact prints `validate_harness: OK (HARNESS_WORKSPACE=<path>)`; the
# trailing `)` is the line's closing paren, not part of the path, so exclude it.
_WS_RE = re.compile(r"HARNESS_WORKSPACE=([^)\s]+)")


def resolve_workspace(root: Path) -> Path:
    """Resolve HARNESS_WORKSPACE by delegating to the Node port.

    Mirrors the precedence in `src/core/workspace.ts` (via the built artifact):
    harness.config.json -> feature_list.json config -> .handyman/ -> root.
    Falls back to `root` if the artifact is absent or the token is unparseable.
    """
    if not _DIST.is_file():
        return root
    try:
        proc = subprocess.run(
            ["node", str(_DIST), "--root", str(root)],
            capture_output=True, text=True, timeout=60, check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return root
    combined = (proc.stdout or "") + (proc.stderr or "")
    match = _WS_RE.search(combined)
    return Path(match.group(1)) if match else root

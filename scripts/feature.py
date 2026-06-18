#!/usr/bin/env python3
"""Handyman feature-state CLI.

Atomic transitions over feature_list.json so agents never hand-edit the state
machine (the root cause of split-scope, two-in_progress, and history-drift
risks documented in references/checklists.md).

Operations:
  add    Append a new pending feature (auto-incremented id).
  start  Mark a feature in_progress, enforcing the single-in_progress
         invariant, and refresh progress/current.md.
  block  Mark a feature blocked and record the reason.
  done   Run the verifier; only on exit 0 mark the feature done, append a
         progress/history.md entry, and reset progress/current.md.

Usage:
  scripts/feature.py [--root PATH] add --name NAME [--title T] [--description D]
                     [--acceptance LINE]...
  scripts/feature.py [--root PATH] start NAME
  scripts/feature.py [--root PATH] block NAME --reason WHY
  scripts/feature.py [--root PATH] done NAME [--verifier PATH] [--date YYYY-MM-DD]

Exit codes: 0 ok, 1 error, 2 usage.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import date
from pathlib import Path

# Reuse the documented HARNESS_WORKSPACE resolution. When run as a script the
# scripts/ directory is on sys.path[0], so this import resolves.
from validate_harness import resolve_workspace

VALID_STATUS = ("pending", "in_progress", "done", "blocked")

SESSION_TEMPLATE = """\
---
feature: {feature}
status: {status}
role: leader
updated: {updated}
tags: [handyman/session/current]
---

# Current Session

This file is reset when a session closes and its summary moves to `[[history]]`. Keep it updated while working, not only at the end.

- **Feature in progress:** {in_progress}
- **Start:** {start}
- **Agent:** {agent}

## Plan

_Write 3 to 5 bullets before editing code._

## Log

_Record significant steps, files changed, decisions, and blockers._

- ...

## Next Step

_If interrupted, the next session starts here._
"""


def err(msg: str) -> int:
    print(f"error: {msg}", file=sys.stderr)
    return 1


def _load(workspace: Path):
    path = workspace / "feature_list.json"
    if not path.is_file():
        raise FileNotFoundError(path)
    return json.loads(path.read_text(encoding="utf-8")), path


def _save(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n",
                    encoding="utf-8")


def _find(features: list, name: str):
    for feature in features:
        if feature.get("name") == name:
            return feature
    return None


def _write_current(workspace: Path, *, feature: str, status: str,
                   in_progress: str, start: str, agent: str,
                   today: str) -> None:
    current = workspace / "progress" / "current.md"
    if not current.parent.is_dir():
        return
    current.write_text(
        SESSION_TEMPLATE.format(
            feature=feature, status=status, updated=today,
            in_progress=in_progress, start=start, agent=agent,
        ),
        encoding="utf-8",
    )


def cmd_add(args, workspace: Path) -> int:
    data, path = _load(workspace)
    features = data.setdefault("features", [])
    if _find(features, args.name) is not None:
        return err(f"feature '{args.name}' already exists")
    next_id = max((f.get("id", 0) for f in features), default=0) + 1
    feature = {
        "id": next_id,
        "name": args.name,
        "title": args.title or args.name,
        "description": args.description or "",
        "acceptance": list(args.acceptance or []),
        "status": "pending",
    }
    features.append(feature)
    _save(path, data)
    print(f"added feature {next_id} '{args.name}' (pending)")
    return 0


def cmd_start(args, workspace: Path) -> int:
    data, path = _load(workspace)
    features = data.get("features", [])
    feature = _find(features, args.name)
    if feature is None:
        return err(f"feature '{args.name}' not found")
    others = [
        f for f in features
        if f.get("status") == "in_progress" and f.get("name") != args.name
    ]
    if others:
        names = ", ".join(str(f.get("name")) for f in others)
        return err(f"another feature is already in_progress: {names}")
    feature["status"] = "in_progress"
    feature.pop("blocked_reason", None)
    _save(path, data)
    today = args.date or date.today().isoformat()
    _write_current(
        workspace, feature=args.name, status="in_progress",
        in_progress=f"{args.name} (id {feature.get('id')})",
        start=today, agent="leader", today=today,
    )
    print(f"started feature {feature.get('id')} '{args.name}' (in_progress)")
    return 0


def cmd_block(args, workspace: Path) -> int:
    data, path = _load(workspace)
    features = data.get("features", [])
    feature = _find(features, args.name)
    if feature is None:
        return err(f"feature '{args.name}' not found")
    feature["status"] = "blocked"
    feature["blocked_reason"] = args.reason
    _save(path, data)
    print(f"blocked feature {feature.get('id')} '{args.name}': {args.reason}")
    return 0


def cmd_done(args, workspace: Path, root: Path) -> int:
    data, path = _load(workspace)
    features = data.get("features", [])
    feature = _find(features, args.name)
    if feature is None:
        return err(f"feature '{args.name}' not found")

    verifier = Path(args.verifier) if args.verifier else (root / "init.sh")
    if not verifier.is_file():
        return err(f"verifier not found: {verifier}")
    result = subprocess.run(
        ["bash", str(verifier)], cwd=str(root),
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False,
    )
    if result.returncode != 0:
        return err(
            f"verifier failed (exit {result.returncode}); "
            f"feature '{args.name}' stays {feature.get('status')}"
        )

    feature["status"] = "done"
    feature.pop("blocked_reason", None)
    _save(path, data)

    today = args.date or date.today().isoformat()
    history = workspace / "progress" / "history.md"
    if history.is_file():
        entry = (
            f"\n## {today} - Feature {feature.get('id')}: {args.name}\n"
            f"- **Verification:** verifier exit 0\n"
            f"- **Closure:** done\n"
        )
        with history.open("a", encoding="utf-8") as fh:
            fh.write(entry)
    _write_current(
        workspace, feature="none", status="idle",
        in_progress="_none_", start="_-_", agent="_-_", today=today,
    )
    print(f"closed feature {feature.get('id')} '{args.name}' (done)")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=".",
                        help="Project root holding the harness (default: cwd).")
    sub = parser.add_subparsers(dest="command", required=True)

    p_add = sub.add_parser("add", help="Append a pending feature.")
    p_add.add_argument("--name", required=True)
    p_add.add_argument("--title", default=None)
    p_add.add_argument("--description", default=None)
    p_add.add_argument("--acceptance", action="append", default=None,
                       help="Acceptance criterion (repeatable).")

    p_start = sub.add_parser("start", help="Mark a feature in_progress.")
    p_start.add_argument("name")
    p_start.add_argument("--date", default=None, help=argparse.SUPPRESS)

    p_block = sub.add_parser("block", help="Mark a feature blocked.")
    p_block.add_argument("name")
    p_block.add_argument("--reason", required=True)

    p_done = sub.add_parser("done", help="Close a feature after the verifier.")
    p_done.add_argument("name")
    p_done.add_argument("--verifier", default=None,
                        help="Verifier script (default: <root>/init.sh).")
    p_done.add_argument("--date", default=None, help=argparse.SUPPRESS)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    root = Path(args.root).resolve()
    if not root.is_dir():
        return err(f"root is not a directory: {root}")
    workspace = resolve_workspace(root)
    try:
        if args.command == "add":
            return cmd_add(args, workspace)
        if args.command == "start":
            return cmd_start(args, workspace)
        if args.command == "block":
            return cmd_block(args, workspace)
        if args.command == "done":
            return cmd_done(args, workspace, root)
    except FileNotFoundError as exc:
        return err(f"feature_list.json not found: {exc}")
    except (ValueError, OSError) as exc:
        return err(str(exc))
    return 2


if __name__ == "__main__":
    raise SystemExit(main())

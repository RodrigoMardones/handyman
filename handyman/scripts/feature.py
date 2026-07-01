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
         rich progress/history.md entry, and reset progress/current.md.
  log    Append a bullet to the Log section of progress/current.md.
  next   Set the Next Step section of progress/current.md.

Usage:
  scripts/feature.py [--root PATH] add --name NAME [--title T] [--description D]
                     [--acceptance LINE]...
  scripts/feature.py [--root PATH] start NAME
  scripts/feature.py [--root PATH] block NAME --reason WHY
  scripts/feature.py [--root PATH] done NAME [--verifier PATH] [--date YYYY-MM-DD]
  scripts/feature.py [--root PATH] log LINE
  scripts/feature.py [--root PATH] next STEP

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


def _read_post_run(root: Path) -> list[str]:
    """Read the optional `post_run` command list, preferring harness.config.json
    and falling back to the feature_list.json config block. Returns [] when the
    block is absent or malformed (post_run is opt-in)."""
    cfg = root / "harness.config.json"
    try:
        if cfg.is_file():
            data = json.loads(cfg.read_text(encoding="utf-8"))
            steps = data.get("post_run")
            if isinstance(steps, list):
                return [s for s in steps if isinstance(s, str) and s.strip()]
        fl = root / ".handyman" / "feature_list.json"
        if not fl.is_file():
            fl = root / "feature_list.json"
        if fl.is_file():
            data = json.loads(fl.read_text(encoding="utf-8"))
            steps = (data.get("config") or {}).get("post_run")
            if isinstance(steps, list):
                return [s for s in steps if isinstance(s, str) and s.strip()]
    except (ValueError, OSError):
        pass
    return []


def run_post_run(root: Path) -> None:
    """Run declared post_run commands after a verified close. A custom step that
    fails only WARNs; it never reverts a close that already passed the verifier,
    and never changes this command's exit code (always exit 0)."""
    steps = _read_post_run(root)
    if not steps:
        return
    for cmd in steps:
        try:
            result = subprocess.run(
                cmd, shell=True, cwd=str(root),
                capture_output=True, text=True, check=False,
            )
        except OSError as exc:
            print(f"post_run WARN: could not run '{cmd}': {exc}", file=sys.stderr)
            continue
        if result.returncode != 0:
            detail = (result.stderr or result.stdout or "").strip().splitlines()
            tail = detail[-1] if detail else ""
            print(
                f"post_run WARN: '{cmd}' exited {result.returncode}"
                + (f" - {tail}" if tail else ""),
                file=sys.stderr,
            )


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


def _current_text(workspace: Path):
    current = workspace / "progress" / "current.md"
    if not current.is_file():
        return None, None
    return current, current.read_text(encoding="utf-8")


def _bump_updated(text: str, today: str) -> str:
    """Set `updated:` in the leading YAML frontmatter to today."""
    lines = text.split("\n")
    in_fm = False
    for i, line in enumerate(lines):
        if i == 0 and line.strip() == "---":
            in_fm = True
            continue
        if in_fm and line.strip() == "---":
            break
        if in_fm and line.startswith("updated:"):
            lines[i] = f"updated: {today}"
            break
    return "\n".join(lines)


def _section_bounds(lines: list, heading: str):
    """Return (heading_index, section_end) for a `## <heading>` block."""
    try:
        start = next(i for i, l in enumerate(lines) if l.strip() == heading)
    except StopIteration:
        return None, None
    end = len(lines)
    for j in range(start + 1, len(lines)):
        if lines[j].startswith("## "):
            end = j
            break
    return start, end


def _append_log(text: str, bullet: str):
    """Append a bullet to the `## Log` section, replacing the `- ...` stub."""
    lines = text.split("\n")
    start, end = _section_bounds(lines, "## Log")
    if start is None:
        return None
    new_bullet = f"- {bullet}"
    for k in range(start + 1, end):
        if lines[k].strip() == "- ...":
            lines[k] = new_bullet
            return "\n".join(lines)
    insert = end
    while insert - 1 > start and lines[insert - 1].strip() == "":
        insert -= 1
    lines.insert(insert, new_bullet)
    return "\n".join(lines)


def _set_next_step(text: str, step: str):
    """Replace the body of the `## Next Step` section with a single step."""
    lines = text.split("\n")
    start, end = _section_bounds(lines, "## Next Step")
    if start is None:
        return None
    rebuilt = lines[:start] + [lines[start], "", step, ""] + lines[end:]
    return "\n".join(rebuilt)


def cmd_log(args, workspace: Path) -> int:
    current, text = _current_text(workspace)
    if text is None:
        return err("progress/current.md not found")
    today = args.date or date.today().isoformat()
    updated = _append_log(_bump_updated(text, today), args.line)
    if updated is None:
        return err("no '## Log' section in progress/current.md")
    current.write_text(updated, encoding="utf-8")
    print(f"logged to {current}")
    return 0


def cmd_next(args, workspace: Path) -> int:
    current, text = _current_text(workspace)
    if text is None:
        return err("progress/current.md not found")
    today = args.date or date.today().isoformat()
    updated = _set_next_step(_bump_updated(text, today), args.step)
    if updated is None:
        return err("no '## Next Step' section in progress/current.md")
    current.write_text(updated, encoding="utf-8")
    print(f"next step set in {current}")
    return 0


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
            f"- **Agent:** leader -> implementer -> reviewer\n"
            f"- **Plan:** ...\n"
            f"- **Changes:** ...\n"
            f"- **Verification:** verifier exit 0\n"
            f"- **Review:** APPROVED -> backlog/review_{args.name}.md\n"
            f"- **Closure:** done\n"
        )
        with history.open("a", encoding="utf-8") as fh:
            fh.write(entry)
    _write_current(
        workspace, feature="none", status="idle",
        in_progress="_none_", start="_-_", agent="_-_", today=today,
    )
    print(f"closed feature {feature.get('id')} '{args.name}' (done)")
    # Post-run hooks: opt-in custom steps declared in harness.config.json under
    # `post_run`. Always exit 0 (a failing step only WARNs); never reverts a
    # verified close. Run AFTER the close so the verifier gate is unaffected.
    run_post_run(root)
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

    p_log = sub.add_parser("log", help="Append a bullet to current.md's Log.")
    p_log.add_argument("line")
    p_log.add_argument("--date", default=None, help=argparse.SUPPRESS)

    p_next = sub.add_parser("next", help="Set current.md's Next Step.")
    p_next.add_argument("step")
    p_next.add_argument("--date", default=None, help=argparse.SUPPRESS)
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
        if args.command == "log":
            return cmd_log(args, workspace)
        if args.command == "next":
            return cmd_next(args, workspace)
    except FileNotFoundError as exc:
        return err(f"feature_list.json not found: {exc}")
    except (ValueError, OSError) as exc:
        return err(str(exc))
    return 2


if __name__ == "__main__":
    raise SystemExit(main())

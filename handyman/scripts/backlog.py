#!/usr/bin/env python3
"""Handyman backlog-entry generator.

Instantiates a backlog report from its bundled template with the exact, per-type
YAML frontmatter the contract requires, so agents stop hand-stamping
`feature`/`status`/`role`/`updated`/`tags` (the drift risk documented in
docs/analisis-acciones-deterministas-por-capa.md and enforced nowhere else).

Operations:
  impl     Create backlog/impl_<feature>.md    (role: implementer).
  review   Create backlog/review_<feature>.md  (role: reviewer; --status).
  explore  Create backlog/explore_<topic>.md   (role: explorer).

Usage:
  scripts/backlog.py [--root PATH] impl FEATURE
  scripts/backlog.py [--root PATH] review FEATURE [--status approved|changes_requested]
  scripts/backlog.py [--root PATH] explore TOPIC

The generator never overwrites an existing entry: it leaves project-owned content
untouched and reports the path. Exit codes: 0 ok, 1 error, 2 usage.
"""
from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

# scripts/ is on sys.path[0] when run as a script, so this resolves.
from validate_harness import resolve_workspace

ASSETS_DIR = Path(__file__).resolve().parent.parent / "assets"

REVIEW_STATUS = ("approved", "changes_requested")


def err(msg: str) -> int:
    print(f"error: {msg}", file=sys.stderr)
    return 1


def _safe_slug(value: str) -> str | None:
    """A backlog identifier becomes a filename; keep it inside backlog/.

    Reject empty names and any path-traversal characters so `explore ../../x`
    cannot escape the workspace.
    """
    value = value.strip()
    if not value:
        return None
    if "/" in value or "\\" in value or value.startswith(".") or ".." in value:
        return None
    return value


def _template(kind: str) -> Path:
    return ASSETS_DIR / f"backlog-{kind}.template.md"


def _write_entry(workspace: Path, filename: str, content: str) -> int:
    backlog = workspace / "backlog"
    backlog.mkdir(parents=True, exist_ok=True)
    dest = backlog / filename
    if dest.exists():
        print(f"exists (left untouched): {dest}")
        return 0
    dest.write_text(content, encoding="utf-8")
    print(f"created {dest}")
    return 0


def _render(kind: str, replacements: dict[str, str]) -> str:
    template = _template(kind)
    if not template.is_file():
        raise FileNotFoundError(template)
    text = template.read_text(encoding="utf-8")
    for old, new in replacements.items():
        text = text.replace(old, new)
    return text


def cmd_impl(args, workspace: Path) -> int:
    name = _safe_slug(args.feature)
    if name is None:
        return err(f"invalid feature name: {args.feature!r}")
    content = _render("impl", {
        "<feature_name>": name,
        "YYYY-MM-DD": args.date or date.today().isoformat(),
    })
    return _write_entry(workspace, f"impl_{name}.md", content)


def cmd_review(args, workspace: Path) -> int:
    name = _safe_slug(args.feature)
    if name is None:
        return err(f"invalid feature name: {args.feature!r}")
    replacements = {
        "<feature_name>": name,
        "YYYY-MM-DD": args.date or date.today().isoformat(),
    }
    if args.status == "changes_requested":
        # The template is authored in the approved variant; flip the three tokens
        # that encode the verdict so status, tag, and body stay coherent.
        replacements["status: approved"] = "status: changes_requested"
        replacements["handyman/review/approved"] = "handyman/review/changes_requested"
        replacements["APPROVED   <!-- or CHANGES_REQUESTED -->"] = (
            "CHANGES_REQUESTED   <!-- or APPROVED -->"
        )
    content = _render("review", replacements)
    return _write_entry(workspace, f"review_{name}.md", content)


def cmd_explore(args, workspace: Path) -> int:
    topic = _safe_slug(args.topic)
    if topic is None:
        return err(f"invalid topic: {args.topic!r}")
    content = _render("explore", {
        "<topic>": topic,
        "YYYY-MM-DD": args.date or date.today().isoformat(),
    })
    return _write_entry(workspace, f"explore_{topic}.md", content)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=".",
                        help="Project root holding the harness (default: cwd).")
    sub = parser.add_subparsers(dest="command", required=True)

    p_impl = sub.add_parser("impl", help="Create an implementer report.")
    p_impl.add_argument("feature")
    p_impl.add_argument("--date", default=None, help=argparse.SUPPRESS)

    p_review = sub.add_parser("review", help="Create a reviewer verdict.")
    p_review.add_argument("feature")
    p_review.add_argument("--status", choices=REVIEW_STATUS, default="approved",
                          help="Review verdict (default: approved).")
    p_review.add_argument("--date", default=None, help=argparse.SUPPRESS)

    p_explore = sub.add_parser("explore", help="Create an exploration report.")
    p_explore.add_argument("topic")
    p_explore.add_argument("--date", default=None, help=argparse.SUPPRESS)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    root = Path(args.root).resolve()
    if not root.is_dir():
        return err(f"root is not a directory: {root}")
    workspace = resolve_workspace(root)
    try:
        if args.command == "impl":
            return cmd_impl(args, workspace)
        if args.command == "review":
            return cmd_review(args, workspace)
        if args.command == "explore":
            return cmd_explore(args, workspace)
    except FileNotFoundError as exc:
        return err(f"template not found: {exc}")
    except OSError as exc:
        return err(str(exc))
    return 2


if __name__ == "__main__":
    raise SystemExit(main())

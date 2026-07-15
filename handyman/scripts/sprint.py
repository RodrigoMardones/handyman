#!/usr/bin/env python3
"""Handyman sprint lifecycle: open, close, and inspect work periods.

A sprint is a declared partition label on features (`"sprint": "2026-SP1"`);
the sprint document is *derived* at close time from the artifacts the workflow
already writes (feature_list.json, progress/history.md, backlog/ frontmatter),
never hand-maintained in parallel (single source of truth). The feature
contract stays a four-state machine: the label says which period a feature
belongs to, not when anything happened.

Operations:
  open ID    Stamp every unlabeled pending/in_progress feature with the sprint
             label and record `current_sprint` in harness.config.json
             (mirrored to the feature_list config block when present).
             Rejects a second open sprint and malformed ids.
  close      Derive docs/sprints/sprint.<ID>.md inside the workspace, archive
             the sprint's done features to archive/feature_archive.json,
             strip the label from carry-over features, and clear
             current_sprint. --dry-run previews without writing.
  status     Report the open sprint and its features. Read-only.

Usage:
  scripts/sprint.py [--root PATH] open SPRINT_ID
  scripts/sprint.py [--root PATH] close [--dry-run]
  scripts/sprint.py [--root PATH] status

Exit codes: 0 ok, 1 error, 2 usage.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
from validate_harness import resolve_workspace  # noqa: E402
from metrics import backlog_reports, history_closures  # noqa: E402

ASSETS_DIR = SCRIPT_DIR.parent / "assets"
SPRINT_ID = re.compile(r"^\d{4}-SP\d+$")
_HISTORY_HEADING = re.compile(r"^## \d{4}-\d{2}-\d{2} - Feature \d+: (.+)$")


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


def _read_current_sprint(root: Path, workspace: Path) -> str | None:
    """The open sprint id, preferring harness.config.json over the
    feature_list config mirror (same precedence as post_run)."""
    cfg = root / "harness.config.json"
    try:
        if cfg.is_file():
            data = json.loads(cfg.read_text(encoding="utf-8"))
            value = data.get("current_sprint")
            if isinstance(value, str) and value:
                return value
            if value is None and "current_sprint" in data:
                return None
        fl = workspace / "feature_list.json"
        if fl.is_file():
            data = json.loads(fl.read_text(encoding="utf-8"))
            value = (data.get("config") or {}).get("current_sprint")
            if isinstance(value, str) and value:
                return value
    except (ValueError, OSError):
        pass
    return None


def _write_current_sprint(root: Path, workspace: Path, value: str | None) -> bool:
    """Record the open sprint in harness.config.json and mirror it to the
    feature_list config block when one exists. True if at least one location
    was written."""
    written = False
    cfg = root / "harness.config.json"
    if cfg.is_file():
        try:
            data = json.loads(cfg.read_text(encoding="utf-8"))
            data["current_sprint"] = value
            cfg.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n",
                           encoding="utf-8")
            written = True
        except (ValueError, OSError):
            pass
    fl = workspace / "feature_list.json"
    if fl.is_file():
        try:
            data = json.loads(fl.read_text(encoding="utf-8"))
            config = data.get("config")
            if isinstance(config, dict):
                config["current_sprint"] = value
                fl.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n",
                              encoding="utf-8")
                written = True
        except (ValueError, OSError):
            pass
    return written


def _history_blocks(workspace: Path) -> dict[str, str]:
    """Map feature name -> its rich history entry body (text until the next
    heading), derived from the dated headings feature.py done writes."""
    path = workspace / "progress" / "history.md"
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return {}
    blocks: dict[str, str] = {}
    name: str | None = None
    body: list[str] = []
    for line in lines:
        match = _HISTORY_HEADING.match(line)
        if match:
            if name is not None:
                blocks[name] = "\n".join(body)
            name = match.group(1).strip()
            body = []
        elif line.startswith("## "):
            if name is not None:
                blocks[name] = "\n".join(body)
            name = None
            body = []
        elif name is not None:
            body.append(line)
    if name is not None:
        blocks[name] = "\n".join(body)
    return blocks


def _bullet_values(block: str, key: str) -> list[str]:
    """Values of `- **<key>:** ...` bullets in a history block, skipping the
    `...` narrative placeholder."""
    values = []
    for line in block.splitlines():
        stripped = line.strip()
        prefix = f"- **{key}:**"
        if stripped.startswith(prefix):
            value = stripped[len(prefix):].strip()
            if value and value != "...":
                values.append(value)
    return values


def _render_doc(sid: str, labeled: list[dict], workspace: Path) -> str:
    template_path = ASSETS_DIR / "sprint.template.md"
    template = template_path.read_text(encoding="utf-8")
    today = date.today().isoformat()

    done = [f for f in labeled if f.get("status") == "done"]
    carry = [f for f in labeled if f.get("status") != "done"]
    done_names = {f.get("name", "") for f in done}

    closures = [c for c in history_closures(workspace) if c["name"] in done_names]
    dates = sorted({c["date"] for c in closures})
    period = f"{dates[0]} to {dates[-1]}" if dates else "-"

    blocks = _history_blocks(workspace)
    branches: list[str] = []
    tools: list[str] = []
    for name in sorted(done_names):
        block = blocks.get(name, "")
        for value in _bullet_values(block, "Branch"):
            if value not in branches:
                branches.append(value)
        for value in _bullet_values(block, "Tools"):
            tools.append(f"- `{name}`: {value}")

    rows = ["| id | name | status |", "|----|------|--------|"]
    for f in sorted(labeled, key=lambda f: f.get("id", 0)):
        rows.append(f"| {f.get('id', '?')} | {f.get('name', '?')} "
                    f"| {f.get('status', '?')} |")
    features_table = "\n".join(rows) if labeled else "_No features carried the label._"

    per_date: dict[str, int] = {}
    for c in closures:
        per_date[c["date"]] = per_date.get(c["date"], 0) + 1
    reports = backlog_reports(workspace)
    approved = changes = 0
    covered = 0
    for name in done_names:
        front = reports.get(f"review_{name}.md", {})
        if front.get("status") == "approved":
            approved += 1
        elif front.get("status") == "changes_requested":
            changes += 1
        if f"impl_{name}.md" in reports and f"review_{name}.md" in reports:
            covered += 1
    metric_lines = [
        f"- **Features done:** {len(done)} (carry-over: {len(carry)})",
        "- **Throughput:** " + (", ".join(
            f"{d} = {n}" for d, n in sorted(per_date.items())) or "-"),
        f"- **Review verdicts:** approved={approved} changes_requested={changes}",
        f"- **Report coverage:** {covered}/{len(done)} done with impl+review pair",
    ]

    carry_lines = []
    for f in sorted(carry, key=lambda f: f.get("id", 0)):
        line = f"- {f.get('name', '?')} ({f.get('status', '?')})"
        reason = f.get("blocked_reason")
        if reason:
            line += f" - {reason}"
        carry_lines.append(line)

    return (template
            .replace("<sprint_id>", sid)
            .replace("YYYY-MM-DD", today)
            .replace("<period>", period)
            .replace("<branches>", ", ".join(branches) or "-")
            .replace("<features_table>", features_table)
            .replace("<metrics>", "\n".join(metric_lines))
            .replace("<tools>", "\n".join(tools) or "_No tools provenance recorded._")
            .replace("<carryover>", "\n".join(carry_lines) or "_None._"))


def _archive(workspace: Path, sid: str, done: list[dict]) -> Path:
    archive_dir = workspace / "archive"
    archive_dir.mkdir(parents=True, exist_ok=True)
    path = archive_dir / "feature_archive.json"
    archive: dict = {}
    if path.is_file():
        try:
            archive = json.loads(path.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            archive = {}
    sprints = archive.setdefault("sprints", {})
    sprints.setdefault(sid, []).extend(done)
    path.write_text(json.dumps(archive, indent=2, ensure_ascii=False) + "\n",
                    encoding="utf-8")
    return path


def cmd_open(args, workspace: Path, root: Path) -> int:
    sid = args.sprint_id
    if not SPRINT_ID.match(sid):
        return err(f"malformed sprint id '{sid}' (expected e.g. 2026-SP1)")
    current = _read_current_sprint(root, workspace)
    if current:
        return err(f"sprint already open: {current} (close it first)")
    try:
        data, path = _load(workspace)
    except FileNotFoundError as exc:
        return err(f"feature_list not found: {exc}")
    has_cfg = (root / "harness.config.json").is_file()
    has_mirror = isinstance(data.get("config"), dict)
    if not has_cfg and not has_mirror:
        return err("nowhere to record current_sprint: neither "
                   "harness.config.json nor a feature_list config block exists")
    stamped = 0
    for feature in data.get("features", []):
        if feature.get("status") in ("pending", "in_progress") \
                and "sprint" not in feature:
            feature["sprint"] = sid
            stamped += 1
    _save(path, data)
    _write_current_sprint(root, workspace, sid)
    print(f"opened sprint {sid}: stamped {stamped} feature(s)")
    return 0


def cmd_close(args, workspace: Path, root: Path) -> int:
    sid = _read_current_sprint(root, workspace)
    if not sid:
        return err("no sprint open (run 'open <id>' first)")
    try:
        data, path = _load(workspace)
    except FileNotFoundError as exc:
        return err(f"feature_list not found: {exc}")
    features = data.get("features", [])
    labeled = [f for f in features if f.get("sprint") == sid]
    active = [f.get("name", "?") for f in labeled
              if f.get("status") == "in_progress"]
    if active:
        return err(f"sprint {sid} has in_progress feature(s): "
                   f"{', '.join(active)}; close or block them first")
    done = [f for f in labeled if f.get("status") == "done"]
    carry = [f for f in labeled if f.get("status") != "done"]
    doc_path = workspace / "docs" / "sprints" / f"sprint.{sid}.md"
    if doc_path.exists():
        return err(f"sprint document already exists: {doc_path}")

    content = _render_doc(sid, labeled, workspace)
    if args.dry_run:
        print(f"DRY RUN: would write {doc_path}")
        print(f"DRY RUN: would archive {len(done)} done feature(s) to "
              f"{workspace / 'archive' / 'feature_archive.json'}")
        print(f"DRY RUN: would strip the label from {len(carry)} "
              f"carry-over feature(s)")
        print(f"DRY RUN: would clear current_sprint ({sid})")
        return 0

    doc_path.parent.mkdir(parents=True, exist_ok=True)
    doc_path.write_text(content, encoding="utf-8")
    archive_path = _archive(workspace, sid, done)
    data["features"] = [
        f for f in features
        if not (f.get("sprint") == sid and f.get("status") == "done")
    ]
    for feature in data["features"]:
        if feature.get("sprint") == sid:
            feature.pop("sprint", None)
    _save(path, data)
    _write_current_sprint(root, workspace, None)
    print(f"closed sprint {sid} -> {doc_path}")
    print(f"archived {len(done)} done feature(s) -> {archive_path}; "
          f"{len(carry)} carried over")
    return 0


def cmd_status(args, workspace: Path, root: Path) -> int:
    sid = _read_current_sprint(root, workspace)
    if not sid:
        print("no sprint open")
        return 0
    try:
        data, _ = _load(workspace)
    except FileNotFoundError:
        print(f"sprint {sid} open; feature_list not found")
        return 0
    labeled = [f for f in data.get("features", []) if f.get("sprint") == sid]
    print(f"sprint {sid} open: {len(labeled)} feature(s)")
    for feature in sorted(labeled, key=lambda f: f.get("id", 0)):
        print(f"  {feature.get('id', '?')} {feature.get('name', '?')} "
              f"[{feature.get('status', '?')}]")
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=".",
                        help="Project root (default: current directory).")
    sub = parser.add_subparsers(dest="command", required=True)

    p_open = sub.add_parser("open", help="Open a sprint and stamp its features.")
    p_open.add_argument("sprint_id")

    p_close = sub.add_parser("close", help="Close the open sprint.")
    p_close.add_argument("--dry-run", action="store_true")

    sub.add_parser("status", help="Report the open sprint. Read-only.")

    args = parser.parse_args(argv)
    root = Path(args.root).resolve()
    workspace = resolve_workspace(root)

    if args.command == "open":
        return cmd_open(args, workspace, root)
    if args.command == "close":
        return cmd_close(args, workspace, root)
    return cmd_status(args, workspace, root)


if __name__ == "__main__":
    raise SystemExit(main())

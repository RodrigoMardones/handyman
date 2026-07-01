#!/usr/bin/env python3
"""Handyman metrics: read-only aggregation of the artifacts the workflow writes.

Derives workflow measures from three existing layers (never from new state):

  - feature_list.json         -> status counts (pending/in_progress/done/blocked)
  - progress/history.md       -> throughput: closures per date (dated headings)
  - backlog/*.md frontmatter  -> review verdicts (approval rate) + report coverage

The feature contract stays a state machine (no dates, see references/workflow.md
"Stages at a Glance"): every measure here is *derived* from the dated artifacts
each stage already leaves on disk. This script observes; it never gates.

Usage:
    python scripts/metrics.py [--root PATH] [--json]

Exit codes:
    0  always (read-only observation; missing layers degrade to empty metrics)
    2  usage error
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
from validate_harness import resolve_workspace  # noqa: E402
from tools_discovery import _parse_frontmatter  # noqa: E402

# Written by `feature.py done`: "## 2026-06-18 - Feature 5: harness_versioning".
# The template line "## YYYY-MM-DD - Feature N: feature_name" does not match.
_HISTORY_HEADING = re.compile(r"^## (\d{4}-\d{2}-\d{2}) - Feature (\d+): (.+)$")

STATUSES = ("pending", "in_progress", "done", "blocked")


def load_features(workspace: Path) -> list[dict]:
    """Features from feature_list.json; [] when missing or unparseable."""
    path = workspace / "feature_list.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    features = data.get("features", []) if isinstance(data, dict) else []
    return [f for f in features if isinstance(f, dict)]


def status_counts(features: list[dict]) -> dict[str, int]:
    counts = {status: 0 for status in STATUSES}
    for feature in features:
        status = feature.get("status")
        if status in counts:
            counts[status] += 1
    return counts


def history_closures(workspace: Path) -> list[dict]:
    """Closure entries derived from the dated headings in progress/history.md."""
    path = workspace / "progress" / "history.md"
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return []
    closures = []
    for line in lines:
        match = _HISTORY_HEADING.match(line)
        if match:
            closures.append(
                {"date": match.group(1), "id": int(match.group(2)), "name": match.group(3).strip()}
            )
    return closures


def throughput(closures: list[dict]) -> dict[str, int]:
    per_date: dict[str, int] = {}
    for entry in closures:
        per_date[entry["date"]] = per_date.get(entry["date"], 0) + 1
    return dict(sorted(per_date.items()))


def backlog_reports(workspace: Path) -> dict[str, dict[str, str]]:
    """Map backlog report filename -> parsed frontmatter (reuses the shared parser)."""
    backlog = workspace / "backlog"
    reports: dict[str, dict[str, str]] = {}
    if not backlog.is_dir():
        return reports
    for path in sorted(backlog.glob("*.md")):
        reports[path.name] = _parse_frontmatter(path)
    return reports


def review_verdicts(reports: dict[str, dict[str, str]]) -> dict[str, object]:
    approved = changes = 0
    for name, front in reports.items():
        if not name.startswith("review_"):
            continue
        status = front.get("status", "")
        if status == "approved":
            approved += 1
        elif status == "changes_requested":
            changes += 1
    total = approved + changes
    rate = round(approved / total, 4) if total else None
    return {"approved": approved, "changes_requested": changes, "approval_rate": rate}


def report_coverage(features: list[dict], reports: dict[str, dict[str, str]]) -> dict[str, object]:
    """Done features that carry their impl_ + review_ evidence pair in backlog/."""
    done = [f.get("name", "") for f in features if f.get("status") == "done"]
    missing = [
        name
        for name in done
        if f"impl_{name}.md" not in reports or f"review_{name}.md" not in reports
    ]
    return {"done": len(done), "with_reports": len(done) - len(missing), "missing": missing}


def collect(root: Path) -> dict[str, object]:
    workspace = resolve_workspace(root)
    features = load_features(workspace)
    closures = history_closures(workspace)
    reports = backlog_reports(workspace)
    return {
        "root": str(root),
        "workspace": str(workspace),
        "status_counts": status_counts(features),
        "throughput": throughput(closures),
        "review_verdicts": review_verdicts(reports),
        "coverage": report_coverage(features, reports),
    }


def render_text(metrics: dict[str, object]) -> None:
    print(f"==> metrics: {metrics['root']}")
    print(f"    workspace: {metrics['workspace']}")
    counts = metrics["status_counts"]
    total = sum(counts.values())
    joined = " ".join(f"{status}={counts[status]}" for status in STATUSES)
    print(f"--> status: {joined} (total {total})")
    print("--> throughput (closures per date):")
    per_date = metrics["throughput"]
    if per_date:
        for date, count in per_date.items():
            print(f"    {date}  {count}")
    else:
        print("    (no dated closures in history.md)")
    verdicts = metrics["review_verdicts"]
    rate = verdicts["approval_rate"]
    rate_txt = f"{rate * 100:.0f}%" if rate is not None else "n/a"
    print(
        "--> review verdicts: "
        f"approved={verdicts['approved']} "
        f"changes_requested={verdicts['changes_requested']} "
        f"(approval rate {rate_txt})"
    )
    coverage = metrics["coverage"]
    print(
        "--> coverage: "
        f"{coverage['done']} done, {coverage['with_reports']} with impl+review reports"
    )
    for name in coverage["missing"]:
        print(f"    missing reports: {name}")
    print("==> metrics: read-only report complete (exit 0)")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Read-only workflow metrics derived from feature_list.json, "
            "progress/history.md and backlog/ frontmatter. Always exits 0."
        )
    )
    parser.add_argument("--root", default=".", help="Project root of the harness.")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON.")
    args = parser.parse_args(argv)
    root = Path(args.root).resolve()
    if not root.is_dir():
        print(f"root is not a directory: {root}", file=sys.stderr)
        return 2
    metrics = collect(root)
    if args.json:
        print(json.dumps(metrics, indent=2))
    else:
        render_text(metrics)
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Handyman fleet: read-only observation of every registered harness.

Multi-harness counterpart of scripts/metrics.py. A machine-global registry
($HANDYMAN_ROOT/registry.json, default $HOME/HANDYMAN) records ONLY each
harness project_root plus the registration date; everything else is read
live from each harness on every query, so there is no mirrored state to
drift (disk is the source of truth). See docs/analisis-monitoreo-flota.md.

Subcommands:
    register PATH    add a harness project root (validates it resolves)
    unregister PATH  remove a registered root
    list             print registered roots (--json)
    discover         scan a directory tree for harnesses (--scan DIR [--register])
    status           per-harness live report: metrics + session + version drift
    health           derived signals: INVARIANT, STALE_WIP, BEHIND, IDLE, UNREADABLE
    moc              regenerate the global fleet MOC at $HANDYMAN_ROOT/index.md

Usage:
    python scripts/fleet.py [--handyman-root PATH] <subcommand> [options]

Exit codes:
    0  ok; status and health observe, they never gate (health --strict exits
       1 when at least one signal is present)
    1  error (register/unregister/discover failure, corrupted registry write)
    2  usage error
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import date
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
from validate_harness import resolve_workspace  # noqa: E402
from tools_discovery import _parse_frontmatter  # noqa: E402
from metrics import collect, history_closures  # noqa: E402
from upgrade_harness import (  # noqa: E402
    current_skill_version,
    parse_version,
    read_installed_version,
)
from index_md import _preserved_notes, NOTES_HEADING  # noqa: E402

STATUSES = ("pending", "in_progress", "done", "blocked")

# Directories never descended into while discovering harnesses.
DISCOVER_PRUNE = {"node_modules", "graphify-out", "__pycache__", ".git"}


def err(msg: str) -> int:
    print(f"ERROR: {msg}", file=sys.stderr)
    return 1


# --- registry ----------------------------------------------------------------

def handyman_root(cli_override: str | None) -> Path:
    """Fleet root: --handyman-root flag, else $HANDYMAN_ROOT, else ~/HANDYMAN."""
    if cli_override:
        return Path(cli_override).expanduser().resolve()
    env = os.environ.get("HANDYMAN_ROOT")
    if env:
        return Path(env).expanduser().resolve()
    return Path.home() / "HANDYMAN"


def registry_path(hroot: Path) -> Path:
    return hroot / "registry.json"


def load_registry(hroot: Path) -> tuple[dict, str | None]:
    """Return (registry, error). Missing file -> empty registry, no error.

    A corrupted registry is returned empty WITH an error so read-only
    commands can degrade while writing commands refuse to clobber it.
    """
    empty = {"version": 1, "harnesses": []}
    path = registry_path(hroot)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except OSError:
        return empty, None
    except ValueError:
        return empty, f"registry does not parse: {path}"
    if not isinstance(data, dict) or not isinstance(data.get("harnesses"), list):
        return empty, f"registry has no 'harnesses' array: {path}"
    return data, None


def save_registry(hroot: Path, data: dict) -> None:
    hroot.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    registry_path(hroot).write_text(text, encoding="utf-8")


def is_harness_root(root: Path) -> bool:
    """A registrable root resolves a workspace holding feature_list.json."""
    return (resolve_workspace(root) / "feature_list.json").is_file()


def cmd_register(hroot: Path, target: str, stamp: str) -> int:
    root = Path(target).expanduser().resolve()
    if not root.is_dir():
        return err(f"root is not a directory: {root}")
    if not is_harness_root(root):
        return err(
            f"not a harness: no feature_list.json under the resolved workspace of {root}"
        )
    registry, load_error = load_registry(hroot)
    if load_error:
        return err(f"{load_error} (fix or remove it before registering)")
    roots = [entry.get("project_root") for entry in registry["harnesses"]]
    if str(root) in roots:
        print(f"already registered: {root}")
        return 0
    registry["harnesses"].append({"project_root": str(root), "registered": stamp})
    registry["harnesses"].sort(key=lambda entry: entry.get("project_root", ""))
    save_registry(hroot, registry)
    print(f"registered {root} -> {registry_path(hroot)}")
    return 0


def cmd_unregister(hroot: Path, target: str) -> int:
    root = Path(target).expanduser().resolve()
    registry, load_error = load_registry(hroot)
    if load_error:
        return err(f"{load_error} (fix or remove it before unregistering)")
    kept = [e for e in registry["harnesses"] if e.get("project_root") != str(root)]
    if len(kept) == len(registry["harnesses"]):
        return err(f"not registered: {root}")
    registry["harnesses"] = kept
    save_registry(hroot, registry)
    print(f"unregistered {root}")
    return 0


def _project_name(root: Path) -> str:
    """project_name from harness.config.json, else feature_list, else basename."""
    config = root / "harness.config.json"
    if config.is_file():
        try:
            data = json.loads(config.read_text(encoding="utf-8"))
            if data.get("project_name"):
                return str(data["project_name"])
        except (ValueError, OSError):
            pass
    feature_list = resolve_workspace(root) / "feature_list.json"
    if feature_list.is_file():
        try:
            data = json.loads(feature_list.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            data = {}
        if isinstance(data, dict):
            name = (data.get("config") or {}).get("project_name") or data.get("project")
            if name:
                return str(name)
    return root.name


def cmd_list(hroot: Path, as_json: bool) -> int:
    registry, load_error = load_registry(hroot)
    if load_error:
        print(f"NOTE: {load_error}")
    entries = [
        {
            "project_root": e.get("project_root", ""),
            "registered": e.get("registered", ""),
            "project_name": _project_name(Path(e.get("project_root", ""))),
        }
        for e in registry["harnesses"]
    ]
    if as_json:
        print(json.dumps({"registry": str(registry_path(hroot)),
                          "version": registry.get("version", 1),
                          "harnesses": entries}, indent=2, ensure_ascii=False))
        return 0
    print(f"==> fleet registry: {registry_path(hroot)}")
    if not entries:
        print("    (no harnesses registered)")
    for entry in entries:
        print(f"    {entry['project_name']}  {entry['project_root']}"
              f"  (registered {entry['registered']})")
    return 0


def cmd_discover(hroot: Path, scan: str, do_register: bool,
                 max_depth: int, stamp: str) -> int:
    base = Path(scan).expanduser().resolve()
    if not base.is_dir():
        return err(f"scan path is not a directory: {base}")
    found: list[Path] = []
    base_depth = len(base.parts)
    for dirpath, dirnames, _filenames in os.walk(base):
        current = Path(dirpath)
        # Prune noisy trees and hidden dirs; markers are checked from the parent.
        dirnames[:] = [
            d for d in dirnames
            if d not in DISCOVER_PRUNE and not d.startswith(".")
            and len(current.parts) - base_depth < max_depth
        ]
        if (current / "harness.config.json").is_file() or \
                (current / ".handyman" / "feature_list.json").is_file():
            if is_harness_root(current):
                found.append(current)
    print(f"==> discover: {len(found)} harness(es) under {base}")
    code = 0
    for root in found:
        print(f"    {_project_name(root)}  {root}")
        if do_register:
            code = max(code, cmd_register(hroot, str(root), stamp))
    return code


# --- live snapshots ----------------------------------------------------------

def _session(workspace: Path) -> dict | None:
    """Live session from progress/current.md frontmatter; None when absent."""
    current = workspace / "progress" / "current.md"
    if not current.is_file():
        return None
    front = _parse_frontmatter(current)
    return {
        "feature": front.get("feature"),
        "status": front.get("status"),
        "role": front.get("role"),
        "updated": front.get("updated"),
    }


def _session_is_idle(session: dict | None) -> bool:
    if not session:
        return True
    return session.get("feature") in (None, "", "none") or \
        session.get("status") == "idle"


def harness_snapshot(root_str: str, skill_version: str) -> dict:
    """Everything status/health/moc need for one harness, degraded field by field."""
    root = Path(root_str)
    snapshot: dict[str, object] = {
        "project_root": root_str,
        "project_name": _project_name(root) if root.is_dir() else Path(root_str).name,
        "error": None,
    }
    if not root.is_dir():
        snapshot["error"] = "root is not a directory"
        snapshot["status_counts"] = {status: 0 for status in STATUSES}
        return snapshot

    workspace = resolve_workspace(root)
    feature_list = workspace / "feature_list.json"
    if not feature_list.is_file():
        snapshot["error"] = f"no feature_list.json under {workspace}"
    else:
        try:
            json.loads(feature_list.read_text(encoding="utf-8"))
        except (ValueError, OSError) as exc:
            snapshot["error"] = f"feature_list.json does not parse: {exc}"

    snapshot.update(collect(root))  # status_counts/throughput/review_verdicts/coverage
    snapshot["session"] = _session(workspace)

    installed = read_installed_version(root, workspace)
    behind = None
    if skill_version:
        installed_tuple = parse_version(installed)
        current_tuple = parse_version(skill_version)
        if current_tuple is not None:
            behind = installed_tuple is None or installed_tuple < current_tuple
    snapshot["version"] = {
        "installed": installed,
        "current": skill_version or None,
        "behind": behind,
    }

    closures = history_closures(workspace)
    snapshot["last_closure"] = max((c["date"] for c in closures), default=None)
    return snapshot


def _snapshots(hroot: Path) -> tuple[list[dict], dict, str | None]:
    registry, load_error = load_registry(hroot)
    skill_version = current_skill_version()
    snaps = [
        harness_snapshot(entry.get("project_root", ""), skill_version)
        for entry in registry["harnesses"]
    ]
    return snaps, registry, load_error


def _counts_line(counts: dict) -> str:
    total = sum(counts.get(status, 0) for status in STATUSES)
    joined = " ".join(f"{status}={counts.get(status, 0)}" for status in STATUSES)
    return f"{joined} (total {total})"


def _version_line(version: dict) -> str:
    installed = version.get("installed") or "unsealed"
    current = version.get("current")
    if version.get("behind") is True:
        return f"{installed} (behind {current})"
    if version.get("behind") is False:
        return f"{installed} (up to date)"
    return f"{installed} (skill version unknown)"


def _session_line(session: dict | None) -> str:
    if _session_is_idle(session):
        return "idle"
    return (f"{session.get('feature')} "
            f"(role {session.get('role') or '?'}, "
            f"updated {session.get('updated') or '?'})")


def run_verifier(root: Path, timeout_s: int) -> dict:
    """Opt-in live verification: execute the harness's own init.sh.

    Only the exit code is observed (output discarded); a missing or
    non-executable verifier is 'skipped'. Never raises.
    """
    init = root / "init.sh"
    if not init.is_file() or not os.access(init, os.X_OK):
        return {"result": "skipped", "exit_code": None}
    try:
        proc = subprocess.run(
            [str(init)], cwd=str(root),
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            timeout=timeout_s,
        )
    except subprocess.TimeoutExpired:
        return {"result": "timeout", "exit_code": None}
    except OSError:
        return {"result": "skipped", "exit_code": None}
    result = "green" if proc.returncode == 0 else "red"
    return {"result": result, "exit_code": proc.returncode}


def _verifier_line(verifier: dict) -> str:
    result = verifier.get("result")
    if result == "green":
        return "green (exit 0)"
    if result == "red":
        return f"red (exit {verifier.get('exit_code')})"
    if result == "timeout":
        return "timeout"
    return "skipped (no executable init.sh)"


def cmd_status(hroot: Path, as_json: bool, verify: bool = False,
               verifier_timeout: int = 300) -> int:
    snaps, _registry, load_error = _snapshots(hroot)
    if verify:
        for snap in snaps:
            if not snap.get("error"):
                snap["verifier"] = run_verifier(
                    Path(str(snap["project_root"])), verifier_timeout)
    fleet_counts = {status: 0 for status in STATUSES}
    unreadable = 0
    for snap in snaps:
        if snap.get("error"):
            unreadable += 1
            continue
        for status in STATUSES:
            fleet_counts[status] += snap["status_counts"].get(status, 0)
    fleet = {"harnesses": len(snaps), "unreadable": unreadable,
             "status_counts": fleet_counts}
    if as_json:
        print(json.dumps({
            "registry": str(registry_path(hroot)),
            "registry_error": load_error,
            "skill_version": current_skill_version() or None,
            "harnesses": snaps,
            "fleet": fleet,
        }, indent=2, ensure_ascii=False))
        return 0
    if load_error:
        print(f"NOTE: {load_error}")
    print(f"==> fleet status: {len(snaps)} harness(es) registered "
          f"(registry: {registry_path(hroot)})")
    if not snaps:
        print("    (no harnesses registered; use fleet.py register/discover)")
    for snap in snaps:
        print(f"--> {snap['project_name']}  {snap['project_root']}")
        if snap.get("error"):
            print(f"    ERROR: {snap['error']}")
            continue
        print(f"    version: {_version_line(snap['version'])}")
        print(f"    status: {_counts_line(snap['status_counts'])}")
        print(f"    session: {_session_line(snap['session'])}")
        print(f"    last closure: {snap['last_closure'] or 'none'}")
        if "verifier" in snap:
            print(f"    verifier: {_verifier_line(snap['verifier'])}")
    print(f"--> fleet: harnesses={fleet['harnesses']} "
          f"unreadable={fleet['unreadable']} {_counts_line(fleet_counts)}")
    print("==> fleet status: read-only report complete (exit 0)")
    return 0


# --- health ------------------------------------------------------------------

def _parse_date(value: object) -> date | None:
    try:
        return date.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None


def harness_signals(snap: dict, today: date, stale_days: int,
                    idle_days: int) -> list[dict]:
    """Derived health signals for one snapshot. Empty list = healthy."""
    if snap.get("error"):
        return [{"signal": "UNREADABLE", "detail": str(snap["error"])}]
    signals: list[dict] = []
    counts = snap["status_counts"]

    if counts.get("in_progress", 0) > 1:
        signals.append({
            "signal": "INVARIANT",
            "detail": f"{counts['in_progress']} features in_progress (max 1)",
        })

    if counts.get("in_progress", 0) >= 1:
        session = snap.get("session")
        updated = _parse_date((session or {}).get("updated"))
        if updated is None:
            signals.append({
                "signal": "STALE_WIP",
                "detail": "in_progress with no parseable updated stamp in current.md",
            })
        elif (today - updated).days > stale_days:
            signals.append({
                "signal": "STALE_WIP",
                "detail": (f"in_progress updated {updated.isoformat()} "
                           f"(> {stale_days} days ago)"),
            })

    version = snap.get("version", {})
    if version.get("behind") is True:
        installed = version.get("installed") or "unsealed"
        signals.append({
            "signal": "BEHIND",
            "detail": f"installed {installed} < skill {version.get('current')}",
        })

    if counts.get("pending", 0) > 0:
        last = _parse_date(snap.get("last_closure"))
        if last is None:
            signals.append({
                "signal": "IDLE",
                "detail": (f"{counts['pending']} pending and no dated closures "
                           "in history.md"),
            })
        elif (today - last).days > idle_days:
            signals.append({
                "signal": "IDLE",
                "detail": (f"{counts['pending']} pending, last closure "
                           f"{last.isoformat()} (> {idle_days} days ago)"),
            })
    return signals


def cmd_health(hroot: Path, as_json: bool, strict: bool, stale_days: int,
               idle_days: int, today_str: str | None) -> int:
    today = _parse_date(today_str) if today_str else date.today()
    if today is None:
        print(f"--today does not parse as YYYY-MM-DD: {today_str}", file=sys.stderr)
        return 2
    snaps, _registry, load_error = _snapshots(hroot)
    report = []
    total = 0
    for snap in snaps:
        signals = harness_signals(snap, today, stale_days, idle_days)
        total += len(signals)
        report.append({
            "project_root": snap["project_root"],
            "project_name": snap["project_name"],
            "signals": signals,
        })
    exit_code = 1 if (strict and total) else 0
    if as_json:
        print(json.dumps({
            "registry": str(registry_path(hroot)),
            "registry_error": load_error,
            "today": today.isoformat(),
            "stale_days": stale_days,
            "idle_days": idle_days,
            "harnesses": report,
            "total_signals": total,
        }, indent=2, ensure_ascii=False))
        return exit_code
    if load_error:
        print(f"NOTE: {load_error}")
    flagged = sum(1 for entry in report if entry["signals"])
    print(f"==> fleet health: {len(report)} harness(es), {flagged} with signals "
          f"(today: {today.isoformat()})")
    for entry in report:
        print(f"--> {entry['project_name']}  {entry['project_root']}")
        if not entry["signals"]:
            print("    OK (no signals)")
        for item in entry["signals"]:
            print(f"    {item['signal']}: {item['detail']}")
    print(f"==> fleet health: {total} signal(s) across fleet (exit {exit_code})")
    return exit_code


# --- heartbeat + timeline ------------------------------------------------------

def events_path(hroot: Path) -> Path:
    return hroot / "events.jsonl"


def load_events(hroot: Path) -> list[dict]:
    """Pushed closure events, one JSON object per line; bad lines are skipped."""
    path = events_path(hroot)
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return []
    events = []
    for line in lines:
        if not line.strip():
            continue
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if isinstance(event, dict) and event.get("project_root") \
                and event.get("feature") and event.get("date"):
            events.append(event)
    return events


def cmd_heartbeat(hroot: Path, root_str: str, feature: str | None,
                  date_str: str | None) -> int:
    """Append one closure event to $HANDYMAN_ROOT/events.jsonl.

    Without --feature, the newest dated heading of progress/history.md is
    reported — exactly the entry `feature.py done` just appended, which makes
    this command a drop-in `post_run` hook.
    """
    root = Path(root_str).expanduser().resolve()
    if not root.is_dir():
        return err(f"root is not a directory: {root}")
    workspace = resolve_workspace(root)
    stamp = date_str
    if feature is None:
        closures = history_closures(workspace)
        if not closures:
            return err(f"no dated closures in {workspace}/progress/history.md "
                       "and no --feature given")
        latest = closures[-1]  # history.md is append-only
        feature = latest["name"]
        stamp = stamp or latest["date"]
    event = {
        "project_root": str(root),
        "project_name": _project_name(root),
        "feature": feature,
        "date": stamp or date.today().isoformat(),
    }
    try:
        hroot.mkdir(parents=True, exist_ok=True)
        with events_path(hroot).open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(event, ensure_ascii=False) + "\n")
    except OSError as exc:
        return err(str(exc))
    print(f"heartbeat recorded: {event['project_name']} "
          f"{event['feature']} ({event['date']}) -> {events_path(hroot)}")
    return 0


def fleet_timeline(hroot: Path, snaps: list[dict]) -> list[dict]:
    """Dated closures from every readable harness plus pushed events,
    newest first. History wins on (project_root, feature, date) collisions."""
    entries: list[dict] = []
    seen: set[tuple] = set()
    for snap in snaps:
        if snap.get("error"):
            continue
        workspace = Path(str(snap.get("workspace", "")))
        for closure in history_closures(workspace):
            key = (snap["project_root"], closure["name"], closure["date"])
            seen.add(key)
            entries.append({
                "date": closure["date"],
                "project_name": snap["project_name"],
                "project_root": snap["project_root"],
                "feature": closure["name"],
                "feature_id": closure["id"],
                "source": "history",
            })
    for event in load_events(hroot):
        key = (event["project_root"], event["feature"], event["date"])
        if key in seen:
            continue
        seen.add(key)
        entries.append({
            "date": event["date"],
            "project_name": event.get("project_name")
            or Path(event["project_root"]).name,
            "project_root": event["project_root"],
            "feature": event["feature"],
            "feature_id": None,
            "source": "event",
        })
    entries.sort(
        key=lambda e: (e["date"], e["project_name"], e["feature_id"] or 0),
        reverse=True,
    )
    return entries


def cmd_timeline(hroot: Path, as_json: bool, limit: int) -> int:
    snaps, _registry, load_error = _snapshots(hroot)
    entries = fleet_timeline(hroot, snaps)
    total = len(entries)
    if limit > 0:
        entries = entries[:limit]
    if as_json:
        print(json.dumps({
            "registry": str(registry_path(hroot)),
            "registry_error": load_error,
            "total": total,
            "entries": entries,
        }, indent=2, ensure_ascii=False))
        return 0
    if load_error:
        print(f"NOTE: {load_error}")
    readable = sum(1 for snap in snaps if not snap.get("error"))
    print(f"==> fleet timeline: {total} closure(s) across "
          f"{readable} readable harness(es)")
    if not entries:
        print("    (no dated closures found)")
    for entry in entries:
        origin = (f"feature {entry['feature_id']}"
                  if entry["feature_id"] is not None else "heartbeat")
        print(f"    {entry['date']}  {entry['project_name']:<16} "
              f"{entry['feature']} ({origin})")
    print("==> fleet timeline: read-only report complete (exit 0)")
    return 0


# --- moc ---------------------------------------------------------------------

def _moc_links(snap: dict) -> str:
    """Absolute markdown links, only to files that exist on disk."""
    root = Path(str(snap["project_root"]))
    workspace = Path(str(snap.get("workspace", root)))
    candidates = (
        ("feature_list.json", workspace / "feature_list.json"),
        ("current.md", workspace / "progress" / "current.md"),
        ("history.md", workspace / "progress" / "history.md"),
        ("workspace MOC", workspace / "index.md"),
    )
    links = [f"[{label}]({path})" for label, path in candidates if path.is_file()]
    return " · ".join(links)


def build_fleet_moc(hroot: Path, snaps: list[dict]) -> str:
    out: list[str] = [
        "---",
        "tags: [handyman/fleet]",
        "---",
        "",
        "# Handyman Fleet",
        "",
        "_Generated by `scripts/fleet.py moc` from the registry and each "
        "harness's live state. Re-run to refresh; the `## Notes` section is "
        "preserved._",
        "",
        "## Registry",
        "",
        f"- `{registry_path(hroot)}` — {len(snaps)} harness(es)",
        "",
        "## Harnesses",
        "",
    ]
    if not snaps:
        out.append("- _no harnesses registered; use `fleet.py register` or "
                   "`fleet.py discover --scan <dir> --register`_")
    for snap in snaps:
        if snap.get("error"):
            out += [f"### {snap['project_name']}", "",
                    f"- root: `{snap['project_root']}`",
                    f"- ERROR: {snap['error']}", ""]
            continue
        out += [
            f"### {snap['project_name']} — {_version_line(snap['version'])}",
            "",
            f"- root: `{snap['project_root']}`",
            f"- status: {_counts_line(snap['status_counts'])}",
            f"- session: {_session_line(snap['session'])}",
            f"- last closure: {snap['last_closure'] or 'none'}",
        ]
        links = _moc_links(snap)
        if links:
            out.append(f"- open: {links}")
        out.append("")
    notes = _preserved_notes(hroot / "index.md")
    if notes:
        out += notes
    else:
        out += [NOTES_HEADING, "",
                "_Operator notes; preserved across regenerations._"]
    return "\n".join(out).rstrip("\n") + "\n"


_HTML_STYLE = """
  :root { color-scheme: light dark; }
  body { font-family: system-ui, sans-serif; margin: 2rem auto; max-width: 72rem;
         padding: 0 1rem; background: #ffffff; color: #1a1a1a; }
  h1 { font-size: 1.4rem; }
  .meta { color: #555; font-size: 0.85rem; }
  table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
  th, td { text-align: left; padding: 0.45rem 0.7rem;
           border-bottom: 1px solid #d0d0d0; font-size: 0.9rem; }
  th { font-weight: 600; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .drift { font-weight: 600; }
  .error { font-style: italic; }
  code { font-size: 0.85em; }
  @media (prefers-color-scheme: dark) {
    body { background: #16181d; color: #e6e6e6; }
    .meta { color: #9aa0a6; }
    th, td { border-bottom-color: #3a3f47; }
  }
"""


def build_fleet_html(hroot: Path, snaps: list[dict]) -> str:
    """Self-contained static page: one table row per harness, no external
    assets, textual BEHIND/OK labels (never color-only semantics)."""
    from html import escape

    rows: list[str] = []
    for snap in snaps:
        name = escape(str(snap["project_name"]))
        root = escape(str(snap["project_root"]))
        if snap.get("error"):
            rows.append(
                f'<tr><td>{name}</td>'
                f'<td colspan="8" class="error">ERROR: '
                f'{escape(str(snap["error"]))} — <code>{root}</code></td></tr>')
            continue
        version = snap.get("version", {})
        drift = ("BEHIND" if version.get("behind") is True
                 else "OK" if version.get("behind") is False else "?")
        counts = snap["status_counts"]
        rows.append(
            "<tr>"
            f'<td title="{root}">{name}</td>'
            f'<td>{escape(str(version.get("installed") or "unsealed"))}</td>'
            f'<td class="drift">{drift}</td>'
            f'<td class="num">{counts.get("pending", 0)}</td>'
            f'<td class="num">{counts.get("in_progress", 0)}</td>'
            f'<td class="num">{counts.get("done", 0)}</td>'
            f'<td class="num">{counts.get("blocked", 0)}</td>'
            f'<td>{escape(_session_line(snap.get("session")))}</td>'
            f'<td>{escape(str(snap.get("last_closure") or "none"))}</td>'
            "</tr>")
    if not rows:
        rows.append('<tr><td colspan="9" class="error">'
                    "no harnesses registered</td></tr>")
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Handyman Fleet</title>
<style>{_HTML_STYLE}</style>
</head>
<body>
<h1>Handyman Fleet</h1>
<p class="meta">Generated by <code>scripts/fleet.py moc --html</code> on
{date.today().isoformat()} · registry: <code>{escape(str(registry_path(hroot)))}</code></p>
<table>
<thead><tr><th>Project</th><th>Version</th><th>Drift</th><th>Pending</th>
<th>In progress</th><th>Done</th><th>Blocked</th><th>Session</th>
<th>Last closure</th></tr></thead>
<tbody>
{chr(10).join(rows)}
</tbody>
</table>
</body>
</html>
"""


def cmd_moc(hroot: Path, html: bool = False) -> int:
    snaps, _registry, load_error = _snapshots(hroot)
    if load_error:
        print(f"NOTE: {load_error}")
    index_path = hroot / "index.md"
    try:
        hroot.mkdir(parents=True, exist_ok=True)
        index_path.write_text(build_fleet_moc(hroot, snaps), encoding="utf-8")
    except (ValueError, OSError) as exc:
        return err(str(exc))
    print(f"regenerated {index_path}")
    if html:
        html_path = hroot / "index.html"
        try:
            html_path.write_text(build_fleet_html(hroot, snaps), encoding="utf-8")
        except (ValueError, OSError) as exc:
            return err(str(exc))
        print(f"regenerated {html_path}")
    return 0


# --- cli ---------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=("Read-only fleet observation over every registered "
                     "Handyman harness. Registry: $HANDYMAN_ROOT/registry.json "
                     "(default $HOME/HANDYMAN)."))
    parser.add_argument("--handyman-root", default=None,
                        help="Override the fleet root (else $HANDYMAN_ROOT, "
                             "else $HOME/HANDYMAN).")
    sub = parser.add_subparsers(dest="command", required=True)

    p_register = sub.add_parser("register", help="Register a harness project root.")
    p_register.add_argument("root")
    p_register.add_argument("--date", default=None,
                            help="Registration stamp YYYY-MM-DD (default today).")

    p_unregister = sub.add_parser("unregister", help="Remove a registered root.")
    p_unregister.add_argument("root")

    p_list = sub.add_parser("list", help="List registered harnesses.")
    p_list.add_argument("--json", action="store_true")

    p_discover = sub.add_parser("discover", help="Scan a tree for harnesses.")
    p_discover.add_argument("--scan", required=True, help="Directory to scan.")
    p_discover.add_argument("--register", action="store_true",
                            help="Register every harness found.")
    p_discover.add_argument("--max-depth", type=int, default=4)
    p_discover.add_argument("--date", default=None,
                            help="Registration stamp YYYY-MM-DD (default today).")

    p_status = sub.add_parser("status", help="Live fleet report (always exit 0).")
    p_status.add_argument("--json", action="store_true")
    p_status.add_argument("--run-verifier", action="store_true",
                          help="Opt-in: execute each harness's init.sh and "
                               "report green/red/skipped/timeout.")
    p_status.add_argument("--verifier-timeout", type=int, default=300,
                          help="Seconds before a running verifier is reported "
                               "as timeout (default 300).")

    p_health = sub.add_parser("health", help="Derived health signals.")
    p_health.add_argument("--json", action="store_true")
    p_health.add_argument("--strict", action="store_true",
                          help="Exit 1 when at least one signal is present.")
    p_health.add_argument("--stale-days", type=int, default=7)
    p_health.add_argument("--idle-days", type=int, default=14)
    p_health.add_argument("--today", default=None,
                          help="Override today for deterministic runs.")

    p_heartbeat = sub.add_parser(
        "heartbeat", help="Append a closure event (post_run hook).")
    p_heartbeat.add_argument("--root", default=".",
                             help="Harness project root (default: cwd).")
    p_heartbeat.add_argument("--feature", default=None,
                             help="Feature name (default: newest history closure).")
    p_heartbeat.add_argument("--date", default=None,
                             help="Event date YYYY-MM-DD (default: closure date "
                                  "or today).")

    p_timeline = sub.add_parser("timeline",
                                help="Merged closure chronology across the fleet.")
    p_timeline.add_argument("--json", action="store_true")
    p_timeline.add_argument("--limit", type=int, default=0,
                            help="Show only the newest N entries (0 = all).")

    p_moc = sub.add_parser("moc", help="Regenerate the global fleet MOC index.md.")
    p_moc.add_argument("--html", action="store_true",
                       help="Also write a self-contained index.html.")

    args = parser.parse_args(argv)
    hroot = handyman_root(args.handyman_root)
    stamp = getattr(args, "date", None) or date.today().isoformat()

    if args.command == "register":
        return cmd_register(hroot, args.root, stamp)
    if args.command == "unregister":
        return cmd_unregister(hroot, args.root)
    if args.command == "list":
        return cmd_list(hroot, args.json)
    if args.command == "discover":
        return cmd_discover(hroot, args.scan, args.register, args.max_depth, stamp)
    if args.command == "status":
        return cmd_status(hroot, args.json, args.run_verifier,
                          args.verifier_timeout)
    if args.command == "health":
        return cmd_health(hroot, args.json, args.strict, args.stale_days,
                          args.idle_days, args.today)
    if args.command == "heartbeat":
        return cmd_heartbeat(hroot, args.root, args.feature, args.date)
    if args.command == "timeline":
        return cmd_timeline(hroot, args.json, args.limit)
    if args.command == "moc":
        return cmd_moc(hroot, args.html)
    return 2


if __name__ == "__main__":
    sys.exit(main())

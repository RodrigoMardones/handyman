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


def cmd_status(hroot: Path, as_json: bool) -> int:
    snaps, _registry, load_error = _snapshots(hroot)
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


def cmd_moc(hroot: Path) -> int:
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

    p_health = sub.add_parser("health", help="Derived health signals.")
    p_health.add_argument("--json", action="store_true")
    p_health.add_argument("--strict", action="store_true",
                          help="Exit 1 when at least one signal is present.")
    p_health.add_argument("--stale-days", type=int, default=7)
    p_health.add_argument("--idle-days", type=int, default=14)
    p_health.add_argument("--today", default=None,
                          help="Override today for deterministic runs.")

    sub.add_parser("moc", help="Regenerate the global fleet MOC index.md.")

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
        return cmd_status(hroot, args.json)
    if args.command == "health":
        return cmd_health(hroot, args.json, args.strict, args.stale_days,
                          args.idle_days, args.today)
    if args.command == "moc":
        return cmd_moc(hroot)
    return 2


if __name__ == "__main__":
    sys.exit(main())

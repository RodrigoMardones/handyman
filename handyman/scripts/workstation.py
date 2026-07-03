#!/usr/bin/env python3
"""Handyman workstation: live localhost panel over the fleet registry.

Interactive counterpart of scripts/fleet.py (which stays a one-shot,
read-only CLI). `serve` starts a localhost-only HTTP server rendering a
self-contained live panel and a single consistent state document. Mutations
(added in the intake endpoints) always shell out to scripts/feature.py —
the panel never writes feature_list.json directly, so the schema contract
(additionalProperties:false) is enforced by the same code paths every agent
session uses. Design: docs/analisis-monitoreo-flota.md + references/workstation.md.

Subcommands:
    serve    start the panel on http://127.0.0.1:<port>

Usage:
    python scripts/workstation.py serve [--port N] [--handyman-root P]
                                        [--verifier-timeout S]
                                        [--refresh-seconds N]

Security model: hard-coded 127.0.0.1 bind; a per-session token (printed at
start, embedded in the page) is required on every POST; the Host header must
be local (DNS-rebinding guard); the fleet registry is the allowlist of write
targets; subprocesses run with argument arrays only.

Exit codes: 0 ok (Ctrl+C is a clean stop), 1 error, 2 usage.
"""
from __future__ import annotations

import argparse
import json
import re
import secrets
import subprocess
import sys
import threading
from datetime import date, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
from validate_harness import resolve_workspace  # noqa: E402
from upgrade_harness import current_skill_version  # noqa: E402
from fleet import (  # noqa: E402
    _FAVICON_LINK,
    _HTML_STYLE,
    _THEME_COLOR_DARK,
    _THEME_COLOR_LIGHT,
    _snapshots,
    fleet_timeline,
    handyman_root,
    harness_signals,
    harness_snapshot,
    load_registry,
    registry_path,
    run_verifier,
)

STATUSES = ("pending", "in_progress", "done", "blocked")
TIMELINE_LIMIT = 20
STALE_DAYS = 7
IDLE_DAYS = 14

# Intake contract guards (references/templates.md, feature-request.template.md):
# only contract keys reach feature.py add, and the green gate is always the
# last acceptance bullet.
NAME_RE = re.compile(r"^[a-z0-9_]+$")
GATE_BULLET = "./init.sh passes (green gate)"
GATE_MARKERS = ("init.sh", "run_tests.sh")
MAX_BODY = 1 << 20  # 1 MiB request cap
MAX_SHORT = 500     # title / reason / includes / verification / skills
MAX_LONG = 4000     # description / context
MAX_ACCEPTANCE = 40
TEMPLATE_PATH = SCRIPT_DIR.parent / "assets" / "feature-request.template.md"

# Serializes the panel's own mutating subprocess calls (feature.py rewrites
# the whole feature_list.json; concurrent panel writes must not interleave).
MUTATION_LOCK = threading.Lock()


def err(msg: str) -> int:
    print(f"ERROR: {msg}", file=sys.stderr)
    return 1


# --- state -------------------------------------------------------------------

def read_features(workspace: Path) -> list[dict]:
    """Queue entries the action forms need; [] when missing or unparseable."""
    path = workspace / "feature_list.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    features = data.get("features", []) if isinstance(data, dict) else []
    out = []
    for feature in features:
        if not isinstance(feature, dict):
            continue
        entry = {
            "id": feature.get("id"),
            "name": feature.get("name"),
            "title": feature.get("title"),
            "status": feature.get("status"),
        }
        if "blocked_reason" in feature:
            entry["blocked_reason"] = feature.get("blocked_reason")
        out.append(entry)
    return out


def build_state(hroot: Path, timeline_limit: int = TIMELINE_LIMIT) -> dict:
    """One consistent document per refresh: snapshots + signals + features
    per harness, fleet aggregate, limited timeline."""
    snaps, _registry, load_error = _snapshots(hroot)
    today = date.today()
    fleet_counts = {status: 0 for status in STATUSES}
    unreadable = 0
    for snap in snaps:
        snap["signals"] = harness_signals(snap, today, STALE_DAYS, IDLE_DAYS)
        workspace = snap.get("workspace")
        snap["features"] = read_features(Path(str(workspace))) if workspace else []
        snap["draft"] = (draft_state(Path(str(workspace))) if workspace
                         else {"present": False, "state": "absent"})
        if snap.get("error"):
            unreadable += 1
            continue
        for status in STATUSES:
            fleet_counts[status] += snap["status_counts"].get(status, 0)
    return {
        "generated": datetime.now().isoformat(timespec="seconds"),
        "registry": str(registry_path(hroot)),
        "registry_error": load_error,
        "skill_version": current_skill_version() or None,
        "harnesses": snaps,
        "fleet": {"harnesses": len(snaps), "unreadable": unreadable,
                  "status_counts": fleet_counts},
        "timeline": fleet_timeline(hroot, snaps)[:timeline_limit],
        "verifier_busy": sorted(VERIFIER_BUSY),
    }


# Roots with a verifier currently running (F74 populates it; state always
# reports it so the UI and tests share one deterministic hook).
VERIFIER_BUSY: set[str] = set()
VERIFIER_BUSY_LOCK = threading.Lock()


# --- mutation helpers ----------------------------------------------------------

def registered_root(hroot: Path, value: object) -> Path | None:
    """The registry is the allowlist of write targets: a posted root must
    resolve to a registered project_root or nothing is touched."""
    if not isinstance(value, str) or not value.strip():
        return None
    root = Path(value).expanduser().resolve()
    registry, _load_error = load_registry(hroot)
    roots = {entry.get("project_root") for entry in registry["harnesses"]}
    return root if str(root) in roots else None


def run_feature_py(root: Path, *argv: str) -> tuple[int, str, str]:
    """Every mutation shells out to feature.py with an argument array —
    the panel never writes feature_list.json itself."""
    cmd = [sys.executable, str(SCRIPT_DIR / "feature.py"),
           "--root", str(root), *argv]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    except (subprocess.TimeoutExpired, OSError) as exc:
        return 124, "", f"feature.py failed to run: {exc}"
    return proc.returncode, proc.stdout, proc.stderr


def ensure_gate(acceptance: list[str]) -> list[str]:
    """Green gate as the LAST acceptance bullet (format contract B)."""
    for bullet in acceptance:
        lowered = bullet.lower()
        if any(marker in lowered for marker in GATE_MARKERS):
            return acceptance
    return acceptance + [GATE_BULLET]


def fresh_snapshot(root: Path) -> dict:
    """Post-action snapshot so the panel re-renders without waiting a poll."""
    snap = harness_snapshot(str(root), current_skill_version())
    snap["signals"] = harness_signals(snap, date.today(), STALE_DAYS, IDLE_DAYS)
    workspace = snap.get("workspace")
    snap["features"] = read_features(Path(str(workspace))) if workspace else []
    snap["draft"] = (draft_state(Path(str(workspace))) if workspace
                     else {"present": False, "state": "absent"})
    return snap


def build_request_md(fields: dict) -> str:
    """CORE-filled feature-request markdown mirroring the shipped template."""
    acceptance = ensure_gate(fields["acceptance"])
    lines = [
        f"# Feature request — {fields['name']}",
        "",
        "/handyman run-feature",
        "",
        "## Feature",
        f"- name: {fields['name']}",
        f"- title: {fields['title'] or fields['name']}",
        "",
        "## Context",
        fields["context"] or "_(fill in)_",
        "",
        "## Scope",
        f"- Includes: {fields['includes'] or '_(fill in)_'}",
        "",
        "## Acceptance criteria (observable and testable)",
    ]
    lines += [f"- {bullet}" for bullet in acceptance]
    lines += [
        "",
        "## Verification",
        f"- Gate that must stay green: `{fields['verification'] or './init.sh'}`",
        "",
        "## Tools",
        f"- skills: {fields['skills'] or 'handyman'}",
        "",
    ]
    return "\n".join(lines)


def draft_target(root: Path) -> Path:
    return resolve_workspace(root) / "feature-request.md"


def draft_conflicts(target: Path) -> bool:
    """True when the file exists with real content. A file identical to the
    pristine shipped template counts as empty (safe to replace)."""
    if not target.exists():
        return False
    try:
        current = target.read_text(encoding="utf-8")
        template = TEMPLATE_PATH.read_text(encoding="utf-8")
    except OSError:
        return True
    return current != template


def draft_state(workspace: Path) -> dict:
    """Additive intake context for the detail view: is a feature-request.md
    draft waiting, and is it real content or still the pristine template?"""
    target = workspace / "feature-request.md"
    if not target.exists():
        return {"present": False, "state": "absent"}
    return {"present": True,
            "state": "filled" if draft_conflicts(target) else "pristine"}


# --- panel -------------------------------------------------------------------

# Panel-only rules on top of the shared tokens. Every value comes from a
# --hw-* variable, so the old dark-mode block disappears: the :root
# reassignment in _HTML_STYLE already themes both pages.
# WCAG 2.2 markup pass (§7 Plan H): the appbar wordmark is a <p> carrying
# the same xl token the per-view <h1>s use — identical look, honest heading
# outline — and buttons reserve --hw-space-4 (2rem = 32px) of height, above
# the 24px target-size floor of 2.5.8.
_PANEL_STYLE = _HTML_STYLE + """
  h2 { font-size: var(--hw-text-xs); margin-top: var(--hw-space-3);
       text-transform: uppercase; letter-spacing: 0.04em;
       color: var(--hw-muted); }
  #statusline { min-height: 1.2em; font-size: var(--hw-text-s);
                color: var(--hw-muted); }
  details { margin: var(--hw-space-1) 0 var(--hw-space-2);
            border: 1px solid var(--hw-border);
            border-radius: var(--hw-radius-s);
            padding: var(--hw-space-1) var(--hw-space-2);
            width: fit-content; min-width: 18rem; }
  details summary { cursor: pointer; font-size: var(--hw-text-m); }
  ul { margin: var(--hw-space-1) 0; padding-left: 0; list-style: none; }
  li { font-size: var(--hw-text-m); padding: 0.1rem 0; }
  .pagetitle { margin: var(--hw-space-2) 0 0; }
  button { font: inherit; font-size: var(--hw-text-s);
           min-height: var(--hw-space-4);
           padding: var(--hw-space-1) var(--hw-space-2); cursor: pointer;
           border: 1px solid var(--hw-border-strong);
           border-radius: var(--hw-radius-s);
           background: var(--hw-surface); color: var(--hw-fg); }
  button:hover:enabled { border-color: var(--hw-accent); }
  .muted { color: var(--hw-muted); }
  td .actions { display: flex; gap: var(--hw-space-1); flex-wrap: wrap; }
  dialog { max-width: 34rem; width: 90%;
           border: 1px solid var(--hw-border);
           border-radius: var(--hw-radius-m);
           padding: var(--hw-space-3);
           background: var(--hw-bg); color: var(--hw-fg); }
  dialog::backdrop { background: var(--hw-backdrop); }
  dialog form { display: grid; gap: var(--hw-space-2); }
  dialog h3 { margin: 0 0 var(--hw-space-1); font-size: var(--hw-text-m); }
  dialog label { display: grid; gap: 0.15rem; font-size: var(--hw-text-s); }
  dialog input[type=text], dialog textarea, dialog select {
    font: inherit; font-size: var(--hw-text-m); width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--hw-border-strong);
    border-radius: var(--hw-radius-s); }
  dialog textarea { min-height: 4.5em; }
  dialog .row { display: flex; gap: var(--hw-space-2);
                justify-content: flex-end; }
  .formstatus { color: var(--hw-danger); min-height: 1em;
                font-size: var(--hw-text-s); }
  .formstatus.working { color: var(--hw-muted); }
  .empty { color: var(--hw-muted); font-style: italic; }
  dialog small { font-size: var(--hw-text-s); }
  .dlghelp { margin: 0; font-size: var(--hw-text-s); }
  header.appbar { display: flex; align-items: baseline;
                  justify-content: space-between; gap: var(--hw-space-2);
                  border-bottom: 1px solid var(--hw-border);
                  padding-bottom: var(--hw-space-2); }
  .wordmark { margin: 0; font-size: var(--hw-text-xl); font-weight: 700; }
  footer { display: block; margin-top: var(--hw-space-4);
           border-top: 1px solid var(--hw-border);
           padding-top: var(--hw-space-2); }
  nav { margin: var(--hw-space-2) 0; display: flex; gap: var(--hw-space-3);
        align-items: center; flex-wrap: wrap;
        border-bottom: 1px solid var(--hw-border); }
  nav a { color: var(--hw-muted); text-decoration: none;
          padding: var(--hw-space-1) 0; margin-bottom: -1px;
          border-bottom: 2px solid transparent; }
  nav a:hover { color: var(--hw-fg); }
  nav a[aria-current="page"] { color: var(--hw-fg); font-weight: 600;
                               border-bottom-color: var(--hw-accent); }
  nav label { margin-left: auto; }
  nav label + label { margin-left: 0; }
  nav select { font: inherit; font-size: var(--hw-text-s);
               border: 1px solid var(--hw-border-strong);
               border-radius: var(--hw-radius-s);
               background: var(--hw-surface); color: var(--hw-fg); }
  th.num { text-align: right; }
  .tl-date { color: var(--hw-muted); font-size: var(--hw-text-xs);
             text-transform: uppercase; letter-spacing: 0.04em;
             margin-top: var(--hw-space-2); }
  .tl-item { padding-left: var(--hw-space-3); }
  .stages { display: grid; gap: var(--hw-space-1); }
  .stage { display: flex; gap: var(--hw-space-1); align-items: center;
           flex-wrap: wrap; }
  .stage > span { min-width: 6.5rem; }
"""


def build_panel_html(token: str, refresh_seconds: int) -> str:
    """Self-contained live panel. All harness data arrives via fetch and is
    rendered with textContent/createElement — text from harness files never
    becomes markup.

    Theme (§6.4): the inline script at the top of <head> runs before the
    stylesheet, so a stored manual theme lands on <html data-theme=...>
    before first paint (no flash). The stored value is only compared against
    the light/dark whitelist and assigned as a data- attribute — it is never
    interpreted as markup. The two scheme-scoped <meta name="theme-color">
    mirror --hw-bg (annotated via data-hw-token, keeping the no-stray-hex
    invariant greppable).

    WCAG 2.2 markup (§7 Plan H): the three views live in a <main> landmark;
    the appbar wordmark is a <p> (same xl token) so each view owns the only
    <h1>, focusable via tabindex="-1" — every hashchange focuses it and
    retitles the document. The <dialog> is named/described through
    aria-labelledby/aria-describedby, returns focus to its opener on close,
    field help hangs off aria-describedby and invalid fields carry
    aria-invalid until fixed. Both tables ship a visually-hidden <caption>
    and scope="col" headers; motion collapses under prefers-reduced-motion."""
    version = current_skill_version() or "unknown"
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<script>(function () {{
  var t = localStorage.getItem("hw-theme:1");
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
}})();</script>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" media="(prefers-color-scheme: light)" content="{_THEME_COLOR_LIGHT}" data-hw-token="--hw-bg">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="{_THEME_COLOR_DARK}" data-hw-token="--hw-bg">
<title>Handyman Workstation</title>
{_FAVICON_LINK}
<style>{_PANEL_STYLE}</style>
</head>
<body>
<header class="appbar">
<p class="wordmark">Handyman · Workstation <span class="badge badge-muted">skill {version}</span>
<span id="stale"></span></p>
<span class="meta" id="updated">connecting…</span>
</header>
<p id="statusline" aria-live="polite"></p>
<nav>
<a href="#/fleet">Fleet</a>
<a href="#/timeline">Timeline</a>
<label class="meta">theme <select id="theme">
<option value="system">system</option>
<option value="light">light</option>
<option value="dark">dark</option>
</select></label>
<label class="meta"><input type="checkbox" id="pause"> pause auto-refresh
 (every {refresh_seconds}s)</label>
</nav>

<main>
<section id="view-fleet">
<h1 id="h1-fleet" tabindex="-1">Fleet</h1>
<table>
<caption class="visually-hidden">Registered harnesses: version drift,
workload counts and live session per project</caption>
<thead><tr><th scope="col">Project</th><th scope="col">Version</th>
<th scope="col">Drift</th>
<th class="num" scope="col">Pending</th>
<th class="num" scope="col">In progress</th>
<th class="num" scope="col">Done</th>
<th class="num" scope="col">Blocked</th>
<th scope="col">Session</th></tr></thead>
<tbody id="fleet"></tbody>
</table>
<p class="meta" id="aggregate"></p>
</section>

<section id="view-harness" hidden>
<p class="meta" id="crumb"></p>
<h1 id="h1-harness" class="pagetitle" tabindex="-1"></h1>
<div id="harness"></div>
</section>

<section id="view-timeline" hidden>
<h1 id="h1-timeline" tabindex="-1">Timeline</h1>
<ul id="timeline"></ul>
</section>
</main>

<footer class="meta"><span id="registry"></span>Stop the server with Ctrl+C
in its terminal · see references/workstation.md</footer>

<dialog id="dlg" aria-labelledby="dlg-title" aria-describedby="dlg-help">
<form id="dlgform"></form></dialog>

<script>
"use strict";
const TOKEN = {json.dumps(token)};
const REFRESH_MS = {refresh_seconds * 1000};
// The page is baked once at serve start; after a skill upgrade a running
// server keeps serving the old panel. Comparing the baked version against
// the live one from /api/state surfaces that instead of hiding it.
const BAKED_VERSION = {json.dumps(version)};
const $ = (id) => document.getElementById(id);

function el(tag, text, attrs) {{
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = String(text);
  for (const key in (attrs || {{}})) node.setAttribute(key, attrs[key]);
  return node;
}}

// Semantic states render as textual badges: the text stays the primary
// encoding, the token color is a secondary cue only.
function badge(text, kind) {{
  return el("span", text, {{class: "badge badge-" + kind}});
}}

function verifierBadge(text) {{
  const kind = text.startsWith("green") ? "ok"
    : (text.startsWith("red") || text.startsWith("error")) ? "danger"
    : text.startsWith("timeout") ? "warn" : "muted";
  return badge(text, kind);
}}

function drift(version) {{
  if (!version) return "?";
  if (version.behind === true) return "BEHIND";
  if (version.behind === false) return "OK";
  return "?";
}}

function driftKind(version) {{
  if (!version) return "muted";
  return version.behind === false ? "ok"
    : version.behind === true ? "warn" : "muted";
}}

// ---- routing: three views over one state document ----------------------------
// #/fleet (read), #/harness/<name> (act on one harness), #/timeline (audit).
// location.hash is the router: deep links and back/forward come for free.
function route() {{
  const h = location.hash || "#/fleet";
  if (h.startsWith("#/harness/")) {{
    return {{view: "harness", name: decodeURIComponent(h.slice(10))}};
  }}
  if (h === "#/timeline") return {{view: "timeline"}};
  return {{view: "fleet"}};
}}

// Every view owns a real h1 (tabindex="-1" so script can focus it). A
// hash navigation is a page change: focus lands on the new view's title and
// document.title follows (WCAG 2.4.3 focus order, 4.1.3 status announced by
// the heading itself, 2.4.6 one honest heading per view). Titles and focus
// are plain textContent/focus() calls — no markup from state.
const VIEW_H1 = {{fleet: "h1-fleet", harness: "h1-harness",
                  timeline: "h1-timeline"}};

function viewTitle(r) {{
  return r.view === "harness" ? r.name
    : r.view === "timeline" ? "Timeline" : "Fleet";
}}

function focusView() {{
  const r = route();
  document.title = viewTitle(r) + " \\u00b7 Handyman Workstation";
  const heading = $(VIEW_H1[r.view]);
  if (heading) heading.focus();
}}

window.addEventListener("hashchange", () => {{
  if (lastState) render(lastState);
  focusView();
}});

// ---- fmt: the single formatting layer ---------------------------------------
// Machine state turns into human sentences here and only here; every consumer
// still renders via textContent, so formatting never introduces markup.
const fmt = {{
  status: (s) => String(s || "").replace(/_/g, " "),
  session: (session) => {{
    if (!session || !session.feature || session.feature === "none" ||
        session.status === "idle") return "idle";
    return session.feature + " \\u2014 " + (session.role || "unknown role");
  }},
  aggregate: (fleet) => {{
    const c = fleet.status_counts;
    return plural(fleet.harnesses, "harness") +
      (fleet.unreadable ? " (" + fleet.unreadable + " unreadable)" : "") +
      " \\u00b7 " + c.pending + " pending \\u00b7 " +
      c.in_progress + " in progress \\u00b7 " +
      c.done + " done \\u00b7 " + c.blocked + " blocked";
  }},
  timelineEntry: (t, omitProject) =>
    (omitProject ? "" : t.project_name + ": ") + t.feature +
    (t.feature_id === null ? " (heartbeat)"
     : " (feature " + t.feature_id + ")"),
  queueItem: (f) => "#" + f.id + " " + f.name +
    (f.blocked_reason ? " \\u2014 " + f.blocked_reason : ""),
}};

function plural(n, word) {{
  return n + " " + (n === 1 ? word : word + (word.endsWith("s") ? "es" : "s"));
}}

// Dates render relative for scanning; the absolute date stays in the title.
function dateEl(s) {{
  const parts = String(s || "").split("-");
  if (parts.length < 3) return el("span", s || "unknown");
  const then = new Date(+parts[0], +parts[1] - 1, parseInt(parts[2], 10));
  if (isNaN(then.getTime())) return el("span", s);
  const days = Math.floor((Date.now() - then.getTime()) / 86400000);
  const text = days <= 0 ? "today" : days === 1 ? "yesterday" : days + "d ago";
  return el("span", text, {{title: String(s)}});
}}

function sessionCell(session) {{
  const cell = document.createElement("td");
  const text = fmt.session(session);
  cell.textContent = text;
  if (text !== "idle" && session.updated) {{
    cell.appendChild(el("span", ", updated "));
    cell.appendChild(dateEl(session.updated));
  }}
  return cell;
}}

// One empty-state pattern for every "nothing here" spot.
function emptyNode(tag, text, attrs) {{
  const node = el(tag, text, attrs);
  node.classList.add("empty");
  return node;
}}

const verifierResults = {{}};  // session-local, keyed by project_root

// Overview: identity + workload + live session only. Everything about ONE
// harness (queue, health, actions, draft, timeline) lives in its detail view.
function renderFleet(state) {{
  const body = $("fleet");
  body.replaceChildren();
  for (const snap of state.harnesses) {{
    const row = document.createElement("tr");
    const pcell = document.createElement("td");
    pcell.appendChild(el("a", snap.project_name,
      {{href: "#/harness/" + encodeURIComponent(snap.project_name),
        title: snap.project_root}}));
    if (snap.signals && snap.signals.length) {{
      pcell.appendChild(el("span", " "));
      pcell.appendChild(badge(plural(snap.signals.length, "signal"), "warn"));
    }}
    row.appendChild(pcell);
    if (snap.error) {{
      const cell = el("td", "ERROR: " + snap.error, {{colspan: "7"}});
      cell.className = "error";
      row.appendChild(cell);
      body.appendChild(row);
      continue;
    }}
    const counts = snap.status_counts || {{}};
    row.appendChild(el("td", (snap.version && snap.version.installed) || "unsealed"));
    const driftCell = document.createElement("td");
    driftCell.appendChild(badge(drift(snap.version), driftKind(snap.version)));
    row.appendChild(driftCell);
    for (const key of ["pending", "in_progress", "done", "blocked"]) {{
      const cell = el("td", counts[key] ?? 0);
      cell.className = (counts[key] ?? 0) === 0 ? "num muted" : "num";
      row.appendChild(cell);
    }}
    row.appendChild(sessionCell(snap.session));
    body.appendChild(row);
  }}
  if (!state.harnesses.length) {{
    const row = document.createElement("tr");
    row.appendChild(emptyNode("td", "no harnesses registered yet",
                              {{colspan: "8"}}));
    body.appendChild(row);
  }}
  $("aggregate").textContent = fmt.aggregate(state.fleet);
}}

function actionButton(kind, snap) {{
  const btn = el("button", LABELS[kind],
                 {{type: "button", title: TITLES[kind]}});
  btn.onclick = () => openForm(kind, snap, btn);
  return btn;
}}

function stageGroup(title) {{
  const box = el("div", null, {{class: "stage"}});
  box.appendChild(el("span", title + ":", {{class: "meta"}}));
  return box;
}}

// Actions are grouped by workflow stage and rendered state-first: a
// transition the live feature statuses cannot take is not painted at all.
function stageActions(state, snap) {{
  const wrap = el("div", null, {{class: "stages"}});
  const intake = stageGroup("Intake");
  intake.appendChild(actionButton("request", snap));
  intake.appendChild(actionButton("add", snap));
  wrap.appendChild(intake);
  const counts = snap.status_counts || {{}};
  const blockable = (counts.pending ?? 0) + (counts.in_progress ?? 0) > 0;
  const unblockable = (counts.blocked ?? 0) > 0;
  if (blockable || unblockable) {{
    const transitions = stageGroup("State");
    if (blockable) transitions.appendChild(actionButton("block", snap));
    if (unblockable) transitions.appendChild(actionButton("unblock", snap));
    wrap.appendChild(transitions);
  }}
  const verification = stageGroup("Verification");
  const busy = state.verifier_busy.includes(snap.project_root);
  const verify = el("button", "Run verifier",
                    {{type: "button", title: TITLES.verify}});
  if (busy) verify.disabled = true;
  verify.onclick = () => runVerify(snap, verify);
  verification.appendChild(verify);
  const vtext = busy ? "running..."
    : (verifierResults[snap.project_root] || "");
  if (vtext) verification.appendChild(verifierBadge(vtext));
  wrap.appendChild(verification);
  return wrap;
}}

async function runVerify(snap, btn) {{
  btn.disabled = true;
  verifierResults[snap.project_root] = "running...";
  if (lastState) render(lastState);
  const res = await api("/api/verifier/run", {{root: snap.project_root}});
  if (res.ok) {{
    const v = res.verifier;
    verifierResults[snap.project_root] = v.result +
      (v.exit_code !== null && v.exit_code !== undefined
        ? " (exit " + v.exit_code + ")" : "");
  }} else {{
    verifierResults[snap.project_root] = "error: " + (res.error || "?");
  }}
  refresh();
}}

// ---- intake forms ----------------------------------------------------------
// Action labels speak the workflow-stage vocabulary (references/workflow.md):
// the docs and the panel name the same thing the same way. Titles state the
// stage plus the artifact each action produces.
const LABELS = {{request: "Draft request", add: "Add pending feature",
                 block: "Block", unblock: "Unblock"}};
const TITLES = {{
  request: "Intake — writes feature-request.md into the target workspace",
  add: "Intake — appends a pending entry via feature.py add "
       + "(green gate auto-appended)",
  block: "State transition — feature.py block --reason "
         + "(pending/in_progress -> blocked)",
  unblock: "State transition — feature.py unblock (blocked -> pending)",
  verify: "Verification — runs the target's own init.sh",
}};
// One-line dialog help: what the action produces and where it lands —
// including the draft-vs-add distinction both intake forms need.
const HELP = {{
  request: "Writes a CORE-filled feature-request.md draft into the target "
    + "workspace for later refinement; nothing enters feature_list.json "
    + "until the form is converted during run-feature. For direct intake "
    + "use Add pending feature.",
  add: "Appends a pending entry straight into feature_list.json via "
    + "feature.py add (contract keys only; the green gate lands as the last "
    + "acceptance bullet). If the request still needs shaping, use Draft "
    + "request instead.",
  block: "Marks the selected feature blocked and records the reason in "
    + "feature_list.json (feature.py block --reason).",
  unblock: "Returns the selected blocked feature to pending and clears "
    + "blocked_reason (feature.py unblock).",
}};
let dlgKind = null, dlgRoot = null, dlgOpener = null;

function input(name, value, placeholder) {{
  const node = el("input", null, {{type: "text", name: name}});
  if (value) node.value = value;
  if (placeholder) node.placeholder = placeholder;
  return node;
}}

function area(name, placeholder) {{
  const node = el("textarea", null, {{name: name}});
  if (placeholder) node.placeholder = placeholder;
  return node;
}}

// Field help is programmatically tied to its control (WCAG 3.3.2): the
// <small> gets an id derived from the field name — unique per form, and the
// form is rebuilt on every open — and the control points at it via
// aria-describedby.
function labeled(text, node, help) {{
  const wrap = document.createElement("label");
  wrap.appendChild(el("span", text));
  wrap.appendChild(node);
  if (help) {{
    const helpId = "help-" + (node.getAttribute("name") || "field");
    node.setAttribute("aria-describedby", helpId);
    wrap.appendChild(el("small", help, {{class: "muted", id: helpId}}));
  }}
  return wrap;
}}

// The slug rule ships as native required+pattern validation: the browser
// blocks a bad submit before any server round-trip.
function slugInput() {{
  const node = input("name");
  node.required = true;
  node.pattern = "[a-z0-9_]+";
  return labeled("name", node, "lowercase slug: a-z, 0-9 and _ only");
}}

function featureSelect(snap, statuses) {{
  const node = el("select", null, {{name: "feature"}});
  for (const f of (snap.features || [])) {{
    if (!statuses.includes(f.status)) continue;
    let text = f.name + " \\u2014 " + fmt.status(f.status);
    if (f.blocked_reason) text += ": " + f.blocked_reason;
    node.appendChild(el("option", text, {{value: f.name}}));
  }}
  if (!node.children.length) {{
    node.appendChild(el("option", "no eligible features", {{value: ""}}));
  }}
  return node;
}}

function openForm(kind, snap, trigger) {{
  dlgKind = kind; dlgRoot = snap.project_root;
  dlgOpener = trigger || null;
  const form = $("dlgform");
  form.replaceChildren();
  // The dialog's aria-labelledby/aria-describedby point at these two ids;
  // replaceChildren above just removed the previous pair, so each stays
  // unique in the document.
  form.appendChild(el("h3", LABELS[kind] + " \\u2014 " + snap.project_name,
                      {{id: "dlg-title"}}));
  form.appendChild(el("p", HELP[kind], {{class: "muted dlghelp",
                                          id: "dlg-help"}}));
  if (kind === "request") {{
    form.appendChild(slugInput());
    form.appendChild(labeled("title", input("title")));
    form.appendChild(labeled("context", area("context"),
      "why this feature exists; lands in the draft's Context section"));
    form.appendChild(labeled("scope includes", input("includes"),
      "directories or areas the work may touch"));
    form.appendChild(labeled("acceptance", area("acceptance"),
      "one observable criterion per line; the green gate is appended "
      + "automatically as the last bullet"));
    form.appendChild(labeled("verification gate",
      input("verification", "./init.sh")));
    form.appendChild(labeled("skills", input("skills", "handyman"),
      "from the declared discovery set (tools_discovery.py check)"));
    const force = el("input", null, {{type: "checkbox", name: "force"}});
    form.appendChild(labeled("overwrite existing draft (force)", force));
  }} else if (kind === "add") {{
    form.appendChild(slugInput());
    form.appendChild(labeled("title", input("title")));
    form.appendChild(labeled("description", area("description")));
    form.appendChild(labeled("acceptance", area("acceptance"),
      "one observable criterion per line; the green gate is appended "
      + "automatically as the last bullet"));
  }} else if (kind === "block") {{
    form.appendChild(labeled("feature", featureSelect(snap,
      ["pending", "in_progress"])));
    const reason = input("reason");
    reason.required = true;
    form.appendChild(labeled("reason", reason,
      "recorded as blocked_reason in feature_list.json"));
  }} else {{
    form.appendChild(labeled("blocked feature", featureSelect(snap,
      ["blocked"])));
  }}
  const row = el("div", null, {{class: "row"}});
  const cancel = el("button", "Cancel", {{type: "button"}});
  cancel.onclick = () => $("dlg").close();
  row.appendChild(cancel);
  row.appendChild(el("button", LABELS[kind], {{type: "submit"}}));
  form.appendChild(row);
  form.appendChild(el("p", "", {{class: "formstatus"}}));
  $("dlg").showModal();
}}

function bulletLines(text) {{
  return String(text || "").split("\\n").map(s => s.trim()).filter(Boolean);
}}

async function api(path, body) {{
  try {{
    const res = await fetch(path, {{
      method: "POST",
      headers: {{"Content-Type": "application/json",
                 "X-Workstation-Token": TOKEN}},
      body: JSON.stringify(body),
    }});
    return await res.json();
  }} catch (e) {{
    return {{ok: false, error: e.message}};
  }}
}}

$("dlgform").addEventListener("submit", async (ev) => {{
  ev.preventDefault();
  const fd = new FormData(ev.target);
  let path;
  const body = {{root: dlgRoot}};
  if (dlgKind === "request") {{
    path = "/api/request-draft";
    body.name = fd.get("name"); body.title = fd.get("title");
    body.context = fd.get("context"); body.includes = fd.get("includes");
    body.acceptance = bulletLines(fd.get("acceptance"));
    body.verification = fd.get("verification"); body.skills = fd.get("skills");
    body.force = fd.get("force") === "on";
  }} else if (dlgKind === "add") {{
    path = "/api/feature/add";
    body.name = fd.get("name"); body.title = fd.get("title");
    body.description = fd.get("description");
    body.acceptance = bulletLines(fd.get("acceptance"));
  }} else if (dlgKind === "block") {{
    path = "/api/feature/block";
    body.name = fd.get("feature"); body.reason = fd.get("reason");
  }} else {{
    path = "/api/feature/unblock";
    body.name = fd.get("feature");
  }}
  // Busy contract: the submit disables and the form says so until the
  // response lands; results reach the statusline with a textual prefix.
  const submitBtn = ev.target.querySelector('button[type="submit"]');
  const status = ev.target.querySelector(".formstatus");
  submitBtn.disabled = true;
  status.classList.add("working");
  status.textContent = "working...";
  const res = await api(path, body);
  submitBtn.disabled = false;
  status.classList.remove("working");
  if (res.ok) {{
    status.textContent = "";
    $("dlg").close();
    $("statusline").textContent = "ok: " + (res.message || res.path || "done");
    refresh();
  }} else {{
    status.textContent = "error: " + (res.error || "request failed");
  }}
}});

// Focus returns to the button that opened the dialog on every close path —
// Cancel, Esc and successful submit all end in the close event (WCAG 2.4.3).
// A refresh may have re-rendered the view meanwhile; a detached opener is
// skipped rather than focused.
$("dlg").addEventListener("close", () => {{
  if (dlgOpener && dlgOpener.isConnected) dlgOpener.focus();
  dlgOpener = null;
}});

// Native validation surfaces to AT: when the browser blocks a submit, the
// offending control is marked aria-invalid; the mark clears as soon as its
// value validates again. invalid does not bubble, so it is captured.
$("dlgform").addEventListener("invalid", (ev) => {{
  ev.target.setAttribute("aria-invalid", "true");
}}, true);
$("dlgform").addEventListener("input", (ev) => {{
  const field = ev.target;
  if (field.willValidate && field.validity && field.validity.valid) {{
    field.removeAttribute("aria-invalid");
  }}
}});

function healthList(snap) {{
  const list = document.createElement("ul");
  if (!snap.signals || !snap.signals.length) {{
    const item = document.createElement("li");
    item.appendChild(badge("OK", "ok"));
    item.appendChild(el("span", " no signals", {{class: "muted"}}));
    list.appendChild(item);
  }} else {{
    for (const s of snap.signals) {{
      const item = document.createElement("li");
      item.appendChild(badge(s.signal, "warn"));
      item.appendChild(el("span", " " + s.detail));
      list.appendChild(item);
    }}
  }}
  return list;
}}

function queueSection(snap) {{
  const box = document.createElement("div");
  const features = snap.features || [];
  if (!features.length) {{
    const list = document.createElement("ul");
    list.appendChild(emptyNode("li", "no features in the queue yet"));
    box.appendChild(list);
    return box;
  }}
  for (const status of ["in_progress", "pending", "blocked", "done"]) {{
    const group = features.filter((f) => f.status === status);
    if (!group.length) continue;
    const kind = status === "blocked" ? "danger"
      : status === "in_progress" ? "ok" : "muted";
    const list = document.createElement("ul");
    for (const f of group) {{
      list.appendChild(el("li", fmt.queueItem(f)));
    }}
    // History (done) and parked work (blocked) collapse to a count; the
    // open queue (in progress, pending) stays fully visible.
    if (status === "done" || status === "blocked") {{
      const fold = document.createElement("details");
      const summary = document.createElement("summary");
      summary.appendChild(badge(fmt.status(status), kind));
      summary.appendChild(el("span", " " + plural(group.length, "feature"),
                             {{class: "meta"}}));
      fold.appendChild(summary);
      fold.appendChild(list);
      box.appendChild(fold);
    }} else {{
      const head = document.createElement("p");
      head.appendChild(badge(fmt.status(status), kind));
      head.appendChild(el("span", " " + plural(group.length, "feature"),
                          {{class: "meta"}}));
      box.appendChild(head);
      box.appendChild(list);
    }}
  }}
  return box;
}}

// Detail view: everything about ONE harness in one place. Actions come
// right after the identity — acting on the harness is what this view is
// for — then a single status strip, then the queue and its timeline.
function renderHarness(state, name) {{
  // The view h1 is the harness name (assigned as textContent, never markup).
  $("h1-harness").textContent = name;
  const crumb = $("crumb");
  crumb.replaceChildren();
  crumb.appendChild(el("a", "Fleet", {{href: "#/fleet"}}));
  crumb.appendChild(el("span", " / " + name));
  const box = $("harness");
  box.replaceChildren();
  const snap = state.harnesses.find((s) => s.project_name === name);
  if (!snap) {{
    box.appendChild(emptyNode("p",
      "harness not found in the registry: " + name));
    return;
  }}
  if (snap.error) {{
    const err = el("p", "ERROR: " + snap.error);
    err.className = "error";
    box.appendChild(err);
    return;
  }}
  const idline = el("p", null, {{class: "meta"}});
  idline.appendChild(el("span",
    ((snap.version && snap.version.installed) || "unsealed") + " "));
  idline.appendChild(badge(drift(snap.version), driftKind(snap.version)));
  idline.appendChild(el("span", " \\u00b7 " + snap.project_root));
  box.appendChild(idline);
  box.appendChild(el("h2", "Actions"));
  const draft = snap.draft || {{present: false, state: "absent"}};
  const dline = el("p", null, {{class: "meta"}});
  dline.appendChild(el("span", "feature-request.md draft: "));
  dline.appendChild(badge(draft.state,
    draft.state === "filled" ? "warn" : "muted"));
  box.appendChild(dline);
  box.appendChild(stageActions(state, snap));
  box.appendChild(el("h2", "Status"));
  const sess = document.createElement("p");
  const stext = fmt.session(snap.session);
  if (stext === "idle") {{
    sess.appendChild(badge("idle", "muted"));
  }} else {{
    sess.appendChild(badge("working", "ok"));
    sess.appendChild(el("span", " " + stext));
    if (snap.session && snap.session.updated) {{
      sess.appendChild(el("span", ", updated "));
      sess.appendChild(dateEl(snap.session.updated));
    }}
  }}
  sess.appendChild(el("span", " \\u00b7 last closure: ", {{class: "meta"}}));
  if (snap.last_closure) sess.appendChild(dateEl(snap.last_closure));
  else sess.appendChild(emptyNode("span", "none yet"));
  box.appendChild(sess);
  box.appendChild(healthList(snap));
  box.appendChild(el("h2", "Queue"));
  box.appendChild(queueSection(snap));
  box.appendChild(el("h2", "Timeline"));
  const tl = document.createElement("ul");
  fillTimeline(tl, state.timeline.filter((t) => t.project_name === name),
               true);
  box.appendChild(tl);
}}

// Closures group under one dated heading per day instead of repeating the
// date on every line.
function fillTimeline(list, entries, omitProject) {{
  list.replaceChildren();
  let lastDate = null;
  for (const t of entries) {{
    if (t.date !== lastDate) {{
      list.appendChild(el("li", t.date, {{class: "tl-date"}}));
      lastDate = t.date;
    }}
    list.appendChild(el("li", fmt.timelineEntry(t, omitProject),
                        {{class: "tl-item"}}));
  }}
  if (!entries.length) {{
    list.appendChild(emptyNode("li", "no closures yet"));
  }}
}}

function render(state) {{
  // Header keeps only the live pulse; the registry path is footer debug.
  const timePart = String(state.generated || "").split("T")[1]
    || String(state.generated || "");
  $("updated").textContent = "updated " + timePart +
    (state.registry_error ? " \\u00b7 NOTE: " + state.registry_error : "");
  $("registry").textContent = "registry: " + state.registry +
    " \\u00b7 skill " + (state.skill_version || "?") + " \\u00b7 ";
  const stale = $("stale");
  stale.replaceChildren();
  if (state.skill_version && state.skill_version !== BAKED_VERSION) {{
    stale.appendChild(badge(
      "panel outdated \\u2014 restart serve to update", "warn"));
  }}
  const r = route();
  document.title = viewTitle(r) + " \\u00b7 Handyman Workstation";
  // Tabs mark the active view; the harness detail belongs to Fleet.
  const currentHref = r.view === "timeline" ? "#/timeline" : "#/fleet";
  for (const link of document.querySelectorAll("nav a")) {{
    if (link.getAttribute("href") === currentHref) {{
      link.setAttribute("aria-current", "page");
    }} else {{
      link.removeAttribute("aria-current");
    }}
  }}
  $("view-fleet").hidden = r.view !== "fleet";
  $("view-harness").hidden = r.view !== "harness";
  $("view-timeline").hidden = r.view !== "timeline";
  if (r.view === "fleet") renderFleet(state);
  else if (r.view === "harness") renderHarness(state, r.name);
  else fillTimeline($("timeline"), state.timeline);
}}

let lastState = null;
async function refresh() {{
  if ($("pause").checked || document.hidden) return;
  try {{
    const res = await fetch("/api/state");
    if (!res.ok) throw new Error("HTTP " + res.status);
    lastState = await res.json();
    render(lastState);
    $("statusline").textContent = "";
  }} catch (e) {{
    $("statusline").textContent =
      "error: server unreachable \\u2014 retrying (" + e.message + ")";
  }}
}}

// Manual theme layered over prefers-color-scheme. The versioned key
// hw-theme:1 stores only whitelisted values; anything else means "system",
// which clears both the key and the data-theme attribute so the OS media
// query takes over again. The head script already applied the stored value
// pre-paint — this only syncs the control and handles changes.
const themeControl = $("theme");
const storedTheme = localStorage.getItem("hw-theme:1");
if (storedTheme === "light" || storedTheme === "dark") {{
  themeControl.value = storedTheme;
}}
themeControl.addEventListener("change", () => {{
  const choice = themeControl.value;
  if (choice === "light" || choice === "dark") {{
    localStorage.setItem("hw-theme:1", choice);
    document.documentElement.dataset.theme = choice;
  }} else {{
    localStorage.removeItem("hw-theme:1");
    delete document.documentElement.dataset.theme;
  }}
}});

refresh();
setInterval(refresh, REFRESH_MS);
</script>
</body>
</html>
"""


# --- http --------------------------------------------------------------------

def make_handler(hroot: Path, token: str, refresh_seconds: int,
                 verifier_timeout: int):
    """Handler class bound to this serve invocation's configuration."""

    panel = build_panel_html(token, refresh_seconds)

    class Handler(BaseHTTPRequestHandler):
        server_version = "HandymanWorkstation/1.0"

        # -- helpers -----------------------------------------------------
        def _host_ok(self) -> bool:
            host = (self.headers.get("Host") or "").split(":", 1)[0].lower()
            return host in ("127.0.0.1", "localhost")

        def _send(self, code: int, body: bytes, ctype: str) -> None:
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def _send_json(self, code: int, obj: dict) -> None:
            self._send(code, json.dumps(obj, ensure_ascii=False).encode("utf-8"),
                       "application/json; charset=utf-8")

        def _send_html(self, body: str) -> None:
            self._send(200, body.encode("utf-8"), "text/html; charset=utf-8")

        def log_message(self, format, *args):  # noqa: A002 - stdlib signature
            pass  # keep server output stable for tests; errors go via responses

        # -- routes ------------------------------------------------------
        def do_GET(self):  # noqa: N802 - stdlib naming
            if not self._host_ok():
                self._send_json(403, {"ok": False, "error": "forbidden host"})
                return
            path = self.path.split("?", 1)[0]
            if path == "/":
                self._send_html(panel)
                return
            if path == "/api/state":
                self._send_json(200, build_state(hroot))
                return
            self._send_json(404, {"ok": False, "error": "not found"})

        # -- mutations -----------------------------------------------------
        def _read_payload(self):
            """Shared POST pipeline: token -> content-type -> size -> JSON.
            Returns the parsed dict or None after sending the error."""
            if self.headers.get("X-Workstation-Token") != token:
                self._send_json(403, {"ok": False, "error": "missing or bad "
                                      "session token"})
                return None
            ctype = self.headers.get("Content-Type") or ""
            if "application/json" not in ctype:
                self._send_json(400, {"ok": False, "error": "Content-Type "
                                      "must be application/json"})
                return None
            try:
                length = int(self.headers.get("Content-Length") or 0)
            except ValueError:
                length = 0
            if length <= 0:
                self._send_json(400, {"ok": False, "error": "empty body"})
                return None
            if length > MAX_BODY:
                self._send_json(413, {"ok": False, "error": "body too large"})
                return None
            try:
                payload = json.loads(self.rfile.read(length).decode("utf-8"))
            except (ValueError, UnicodeDecodeError):
                self._send_json(400, {"ok": False, "error": "body is not "
                                      "valid JSON"})
                return None
            if not isinstance(payload, dict):
                self._send_json(400, {"ok": False, "error": "body must be a "
                                      "JSON object"})
                return None
            return payload

        def _target_root(self, payload):
            root = registered_root(hroot, payload.get("root"))
            if root is None:
                self._send_json(400, {"ok": False, "error": "root is not a "
                                      "registered harness"})
            return root

        def _valid_name(self, payload):
            name = payload.get("name")
            if not isinstance(name, str) or not NAME_RE.match(name):
                self._send_json(400, {"ok": False, "error": "name must match "
                                      "^[a-z0-9_]+$"})
                return None
            return name

        def _short(self, payload, key):
            value = payload.get(key)
            if value is None:
                return ""
            if not isinstance(value, str) or len(value) > MAX_SHORT:
                self._send_json(400, {"ok": False, "error": f"{key} must be a "
                                      f"string of at most {MAX_SHORT} chars"})
                return None
            return value.strip()

        def _long(self, payload, key):
            value = payload.get(key)
            if value is None:
                return ""
            if not isinstance(value, str) or len(value) > MAX_LONG:
                self._send_json(400, {"ok": False, "error": f"{key} must be a "
                                      f"string of at most {MAX_LONG} chars"})
                return None
            return value.strip()

        def _acceptance(self, payload):
            value = payload.get("acceptance")
            if value is None:
                return []
            if not isinstance(value, list) or len(value) > MAX_ACCEPTANCE or \
                    not all(isinstance(item, str) and item.strip()
                            and len(item) <= MAX_SHORT for item in value):
                self._send_json(400, {"ok": False, "error": "acceptance must "
                                      "be a list of non-empty strings"})
                return None
            return [item.strip() for item in value]

        def _feature_py_reply(self, root, code, out, errtxt):
            if code == 0:
                match = re.search(r"feature (\d+)", out)
                self._send_json(200, {
                    "ok": True,
                    "message": out.strip(),
                    "id": int(match.group(1)) if match else None,
                    "snapshot": fresh_snapshot(root),
                })
                return
            reason = (errtxt.strip() or out.strip()).splitlines()
            reason = reason[-1] if reason else "feature.py failed"
            conflict = any(marker in reason for marker in
                           ("already exists", "is not blocked", "not found"))
            self._send_json(409 if conflict else 500,
                            {"ok": False, "error": reason})

        def _post_add(self, payload, root):
            name = self._valid_name(payload)
            if name is None:
                return
            title = self._short(payload, "title")
            if title is None:
                return
            description = self._long(payload, "description")
            if description is None:
                return
            acceptance = self._acceptance(payload)
            if acceptance is None:
                return
            argv = ["add", "--name", name]
            if title:
                argv += ["--title", title]
            if description:
                argv += ["--description", description]
            for bullet in ensure_gate(acceptance):
                argv += ["--acceptance", bullet]
            with MUTATION_LOCK:
                code, out, errtxt = run_feature_py(root, *argv)
            self._feature_py_reply(root, code, out, errtxt)

        def _post_block(self, payload, root):
            name = self._valid_name(payload)
            if name is None:
                return
            reason = self._short(payload, "reason")
            if reason is None:
                return
            if not reason:
                self._send_json(400, {"ok": False, "error": "reason is "
                                      "required"})
                return
            with MUTATION_LOCK:
                code, out, errtxt = run_feature_py(
                    root, "block", name, "--reason", reason)
            self._feature_py_reply(root, code, out, errtxt)

        def _post_unblock(self, payload, root):
            name = self._valid_name(payload)
            if name is None:
                return
            with MUTATION_LOCK:
                code, out, errtxt = run_feature_py(root, "unblock", name)
            self._feature_py_reply(root, code, out, errtxt)

        def _post_verifier_run(self, payload, root):
            root_key = str(root)
            with VERIFIER_BUSY_LOCK:
                if root_key in VERIFIER_BUSY:
                    self._send_json(409, {"ok": False, "error": "verifier "
                                          "already running for this root"})
                    return
                VERIFIER_BUSY.add(root_key)
            try:
                # Long and read-only: runs OUTSIDE the mutation lock so
                # intake keeps working and GETs stay responsive.
                verdict = run_verifier(root, verifier_timeout)
            finally:
                with VERIFIER_BUSY_LOCK:
                    VERIFIER_BUSY.discard(root_key)
            self._send_json(200, {"ok": True, "verifier": verdict})

        def _post_request_draft(self, payload, root):
            name = self._valid_name(payload)
            if name is None:
                return
            fields = {"name": name}
            for key in ("title", "includes", "verification", "skills"):
                value = self._short(payload, key)
                if value is None:
                    return
                fields[key] = value
            context = self._long(payload, "context")
            if context is None:
                return
            fields["context"] = context
            acceptance = self._acceptance(payload)
            if acceptance is None:
                return
            fields["acceptance"] = acceptance
            target = draft_target(root)
            overwrote = target.exists()
            if draft_conflicts(target) and not payload.get("force") is True:
                self._send_json(409, {"ok": False, "error":
                                      f"{target} already has content; retry "
                                      "with force to overwrite"})
                return
            try:
                with MUTATION_LOCK:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_text(build_request_md(fields),
                                      encoding="utf-8")
            except OSError as exc:
                self._send_json(500, {"ok": False, "error": str(exc)})
                return
            self._send_json(200, {"ok": True, "path": str(target),
                                  "overwrote": overwrote})

        def do_POST(self):  # noqa: N802 - stdlib naming
            if not self._host_ok():
                self._send_json(403, {"ok": False, "error": "forbidden host"})
                return
            path = self.path.split("?", 1)[0]
            if path in ("/", "/api/state"):
                self._send_json(405, {"ok": False, "error": "method not allowed"})
                return
            routes = {
                "/api/request-draft": self._post_request_draft,
                "/api/feature/add": self._post_add,
                "/api/feature/block": self._post_block,
                "/api/feature/unblock": self._post_unblock,
                "/api/verifier/run": self._post_verifier_run,
            }
            action = routes.get(path)
            if action is None:
                self._send_json(404, {"ok": False, "error": "not found"})
                return
            payload = self._read_payload()
            if payload is None:
                return
            root = self._target_root(payload)
            if root is None:
                return
            action(payload, root)

    Handler.hroot = hroot
    Handler.token = token
    Handler.verifier_timeout = verifier_timeout
    return Handler


def cmd_serve(hroot: Path, port: int, refresh_seconds: int,
              verifier_timeout: int) -> int:
    token = secrets.token_hex(16)
    handler = make_handler(hroot, token, refresh_seconds, verifier_timeout)
    try:
        server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    except OSError as exc:
        return err(f"cannot bind 127.0.0.1:{port}: {exc}")
    print(f"workstation: serving on http://127.0.0.1:{server.server_port}",
          flush=True)
    print(f"workstation: token {token}", flush=True)
    print("workstation: Ctrl+C to stop", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("workstation: stopped")
    finally:
        server.server_close()
    return 0


# --- cli ---------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=("Live localhost panel over the Handyman fleet registry. "
                     "Reads live harness state; mutations go through "
                     "scripts/feature.py."))
    parser.add_argument("--handyman-root", default=None,
                        help="Override the fleet root (else $HANDYMAN_ROOT, "
                             "else $HOME/HANDYMAN).")
    sub = parser.add_subparsers(dest="command", required=True)

    p_serve = sub.add_parser("serve", help="Start the workstation panel.")
    p_serve.add_argument("--port", type=int, default=8765,
                         help="Port on 127.0.0.1 (0 = ephemeral; default 8765).")
    p_serve.add_argument("--refresh-seconds", type=int, default=7,
                         help="Panel auto-refresh interval (default 7).")
    p_serve.add_argument("--verifier-timeout", type=int, default=300,
                         help="Seconds before an on-demand verifier run is "
                              "reported as timeout (default 300).")

    args = parser.parse_args(argv)
    hroot = handyman_root(args.handyman_root)

    if args.command == "serve":
        return cmd_serve(hroot, args.port, args.refresh_seconds,
                         args.verifier_timeout)
    return 2


if __name__ == "__main__":
    sys.exit(main())

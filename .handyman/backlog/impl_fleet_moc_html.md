---
feature: fleet_moc_html
status: implemented
role: implementer
updated: 2026-07-01
tags: [handyman/role/implementer, handyman/feature/fleet_moc_html]
---

# Implementation Report: fleet_moc_html

## Files Changed

- `handyman/scripts/fleet.py`: `moc --html` + `build_fleet_html()` — writes a
  self-contained `$HANDYMAN_ROOT/index.html` beside the Obsidian MOC: semantic
  table (project, version, textual BEHIND/OK drift label, per-status counts,
  live session, last closure), inline CSS only, `prefers-color-scheme` dark
  support, `html.escape` on every interpolated value.
- `handyman/references/fleet.md`: `moc [--html]` row updated.
- `tests/test_fleet.sh`: FL23 (default writes no HTML; `--html` emits DOCTYPE
  page with fleet rows, BEHIND label, and zero external refs/scripts).

## Design Notes

- Status semantics are textual (BEHIND/OK), never color-only — readable in
  monochrome and by screen readers; the page stays shareable as one file.
- index.md (Obsidian) remains the primary view; HTML is the outward-facing
  export, so no links into local workspaces are emitted there.

## Test Output

```text
bash tests/test_fleet.sh -> 23 run, 23 passed, 0 failed
```

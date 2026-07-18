---
feature: workstation_app_shell
status: implemented
role: implementer
updated: 2026-07-02
tags: [handyman/role/implementer, handyman/feature/workstation_app_shell]
---

# Implementation Report: workstation_app_shell

## Files Changed

- `handyman/scripts/workstation.py` — body restructured into an app shell: `<header class="appbar">` (wordmark + skill badge left, live `updated HH:MM:SS` pulse right, bottom border), nav styled as tabs with an active state (`render()` sets `aria-current="page"` — the harness detail counts as Fleet), pause toggle pushed to the tab bar's right, and a `<footer>` that now owns the registry path + skill version + the Ctrl+C hint (debug info out of the header). Overview table: the four count headers carry `class="num"` (right-aligned like their values) and zero cells render muted so real numbers pop. `fillTimeline` groups closures under one muted uppercase date heading per day (`.tl-date`) with indented items (`.tl-item`), so the date never repeats per line; `fmt.timelineEntry` drops the date prefix accordingly.
- `tests/test_workstation.sh` — new W20: appbar present, footer with `id="registry"`, `aria-current` wiring, `<th class="num">`, `tl-date` grouping, compact `"updated "` pulse and `"num muted"` zero styling.

## Design Notes

- Visually verified against the real registry (scratchpad `f83-fleet.png`, `f83-timeline.png`): active tab underline, aligned numeric columns with muted zeros, dated timeline groups, footer debug line.
- The generated ISO timestamp now shows only its time part in the header; the full registry path moved to the footer where debug info belongs.
- Chrome-headless capture flakiness was tamed with a reusable `capture.sh` (unique throwaway profile per run, crash reporter off, bounded poll, targeted kill).

## Test Output

```text
tests/test_workstation.sh: 20 run, 20 passed (new W20 green)
bash tests/run_tests.sh: ALL SUITES PASSED
```

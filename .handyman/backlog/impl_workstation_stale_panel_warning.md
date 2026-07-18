---
feature: workstation_stale_panel_warning
status: implemented
role: implementer
updated: 2026-07-02
tags: [handyman/role/implementer, handyman/feature/workstation_stale_panel_warning]
---

# Implementation Report: workstation_stale_panel_warning

## Files Changed

- `handyman/scripts/workstation.py` — the served page bakes `BAKED_VERSION` (the skill version at serve start) next to the session token; every `render()` compares it against the live `state.skill_version` from `/api/state` and, on mismatch, paints a textual `badge-warn` "panel outdated — restart serve to update" in the appbar `#stale` slot (cleared when versions agree).
- `tests/test_workstation.sh` — new W21: the served page carries the baked constant, the `!== BAKED_VERSION` comparison, the warning message and the `#stale` slot (structural: an in-process mismatch cannot fire, since the server bakes the same version it reports).

## Design Notes

- Root cause this closes: the panel HTML is built once at serve start, so a server left running across a skill upgrade silently serves the old UI — exactly the confusion hit with the long-lived `:8765` instance during the visual review.
- The check runs client-side on data the panel already fetches; no new endpoint, no server change.

## Test Output

```text
tests/test_workstation.sh: 21 run, 21 passed (new W21 green)
bash tests/run_tests.sh: ALL SUITES PASSED
```

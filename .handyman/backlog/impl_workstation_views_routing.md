---
feature: workstation_views_routing
status: implemented
role: implementer
updated: 2026-07-02
tags: [handyman/role/implementer, handyman/feature/workstation_views_routing]
---

# Implementation Report: workstation_views_routing

## Files Changed

- `handyman/scripts/workstation.py` — panel body restructured into `<nav>` (Fleet / Timeline links + the pause toggle) and three `<section>` views: `#view-fleet` (overview table slimmed to 8 columns — Project links to the detail via `#/harness/<name>`, a `N signal(s)` badge marks attention, Last closure/Verifier/Actions columns dropped), `#view-harness` (breadcrumb + `renderHarness`: identity line, Session with relative dates, Health signals, Queue grouped by status with count badges, `feature-request.md` draft state badge, `stageActions` grouped Intake/State/Verification and rendered state-first — Block only with pending/in_progress, Unblock only with blocked — plus a per-harness Timeline) and `#view-timeline` (cross-fleet audit via `fillTimeline`). Native `location.hash` router (`route()` + `hashchange` listener, no framework); `render()` toggles section visibility per route. Server side: additive `draft_state()` (`absent`/`pristine`/`filled` against the shipped template) attached per harness in `build_state` and `fresh_snapshot`; every pre-existing `/api/state` key untouched. Old `actionsCell`/`renderQueues`/`renderHealth` removed; `driftKind()`/`actionButton()`/`stageGroup()`/`healthList()`/`queueSection()` added; CSS for `nav`, `.stages`, `.stage`.
- `tests/test_workstation.sh` — new W18: the served page carries the three routes, `<nav>`, both view sections, no Verifier/Actions columns in the overview; `/api/state` walks the draft lifecycle absent → pristine (template copy) → filled (real content).

## Design Notes

- Routing is `location.hash` + one `render(route, state)` — deep links and back/forward are native, zero dependencies (ponytail rung 4; decision 3 of the analysis doc).
- State-first actions mirror the transitions `feature.py` already enforces: what is not eligible is not painted, instead of failing after the dialog (decision 4).
- The `draft` field is additive only; W2/W3 and all other suite cases pass unchanged, satisfying the backward-compatibility acceptance.
- Verifier results stay session-local per the existing limitation; they now render inside the detail view's Verification stage.

## Test Output

```text
tests/test_workstation.sh: 18 run, 18 passed (new W18 green)
bash tests/run_tests.sh: ALL SUITES PASSED
```

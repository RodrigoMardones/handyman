---
feature: workstation_views_routing
status: approved
role: reviewer
updated: 2026-07-02
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/workstation_views_routing]
---

# Review: workstation_views_routing

## Verdict

APPROVED   <!-- or CHANGES_REQUESTED -->

## Acceptance Criteria Verification

- [x] Criterion 1: GET / carries nav with three routes (#/fleet, #/timeline, #/harness/<name>); overview table links each project to detail view; Verifier and Actions columns dropped (W18 checks routes, nav, detail view, and confirms columns absent)
- [x] Criterion 2: Detail view consolidates queue-by-status, signals, per-harness timeline, draft state and stage-grouped actions rendered state-first (renderHarness + queueSection + healthList + stageActions + fillTimeline implementation verified; W18 lifecycle test: absent→pristine→filled)
- [x] Criterion 3: /api/state additive only; all existing keys retained (draft_state() returns {present, state} per harness in build_state + fresh_snapshot; W2/W3/W5-W16 all green unchanged with no column/key removals)
- [x] Criterion 4: Deterministic test W18 covers routes, nav sections, detail href target, absent/pristine/filled draft lifecycle
- [x] Criterion 5: bash tests/test_workstation.sh: 18 run, 18 passed; ./init.sh: ALL SUITES PASSED, verifier green

## Implementation Notes

- Native location.hash router (route() + hashchange) with no dependencies; deep links and back/forward native
- State-first action rendering: ineligible transitions omitted entirely, not presented then disabled (stageActions blockable/unblockable guards)
- draft_state() distinguishes absent/pristine/filled by comparing against shipped template
- HTML body restructured: <nav> (Fleet/Timeline links + pause toggle) + three <section> views (#view-fleet, #view-harness, #view-timeline)
- Fleet overview: 8-column thead (Project, Version, Drift, Pending, In progress, Done, Blocked, Session); detail view renders per-harness identity/session/health/queue/draft/actions/timeline
- Old actionsCell/renderQueues/renderHealth removed; new driftKind()/actionButton()/stageGroup()/healthList()/queueSection()/fillTimeline() added
- Backward-compatible: all existing suite cases (W2-W17) pass green with no changes

## Verifier Exit Code

0 (green gate)

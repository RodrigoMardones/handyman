---
type: Review Log
feature: web_harness_active_first
status: approved
role: reviewer
actor: reviewer-copilot-run73
updated: 2026-07-20
tags: [handyman/backlog/review, handyman/feature/web_harness_active_first]
---

# Review: web_harness_active_first

APPROVED

## Verdict

Feature 73 satisfies its current acceptance contract. The page server component
owns the contextual header, breadcrumb, H1, sole `Add feature` CTA, and runner
placement before the live region. The live renderer starts with the actionable
queue, keeps active statuses complete, bounds Done deterministically, and no
longer generates a duplicate heading. No product or test files were edited by
this review.

## Criteria

- **Ownership: PASS.** `page.tsx` renders `Fleet / <harness>`, one H1 and one
  `Add feature` link before `RunPanel` and `HarnessLive`. `AddFeatureForm` is not
  imported or mounted. `renderHarnessHtml` emits no H1/header duplicate.
- **Runner placement and states: PASS.** `RunPanel` precedes `HarnessLive`.
  Enabled with no pending features renders compact `No work ready` copy without
  a second CTA or feature select. Disabled mode remains explicit; the full path
  retains engine selection, start/stop/resume, status, log and run history.
- **Queue and Done: PASS.** Queue precedes Workspace, Docs and Knowledge graph.
  Pending, in-progress and blocked items remain complete. Empty actionable
  columns receive the compact modifier. Done preserves the real count, renders
  at most the five highest ids in deterministic order, puts null ids last, and
  links the escaped total to same-origin `/timeline` Activity.
- **Security and accessibility: PASS.** Dynamic string-renderer values pass
  through `esc`; React text is escaped by JSX; graph names use
  `encodeURIComponent`; there are no generated inline handlers, scripts or
  external targets. Touched CSS uses existing color tokens, visible focus
  styles and 24/44 px minimum targets. Landmarks, headings, labels and live
  status semantics remain present.
- **Tests and gates: PASS.** The tests exercise real renderer output and a real
  local Next server with fixture runner processes. No real agent, LLM or
  external network is used. The full suite registration includes the focused
  harness, runner and feature-write coverage.

## Quality

- The implementation follows the existing server-component plus pure escaped
  renderer boundary and introduces no dependency or new data-fetch path.
- Sorting copies the Done input before ordering, avoiding mutation of state.
- The supplied independent Playwright evidence is consistent with the code and
  gates: desktop and mobile each expose one `Add feature`, preserve first-view
  ordering, show no overlaps, keep the harness at clientWidth=scrollWidth, and
  compact empty columns. The pre-existing global mobile nav overflow is outside
  feature 73 by explicit acceptance.
- Non-blocking cleanup: `RunPanel.module.css` retains an unused `.emptyAction`
  mobile rule after removing the empty-state CTA. It has no rendered effect and
  does not alter the verdict.

## Evidence

- `bash tests/test_web_harness.sh` -> 14/14 passed.
- `bash tests/test_web_run.sh` -> 25/25 passed.
- `./init.sh` -> exit 0, `status: ok`; expected worklist advisory while feature
  73 remains the sole `in_progress` item.
- `bash tests/run_tests.sh` -> `ALL SUITES PASSED`; `test_web_feature.sh` 13/13.
- Protocol-literal `find scripts tests -name '*.sh' | xargs shellcheck -S warning`
  reports only that the migrated-away root `scripts/` directory is absent.
  Effective documented scope `find handyman/scripts tests -name '*.sh' -print0
  | xargs -0 shellcheck -S warning` -> exit 0 with no findings.
- VS Code diagnostics for the reviewed TSX, TypeScript, CSS and shell tests ->
  no errors. Targeted raw-color scan and `git diff --check` -> clean.
- Independent viewport evidence from the leader: 1440x900 and 390x844 both
  have one CTA, correct H1/runner/Queue vertical order, no overlaps, and no
  harness-container horizontal overflow; desktop empty columns are 58 px versus
  544 px for Done.

## Required Changes

None.
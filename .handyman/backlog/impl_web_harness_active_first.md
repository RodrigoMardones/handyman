---
type: Implementation Log
feature: web_harness_active_first
status: implemented
role: implementer
actor: implementer-copilot-run73
updated: 2026-07-20
tags: [handyman/backlog/impl, handyman/feature/web_harness_active_first]
---

# Implementation: web_harness_active_first

## Summary

The harness detail now places the server-rendered context and runner before the
live archive. The header is the only Add feature entry point, the enabled runner
collapses to an explanatory No work ready state when no pending feature exists,
empty actionable columns stay compact, and Done remains a deterministic
five-item window over the full Activity history.

## Visual fix round 1

Visual evidence from the first implementation showed two regressions: desktop
rendered a second Add feature action inside the enabled empty RunPanel and let
empty Pending/Blocked columns stretch to Done's height; mobile repeated the CTA
and consumed too much of the first viewport.

This round applies the updated acceptance criteria without touching global
navigation:

- `RunPanel` no longer accepts `addFeatureHref`. Its enabled/no-pending branch
  renders No work ready plus its explanation, with no link and no select.
- `renderHarnessHtml` adds `kanban__column--empty` deterministically when
  pending, in_progress, or blocked has zero cards. Done never receives the
  modifier, including an empty Done column.
- Empty actionable columns retain their header and count but opt out of grid
  stretch with `align-self: start`; their empty list contributes no height.
- Focus behavior, disabled-runner messaging, and full runner controls remain
  unchanged. The global `.nav` overflow remains out of scope for
  `web_shared_navigation`.

## Files changed

- `apps/web/app/harness/[name]/page.tsx`: owns the breadcrumb, H1, primary Add
  feature link, and RunPanel placement before HarnessLive; removes the
  AddFeatureForm import and render.
- `apps/web/app/harness/harnessHtml.ts`: removes the duplicate generated header,
  puts Queue before Workspace/Docs/Knowledge graph, and caps Done at the five
  highest ids with null ids last, total count preserved, and Activity link.
- `apps/web/components/RunPanel.tsx`: enabled runners with no pending work render
  No work ready plus an explanation, with no duplicate action or empty select.
  The unused `addFeatureHref` prop is removed; disabled and full-control paths
  are unchanged.
- `apps/web/components/RunPanel.module.css`: removes the deleted empty-state CTA
  rules and keeps the explanatory state compact using existing tokens.
- `apps/web/app/harness/[name]/page.module.css`: styles the contextual header and
  action bar, protects responsive wrapping, and makes empty actionable queue
  columns compact on desktop and mobile.
- `tests/test_web_harness.sh`: covers React header ownership, CTA, absence of
  AddFeatureForm, empty RunPanel without action/select, page ordering, Queue
  ordering, empty-column modifiers/CSS, and an eight-Done fixture capped to five
  in descending id order with total and Activity link.
- `tests/test_web_run.sh`: covers the runner-enabled zero-pending HTML state,
  exactly one page Add feature link, and absence of a RunPanel CTA/select.
- `tests/test_web_feature.sh`: updates the feature 60 composition assertions for
  the deliberate single-entry design while retaining all API, guard, and legacy
  component checks.

## Design decisions

- The page Server Component owns stable context; HarnessLive owns only data that
  changes with SSE. This avoids duplicate H1/header markup after refreshes.
- RunPanel stays a React sibling outside the generated live region. No new state,
  dependency, polling path, or renderer import was introduced.
- Done sorting copies the input before sorting, compares numeric ids descending,
  places null ids last, and uses feature name only as a deterministic tie-breaker.
- The disabled runner still shows its opt-in explanation even when the queue is
  empty. The compact No work ready state applies only when the runner is enabled.
- Global navigation and the broader vocabulary migration remain out of scope.

## Verification

- Baseline before Visual fix round 1: `./init.sh` -> exit 0;
  `bash tests/test_web_harness.sh` -> 14/14 passed, confirming the existing suite
  did not capture the visual regressions.
- New assertions before implementation: 12/14 passed. The two failures named the
  duplicated empty RunPanel action/select contract and missing empty-column
  modifier/CSS contract.
- `bash tests/test_web_harness.sh` -> 14/14 passed.
- `bash tests/test_web_run.sh` -> 25/25 passed.
- `pnpm --filter @handyman/web typecheck` -> exit 0.
- `pnpm --filter @handyman/web build` -> exit 0. Next emitted the existing NFT
  tracing warning for the dynamic runner loader; compilation and TypeScript both
  completed successfully.
- VS Code diagnostics for all touched source, CSS, and test files -> no errors.
- Chrome CDP at 390x844: `.harness` clientWidth/scrollWidth = 390/390; one Add
  feature link; H1, CTA, and runner bottom edges = 157/229/383 px, all in the
  first viewport with no overlap. Document overflow = 772/390 from global nav,
  explicitly outside this feature.
- Chrome CDP at 1440x900: `.harness` clientWidth/scrollWidth = 1200/1200; one Add
  feature link; H1, CTA, and runner all end by y=306 with no overlap. Empty
  Pending/Blocked columns = 58 px while normal Done = 544 px.
- Final `bash tests/run_tests.sh` -> ALL SUITES PASSED, exit 0.
- Protocol-literal `find scripts tests -name '*.sh' | xargs shellcheck -S warning`
  reports the migrated-away root `scripts/` directory as absent. The effective
  documented scope, `find handyman/scripts tests -name '*.sh' -print0 | xargs -0
  shellcheck -S warning`, passes with exit 0 and no findings.
- Final `./init.sh` -> exit 0. Discovery and worklist advisories are expected and
  non-blocking while feature 73 remains the sole in_progress feature.
- Final Markdown/link validation, diff check, and cache-artifact marker scan pass
  after this report update.

## Limits

- Playwright was not installed as a callable workspace module, so the requested
  viewport checks used installed Chrome headless through CDP against the compiled
  Next app. The measured DOM contract is equivalent for size/overflow/overlap.
- The feature status, progress files, global navigation, and review/closure state
  were not edited by this implementation.
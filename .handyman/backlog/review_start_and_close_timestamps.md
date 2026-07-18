---
feature: start_and_close_timestamps
status: approved
role: reviewer
updated: 2026-07-17
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/start_and_close_timestamps]
---

# Review: start_and_close_timestamps

## Verdict

APPROVED

## Stage 1: Spec Compliance

- [x] Every acceptance criterion is satisfied:
  - `feature.js start` records an exact ISO 8601 start timestamp (`meta.started_at`).
  - `feature.js done` records an exact ISO 8601 close timestamp (`meta.done_at`).
  - `sprint.js close` records the sprint close timestamp (`closed_at` in the derived document).
  - The schema change is backward-compatible at draft-07 level: `meta` is optional and `additionalProperties:false` is preserved on both `feature` and `meta`, so existing feature_list documents still validate and invented keys are rejected.
  - `bash tests/run_tests.sh` passes (ALL SUITES PASSED).
- [x] The change stays inside the declared scope (featureList/schema/feature/sprint + schemas + tests).
- [x] The implementation report exists and matches what changed.

## Stage 2: Code Quality

- [x] Architecture respected — feature state machine stays four-state; exact moments live in an optional `meta` object; sprint doc stays derived (single source of truth).
- [x] Conventions respected — ISO 8601 `pattern` used instead of `format: "date-time"` (matches every other field in the schemas; avoids Ajv stderr noise); `stampMeta` preserves sibling keys; `split/join`/literal patterns honored.
- [x] Tests meaningful and green — new vitest schema cases + F26/F27/S12 shell cases assert presence, ISO format, and that `done_at != started_at`; doc-schema checks pin the contract.
- [x] Verifier exits 0 — `npm run typecheck`=0, `npm run build`=0, `bash init.sh`=0.

## Required Changes

_None._

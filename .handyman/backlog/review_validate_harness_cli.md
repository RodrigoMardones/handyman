---
feature: validate_harness_cli
status: approved
role: reviewer
updated: 2026-07-16
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/validate_harness_cli]
---

# Review: validate_harness_cli

## Verdict

APPROVED   <!-- or CHANGES_REQUESTED -->

## Stage 1: Spec Compliance

_Review the change against the feature request and its acceptance criteria first. A Stage 1 failure ends the review: report CHANGES_REQUESTED without moving to Stage 2, so spec drift is never buried under style feedback._

- [x] Every acceptance criterion is satisfied
- [x] The change stays inside the feature's declared scope
- [x] The implementation report exists and matches what changed

## Stage 2: Code Quality

_Only after Stage 1 passes._

- [x] Architecture respected
- [x] Conventions respected
- [x] Tests meaningful and green
- [x] Verifier exits 0

## Required Changes

_None required for merge._ One documented, non-blocking divergence (same category as #14 evals):

- **Schema-error wording**: two parity scenarios (`invalid status`, extra feature field) diverge only in the jsonschema-vs-ajv error message text (e.g. `'X' is not one of [...]` vs `must be equal to one of the allowed values`; `Additional properties are not allowed` vs `must NOT have additional properties`) and a leading `/` on the instance path. The oracle (`tests/test_init.sh` T13/T14) asserts only the `schema violation` prefix, which the port reproduces exactly. Tracked for the eventual cutover; not a blocker.

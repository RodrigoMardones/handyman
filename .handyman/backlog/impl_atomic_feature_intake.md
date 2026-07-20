---
type: Implementation Log
feature: atomic_feature_intake
status: implemented
role: implementer
updated: 2026-06-24
tags: [handyman/role/implementer, handyman/feature/atomic_feature_intake]
---

# Implementation Report: atomic_feature_intake (mitigation E)

## Files Changed

- `references/workflow.md` — Leader Protocol step 4 now requires turning the
  filled `feature-request.md` form into a feature entry via `scripts/feature.py
  add` (which writes only the contract keys), and explicitly forbids hand-editing
  `feature_list.json` "which is how out-of-contract keys such as date fields creep
  in".

## Design Notes

- Closes the intake side of root cause 3.5: the atomic CLI builds only
  `id`/`name`/`title`/`description`/`acceptance`/`status`, so invented fields
  cannot enter at the source. Reinforces Bootstrap Protocol step 7 (mitigation A)
  and is enforced downstream by the live schema gate (mitigation C).

## Acceptance Criteria

- [x] references/workflow.md (Leader Protocol) directs using `scripts/feature.py add` for intake instead of editing the JSON by hand
- [x] `bash tests/run_tests.sh` passes
- [x] token budgets and markdown-link test intact

## Test Output

```text
./init.sh -> EXIT=0
  PASS all relative markdown links resolve
ALL SUITES PASSED
VERIFIER: all gates passed
```

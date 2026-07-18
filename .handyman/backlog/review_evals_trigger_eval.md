---
feature: evals_trigger_eval
status: approved
role: reviewer
updated: 2026-07-16
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/evals_trigger_eval]
---

# Review: evals_trigger_eval

## Verdict

APPROVED   <!-- or CHANGES_REQUESTED -->

## Stage 1: Spec Compliance

_Review the change against the feature request and its acceptance criteria first. A Stage 1 failure ends the review: report CHANGES_REQUESTED without moving to Stage 2, so spec drift is never buried under style feedback._

- [x] Every acceptance criterion is satisfied
  - validate/measure CLI contract replicated (subcommands, flags, exit 0/1/2).
  - `core/formatHalfEven` used for all `:.2f`; `ajv` for `trigger_eval.schema.json`.
  - `structuralProblems` reproduced (empty, non-object, unexpected keys, empty/dup query, non-boolean, min-per-class).
  - measure reproduces shlex.split, NOTE degradation (no runner / unavailable runner via `which`), confusion matrix, accuracy, mean_rate/stddev, pass@k.
  - test_evals.sh repointed to node dist/evals.js, 0 edited assertions, suite green.
  - evals.py deleted; references + pinned test_docs.py assertions updated.
- [x] The change stays inside the feature's declared scope (no unrelated edits).
- [x] The implementation report exists and matches what changed.

## Stage 2: Code Quality

_Only after Stage 1 passes._

- [x] Architecture respected (reuses core: formatHalfEven; standalone module; entry guard mirrors metrics.ts/feature.ts).
- [x] Conventions respected (biome lint exit 0; 23 noNonNullAssertion warnings = known debt parity with feature.ts).
- [x] Tests meaningful and green (8/8 evals + full run_tests.sh ALL PASSED + parity byte-identical 8/8 scenarios Python vs Node).
- [x] Verifier exits 0 (init.sh exit 0 in checkout principal; feature.js done dogfood closed #14).

## Required Changes

_None. Two non-blocking parity notes documented in the impl report:_

1. _stdout/stderr interleave order under `2>&1` redirect differs (Python block-buffers stdout) — not asserted by the oracle._
2. _schema error message phrasing (jsonschema Draft7 vs ajv) differs; structuralProblems already gates the deterministic contract so test T5 passes._

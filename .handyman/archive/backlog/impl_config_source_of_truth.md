---
type: Implementation Log
feature: config_source_of_truth
status: implemented
role: implementer
updated: 2026-06-24
tags: [handyman/role/implementer, handyman/feature/config_source_of_truth]
---

# Implementation Report: config_source_of_truth (mitigation B)

## Files Changed

- `references/anatomy.md` — two edits:
  - Required Core Files: the `harness.config.json` row now calls it the
    **canonical** bridge file and notes the `feature_list.json` `config` block
    mirrors it.
  - Feature List Contract: the config bullet now states the block is an optional
    **mirror** of `harness.config.json`, to be kept in sync, and documents the
    resolution precedence (`harness.config.json` -> `feature_list.json config` ->
    `.handyman/` -> legacy `PROJECT_ROOT`) as implemented by `validate_harness.py`.

## Design Notes

- Closes root cause 3.2 (two sources of truth). Rather than removing the mirror
  — which would break `scaffold.sh` version-stamping into `feature_list.json` and
  the T12 test that asserts `.config.harness_version` — the docs name the
  canonical source and the precedence so the redundancy is unambiguous.
- Doc-only; no template change (the `config` block must stay for stamping).

## Acceptance Criteria

- [x] anatomy.md declares harness.config.json canonical and the feature_list.json config block an optional mirror
- [x] documents the HARNESS_WORKSPACE resolution precedence
- [x] `bash tests/run_tests.sh` passes
- [x] token budgets and markdown-link test intact

## Test Output

```text
./init.sh -> EXIT=0
  PASS all relative markdown links resolve
ALL SUITES PASSED
VERIFIER: all gates passed
```

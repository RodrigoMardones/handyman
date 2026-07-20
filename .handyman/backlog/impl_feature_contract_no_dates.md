---
type: Implementation Log
feature: feature_contract_no_dates
status: implemented
role: implementer
updated: 2026-06-24
tags: [handyman/role/implementer, handyman/feature/feature_contract_no_dates]
---

# Implementation Report: feature_contract_no_dates (mitigation D)

## Files Changed

- `references/anatomy.md` — Feature List Contract: the `features` bullet now
  enumerates the exact valid keys and states a feature carries **no dates**
  (schema `additionalProperties: false` rejects others); a new rule explains
  that a feature is a state machine, not a timeline, and that chronology lives
  in `progress/` (`current.md` `Start`, `history.md` `## YYYY-MM-DD`).

## Design Notes

- **Doc-only on purpose.** The template `assets/feature_list.template.json` is
  JSON (no comments) and already carries no dates, so the explicit statement
  belongs in `anatomy.md`. Mitigation C *enforces* the contract at the verifier;
  D *explains* it so models stop inventing date fields in the first place
  (belt-and-suspenders for root cause 3.4).
- Pointed the reader to `scripts/feature.py add` as the intake that only writes
  contract keys, which dovetails with mitigation E.

## Acceptance Criteria

- [x] anatomy.md Feature List Contract enumerates the valid feature keys and declares features carry no dates
- [x] clarifies chronology lives in `progress/` (current `Start` + history dates)
- [x] `bash tests/run_tests.sh` passes
- [x] token budgets and markdown-link test intact (SKILL 996/1000, AGENTS 249/250, links resolve)

## Test Output

```text
./init.sh -> EXIT=0
  PASS all relative markdown links resolve
  PASS SKILL.md stays within 1000 words (996)
ALL SUITES PASSED
VERIFIER: all gates passed
```

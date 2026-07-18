---
feature: business_interview_contract
status: implemented
role: implementer
updated: 2026-06-25
tags: [handyman/role/implementer, handyman/feature/business_interview_contract]
---

# Implementation Report: business_interview_contract (Mitigación C)

## Files Changed

- `references/anatomy.md`:
  - **Required Core Files** — `docs/business.md` row: now declares the doc is
    "populated through a **mandatory user interview during bootstrap**, not
    inferred from code" (the domain lives in the user's head), linking to the
    Bootstrap Protocol in `workflow.md`.
  - **Verification Contract** — new item 8: optional advisory checks emit `NOTE:`
    (never change exit code) for a missing version stamp, a stale graph, or a
    `docs/business.md` that still matches the starter template — signaling the
    bootstrap business interview was skipped.

## Design Notes

- C documents the **contract**; the runtime advisory is implemented separately in
  D (`assets/init.template.sh`). Item 8 names the advisory so the contract and the
  implementation stay in sync.
- Link to `workflow.md` (not a not-yet-existing anchor) so T2 stays green and the
  forward reference to B's interview step degrades gracefully.

## Acceptance Mapping

1. anatomy.md declares business.md is interview-populated, not inferred → business.md row.
2. Verification Contract mentions the unfilled-business.md advisory → item 8.
3. `bash tests/run_tests.sh` passes → verifier exit 0; links + budgets green.

## Test Output

```text
VERIFIER_EXIT=0
  PASS all relative markdown links resolve
  PASS SKILL.md stays within 1000 words (997)
```

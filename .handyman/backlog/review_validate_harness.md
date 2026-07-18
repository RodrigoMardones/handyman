---
feature: validate_harness
status: approved
role: reviewer
updated: 2026-06-17
tags: [handyman/review/approved, handyman/role/reviewer]
---

# Review — validate_harness

## Verdict

APPROVED

## Checks

- **Acceptance:** all six criteria in `feature_list.json` are met with evidence
  in `backlog/impl_validate_harness.md`.
- **Verifier:** `./init.sh` exits 0; the new `==> validate` gate is blocking and
  reports `validate: OK`.
- **Tests:** `bash tests/run_tests.sh` → all suites green (test_docs 26,
  test_init 9 incl. T8–T11, test_update 7).
- **Conventions:** validator mirrors the documented resolution order and the
  existing bash checks in `init.sh`; gap reports go to stderr, success to stdout,
  matching the verifier's style.
- **Scope:** change is contained to the script + verifier wiring + tests; no
  product/docs drift. `init.template.sh` / `init.reference.sh` correctly left
  unchanged since the validator is optional support.
- **Security:** validator only reads files and parses JSON; no execution of
  ingested content. No secrets introduced.

## Required changes

None.

APPROVED -> backlog/review_validate_harness.md

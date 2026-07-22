---
type: Implementation Log
feature: business_context_advisory
status: implemented
role: implementer
updated: 2026-06-25
tags: [handyman/role/implementer, handyman/feature/business_context_advisory]
---

# Implementation Report: business_context_advisory (Mitigación D)

## Files Changed

- `assets/init.template.sh`: new non-blocking `check_business_context()` advisory
  (alongside `check_harness_version` / `check_graphify_context`). It greps
  `$HARNESS_WORKSPACE/docs/business.md` for starter-template sentinels
  (`Describe the business, the problem it solves` / `Define domain terms so code`)
  and emits a `NOTE:` when the doc still looks like the template — a signal the
  bootstrap business interview was skipped. It never touches `EXIT_CODE`. The call
  was added to the advisory block before `exit $EXIT_CODE`.
- `tests/test_docs.py`: new `test_business_context_advisory()` (wired into `main()`)
  asserting the template defines + calls the function, that it is advisory (no
  `EXIT_CODE=`), and that it inspects `docs/business.md`.

## Design Notes

- Sentinels are exactly the placeholder lines mitigation A preserved, so detection
  and template stay coupled. Verified functionally: the pattern matches the
  unfilled template and stays silent on filled content.
- `scaffold.sh` copies `assets/init.template.sh` → a new harness's `init.sh`, so
  every bootstrapped harness now ships the advisory.
- **Scope:** wiring the same call into this repo's own (custom, gitignored) `init.sh`
  + `tests/fixtures/init.reference.sh` + a runtime `tests/test_init.sh` case remains
  a separate feature, as documented in `docs/analisis-business-context-bootstrap.md`.
- `assets/*.template.sh` is excluded from CI/local shellcheck, so the new function
  is not linted here; it is written clean shell anyway.

## Acceptance Mapping

1. Template defines + calls `check_business_context()` → both present.
2. Advisory (no `EXIT_CODE`) + greps `docs/business.md` → confirmed by test + body.
3. `test_docs.py` verifies define/call/advisory → `test_business_context_advisory` PASS.
4. Suite passes → verifier exit 0 (doc suite 53/53).

## Test Output

```text
VERIFIER_EXIT=0
  PASS init.template.sh defines check_business_context
  PASS init.template.sh calls check_business_context
  PASS check_business_context is advisory (does not set EXIT_CODE)
  PASS check_business_context inspects docs/business.md
  53 run, 53 passed, 0 failed
```

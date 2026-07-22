---
type: Implementation Log
feature: live_schema_validation
status: implemented
role: implementer
updated: 2026-06-24
tags: [handyman/role/implementer, handyman/feature/live_schema_validation]
---

# Implementation Report: live_schema_validation (mitigation C)

## Files Changed

- `scripts/validate_harness.py` — added `check_schema()` (+ `_feature_list_schema_path()` helper) and wired it into `validate()`.
- `tests/test_init.sh` — added T13 (extra field rejected) and T14 (contract-complete passes), both guarded by jsonschema availability.
- `references/anatomy.md` — Verification Contract: new check #5 (live feature_list validates against the schema; renumbered tests/optional to 6/7).
- `references/checklists.md` — Analysis Checklist item (schema conformance) + Common Risks row ("Out-of-contract fields").

## Design Notes

- **Where the gate lives.** The root `init.sh` already runs `validate_harness.py`
  via `run_phase "validate" check_structure`, so wiring the schema check inside
  `validate_harness.py` makes it a real blocking gate without touching the verifier
  shell. This closes root cause 3.3: previously the schema (`additionalProperties:
  false`) only ran against templates in `test_docs.py`, never against the live
  `feature_list.json`.
- **Graceful degradation.** `check_schema()` prints a `NOTE` and skips when
  `jsonschema` is not importable OR the schema file is unreachable, mirroring the
  `test_docs.py` pattern. This keeps installed target repos (which do not ship
  `assets/schemas/`) from being blocked, while the skill repo and CI (where both
  are present) get full enforcement.
- **Schema path.** `_feature_list_schema_path()` resolves relative to the script
  (`Path(__file__).resolve().parent.parent / assets/schemas/...`), not to `--root`,
  so even a temp fixture under `--root` is validated against the real schema.
- **Why not `init.template.sh`.** The template verifier does not invoke
  `validate_harness.py` (the script is optional support and is not scaffolded into
  target repos), so adding a schema step there would be dead code. Deliberately
  left unchanged; the enforcement lives where the script is actually run.

## Acceptance Criteria

- [x] validate_harness.py validates the live feature_list.json and exits !=0 on an extra field (T13: `start_date` rejected with "schema violation")
- [x] degrades with NOTE (non-blocking) when jsonschema or the schema is unavailable (import/try guards + tests guarded by `python3 -c import jsonschema`)
- [x] tests/test_init.sh covers the extra-field rejection (T13) and a positive path (T14)
- [x] references/anatomy.md + references/checklists.md document the live schema validation
- [x] `bash tests/run_tests.sh` passes

## Test Output

```text
./init.sh -> EXIT=0
  PASS validate_harness: extra feature field rejected by schema
  PASS validate_harness: contract-complete feature_list passes schema
  Summary: test_init 12/12
  PASS all relative markdown links resolve
ALL SUITES PASSED (test_docs + test_init 12 + test_update 7 + test_feature 9 + test_upgrade 10)
VERIFIER: all gates passed
```

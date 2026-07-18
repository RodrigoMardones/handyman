---
feature: sprint_schema
status: implemented
role: implementer
updated: 2026-07-15
tags: [handyman/role/implementer, handyman/feature/sprint_schema]
---

# Implementation Report: sprint_schema

## Files Changed

- `handyman/assets/schemas/feature_list.schema.json`: `sprint` (string, pattern `^\d{4}-SP\d+$`) in the `feature` definition; `current_sprint` (nullable string, same pattern) in the `config` definition. `additionalProperties:false` intact, neither key required.
- `handyman/assets/schemas/harness.config.schema.json`: `current_sprint` in top-level properties, optional.
- `handyman/assets/{feature_list,harness.config.local,harness.config.global}.template.json`: sentinel `"current_sprint": null`.
- `tests/test_docs.py`: new `test_sprint_config()` (12 checks) wired in `main()` after `test_discovery_config`.

## Design Notes

- Schema-first because `additionalProperties:false` rejects undeclared keys — exact mirror of `harness_version` (feature 5) and `discovery` (features 33/49).
- `sprint` is a partition label, not a date: feature 11 rule (state machine, not timeline) intact.
- `current_sprint` nullable: `null` = no sprint open (resting sentinel in templates).
- Legacy files without labels keep validating (both keys optional).

## Test Output

```text
tests/test_docs.py: 168 run, 168 passed, 0 failed (12 new sprint checks)
./init.sh -> EXIT 0
```

---
type: Implementation Log
feature: json_schema
status: done
role: implementer
updated: 2026-06-17
tags: [handyman/feature/done, handyman/role/implementer]
---

# Implementation Report — json_schema

Formal JSON Schema (draft-07) contracts for the two state/config files, plus a
test that validates the shipped templates against them. Closes gap A4 from
`docs/analisis-iteraciones.md`: T1 previously only checked that templates parse,
not that they honor the contract.

## Changes

- **`assets/schemas/feature_list.schema.json`** (new): draft-07 contract for
  `feature_list.json` — `project`/`features` required, `config` (install_mode
  enum, paths), `rules` (valid_status enum), and `feature` shape (id/name/status
  required, status enum). `additionalProperties: false` throughout.
- **`assets/schemas/harness.config.schema.json`** (new): draft-07 contract for
  `harness.config.json` — install_mode enum, project/workspace paths,
  `handyman_root` nullable, and `models`/`tools` maps requiring the four roles
  (leader, implementer, reviewer, explorer).
- **`tests/test_docs.py`**: new `test_json_schemas()` — schemas exist, parse,
  declare draft-07; with `jsonschema` present it runs `Draft7Validator.check_schema`
  and validates `feature_list.template.json` + both `harness.config.*.template.json`
  against their schema. Degrades gracefully (parse + draft-07 checks only, with a
  NOTE) when `jsonschema` is absent, keeping the verifier deterministic locally.
- **`.github/workflows/ci.yml`**: added an `Install test dependencies` step
  (`pip install jsonschema`) to the `tests` job so full validation runs in CI.
- **`references/anatomy.md`**: listed `assets/schemas/*.schema.json` under
  Optional Support Files, beside `validate_harness`.

## Acceptance evidence

| Criterion | Result |
|-----------|--------|
| `feature_list.schema.json` exists + valid draft-07 | PASS (`check_schema` green) |
| `harness.config.schema.json` exists + valid draft-07 | PASS (`check_schema` green) |
| test_docs.py validates the templates against schemas | PASS (3 template-conformance checks green) |
| `bash tests/run_tests.sh` passes | PASS (37 + 9 + 7 all green) |

## Notes

- `jsonschema 4.25.1` installed locally to demonstrate full validation; CI pins
  it via the new install step. The graceful-degradation path means a missing dep
  warns but never fails `./init.sh`.
- Templates intentionally do NOT carry a `$schema` key: the schemas use
  `additionalProperties: false`, which would otherwise reject it. Editors can
  associate the schema via settings instead.

done -> backlog/impl_json_schema.md

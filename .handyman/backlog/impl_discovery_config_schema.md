---
type: Implementation Log
feature: discovery_config_schema
status: implemented
role: implementer
updated: 2026-06-26
tags: [handyman/role/implementer, handyman/feature/discovery_config_schema]
---

# Implementation Report: discovery_config_schema

Plan A of `docs/analisis-tool-discovery.md`: add the optional global `discovery`
block to the config contract. Mirror of feature 5 (`harness_versioning`).

## Files Changed

- `handyman/assets/schemas/harness.config.schema.json` — new `discovery` property
  (`$ref` to a new `discovery` definition: `{ skills, mcp }`, each an array of
  unique non-empty strings, `additionalProperties:false`). Kept OUT of `required`
  and the root stays `additionalProperties:false`.
- `handyman/assets/schemas/feature_list.schema.json` — `discovery` added to the
  `config` properties + a top-level `discovery` definition (same shape).
- `handyman/assets/harness.config.local.template.json`,
  `handyman/assets/harness.config.global.template.json` — sentinel
  `"discovery": { "skills": [], "mcp": [] }` after `tools`.
- `handyman/assets/feature_list.template.json` — `"discovery": { "skills": [], "mcp": [] }`
  in the `config` block.
- `tests/test_docs.py` — new `test_discovery_config()` (registered in `main()`).

## Design Notes

- **Global, not per-role.** Skills/MCPs are mostly cross-role; a per-role map would
  be premature complexity. The block is a sibling of `models`/`tools`.
- **Schema-first because of `additionalProperties:false`.** Both config objects
  reject unknown keys, so the new `discovery` key MUST be declared in the schema or
  the templates stop validating — exactly the constraint that sealing
  `harness_version` hit. Declared, but kept optional (outside `required`) so legacy
  harnesses still validate.
- **Scaffold unchanged.** `scaffold.sh` copies the templates verbatim, so the
  sentinel block ships automatically; no scaffold logic touched.
- **Test has teeth.** With `jsonschema` present, `test_discovery_config` asserts an
  unknown key inside `discovery` is rejected (proves `additionalProperties:false`
  works); it degrades with a NOTE when `jsonschema` is absent (same pattern as
  `test_json_schemas`).

## Test Output

```text
$ python3 tests/test_docs.py | grep discovery
  PASS harness.config schema declares discovery
  PASS discovery stays optional in harness.config schema
  PASS discovery definition lists skills and mcp
  PASS discovery rejects unknown keys (additionalProperties:false)
  PASS feature_list config schema declares discovery
  PASS template 'harness.config.local.template.json' carries a discovery block
  PASS template 'harness.config.global.template.json' carries a discovery block
  PASS feature_list template config carries discovery
  PASS an unknown key inside discovery is rejected
  99 run, 99 passed, 0 failed
$ ./init.sh -> ALL SUITES PASSED / VERIFIER: all gates passed
```

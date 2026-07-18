---
feature: discovery_agents_schema
status: implemented
role: implementer
updated: 2026-07-01
tags: [handyman/role/implementer, handyman/feature/discovery_agents_schema]
---

# Implementation Report: discovery_agents_schema

Plan A of `docs/analisis-tool-discovery-referencias.md`. Schema-first: the
`discovery` block is `additionalProperties:false`, so `agents` must be declared in
the schema before any harness can write it (mirror of `harness_version`, feature 5).

## Files Changed

- `handyman/assets/schemas/harness.config.schema.json` — `discovery` definition now
  declares `agents` (array of unique strings), beside `skills`/`mcp`.
- `handyman/assets/schemas/feature_list.schema.json` — same `agents` key in its
  `discovery` definition.
- `handyman/assets/harness.config.local.template.json`,
  `harness.config.global.template.json`, `feature_list.template.json` — sentinel
  `"agents": []` added to the discovery block.
- `tests/test_docs.py` — `test_discovery_config` now asserts `agents` in both schema
  definitions and in all three templates.

## Design Notes

- `agents` stays **optional** (out of `required`) and keeps
  `additionalProperties:false`, so a legacy harness with no `agents` still validates.
- No `scaffold.sh` change: it copies the templates verbatim, so the new key travels
  on its own (same as skills/mcp in feature 33).
- The dogfood `harness.config.json` will declare real agents in Feature B (where
  `check` verifies them); this feature only lands the contract.

## Test Output

```text
$ ./init.sh   # EXIT=0 - ALL SUITES PASSED
test_docs test_discovery_config: agents asserted in both schemas + 3 templates
```

---
type: Implementation Log
feature: tools_discovery_declare
status: implemented
role: implementer
updated: 2026-07-01
tags: [handyman/role/implementer, handyman/feature/tools_discovery_declare]
---

# Implementation Report: tools_discovery_declare

## Files Changed

- `handyman/scripts/tools_discovery.py` — new `declare <skill|mcp|agent> NAME [--dry-run]` subcommand: `_DECLARE_KEYS` maps kind→discovery list; `cmd_declare` does a json round-trip on `harness.config.json` (indent=2, preserves key order), creates the sentinel `{skills:[],mcp:[],agents:[]}` block when absent, rejects duplicates (exit 1, no write), validates the RESULT against `assets/schemas/harness.config.schema.json` BEFORE writing (self-locating `_config_schema_path`, graceful NOTE when jsonschema missing — mirror of validate_harness), and `--dry-run` prints a difflib unified diff without writing (mirror of upgrade_harness). Docstring: Operations/Usage/Exit codes updated.
- `tests/test_tools_discovery.sh` — +T13 (append via round-trip, verified by parsing the file), +T14 (duplicate → exit!=0 + file byte-identical), +T15 (--dry-run → diff preview + no write), +T16 (config without discovery → block created with all three keys); 12→16.

## Design Notes

- Plan D of `docs/analisis-workflow-etapas.md`: closes the detect-but-hand-edit gap — exact mirror of `feature.py add` vs hand-editing `feature_list.json` (feature 13).
- Validate-then-write: an invalid result never lands on disk (schema has `additionalProperties:false`).
- Dogfood: `declare skill ponytail` applied to the live gitignored `harness.config.json` (ponytail is genuinely consulted as literature by the research series — true provenance); `check` now resolves it `ok -> ~/.agents/skills/ponytail/SKILL.md`, one NOTE cured; remaining installed-but-not-declared NOTEs stay informational by design (declaring unrelated globally-installed skills would be false provenance).

## Test Output

```text
test_tools_discovery.sh: 16 run, 16 passed, 0 failed
shellcheck -S warning tests/test_tools_discovery.sh: clean; py_compile: OK
./init.sh -> EXIT=0
```

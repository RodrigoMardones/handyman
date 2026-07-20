---
type: Implementation Log
feature: discovery_note_summary
status: implemented
role: implementer
updated: 2026-07-01
tags: [handyman/role/implementer, handyman/feature/discovery_note_summary]
---

# Implementation Report: discovery_note_summary

## Files Changed

- `handyman/scripts/tools_discovery.py`: `check` collapses
  installed-but-undeclared SKILLS into one summary NOTE (count > 3), names
  them inline at ≤ 3, and gains `check --verbose` to restore the per-skill
  listing. Declared-but-MISSING lines, agent notes and MCP notes unchanged.
- `handyman/references/discovery.md`: "Undeclared-skill noise is summarized"
  paragraph (rule, thresholds, --verbose).
- `tests/test_tools_discovery.sh`: T17 (5 installed / 1 declared → summary
  with count 4, no individual lines, --verbose expands) and T18 (inline
  naming at count ≤ 3).

## Design Notes

- Scope deliberately limited to the skills family — the 17-line noise source
  in every preflight/init run; agent and MCP notes are rare and actionable,
  so they stay individual (T12 untouched).
- Gating semantics untouched: exit code logic did not move.

## Test Output

```text
bash tests/test_tools_discovery.sh -> 18 run, 18 passed, 0 failed
bash tests/test_preflight.sh -> 8 run, 8 passed, 0 failed
live preflight now shows: "NOTE: 17 installed skill(s) not declared under
discovery (run check --verbose to list)" (was 17 lines)
```

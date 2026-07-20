---
type: Implementation Log
feature: tools_discovery_agents_advisory
status: implemented
role: implementer
updated: 2026-07-01
tags: [handyman/role/implementer, handyman/feature/tools_discovery_agents_advisory]
---

# Implementation Report: tools_discovery_agents_advisory

Plan C of `docs/analisis-tool-discovery-referencias.md`. Extends the non-blocking
discovery advisory so a harness that declares no skills, MCP servers, *or* agents
gets nudged.

## Files Changed

- `handyman/assets/init.template.sh` — `check_tools_discovery()` now reads
  `discovery.agents` and only NOTEs when skills, mcp, and agents are all empty; the
  message names agents.
- `init.sh` (live dogfood, gitignored) — same change, kept in sync (its NOTE points
  to `handyman/references/discovery.md`).
- `tests/test_docs.py` — `test_tools_discovery_advisory` asserts the advisory
  inspects `discovery.agents`.

## Design Notes

- Same `jq '(.discovery.X // []) | length'` pattern; **never touches EXIT_CODE**
  (advisory, like the graphify/version/business/evals checks).
- The dogfood declares agents, so the live advisory stays silent (correct).

## Test Output

```text
$ ./init.sh   # EXIT=0 - ALL SUITES PASSED (10 suites)
test_docs test_tools_discovery_advisory: inspects discovery.agents
```

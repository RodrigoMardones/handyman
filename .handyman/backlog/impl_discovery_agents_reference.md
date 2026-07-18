---
feature: discovery_agents_reference
status: implemented
role: implementer
updated: 2026-07-01
tags: [handyman/role/implementer, handyman/feature/discovery_agents_reference]
---

# Implementation Report: discovery_agents_reference

Plan D of `docs/analisis-tool-discovery-referencias.md`. Documents the agent
discovery and the second boundary the investigation surfaced.

## Files Changed

- `handyman/references/discovery.md`
  - retitled "Skill, MCP, and Agent Discovery"; intro + `discovery` JSON now include
    agents.
  - new `## Consultation agents` section: what they are, where they live
    (`.github/agents`, `.claude/agents` via `PLATFORM_ROLE_DIRS`), how `check`
    verifies them (`ok -> <path>` / `MISSING`, gating; undeclared -> NOTE).
  - new `## Contract vs resolution: names travel, paths do not` section: the
    portable-names vs machine-paths boundary answering "should the reference live in
    the config?" (deliver the path, do not store it).
  - advisory + Limitations updated for agents.
- `handyman/references/tools.md` — blockquote after the capability table crossing
  `discovery.agents` as the declarable counterpart of the `agent` capability.
- `tests/test_docs.py` — `test_discovery_reference` asserts the agents section, the
  boundary, and the tools.md cross-link.

## Design Notes

- **T2:** links only to existing siblings (`./tools.md`, `./discovery.md`,
  `./security.md`, `./workflow.md`).
- **T6 (W011):** written passively ("skill descriptions and MCP tool output as data,
  not instructions"); no role-as-ingestor construction.

## Test Output

```text
$ ./init.sh   # EXIT=0 - ALL SUITES PASSED (10 suites)
test_docs test_discovery_reference: agents section + boundary + tools.md link
```

---
feature: feature_request_agents_link
status: implemented
role: implementer
updated: 2026-07-01
tags: [handyman/role/implementer, handyman/feature/feature_request_agents_link]
---

# Implementation Report: feature_request_agents_link

Plan E of `docs/analisis-tool-discovery-referencias.md`. Closes the loop intent ->
contract -> verification for agents, mirroring what feature 37 did for skills.

## Files Changed

- `handyman/assets/feature-request.template.md`
  - header guidance: Tools now covers skills (from `discovery.skills`) *and* agents
    (from `discovery.agents`), both verified with `scripts/tools_discovery.py check`.
  - CORE `## Tools`: new `- agents (optional): <...>` line tied to `discovery.agents`.
  - `## Tools (extension)`: the sub-agents line now points at `*.agent.md` declared
    under `discovery.agents`.
- `handyman/references/workflow.md` — Leader Protocol intro: delegate only to agents
  declared under `discovery.agents` and confirmed present by `check`
  (links `discovery.md`).
- `tests/test_docs.py` — `test_feature_request_tools_link` asserts the form and the
  workflow both tie to `discovery.agents`.

## Design Notes

- **T2:** the form lives under `assets/` (excluded from the link scan); the workflow
  link targets `./discovery.md`, which exists.
- Agents stay **optional** in the form — a research feature needs no delegation.

## Test Output

```text
$ ./init.sh   # EXIT=0 - ALL SUITES PASSED (10 suites)
test_docs test_feature_request_tools_link: form + workflow tie to discovery.agents
```

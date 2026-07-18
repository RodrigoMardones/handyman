---
feature: tools_discovery_agents
status: implemented
role: implementer
updated: 2026-07-01
tags: [handyman/role/implementer, handyman/feature/tools_discovery_agents]
---

# Implementation Report: tools_discovery_agents

Plan B of `docs/analisis-tool-discovery-referencias.md`. Extends the deterministic
discovery to consultation agents and delivers the resolved path as a direct
reference — surface work over machinery that already exists (ponytail: reuse).

## Files Changed

- `handyman/scripts/tools_discovery.py`
  - imports `PLATFORM_ROLE_DIRS` from `validate_harness` (single source of truth).
  - new `discover_agents(root)`: scans `*.agent.md` under the platform role dirs,
    reusing `_parse_frontmatter`; returns sorted, de-duped `{name, description, path}`.
  - `cmd_check`: verifies each declared agent as `ok -> <path>` / `MISSING`
    (gates like a skill, because a role file is on disk), notes undeclared role
    files, and now prints the resolved `path` of every present skill and agent.
  - docstring updated (title, operations, agents paragraph, exit codes).
- `tests/test_tools_discovery.sh` — T10 (agent present -> `ok` + path), T11
  (declared-missing agent -> `MISSING` + non-zero), T12 (undeclared role file ->
  NOTE, non-gating); 9 -> 12 cases. Header updated.
- `harness.config.json` (dogfood, gitignored) — `discovery.agents` now declares
  `leader`, `implementer`, `reviewer`.

## Design Notes

- **Contract = names, query = path.** The declaration stays portable (names); the
  path is resolved at query time and printed as a direct reference, never persisted
  (see the doc's portable-vs-machine boundary).
- **Agents gate; MCP does not.** A role file is verifiable on disk, so a missing
  declared agent is an error (exit 1), unlike a host-defined MCP server (NOTE).
- **No gate risk to the verifier:** `tools_discovery.py check` runs only inside
  `preflight.py` (always exit 0, called `|| true`). The dogfood declares only
  present agents, so live `check` stays exit 0.

## Test Output

```text
$ bash tests/test_tools_discovery.sh   ->  12 run, 12 passed, 0 failed
$ python3 handyman/scripts/tools_discovery.py --root . check
skill handyman: ok -> ~/.agents/skills/handyman/SKILL.md   (path shown)
agent leader: ok -> .github/agents/leader.agent.md
agent implementer: ok -> .github/agents/implementer.agent.md
agent reviewer: ok -> .github/agents/reviewer.agent.md
$ ./init.sh   # EXIT=0 - ALL SUITES PASSED
```

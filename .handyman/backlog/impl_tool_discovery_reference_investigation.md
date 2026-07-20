---
type: Implementation Log
feature: tool_discovery_reference_investigation
status: implemented
role: implementer
updated: 2026-07-01
tags: [handyman/role/implementer, handyman/feature/tool_discovery_reference_investigation]
---

# Implementation Report: tool_discovery_reference_investigation

Research-only feature (mirror of features 9/15/20/25/31/32/38). Deliverable is a
research document plus a work proposal; no product code changed.

## Files Changed

- `docs/analisis-tool-discovery-referencias.md` (new, 369 lines, 0 raw markdown
  links) — investigation document, sibling of `docs/analisis-tool-discovery.md`.

## Design Notes

- **Two topics answered with evidence read from the repo.**
  - **Topic 1 (extend discovery to agents):** the `discovery` block knows
    `skills`/`mcp` only; the agents of consultation (`.agent.md` role files) are
    already known to `validate_harness.py` via `PLATFORM_ROLE_DIRS`
    (`.github/agents`, `.claude/agents`) but for a location check, not a discovery.
    Proposal reuses `_parse_frontmatter` + those dirs, mirroring `discover_skills`.
  - **Topic 2 (add path/reference):** `discover_skills` **already** captures the
    `path`; it is emitted by `list --json` but hidden from `check`. MCP has a host
    label, not a fs path. Conclusion (grounded in `ponytail` + the repo's own note
    that skill roots are environment-dependent): the contract declares **names**
    (portable), the query **resolves and delivers the path** (machine-specific);
    do not persist absolute paths in `discovery`. The work is surface, not schema.
- **Evidence anchors:** `harness.config.json` discovery block; the `discovery`
  definition (`additionalProperties:false`, two keys) in both schemas;
  `discover_skills`/`discover_mcp_servers` in `tools_discovery.py`;
  `PLATFORM_ROLE_DIRS` in `validate_harness.py`; the three `.github/agents/*.agent.md`
  files and the missing `explorer.agent.md`; the absent `.agents/` at repo root.
- **Literature:** `handyman` (delegation/least-privilege as first-class),
  `skill-creator` (description-as-trigger, path already listed in `<skills>`),
  `mcp-builder` (discoverability, MCP host-defined), `ponytail` (the ladder:
  reuse `_parse_frontmatter` and the already-computed `path`; YAGNI on persisting
  paths).
- **Work proposal:** plan A–E (schema `discovery.agents`; script `discover_agents`
  + surface resolved path in `check`; optional advisory; reference doc; workflow
  link), plus five suggested atomic features. `SKILL.md` and `AGENTS.template.md`
  stay untouched (token budgets 997/1000, 249/250).
- **T2 safety:** the doc uses inline-code and fenced blocks for every path; zero
  raw markdown links (`grep -c '](' = 0`), so `test_docs.py` link check stays green.

## Test Output

```text
$ ./init.sh   # EXIT=0
Summary: 14 run, 14 passed, 0 failed   (test_init)
Summary: 12 run, 12 passed, 0 failed   (test_feature)
Summary: 17 run, 17 passed, 0 failed   (test_docs)
Summary:  7 run,  7 passed, 0 failed   (test_update)
Summary:  5 run,  5 passed, 0 failed   (test_index)
Summary: 10 run, 10 passed, 0 failed   (test_upgrade)
Summary:  9 run,  9 passed, 0 failed   (test_tools_discovery)
Summary:  7 run,  7 passed, 0 failed   (test_evals)
Summary:  5 run,  5 passed, 0 failed   (test_preflight)
ALL SUITES PASSED
VERIFIER: all gates passed
```

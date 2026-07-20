---
type: Review Log
feature: discovery_agents_batch
status: approved
role: reviewer
updated: 2026-07-01
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/discovery_agents_batch]
---

# Review: discovery_agents_batch

## Verdict

APPROVED

## Per-Feature Status

| Feature | Component | Requirement | Status |
|---------|-----------|-------------|--------|
| A | `discovery_agents_schema` | `agents` array in `harness.config.schema.json` discovery | ✓ MET |
| A | `discovery_agents_schema` | `agents` array in `feature_list.schema.json` discovery | ✓ MET |
| A | `discovery_agents_schema` | `additionalProperties: false` on both discovery defs | ✓ MET |
| A | `discovery_agents_schema` | Sentinel `[]` in 3 templates (local/global config, feature_list) | ✓ MET |
| A | `discovery_agents_schema` | `test_docs.test_discovery_config` extended | ✓ MET |
| B | `tools_discovery_agents` | `discover_agents(root)` imports `PLATFORM_ROLE_DIRS` from validate_harness | ✓ MET |
| B | `tools_discovery_agents` | `discover_agents` reuses `_parse_frontmatter` | ✓ MET |
| B | `tools_discovery_agents` | `cmd_check` prints `agent <name>: ok -> <path>` for declared agents | ✓ MET |
| B | `tools_discovery_agents` | `cmd_check` gates on missing declared agents (returns 1) | ✓ MET |
| B | `tools_discovery_agents` | `tests/test_tools_discovery.sh` extended 9→12 tests | ✓ MET |
| C | `tools_discovery_agents_advisory` | `check_tools_discovery()` in `init.template.sh` counts `discovery.agents` | ✓ MET |
| C | `tools_discovery_agents_advisory` | `check_tools_discovery()` in live `init.sh` counts `discovery.agents` | ✓ MET |
| C | `tools_discovery_agents_advisory` | Never sets EXIT_CODE (only advisory NOTE) | ✓ MET |
| C | `tools_discovery_agents_advisory` | Only runs when skills+mcp+agents all empty | ✓ MET |
| D | `discovery_agents_reference` | `discovery.md` gained "Consultation agents" section | ✓ MET |
| D | `discovery_agents_reference` | "Contract vs resolution: names travel, paths do not" boundary in `discovery.md` | ✓ MET |
| D | `discovery_agents_reference` | `tools.md` cross-links `discovery.agents` | ✓ MET |
| D | `discovery_agents_reference` | `test_discovery_reference` extended | ✓ MET |
| E | `feature_request_agents_link` | `feature-request.template.md` references `discovery.agents` | ✓ MET |
| E | `feature_request_agents_link` | `workflow.md` delegates only to declared+verified agents via `discovery.agents` | ✓ MET |

## Fact-Check Results

All 6+ concrete claims verified against actual files:

1. **Both schema `discovery` definitions contain `agents` AND `additionalProperties: false`**
   - Evidence: `handyman/assets/schemas/harness.config.schema.json` line ~23 has `"agents": {...}, "additionalProperties": false` in discovery
   - Evidence: `handyman/assets/schemas/feature_list.schema.json` line ~41 has `"agents": {...}, "additionalProperties": false` in discovery
   - **TRUE** ✓

2. **All three templates contain `discovery.agents` as `[]`**
   - Evidence: `handyman/assets/harness.config.local.template.json` line 20-24 has `"discovery": { "skills": [], "mcp": [], "agents": [] }`
   - Evidence: `handyman/assets/harness.config.global.template.json` line 20-24 has same structure
   - Evidence: `handyman/assets/feature_list.template.json` line 11 has `"discovery": { "skills": [], "mcp": [], "agents": [] }`
   - **TRUE** ✓

3. **`tools_discovery.py` imports `PLATFORM_ROLE_DIRS` from validate_harness and defines `discover_agents`**
   - Evidence: Line 57 imports `PLATFORM_ROLE_DIRS` from `validate_harness`
   - Evidence: Line 159 defines `discover_agents(root: Path) -> list[dict[str, str]]`
   - Evidence: Function uses `_parse_frontmatter` at line 170
   - **TRUE** ✓

4. **`cmd_check` prints `agent <name>: ok -> <path>` and gates on missing agents**
   - Evidence: Lines 305-311 iterate declared_agents and print `agent {name}: ok -> {agent_path[name]}` for found agents
   - Evidence: Line 312 prints `agent {name}: MISSING` for missing agents
   - Evidence: Lines 320-321 return 1 if `missing_agents` is non-empty, gating on missing agents
   - **TRUE** ✓

5. **Running `tools_discovery.py check` shows all three agents as `ok -> <path>` and exits 0**
   - Evidence: `python3 handyman/scripts/tools_discovery.py --root . check` output shows:
     - `agent leader: ok -> /Users/.../github/agents/leader.agent.md`
     - `agent implementer: ok -> /Users/.../github/agents/implementer.agent.md`
     - `agent reviewer: ok -> /Users/.../github/agents/reviewer.agent.md`
   - Evidence: Exit code confirmed as 0
   - **TRUE** ✓

6. **`check_tools_discovery()` in both init files references `discovery.agents` and does NOT set EXIT_CODE**
   - Evidence: `handyman/assets/init.template.sh` line 159 defines function reading `discovery.agents` via jq at line 164
   - Evidence: `init.sh` line 166 has identical function; both only echo NOTE to stderr, never modify EXIT_CODE
   - Evidence: Line 165 in both files: only conditional echos, function returns 0 implicitly
   - **TRUE** ✓

7. **`references/discovery.md` contains "Consultation agents" section and "names travel" boundary; `references/tools.md` contains `discovery.agents`**
   - Evidence: `handyman/references/discovery.md` line 99 starts "## Consultation agents"
   - Evidence: `handyman/references/discovery.md` line 140 has heading "## Contract vs resolution: names travel, paths do not"
   - Evidence: `handyman/references/tools.md` line 33 mentions `discovery.agents`
   - **TRUE** ✓

8. **`feature-request.template.md` and `references/workflow.md` both contain `discovery.agents`**
   - Evidence: `handyman/assets/feature-request.template.md` line 32 mentions `discovery.agents`; lines 57, 79 also reference it
   - Evidence: `handyman/references/workflow.md` line 45 delegates "only to consultation agents the harness declares under `discovery.agents`"
   - **TRUE** ✓

## Verifier Output

**Exit Code: 0** ✓ ALL GATES PASSED

Test Suite Results:
- Docs suite: PASS (T1–T5 contract tests)
- Feature suite: PASS (17 tests)
- Backlog-generator suite: PASS (7 tests)
- Index-MOC suite: PASS (5 tests)
- Upgrade-check suite: PASS (10 tests)
- **Tools-discovery suite: PASS (12 tests)** ← 9→12 per spec
- Evals suite: PASS (7 tests)
- Preflight suite: PASS (5 tests)

Preflight Discovery Block:
- `agent leader: ok -> /Users/rodrigomardones/proyectos/programing/handyman/.github/agents/leader.agent.md`
- `agent implementer: ok -> /Users/rodrigomardones/proyectos/programing/handyman/.github/agents/implementer.agent.md`
- `agent reviewer: ok -> /Users/rodrigomardones/proyectos/programing/handyman/.github/agents/reviewer.agent.md`

## Quality Checks

- **SKILL.md word count:** 998 words (≤ 1000) ✓
- **Git status:** Only tracked changes + untracked `docs/analisis-tool-discovery-referencias.md`
  - Modified: `handyman/assets/` (4 templates + 2 schemas)
  - Modified: `handyman/references/` (3 files)
  - Modified: `handyman/scripts/tools_discovery.py`
  - Modified: `tests/` (2 test files)
  - Untracked: research doc (per spec)
- **ShellCheck:** No warnings ✓

## Conclusion

All five features (A–E, ids 49–53) fully implemented and verified. The batch extends tool discovery to consultation agents, adds proper schema validation, implements advisory warnings, documents the contract/resolution boundary, and integrates agent declarations into the feature workflow. Tests green, verifier gates passed, quality checks complete.

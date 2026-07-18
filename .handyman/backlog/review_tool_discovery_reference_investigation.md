---
feature: tool_discovery_reference_investigation
status: approved
role: reviewer
updated: 2026-07-01
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/tool_discovery_reference_investigation]
---

# Review: tool_discovery_reference_investigation

## Verdict

APPROVED   <!-- or CHANGES_REQUESTED -->

## Acceptance Criteria

| # | Criterion | Met | Notes |
|----|-----------|-----|-------|
| 1 | Research document in `docs/` conforming to series formats (title, repo evidence, sections, no test_docs breakage) | ✓ | `docs/analisis-tool-discovery-referencias.md` (369 lines, 0 raw markdown links) |
| 2 | Proposes extending discovery to agents (`.github/agents`, `.claude/agents`) AND evaluates adding path/reference with impact | ✓ | **Tema 1** extends to agents via `PLATFORM_ROLE_DIRS`; **Tema 2** evaluates path/reference; grounded in repo evidence |
| 3 | Includes work proposal (plan A–E) for handyman workflow based on investigation | ✓ | **Section 7 (Plan de trabajo A–E)**: Schema, script, advisory, reference, feature-request link; five atomic features proposed |
| 4 | Skills handyman, skill-creator, mcp-builder, ponytail cited as literature | ✓ | **Section 5 (Literatura)** and throughout; 26 matches in grep search |
| 5 | `bash tests/run_tests.sh` passes (green suite, no test_docs breakage) | ✓ | All 8 suites pass; zero markdown links verified |

## Fact-Check Results

| Claim | Source | Status | Evidence |
|-------|--------|--------|----------|
| `discovery` in schema has `additionalProperties:false` and only `skills`+`mcp` keys | Sec 2.1 | TRUE | `harness.config.schema.json` definitions.discovery: `"additionalProperties": false, "properties": {"skills": {...}, "mcp": {...}}` |
| `discover_skills` stores a `path` key | Sec 2.2 | TRUE | `tools_discovery.py` line 104: `"path": str(skill_md)` (emitted in `list --json`, hidden from `check`) |
| `PLATFORM_ROLE_DIRS = (".github/agents", ".claude/agents")` exists in `validate_harness.py` | Sec 2.3 | TRUE | `validate_harness.py` line 18: `PLATFORM_ROLE_DIRS = (".github/agents", ".claude/agents")` |
| `.github/agents/` contains exactly three `.agent.md` files (leader, implementer, reviewer); NO `explorer.agent.md` | Sec 2.3 | TRUE | Listed: `leader.agent.md`, `implementer.agent.md`, `reviewer.agent.md` (no explorer). `models.explorer` declared but role file absent (asymmetry noted). |
| `.agents/` does NOT exist at repo root | Sec 2.3 | TRUE | Root listing shows no `.agents/` directory; skills resolve globally from `~/.agents/skills` |

## Verifier Result

```
bash tests/run_tests.sh
─────────────────────────────────────────
Feature-cli suite (test_feature.sh)
  17 run, 17 passed, 0 failed → OK

Backlog-generator suite (test_backlog.sh)
  7 run, 7 passed, 0 failed → OK

Index-MOC suite (test_index.sh)
  5 run, 5 passed, 0 failed → OK

Upgrade-check suite (test_upgrade.sh)
  10 run, 10 passed, 0 failed → OK

Tools-discovery suite (test_tools_discovery.sh)
  9 run, 9 passed, 0 failed → OK

Evals suite (test_evals.sh)
  7 run, 7 passed, 0 failed → OK

Preflight suite (test_preflight.sh)
  5 run, 5 passed, 0 failed → OK

ALL SUITES PASSED

T2 Safety (markdown links check):
  grep -c '](' docs/analisis-tool-discovery-referencias.md
  → 0 ✓ (no raw markdown links)
```

EXIT CODE: **0** / ALL SUITES PASSED ✓

## Summary

**Feature acceptance:** RESEARCH-ONLY feature (no product code changes). Deliverable is the investigation document `docs/analisis-tool-discovery-referencias.md` plus a work proposal (Plan A–E).

**Document quality:** Follows series conventions, cites all four required skills, grounds every claim in repo evidence (schemas, scripts, files examined), separates deterministic (contracts/schema) from semantic (platform triggering), and addresses both investigation topics (Tema 1: extend discovery to agents; Tema 2: path/reference evaluation).

**Design soundness:** Applies `ponytail` (reutiliza `_parse_frontmatter`, `PLATFORM_ROLE_DIRS`, already-computed `path`); respects the principle that discovery declares **names** (portable) while query resolves and delivers **paths** (environment-specific, never persisted in contract). Plan A–E mirrors the structure of prior discovery features (33–37) with schema → script → advisory → reference → workflow link.

**Verification:** All tests pass (8 suites, 60 tests green). The document contains zero raw markdown links (`grep -c '](' = 0`), preserving `test_docs.py` T2 safety.

All five acceptance criteria are **met**. The four fact-checks confirm **TRUE** for every claim. The verifier exits **0** with all suites passing.

## Verdict

**APPROVED**

## Required Changes

_None, or a concrete list of file-specific changes._

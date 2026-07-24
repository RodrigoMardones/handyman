---
type: Review Log
feature: skill_mcp_first_prose
status: approved
role: reviewer
updated: 2026-07-23
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/skill_mcp_first_prose]
---

# Review: skill_mcp_first_prose

## Verdict

APPROVED

Docs-only MCP-first inversion is spec-complete and factually exact: the 20-tool surface in `SKILL.md` and `workflow.md` matches the `buildServer` registrations in `src/mcp.ts` name for name, both resources match the registered `ResourceTemplate` URIs, stage 7 stays explicitly CLI-only, and the CLI-only sections that must stay CLI (Unattended Loop, evals gate, sprint open/close, upgrade apply) were left untouched. Verifier green: `node tests/test_docs.js` 220/220, `./init.sh` exit 0 with zero FAIL lines.

## Stage 1: Spec Compliance

_Review the change against the feature request and its acceptance criteria first. A Stage 1 failure ends the review: report CHANGES_REQUESTED without moving to Stage 2, so spec drift is never buried under style feedback._

### Criterion 1 — SKILL.md Mechanics lists all 20 MCP tools grouped by cycle — PASS

Cross-checked `handyman/SKILL.md:67` against every `registerTool`/`registerCliTool` `name:` in `handyman/src/mcp.ts` (lines 459-948). Registrations: `harness_list`, `preflight`, `feature_next`, `feature_add`, `feature_start`, `feature_log`, `feature_next_step`, `feature_block`, `feature_unblock`, `feature_acceptance`, `backlog_review`, `feature_close`, `report_write`, `verify`, `sprint_status`, `upgrade_check`, `metrics`, `fleet_status`, `fleet_health`, `fleet_timeline` — exactly 20. SKILL.md names all 20 with no extras and no misses, grouped feature cycle (9) / review (2) / observability (5) / ops (4). Both resources match the registered templates: `handyman://{project}/current` (mcp.ts:967) and `handyman://{project}/docs/{doc}` (mcp.ts:992).

### Criterion 2 — workflow.md stages 0-7: MCP primary + CLI fallback; stage 7 CLI-only — PASS

`handyman/references/workflow.md:21-28`: stages 0-3, 5, 6 use `` `tool` (MCP; fallback `npx handyman-harness@3 ...`) ``; stage 4 reads "`verify` (MCP wraps the verifier; local fallback `./init.sh`)" — accurate, since `verify` runs the project verifier; stage 7 is "`npx handyman-harness@3 sprint close` (CLI-only; destructive period verbs stay out of the MCP)" — explicit and justified. Role-protocol guardian references were re-pointed MCP-first throughout (startup branch-mismatch paragraph, preflight line, Bootstrap step 8, Leader step 4, Implementer steps 3 and 7, Reviewer step 7, Closure steps 3 and 6, Sprint Protocol step 2, Parallel Exploration scaffold).

### Criterion 3 — No stale MCP references — PASS

Grep for `6 tools|six tools` across `handyman/**/*.md`: no stale counts (only unrelated "stale" prose in evals/graphify/toolbox/models). Every tool-count mention agrees on 20: SKILL.md:67, workflow.md:5, mcp.md:3. New tools (`backlog_review`, `feature_add`, `metrics`, `fleet_*`, `report_write`, `harness_list`, `upgrade_check`, `sprint_status`) present in both edited files. Only the two intended spots enumerate the surface; `references/mcp.md` (untouched, source of truth) matches the registrations.

### Criterion 4 — Verifier green — PASS

`node tests/test_docs.js`: 220 run, 220 passed, 0 failed (covers the SKILL.md 1000-word budget). `./init.sh`: exit 0, zero FAIL lines, `status: ok`.

- [x] Every acceptance criterion is satisfied
- [x] The change stays inside the feature's declared scope (docs-only; no code touched)
- [x] The implementation report exists and matches what changed

## Stage 2: Code Quality

_Only after Stage 1 passes._

- **Methodology intact.** One feature at a time (SKILL.md Core Rules, Leader step 4), the verifier gate (SKILL.md "No feature is `done` until the verifier exits 0"; Closure Protocol preconditions), and reviewer independence ("The reviewer validates and does not edit code") are all preserved verbatim; only guardian references changed.
- **CLI stays CLI where it should.** Unattended Loop keeps the shell-runner CLIs (an external runner is not an MCP client); the Description Trigger Gate keeps `evals validate`/`evals measure` (no evals verbs in the MCP); sprint open/close stay CLI (registrations contain only read-only `sprint_status`); upgrade apply stays CLI (MCP exposes only read-only `upgrade_check`); `update_harness` and `tools_discovery` remain CLI (not MCP tools). All consistent with `src/mcp.ts`.
- **Schema accuracy spot-checks.** `backlog_review` status enum is exactly `approved|changes_requested` (mcp.ts:731-733) as Reviewer step 7 states; `feature_close` exposes no `tools` argument (mcp.ts:752-759), so Closure step 3's "pass `--tools` on the CLI" is correct; `report_write` kinds are `impl|review|explore` with house frontmatter stamped (mcp.ts:792-802), matching Implementer step 7 and the Parallel Exploration scaffold.
- **Voice.** Terse declarative English, no hype; the dense Mechanics sentence matches the file's existing bullet style.
- **Minor observation (non-blocking).** SKILL.md groups the 20 tools as feature cycle/review/observability/ops while workflow.md uses feature cycle/review and reports/observation; both groupings are complete and factual, so this is taste, not drift.
- [x] Architecture respected (docs-only; mcp.md left as the surface source of truth)
- [x] Conventions respected (reused the existing stage-5 guardian notation)
- [x] Tests meaningful and green (test_docs.js assertions match reality)
- [x] Verifier exits 0

## Required Changes

_None._

---
feature: research_workflow_project_handyman
status: implemented
role: implementer
updated: 2026-07-01
tags: [handyman/role/implementer, handyman/feature/research_workflow_project_handyman]
---

# Implementation Report: research_workflow_project_handyman

## Files Changed

- `docs/analisis-workflow-etapas.md` (NEW, 344 lines) — research doc, only deliverable (research-only feature, mirror of ids 9/15/20/25/31/32/38/48).

## Design Notes

- Answers the three axes of the request: (1) ordered and measurable workflow with explicit stages, (2) new deterministic tools, (3) better selection/automation of tool discovery.
- Central thesis: stages already exist de facto (7-stage pipeline in `references/workflow.md` protocols) and the raw material for measurement is already on disk (dated `history.md` headings written by `feature.py done`, parseable YAML frontmatter in `backlog/*.md` stamped by `backlog.py`, `feature_list.json` counts) — nothing aggregates it. "No falta capacidad, falta orquestación" applied to observation.
- Evidence verified live: status enum is exactly 4 states (`feature_list.schema.json`); history headings are regex-stable (`## YYYY-MM-DD - Feature N: name`); backlog frontmatter carries `status: implemented|approved|changes_requested`; `preflight.py` docstring says "0 always"; 10 scripts inventoried in `handyman/scripts/`; 18 live `installed but not declared` NOTEs in this repo's check output.
- New design boundary proposed: **declared states vs derived stages** — the contract stays a 4-state machine (feature 11: no dates), stage granularity and all metrics are derived from artifacts each stage already stamps. Mirrors the two sealed boundaries (deterministic/stochastic, names/paths).
- Plan A–E: A `workflow.md` stages table (doc), B `scripts/metrics.py` read-only aggregator (reuses `resolve_workspace` + `_parse_frontmatter`, always exit 0, mirror of preflight), C `preflight.py --strict` opt-in CI gate, D `tools_discovery.py declare` (kills hand-edit of `discovery`, mirror of `feature.py add` vs feature 13), E validate `## Tools` at intake + `Tools:` provenance line in the rich history entry.
- Suggested features (NOT added): `workflow_stages_reference`, `metrics_script`, `preflight_strict_mode`, `tools_discovery_declare`, `feature_tools_provenance`.
- Literature: handyman (protocols = implicit pipeline, disk is source of truth), skill-creator (measurable loops, scripts for deterministic/repetitive, baseline before judging improvement), ponytail (ladder rungs 1–2: no new event-log/dashboard, aggregate what exists; enum widening = "smallest change in the wrong place").
- Format contract honored: `# 🔬 Investigación:` title, blockquote intro, numbered sections with `---`, inline-code + fences only, `grep -c '](' = 0` (T2 safe), passive framing (T6/W011 safe), SKILL.md and AGENTS.template.md untouched.

## Test Output

```text
grep -c '](' docs/analisis-workflow-etapas.md -> 0
./init.sh -> EXIT=0 (all 10 suites green; preflight advisory: drift BEHIND 1.13.13 -> 1.14.15 pre-existing, non-blocking)
```

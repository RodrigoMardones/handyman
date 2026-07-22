---
type: Implementation Log
feature: workflow_stages_reference
status: implemented
role: implementer
updated: 2026-07-01
tags: [handyman/role/implementer, handyman/feature/workflow_stages_reference]
---

# Implementation Report: workflow_stages_reference

## Files Changed

- `handyman/references/workflow.md` — new `## Stages at a Glance` section right after the intro: normative 7-stage table (stage → guardian → artifact → derivable measure) + the rule "a stage without its artifact did not happen" + explicit note that measures are derived, never declared (contract stays a 4-state machine).
- `handyman/references/checklists.md` — Run-Feature Checklist gains a closure item: every stage left its artifact (links the stages table in workflow.md).

## Design Notes

- Plan A of `docs/analisis-workflow-etapas.md` (section 3 table transposed verbatim into English reference prose).
- Doc-only feature: no new tests promised in acceptance (mirror of doc features 11/12/13/14). T2-safe: only relative link added is `[workflow.md](./workflow.md)` from checklists.md, a resolving sibling.
- SKILL.md and AGENTS.template.md untouched (token budgets preserved).

## Test Output

```text
grep -c "Stages at a Glance" workflow.md -> 1
grep -c "Every stage left its artifact" checklists.md -> 1
./init.sh -> EXIT=0 (10 suites green)
```

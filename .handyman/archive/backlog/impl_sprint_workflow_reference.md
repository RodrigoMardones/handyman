---
type: Implementation Log
feature: sprint_workflow_reference
status: implemented
role: implementer
updated: 2026-07-15
tags: [handyman/role/implementer, handyman/feature/sprint_workflow_reference]
---

# Implementation Report: sprint_workflow_reference

## Files Changed

- `handyman/references/workflow.md`: Stages at a Glance intro reworded (stages 0-6 per feature, 7 per period) + stage 7 row (`sprint.py close` -> `docs/sprints/sprint.<id>.md`); multi-branch/worktree paragraph after Startup (workspace singleton per checkout, branch NOTE, worktrees for parallelism); new `## Sprint Protocol` section (open -> work -> close -> manual pass; derived-never-hand-maintained rule) before Description Trigger Gate.
- `handyman/references/anatomy.md`: Optional Support Files +3 rows (`scripts/sprint.py`, `docs/current/`, `docs/sprints/sprint.<id>.md`); Feature List Contract: feature keys line now covers the conditional `sprint` partition label (feature-11 no-dates rule explicitly preserved); config mirror bullet mentions `current_sprint`.
- `handyman/references/checklists.md`: new `## Sprint-Close Checklist` (6 items: no in_progress, dry-run first, derived doc, manual sections, archive+label strip, current_sprint cleared + docs/current compressed).

## Design Notes

- SKILL.md pointer SKIPPED: budget is 998/1000 (margin 2) and the acceptance made it conditional; documented as out of scope, next holder must compensate words to add it.
- T2: new links only to existing siblings (workflow.md, security.md); research doc referenced as inline-code, not a link (it lives outside references/).
- T6 W011: all new prose passive/resource-as-subject.

## Test Output

```text
tests/test_docs.py: 169 run, 169 passed (T2 links, T6 framing, budgets 998/249)
./init.sh -> EXIT 0
```

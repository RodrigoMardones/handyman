---
type: Implementation Log
feature: skill_preflight_pointer
status: implemented
role: implementer
updated: 2026-07-01
tags: [handyman/role/implementer, handyman/feature/skill_preflight_pointer]
---

# Implementation Report: skill_preflight_pointer

## Files Changed

- `handyman/SKILL.md` — "Run one feature": puntero al stability check (pre, `scripts/preflight.py`) y a los `post_run` hooks (post). Compensado condensando 5 frases (Bootstrap, Analyze, Untrusted content, tools per role, Obsidian vault) para quedar en 998/1000.

## Design Notes

- SKILL.md estaba en 997/1000; añadir el puntero subió a ~1020. Se compensó condensando prosa existente sin perder información (la guía pesada vive en references/workflow.md).
- `skill-creator`: SKILL.md es puntero mínimo; la guía detallada del stability check y post-run vive en references/.

## Test Output

```text
SKILL.md: 998/1000 palabras (test_token_budgets PASS)
AGENTS.template: 249/250 (sin tocar)
./init.sh exit 0 (ALL SUITES PASSED)
```

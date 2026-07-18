---
feature: workflow_stability_steps
status: implemented
role: implementer
updated: 2026-07-01
tags: [handyman/role/implementer, handyman/feature/workflow_stability_steps]
---

# Implementation Report: workflow_stability_steps

## Files Changed

- `handyman/references/workflow.md` — nueva subsección "Stability check before feature work" bajo Startup (enumera los 5 controles: format, feature-list contract, version drift, config↔role-file sync, discovery; referencia preflight.py); nuevo paso 6 en Closure Protocol (post-run hooks).
- `handyman/references/checklists.md` — Run-Feature Checklist: nuevo ítem "Stability check run before starting" (pre) y "Declared post-run hooks ran after the close" (post).

## Design Notes

- Reframe del Startup como *stability check before feature work*: distingue la revisión de estabilidad (read-only, vía preflight.py o los advisories) del *quality gate* (verifier).
- Los 5 controles se enumeran explícitamente con su script, cerrando el gap "no es un paso documentado".
- Closure ahora menciona el hook post_run y sus usos típicos (index.md, graphify, evals).
- Sin nuevos links markdown rotos (el link a security.md ya existía); inline-code para scripts.

## Test Output

```text
./init.sh exit 0 (ALL SUITES PASSED; markdown links resuelven)
SKILL.md 997/1000, AGENTS.template 249/250 (sin tocar, budgets ok)
```

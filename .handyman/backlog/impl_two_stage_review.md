---
feature: two_stage_review
status: implemented
role: implementer
updated: 2026-07-15
tags: [handyman/role/implementer, handyman/feature/two_stage_review]
---

# Implementation Report: two_stage_review

## Files Changed

- `handyman/assets/backlog-review.template.md` (`## Checklist` -> `## Stage 1: Spec Compliance` con regla de corte + 3 checks de spec, y `## Stage 2: Code Quality` con los 4 checks originales)
- `handyman/references/workflow.md` (Reviewer Protocol paso 6: dos etapas ordenadas, fallo de Stage 1 = CHANGES_REQUESTED inmediato sin Stage 2)
- `tests/test_docs.py` (`test_two_stage_review`: 7 checks sobre template + protocolo)

## Design Notes

- El superpowers-ismo barato (plan C del research): la separacion spec->calidad es protocolo + template, cero codigo. `backlog.py review` NO cambia (rellena placeholders y voltea status/tag/verdict, agnostico de las secciones del cuerpo; test_backlog 7/7 lo confirma).
- El corte de Stage 1 evita que el drift de spec se entierre bajo feedback de estilo — la razon por la que superpowers separa spec compliance de code quality en su subagent-driven development.
- Este mismo reporte de review (generado tras el cambio) ya sale con el formato two-stage = dogfood inmediato.

## Test Output

```text
test_docs.py: 193 run, 193 passed / test_backlog.sh: 7 run, 7 passed
./init.sh EXIT=0
```

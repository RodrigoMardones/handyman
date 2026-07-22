---
type: Implementation Log
feature: feature_request_md
status: implemented
role: implementer
updated: 2026-06-25
tags: [handyman/role/implementer, handyman/feature/feature_request_md]
---

# Implementation Report: feature_request_md

Feature de **investigación** (espejo de ids 9 / 15 / 20): no toca código de la
skill; entrega un documento de resultados + plan de acción en `docs/`. La
acceptance observable es "dejar un plan de trabajo en `docs/` con la investigación
hecha".

## Files Changed

- `docs/analisis-feature-request-md.md` (nuevo): investigación + plan de acción
  sobre cómo convertir `feature-request.md` de "copia genérica" en una
  "recomendación basada en la experiencia", con el formato recomendado concreto.

## Design Notes

- **Evidencia, no opinión.** Cada causa se ancla a evidencia leída del repo:
  `scaffold.sh` L149 (copia verbatim), `assets/feature-request.template.md`
  (`## Worked example` = `backfill_event_attendees`, ajeno al repo),
  `references/workflow.md` Leader Protocol #4 (mapeo form→`feature.py add`),
  `references/examples.md` `Example 2` (no modela el form), y las **24 features** de
  `feature_list.json` como corpus de "peticiones reales".
- **Hallazgo central.** Las peticiones reales se parten en **dos arquetipos**
  (investigación: 9/15/20/25; implementación: el resto) y tienen un **núcleo de
  campos** que siempre se usa frente a un conjunto **opcional** que casi nunca se
  rellena (Model/schema changes, Functional check, Post-feature, sub-agents,
  Questions). Invariante empírica: el **gate verde es la última bala de Acceptance**
  en las 24 features.
- **Formato recomendado concreto.** El doc incluye el cuerpo propuesto para
  `assets/feature-request.template.md` (Núcleo + Opcional + encabezado de
  recomendación) y **dos ejemplos por arquetipo grounded** en features reales del
  repo, listo para levantar en la mitigación A.
- **Plan A–E** con foco en `assets/feature-request.template.md`, `references/`
  (`templates.md`, `examples.md`) y un puntero en `SKILL.md`. Lo que toca `SKILL.md`
  más allá del puntero (budget 997/1000) y la capa de tests queda como **features
  propias**, documentadas en "Fuera de scope" (mismo patrón que ids 9/15/20: la
  feature de investigación NO añade las features de seguimiento).
- **Contrato de tests.** El doc usa **inline-code y bloques fenced**, nunca markdown
  links; `tests/test_docs.py` corre `strip_code` (fences + inline) antes de extraer
  links, así que no se rompe `test_markdown_links` (T2). No se editó `SKILL.md` ni
  `AGENTS.template.md`, de modo que los presupuestos de tokens quedan intactos.
- **`skill-creator` consultada**: plantilla = `assets/`, disclosure progresiva
  (recomendación pesada en asset/`references/`, puntero en `SKILL.md`), examples
  pattern (mejor ejemplos por arquetipo grounded que uno genérico), "explica el
  porqué salvo en contratos de formato", interview-first y principio de no-sorpresa
  (no cambia las claves de contrato de `feature.py add`).

## Test Output

```text
$ ./init.sh
==> validate
    validate: OK
...
ALL SUITES PASSED
    test: OK
VERIFIER: all gates passed
EXIT: 0
```


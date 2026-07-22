---
type: Implementation Log
feature: validator_legacy_frontmatter_alias
status: implemented
role: implementer
updated: 2026-07-19
actor: agente-local (single-agent session)
tags: [handyman/role/implementer, handyman/feature/validator_legacy_frontmatter_alias]
---

# Implementation Report: validator_legacy_frontmatter_alias

## Files Changed

- `handyman/src/validate_harness.ts` — nuevo mapa `FRONTMATTER_LEGACY_ALIASES`
  (`status`→`verdict`, `updated`→`date`, `role`→`reviewer`) y el cálculo de
  `missing` del advisory ahora acepta la clave legacy como presencia válida.
- `tests/test_init.sh` — caso T29: un reporte con la convención pre-2.1 completa
  (`verdict:`/`date:`/`reviewer:`) no emite NOTE. T15 sigue siendo el caso
  negativo (reporte sin las claves en ninguna convención sí emite NOTE).

## Design Notes

- Opción (a) del handoff 2026-07-19 §3.1: enseñar el alias al validador,
  espejando el fallback que `done` ya usa (`feature.ts` `front.status ?? front.verdict`).
  No se reescribe ningún reporte histórico. La migración (b) queda nombrada como
  mejora futura separada, no se hace acá.
- El alias `role`→`reviewer` no estaba en el diagnóstico del handoff pero sí en la
  evidencia: las reviews legacy (p.ej. `review_toolbox_next_intake_ask_ui.md`)
  escriben `reviewer: reviewer` donde la convención nueva escribe `role:`.
  Sin ese alias, 2 de los 32 reportes seguían NOTEados por una clave que sí tienen.
- `explore_workstation_ui_state_2.md` sigue emitiendo NOTE a propósito: le faltan
  `topic/role/updated` en ambas convenciones. Es deuda real, no ruido de convención.

## Test Output

```text
tests/test_init.sh: Summary: 28 run, 28 passed, 0 failed
./init.sh: exit 0; NOTEs "frontmatter is missing" bajan de 32 a 1
  (solo explore_workstation_ui_state_2.md, genuinamente incompleto)
```

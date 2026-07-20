---
type: Review Log
feature: backlog_review_reissue
status: approved
role: reviewer
updated: 2026-07-19
actor: agente-local (single-agent session)
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/backlog_review_reissue]
---

# Review: backlog_review_reissue

## Verdict

APPROVED   <!-- or CHANGES_REQUESTED -->

## Advertencia de procedencia

Mismo actor que el `impl_`, declarado en ambos `actor:`. El NOTE de colisión de la
feature 55 se disparará, correctamente.

## Stage 1: Spec Compliance

- [x] Every acceptance criterion is satisfied
- [x] The change stays inside the feature's declared scope
- [x] The implementation report exists and matches what changed

Bala por bala:

1. **`--force` reescribe y sale 0.** B10, más comprobación fuera de suite:
   `changes_requested -> approved`, salida `reissued ...: changes_requested ->
   approved (body preserved)`.
2. **Sin `--force`, veredicto divergente sale != 0 nombrando ambos.** B9: exit 1,
   md5 del archivo sin cambiar, y la salida contiene las dos cadenas. Es el cambio
   de contrato de la feature.
3. **Sin `--force` y mismo veredicto sale 0.** B8: exit 0, md5 idéntico, salida
   `exists (left untouched)`. La idempotencia se preserva.
4. **Se eligió preservar el cuerpo, y está anotado.** El `impl_` lo declara con su
   razón. Verificado: la prosa del reviewer sobrevive (B10) y el resultado es
   byte-idéntico a una generación fresca (B11).
5. **`tests/test_backlog.sh` cubre las tres direcciones.** B8/B9/B10, más B11 y B12.
   12 casos, 12 verdes. La suite black-box se actualiza en el mismo cambio que el
   contrato, como la acceptance exige.
6. **Gate verde.** `run_tests.sh` -> ALL SUITES PASSED.

## Hallazgos

**Uno, corregido durante la implementación y bien manejado.** La primera versión
volteaba sólo el token inicial de la línea de veredicto y dejaba
`APPROVED   <!-- or APPROVED -->`. El `impl_` lo declara en vez de esconderlo, y la
respuesta correcta no fue sólo arreglar el swap: fue **B11**, que fija la forma
contra el generador (`diff` entre re-emitido y recién generado) en lugar de contra
una expectativa escrita a mano. Un test escrito mirando la primera palabra habría
pasado con el archivo roto. Fijar contra el generador hace que cualquier deriva
futura de la plantilla también se detecte.

**Uno abierto durante el review y cerrado: el camino `bodyFlipped === false`.**
Un reporte reestructurado a mano, sin marcador bajo `## Verdict`, actualiza igual el
frontmatter y el tag e imprime un NOTE. El `impl_` lo declaraba explícitamente como
el único camino sin cobertura. Se verificó a mano (frontmatter y tag actualizados,
prosa preservada, NOTE emitido) y luego se le puso caso: **B12**. Se cerró con la
misma vara que se usó en la feature 56 con `NO VERDICT` — una salida observable del
CLI sin caso en el oráculo no está cubierta.

## Stage 2: Code Quality

- [x] Architecture respected
- [x] Conventions respected
- [x] Tests meaningful and green
- [x] Verifier exits 0

- **Sin deps nuevas** (`architecture.md:46-52`), y sin imports nuevos.
- **Parsing propio en vez de `parseFrontmatter`, justificado.** `reissueVerdict`
  reescribe líneas preservando el resto byte a byte; `parseFrontmatter` devuelve un
  objeto y perdería el cuerpo. La justificación está en el `impl_`. `declaredStatus`
  recorre la misma estructura y evita una segunda forma de leer lo mismo.
- **El camino de creación no se tocó.** `cmdReview` desvía a `reviewExisting` sólo
  cuando el destino existe; `render` + `writeEntry` siguen igual, y `writeEntry` sigue
  sirviendo a `impl` y `explore` con su política de no sobreescribir intacta (B5 y el
  resto de la suite lo confirman).
- **`--force` acotado a `review`**, como `--status`. `impl` y `explore` no tienen
  veredicto.
- **Ayuda y header siguen al código**: `subUsage`, `printSubHelp`, `printMainHelp` y
  el comentario del módulo describen el contrato nuevo, incluido el exit 1.
- **La palabra `--force` es la misma que introdujo la feature 57** en
  `feature.js acceptance`. Dos CLIs del mismo harness, un vocabulario.

## Nota sobre el cambio de exit code

La bala 2 convierte un 0 silencioso en un 1. Es ruptura de contrato para cualquiera
que hoy llame `backlog.js review` sobre un reporte existente con un `--status`
distinto esperando 0. El repo lo acepta porque un veredicto descartado en silencio es
peor que un error — y porque la superficie afectada es exactamente el bug: el ciclo
CHANGES_REQUESTED -> APPROVED no tenía verbo, así que nadie podía estar dependiendo
del no-op para algo útil. El caso idempotente (mismo `--status`) sigue en 0, que es
el que un script repetido realmente ejercita.

## Verification

```text
bash tests/test_backlog.sh   -> 12 run, 12 passed, 0 failed
bash tests/run_tests.sh      -> ALL SUITES PASSED
./init.sh                    -> exit 0 (via feature.js done)
```

## Required Changes

None.

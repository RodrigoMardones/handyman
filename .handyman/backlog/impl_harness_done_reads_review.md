---
type: Implementation Log
feature: harness_done_reads_review
status: implemented
role: implementer
updated: 2026-07-19
actor: agente-local (single-agent session)
tags: [handyman/role/implementer, handyman/feature/harness_done_reads_review]
---

# Implementation Report: harness_done_reads_review

## Procedencia — leer antes que el resto

**La implementación ya estaba en el árbol de trabajo cuando esta feature se registró.**
No fue escrita en esta sesión. Se registró la feature *después* del código, invirtiendo
el orden que el harness pide.

Se declara acá porque es exactamente el defecto que esta feature arregla, un nivel más
arriba: `done` afirmaba `APPROVED` sin leer el review; acá el trabajo existía sin que
`feature_list.json` lo supiera (`max id` era 55). El registro durable no puede quedar
mintiendo sobre su propia procedencia mientras cierra la feature que arregla las mentiras
del registro durable.

Lo que esta sesión sí hizo: verificar la implementación contra las acceptance, aislar su
alcance dentro de un árbol sucio de 39 archivos, registrar la feature y escribir estos
reportes.

## Files Changed

El árbol tiene 39 archivos sin commitear del lote 50-55, así que `git diff HEAD` **no**
es el alcance de esta feature. Los hunks que sí le pertenecen:

- `handyman/src/feature.ts`
  - `+import { parseFrontmatter } from "./core/frontmatter.js"` (:58)
  - `+function reviewVerdict(workspace, name)` (:392-414) — nueva
  - la línea `- **Review:**` de la entrada de historia en `cmdDone` (:894), que pasa de la
    constante `APPROVED` a `reviewVerdict(workspace, args.name)`
- `tests/test_feature.sh` — 4 casos nuevos: F32, F32b, F32c, F33 (:538-600)

**No** pertenecen a esta feature, aunque el diff los muestre: `saveValidated`, `cmdUnblock`,
`cmdAcceptance`, `parseUnblock`, `parseAcceptance` y sus 4 tests son la feature 51, cerrada
y sin commitear. El resto de los 39 archivos son las features 50 y 52-55.

## Design Notes

- **`status:` es la clave canónica, `verdict:` el fallback.** `status:` es lo que estampa la
  plantilla detrás de `backlog.js review`, lo que documenta `references/workflow.md`, y lo que
  `metrics.ts` y `sprint.ts` ya cuentan. `verdict:` sólo existe en reviews hand-written previos
  a esa convención; leerlo evita invalidar el registro histórico.
- **Tres estados de ausencia, no uno.** `NO REVIEW FILE` (no existe el archivo) y `NO VERDICT`
  (existe pero no declara veredicto) son hechos distintos y el marcador los distingue. La
  alternativa —sustituir un veredicto por defecto— es la mentira original con otro valor.
- **Reusa `parseFrontmatter` de `core/frontmatter.js`**, ya consumido por `metrics.ts`,
  `sprint.ts`, `toolbox.ts`, `tools_discovery.ts` y `validate_harness.ts`. Cero parsing nuevo.
- **No endurece el exit code** — decisión de sprint registrada en
  `docs/sprints/plan-accion-contrato-y-panel.md` §3.3, opción (b). `done` sigue cerrando siempre.
  Endurecer rompería el gate de los harnesses instalados que hoy cierran sin review, y el repo
  tiene precedente en contra («romperles el gate de golpe es hostil»). El defecto real era la
  afirmación falsa, no la laxitud; y ahora que el marcador existe, el advisory de deuda de
  evidencia de la feature 52 da los datos para decidir el endurecimiento más tarde.

## Deuda que esta feature NO cierra

`Plan`, `Changes` y `Tools` siguen escribiéndose como `...` literal en la entrada de historia
(`feature.ts:888-890`). El análisis lo nombra junto a A1, pero ninguna acceptance de esta
feature lo cubre: `...` es un hueco visible, no una afirmación falsa, así que no comparte la
urgencia. Queda nombrado acá para que se registre en vez de perderse.

## Test Output

```text
tests/test_feature.sh
  PASS done: history carries the verdict from a generated review file
  PASS done: a generated approved review records APPROVED
  PASS done: falls back to a legacy verdict: key
  PASS done: marks the absent review instead of asserting APPROVED

Summary: 35 run, 35 passed, 0 failed
```

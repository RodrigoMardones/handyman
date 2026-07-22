---
type: Implementation Log
feature: period_close_branch_unit
status: implemented
role: implementer
updated: 2026-07-21
tags: [handyman/role/implementer, handyman/feature/period_close_branch_unit]
---

# Implementation Report: period_close_branch_unit

F0 del rework de capas ([[explore_reorganizacion_capas]]): la rama reemplaza al
sprint calendario como unidad de trabajo, y se ejecuta el cierre que el
calendario nunca disparó.

## Files Changed

- `.handyman/feature_list.json` — 73 KB → ~5 KB: las 39 done de 2026-SP6
  archivadas (19 de ellas estaban varadas sin label por el hueco de estampado;
  se estamparon una única vez con jq antes del close). Quedan las 4 features
  vivas del rework (69–72), etiquetadas `feat-rework-tools`.
- `.handyman/archive/feature_archive.json` — ahora 68 features en 6 períodos
  (SP1:4, SP2:3, SP3:1, SP4:1, SP5:20, SP6:39).
- `.handyman/docs/sprints/sprint.2026-SP6.md` — derivado por `sprint close`.
- `.handyman/progress/history.md` — 39 entradas compactadas a stubs.
- `.handyman/archive/backlog/` — 318 reportes `impl_`/`review_` de features
  archivadas movidos desde `backlog/`; quedan solo los 7 `explore_` activos.
  Las rutas `backlog/...` citadas en entradas viejas de history quedan como
  referencias históricas (git y archive conservan los archivos).
- `.handyman/request.template.md` — eliminado. Copia huérfana sin referencias
  en código; contenía la petición original del ciclo de sprints (implementada)
  y la medida multi-rama (esta feature). Plantilla única: `feature-request.md`.
- `handyman/src/core/period.ts` — nuevo: `readCurrentSprint` extraído de
  `sprint.ts` para compartirlo con `feature.ts` sin duplicar la precedencia
  config → mirror.
- `handyman/src/core/index.ts` — exporta `readCurrentSprint`.
- `handyman/src/sprint.ts` — `SPRINT_ID` pasa de `^\d{4}-SP\d+$` a slug
  fs-safe `^[A-Za-z0-9][A-Za-z0-9._-]*$` (labels de rama; los ids calendario
  siguen válidos); mensaje de error actualizado; usa el helper de core.
- `handyman/src/core/featureWrite.ts` — `AddFeatureOptions.sprint`: estampa el
  período abierto al nacer la feature (CLI y panel comparten la única
  escritura).
- `handyman/src/feature.ts` — `add` resuelve y pasa el período abierto;
  `start` adopta el período cuando la feature no tiene label (nunca
  sobreescribe uno explícito).
- `handyman/assets/schemas/{feature_list,harness.config,sprint}.schema.json` —
  patrón de sprint alineado al slug en los 4 puntos.
- `tests/test_sprint.sh` — S2 usa un id con slash (sigue inválido); S2b nuevo:
  acepta label de rama y estampa pendientes. 13/13.
- `tests/test_feature.sh` — F36 (add estampa), F37 (sin período abierto no hay
  key), F38 (start adopta label faltante). 43/43.
- `AGENTS.md` — paso 5: abrir período al abrir rama, cerrar en el merge.
- `CHECKPOINTS.md` — C6 "Period Closed (at branch merge)".
- `$HOME/HANDYMAN/` — `events.jsonl` (muerto desde 2026-07-02) e `index.html`
  (panel retirado) eliminados; ambos son salidas regenerables de `toolbox.ts`.
  `registry.json` intacto.
- `.handyman/index.md` — regenerado (26 KB → 2.6 KB).

## Design Notes

- El hueco que varó 19 features: `sprint open` solo etiqueta features que
  existen al abrir; lo nacido después quedaba sin label y `close` no lo
  archivaba nunca. Fix en las dos puntas: `add` estampa al nacer, `start`
  adopta si falta. `close` no cambió.
- El período se abre ahora con el slug de la rama (`feat-rework-tools`), así
  el doc derivado y el archive quedan atados a la provenance real del trabajo.
- Sin renombres de "sprint" en código ni plantillas: cosmético, va al futuro
  nombrado.

## Test Output

```text
tests/test_sprint.sh  — Summary: 13 run, 13 passed, 0 failed
tests/test_feature.sh — Summary: 43 run, 43 passed, 0 failed
./init.sh — ver history (feature done adjunta el gate completo)
```

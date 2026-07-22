---
type: Implementation Log
feature: graphify_freshness_gate
status: implemented
role: implementer
updated: 2026-07-21
tags: [handyman/role/implementer, handyman/feature/graphify_freshness_gate]
---

# Implementation Report: graphify_freshness_gate

F1 del rework de capas ([[explore_reorganizacion_capas]]) con la decisión del
usuario: graphify se queda como capa necesaria, así que la frescura se vigila
y el grafo se refresca — la regla escrita deja de convivir con un grafo muerto.

## Files Changed

- `handyman/src/preflight.ts` — bloque `context` nuevo (tras discovery):
  NOTE cuando `graphify-out/graph.json` es más viejo que el último commit,
  OK cuando está fresco, silencioso sin grafo o sin git. Advisory puro:
  nunca entra a `problems`, así `--strict` no falla por grafo viejo.
- `tests/test_preflight.sh` — T12 (NOTE con grafo viejo + strict sigue 0 +
  sin grafo no hay bloque context) y T13 (OK con grafo fresco). 13/13.
- `.handyman/docs/conventions.md` — regla única de análisis: en vuelo →
  `backlog/explore_*`; durable → `docs/` raíz; cumplido → `docs/archive/`;
  el grafo como capa de contexto con refresh en cierre de rama.
- `docs/archive/` — 20 análisis cumplidos movidos (`analisis-*.md` +
  `estado-migracion-ts.md`); quedan vivos `mapa-entidades-negocio.md` y
  `pull_request_*.md`. Comentarios de procedencia en 12 fuentes actualizados
  a `docs/archive/analisis-*` (sed sobre src + references).
- `handyman/src/feature.ts` — entrada de history compacta (5 líneas):
  heading + Branch + Tools (los consume `sprint.js renderDoc`) + Evidence
  (impl + veredicto de review) + Verification. Muere la ceremonia de 8 campos
  que se auto-degradaba a `Plan: ...` (evidencia: features 68 y 69).
- `handyman/assets/progress-history.template.md` — plantilla alineada.
- `tests/test_feature.sh` — F12 al contrato compacto + 5 asserts de veredicto
  movidos a la línea Evidence. 43/43.
- `.handyman/progress/history.md` — entrada de la feature 69 retro-ajustada
  al formato compacto.
- `graphify-out/` — grafo refrescado: 2185 nodos / 4268 aristas / 134
  comunidades etiquetadas; HTML y GRAPH_REPORT regenerados; `cost.json`
  inicia el registro de costo (423K tokens input esta corrida).

## Design Notes

- Refresh incremental sobre el manifest: 563 archivos cambiados detectados,
  filtrados a 224 (se excluyó `.handyman/archive/**` — 314 reportes muertos —,
  `docs/archive/`, skills de terceros e `history.md`). Código por AST (gratis,
  150 archivos); semántica por 4 subagentes paralelos sobre 74 docs,
  **incluida por primera vez la memoria `.handyman/docs/`**.
- El chunk 2 (21 docs: sprints, verification, AGENTS/CHECKPOINTS, index)
  murió por límite de sesión y dejó un parcial sin aristas → descartado.
  Sus 21 archivos quedaron FUERA del manifest a propósito: el próximo
  `/graphify --update` los re-detecta y extrae — hueco visible y
  auto-corregible, no silencioso. (Varios ya están representados como stubs
  citados desde otros chunks.)
- La poda de `build_merge` no casó los 23 borrados (paths absolutos vs
  relativos en el grafo viejo); se podaron a mano 347 nodos fantasma de los
  `analisis-*` movidos — ahí vivían las ~15 comunidades "Docs Analisis"
  duplicadas del reporte anterior.

## Test Output

```text
tests/test_preflight.sh — Summary: 13 run, 13 passed, 0 failed
tests/test_feature.sh  — Summary: 43 run, 43 passed, 0 failed
preflight en vivo: --> context: OK (grafo más nuevo que el último commit)
./init.sh — gate completo adjunto por feature done
```

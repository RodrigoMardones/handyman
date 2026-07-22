---
type: Implementation Log
feature: mcp_feature_workflow_tools
status: implemented
role: implementer
updated: 2026-07-21
tags: [handyman/role/implementer, handyman/feature/mcp_feature_workflow_tools]
---

# F75 — MCP P1: feature_start, feature_log, feature_next_step

Paso 2 del plan de `docs/analisis-mcp-extension.md` (§2.1). Cierra el ciclo del
rol implementer dentro del MCP: reclamar, loggear, marcar next step. Tres tools
nuevas como wrappers delgados de `feature.js` (subprocess, cero segunda fuente
de verdad).

## Qué cambió

`handyman/src/mcp.ts`:

- **3 handlers nuevos** junto a `featureClose`:
  - `featureStart(project, name, noPreflight)` → `feature.js start name [--no-preflight]`
  - `featureLog(project, line)` → `feature.js log line`
  - `featureNextStep(project, step)` → `feature.js next step`
- **3 tools nuevas** registradas con `registerCliTool` (helper de F74), entre
  `feature_next` y `feature_close` (orden lógico del ciclo implementer).
- **Header actualizado:** lista de tools de 6 a 9 con descripción de cada una.

`handyman/references/mcp.md`:

- Tabla de Tools: añadidas 3 filas (`feature_start`, `feature_log`,
  `feature_next_step`).
- Sección "Deliberately absent" **retractada**: ya no dice que claiming stays
  on the CLI. Ahora explica que las 3 tools implementer entraron al MCP para
  cerrar el ciclo, y lista lo que sigue fuera: verbs destructivos de periodo
  (`sprint open/close`, `upgrade_harness apply`, `update_harness`).

## Decisiones de diseño

- **Naming:** `feature_next_step` (no `feature_next` que ya existe para listar
  claimable; no `feature_set_next` que es más largo). El plan pedía
  `feature_next_step` explícitamente.
- **`no_preflight` flag en feature_start:** snake_case para exponerlo como
  `no_preflight` en el JSON schema del MCP (los args internos convierten a
  `--no-preflight` kebab-case del CLI).
- **Handlers exportados aparte:** aunque `registerCliTool` podría inlinearlos,
  mantengo el patrón existente (handler plano exportado + referencia desde
  buildServer) para:
  1. consistencia con `featureClose`, `featureNext`, `reportWrite`, `verify`;
  2. testeabilidad directa por `test_mcp.js` (M9-M11 llaman `mcp.featureStart`,
     `mcp.featureLog`, `mcp.featureNextStep`).
- **Annotations:** `feature_start` no idempotente (cambiar estado), `feature_log`
  y `feature_next_step` idempotentes (reemplazan la sección, no acumulan).

## Tests

`tests/test_mcp.js` ampliado de 8 a 12 checks:

- **M1 actualizado:** aserta 9 tools (lista esperada ordenada incluye las 3
  nuevas).
- **M9 feature_start:** marca 'b' in_progress; rechaza arrancar 'a' mientras 'b'
  está activa (single-in_progress enforced por el CLI subyacente).
- **M10 feature_log:** append de bullet al `## Log` (las secciones las crea
  `feature_start` que reescribe current.md con template lleno).
- **M11 feature_next_step:** setea `## Next Step`.

Los tests nuevos usan un fixture aparte (`hmcp-wf-`) para no interferir con el
fixture principal que ya cerró 'a' y dejó 'b' listo en M6.

## Paridad

- `test_mcp.js` 12/12 PASS (M1-M11 más la aserción ampliada de M1).
- `tsc --noEmit` limpio.
- `npm run build` recompila sin errores.
- `./init.sh` exit 0.

## Archivos modificados

- `handyman/src/mcp.ts` (+~85 líneas netas: 3 handlers + 3 tools).
- `handyman/references/mcp.md` (tabla + nota retractada).
- `tests/test_mcp.js` (+~70 líneas: M1 ampliada + M9-M11).

## Siguiente

F76 (descentralización suave) y F77 (P3 read-only) pueden correr en paralelo
lógico: F76 toca imports de mcp.ts y toolbox-core; F77 sólo añade 2 tools con
`registerCliTool`. Ambas dependen de F74 (helper) que ya está done.

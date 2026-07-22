---
type: Implementation Log
feature: mcp_readonly_status_tools
status: implemented
role: implementer
updated: 2026-07-21
tags: [handyman/role/implementer, handyman/feature/mcp_readonly_status_tools]
---

# F77 — MCP P3: sprint_status y upgrade_check (read-only puros)

Paso 5 del plan de `docs/analisis-mcp-extension.md` (§2.3 y §2.4, P3 opcional).
Dos tools read-only para el operador del MCP, sin exponer subcomandos
destructivos.

## Qué cambió

`handyman/src/mcp.ts`:

- **2 handlers nuevos** junto a `verify`:
  - `sprintStatus(project)` → `sprint.js status`
  - `upgradeCheck(project)` → `upgrade_harness.js --check`
- **2 tools nuevas** registradas con `registerCliTool` (helper de F74), después
  de `verify` en el ciclo del servidor.
- **Header actualizado:** lista de tools de 9 a 11.

`handyman/references/mcp.md`:

- Tabla de Tools: añadidas 2 filas (`sprint_status`, `upgrade_check`).

## Diseño: por qué read-only y nada más

El plan (§2.3) es explícito: `sprint open` y `sprint close` son destructivos
(archivan features, compactan history, derivan el doc del periodo), y el modo
`apply` default de `upgrade_harness.js` reescribe `harness.config.json` y
archivos managed. El operador ya corre esos verbos a mano en hitos de rama
(dogfood en `AGENTS.md:16`). Las tools MCP sólo exponen los modos read-only:
`sprint status` y `upgrade_harness --check`.

Los handlers fuerzan los args (`["status"]` y `["--check"]`) sin aceptar
overrides del input — no hay flag que permita al caller pedir `open`, `close` o
`apply` por accidente.

## Tests

`tests/test_mcp.js` ampliado de 12 a 14 checks:

- **M1 actualizada:** aserta 11 tools (lista esperada incluye las 2 nuevas).
- **M12 sprint_status:** output menciona `open:` y `feature(s)` (el reporte del
  periodo abierto con su conteo). Exit 0.
- **M13 upgrade_check:** output menciona `installed version:` y
  `current version:`. El exit puede ser non-zero cuando hay drift (que es lo
  esperado: este repo está 3.2.0 → 3.2.1), así que el test sólo aserta la
  presencia de los markers, no el exit code.

Los tests nuevos usan el propio repo como fixture (ambos CLIs son read-only y
no tiene sentido construir un fixture mock para algo que reporta estado real).
`resolveProject` se resuelve contra `__dirname/..` (el root del repo).

## Paridad

- `test_mcp.js` 14/14 PASS.
- `tsc --noEmit` limpio.
- `npm run build` sin errores.
- `./init.sh` exit 0.

## Archivos modificados

- `handyman/src/mcp.ts` (+~50 líneas netas: 2 handlers + 2 tools).
- `handyman/references/mcp.md` (+2 filas).
- `tests/test_mcp.js` (+~30 líneas: M1 ampliada + M12-M13).

## Cierre del plan de `analisis-mcp-extension.md`

Con F77 se completa el plan §5 (orden propuesto) hasta donde el operador
decidió:

1. ✓ **Refactor `registerCliTool` helper** (F74).
2. ✓ **P1: `feature_start`, `feature_log`, `feature_next_step`** (F75).
3. ✗ **P2: metrics + fleet_*** — reservado para el panel web por decisión del
   operador (§6.2: si el panel es host, el MCP es loopback redundante para esas
   tools).
4. ✓ **Descentralización suave** (F76).
5. ✓ **P3: `sprint_status`, `upgrade_check`** (F77, esta feature).
6. ⊘ **Camino B (paquete `packages/handyman-mcp/`)** — postergado; sin consumidor
   externo que lo exija. F76 dejó la migración trivial al declarar la frontera
   en `architecture.md`.

## Superficie final del MCP

11 tools (6 originales + 5 nuevas) + 2 resources. Wrappers delgados sobre los
mismos `dist/*.js` que los roles ya corren. Contrato "zero second source of
truth" preservado.

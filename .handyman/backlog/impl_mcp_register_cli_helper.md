---
type: Implementation Log
feature: mcp_register_cli_helper
status: implemented
role: implementer
updated: 2026-07-21
tags: [handyman/role/implementer, handyman/feature/mcp_register_cli_helper]
---

# F74 — MCP: helper `registerCliTool` para reducir boilerplate por tool

Paso 1 del plan de `docs/analisis-mcp-extension.md` (§3.3 y §5). Refactor
interno: ninguna tool nueva, ninguna cambio observable.

## Qué cambió

`handyman/src/mcp.ts` (único archivo tocado):

- **Import añadido:** `ToolAnnotations` desde `@modelcontextprotocol/sdk/types.js`
  como tipo nombrado (antes el tipo se infería con `Parameters<...>` y resolvía a
  `undefined`).
- **Dos helpers nuevos antes de `buildServer`:**
  - `registerTool(server, spec)` envuelve el patrón `resolveProject → handler →
    textResult/errorResult` y añade `project: target.name` al payload. Acepta
    `needsProject: false` para tools agnósticas (útil para `harness_list`).
  - `registerCliTool(server, spec)` añade el `runCli` shell-out encima, para tools
    que envuelven un CLI hermano de `dist/*.js` (el caso común).
- **`buildServer` reescrito:** las 6 tools existentes migran a uno de los dos
  helpers. El bloque de cada tool baja de ~30 líneas a ~15.
  - `harness_list` → `registerTool` con `needsProject: false`.
  - `preflight`, `feature_next`, `feature_close` → `registerCliTool` con `format`
    custom donde hace falta (drained en next, closed + hint en close).
  - `report_write` → `registerTool` con `run` que llama a `reportWrite` (no es
    CLI, es handler propio).
  - `verify` → `registerTool` con `run` que llama a `verify` (tampoco es CLI
    puro: hace bash + chequeo de existencia del script).
- **Resources sin tocar** (`current`, `docs`): su patrón no era repetitivo.

## Por qué `verify` y `report_write` no usan `registerCliTool`

`verify` no es un shell-out a un dist/*.js: hace `bash <script>` (donde `<script>`
es `<root>/init.sh` o uno alternativo) y chequea existencia del archivo antes.
`reportWrite` es un handler de escritura directa al workspace (no subprocess).
Ambas usan `registerTool` (que sólo aporta la envoltura
resolveProject + try/catch + textResult), no `registerCliTool`.

## Paridad

- `test_mcp.js` 8/8 PASS (incluido M1 que aserta exactamente las 6 tools y M2
  que aserte los 2 resource templates — sin cambio de superficie).
- `tsc --noEmit` limpio.
- `npm run build` (tsc -b) recompila dist/ sin errores.
- `./init.sh` exit 0.

## Diseño del tipo `Annotations`

Primer intento infería el tipo con
`NonNullable<Parameters<McpServer["registerTool"]>[1]["annotations"]>` y resolvía
a `undefined` (TS no propagaba el tipo literal del overload). Solución: importar
`ToolAnnotations` directamente del SDK como `type`-only import.

## Archivos modificados

- `handyman/src/mcp.ts` (+~70 líneas netas: helpers nuevos, bodies más cortos
  compensan parte del crecimiento).

## Siguiente

F75 (P1) y F76, F77 ya dependen de este helper y lo usarán para añadir 5 tools
nuevas (3 implementer + 2 read-only) sin repetir boilerplate.

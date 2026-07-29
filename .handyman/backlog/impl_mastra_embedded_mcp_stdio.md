---
type: Implementation Log
feature: mastra_embedded_mcp_stdio
status: implemented
role: implementer
updated: 2026-07-29
tags: [handyman/role/implementer, handyman/feature/mastra_embedded_mcp_stdio]
---

# Implementation Report: mastra_embedded_mcp_stdio

El runtime Mastra spawnea el MCP handyman como hijo por stdio: UN solo
comando corre cliente + MCP sin servidor HTTP aparte.
`HANDYMAN_MCP_TRANSPORT=stdio` (nuevo env) conecta el `MCPClient` al hijo
`node <handymanAssetsDir>/dist/mcp.js`; el default `http` deja la topología
previa intacta. **Camino elegido: stdio NATIVO de `@mastra/mcp` (no hubo
plan B)** — la versión instalada 1.15.0 soporta `StdioServerDefinition`
verificado contra sus tipos y contra un boot real.

## What

- **`HANDYMAN_MCP_TRANSPORT` en `src/ports/config.ts`** — campo tipado
  `mcpTransport: 'http' | 'stdio'` (default `http`); valor inválido → error
  accionable en `loadConfig`. Header de vars actualizado.
- **Puerto nuevo `src/ports/mcp-transport.ts`** — composición de la server
  definition del MCPClient: `http` → `{ url }` (intacto); `stdio` →
  `{ command: process.execPath, args: [<handymanAssetsDir>/dist/mcp.js],
  env: { PATH, HOME, HANDYMAN_ROOT } }`. El entry vive en el paquete que ya
  resuelve F101 (`handymanAssetsDir`: env > handyman-harness > dev fallback)
  — stdio no necesitó resolvedor nuevo. Si `dist/mcp.js` no existe (toolchain
  sin buildear) → error accionable que sugiere el build o volver a `http`.
  La unión se describe ESTRUCTURALMENTE (sin importar tipos de `@mastra/mcp`:
  el barrel anti-volatilidad es el único que importa `@mastra/*`); shapes
  verificados contra `client/types.d.ts` de 1.15.0. Env bag inyectable para
  tests. Helpers `handymanMcpEntry`/`handymanMcpTarget` (log/errores).
- **`connectHandymanMcp`** (`src/agents/handyman/leader.agent.ts`) — el
  servidor `handyman` se define vía el puerto; la guarda de 0 tools ahora
  diferencia modos (stdio: "the child spawned but listed nothing…"); el
  boot log informa el transporte: `[mcp] connected via stdio (embedded
  …/dist/mcp.js): 25 tools, 21 pinned to <root>` (http conserva el formato
  de F103). **El pinning de F103 envuelve el toolset exactamente igual** —
  el transporte es invisible para el wrap (mismo choke point, misma
  detección por inputSchema).
- **Ciclo de vida** — los runners ya cierran con `mcp.disconnect()` en su
  `finally` (el transport stdio del SDK mata al hijo); en salida anormal el
  hijo ve EOF en stdin y muere solo. Sin handlers nuevos: el mecanismo es
  stdin-EOF, suficiente por ser hijo directo con pipes (documentado en
  README). Verificado por smoke: `pgrep -f handyman/dist/mcp.js` antes/
  después, delta 0, sin tocar procesos ajenos.
- **`scripts/smoke_stdio.sh`** (nuevo, estilo casa) — S1 build del bundle;
  S2 boot stdio desde cwd ajeno con `HANDYMAN_ROOT` aislado y SIN MCP HTTP:
  aserta `[mcp] connected via stdio (embedded …)` + `25 tools, 21 pinned`
  (el runner muere después del boot por falta de keys — esperado;
  `HANDYMAN_LEADER_MODEL=ollama/smoke` lo hace fallar rápido sin red);
  S3 cero huérfanos tras el exit; S4 `HANDYMAN_ASSETS_DIR` sin `dist/mcp.js`
  → exit ≠ 0 + mensaje accionable.
- **`scripts/studio-local.sh`** (excepción permitida, punto 5) — si
  `HANDYMAN_MCP_TRANSPORT=stdio` está en el entorno, SALTA el boot del MCP
  compartido en 8177 (la sección queda en un `else`; `bash -n` + shellcheck
  limpios). Default http sin cambios.
- **README** — sección "Un solo comando (MCP embebido por stdio)": topología,
  env, ciclo de vida, skip de studio-local y la nota honesta de que Studio
  (browser) sigue siendo cliente aparte. Header de `run-feature.ts`
  actualizado (el MCP ya no es solo "server on :8177").

## Files Changed

- `agents/mastra-handyman/src/ports/config.ts` — `mcpTransport` tipado +
  header.
- `agents/mastra-handyman/src/ports/mcp-transport.ts` — **nuevo**: definición
  http/stdio del servidor handyman.
- `agents/mastra-handyman/src/ports/mcp-transport.test.ts` — **nuevo**: 4
  tests de composición.
- `agents/mastra-handyman/src/ports/config.test.ts` — += describe
  mcpTransport (default/stdio/inválido).
- `agents/mastra-handyman/src/agents/handyman/leader.agent.ts` — server
  definition vía el puerto; guarda y boot log por transporte.
- `agents/mastra-handyman/src/ports/harness-identity.test.ts`,
  `src/workflows/feature-cycle.test.ts` — fixtures AppConfig += mcpTransport.
- `agents/mastra-handyman/scripts/smoke_stdio.sh` — **nuevo**: smoke 4 casos.
- `agents/mastra-handyman/README.md` — sección MCP embebido.
- `agents/mastra-handyman/run-feature.ts` — header del requisito MCP.
- `scripts/studio-local.sh` — skip del boot MCP compartido con stdio.

## Decisions

- **stdio NATIVO (no plan B).** Evidencia de que 1.15.0 lo soporta:
  `MastraMCPServerDefinition = StdioServerDefinition | HttpServerDefinition`
  en `dist/client/types.d.ts` (`StdioServerDefinition { command, args?, env?,
  stderr?, cwd? }`, `url?: never` en stdio) y `disconnect(): Promise<void>`
  documentado como seguro de llamar repetidas veces. El spawn propio con
  puerto efímero quedó descartado: añade lifecycle propio (health-wait,
  kill on signal) para algo que el SDK ya resuelve.
- **Env passthrough MÍNIMO** (`HANDYMAN_ROOT`, `PATH`, `HOME`) en vez de
  heredar `process.env` entero: el hijo solo necesita el registry y git;
  heredar todo filtraría las LLM keys a un proceso que no las usa. El comando
  es `process.execPath` — encontrar node no depende de PATH (el toolchain
  internamente spawnea sus CLIs igual, `mcp.ts` usa `process.execPath`).
- **Sin resolvedor nuevo para el entry**: `handymanAssetsDir` (F101) ES el
  directorio del paquete — `dist/mcp.js` cuelga de él en los tres peldaños
  (env, paquete workspace, fallback dev).
- **Sin handler de señales propio**: los runners ya tienen `finally →
  disconnect()` para el camino normal; para señales, stdin-EOF. El smoke
  aserta el resultado (cero huérfanos), no el mecanismo.
- **studio-local.sh: skip, no cambio de default** — el script sigue sin
  exportar `HANDYMAN_MCP_TRANSPORT`; solo honra el valor si el operador lo
  trae. Simple y sin riesgo para el flujo dev http.

## Test Output

```text
cd agents/mastra-handyman
pnpm test:unit          # Test Files 10 passed (10) · Tests 93 passed (93)
pnpm exec tsc --noEmit  # exit 0
pnpm build:bundle       # status: ok
bash scripts/smoke_bundle.sh   # Summary: 4 run, 4 passed, 0 failed
bash scripts/smoke_stdio.sh
#   PASS build:bundle emits the runner bundles
#   PASS stdio boot lists and pins the tools with no HTTP MCP running
#   PASS no orphan dist/mcp.js child after the runner exits
#   PASS stdio with a missing dist/mcp.js fails with an actionable error
# Summary: 4 run, 4 passed, 0 failed
./init.sh               # VERIFIER: all gates passed (exit 0)
```

## Boot evidence (stdio, sin MCP HTTP, cwd ajeno)

```text
$ cd $TMP/alien && HANDYMAN_ROOT=$TMP/HANDYMAN HANDYMAN_PROJECT_ROOT=stdio-probe \
    HANDYMAN_MCP_TRANSPORT=stdio HANDYMAN_LEADER_MODEL=ollama/smoke \
    node <pkg>/dist-bundle/run-feature.mjs smoke_stdio_probe
[mcp] connected via stdio (embedded …/handyman/dist/mcp.js): 25 tools, 21 pinned to $TMP/stdio-probe
ERROR (mastra-handyman): Error in agent stream — Could not find config for provider ollama…  ← fallo POST-boot (sin keys, esperado)
exit: 1
pgrep -f handyman/dist/mcp.js: before=1 after=1   ← cero huérfanos (el 1 es el MCP HTTP preexistente del operador)
```

Proyecto resuelto por NOMBRE contra el registry aislado (F101), pinning
activo vía stdio (F103), bundle con node puro (F102): la serie completa
converge en este boot.

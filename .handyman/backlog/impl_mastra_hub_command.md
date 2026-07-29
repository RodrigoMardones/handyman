---
type: Implementation Log
feature: mastra_hub_command
status: implemented
role: implementer
updated: 2026-07-29
tags: [handyman/role/implementer, handyman/feature/mastra_hub_command]
---

# Implementation Report: mastra_hub_command

`run-hub` levanta el stack completo de revisión con UN comando (modelo
gateway): el MCP handyman en HTTP y `mastra dev` (Studio + agentes) como
hijos del mismo proceso, con health-wait activo, banner de puntos de acceso
y apagado ordenado. Corre con tsx (`pnpm run-hub`) o node puro
(`dist-bundle/run-hub.mjs`, F102) desde cualquier cwd, contra cualquier
proyecto del registry (resolución F101).

## What

- **Puerto nuevo `src/ports/hub.ts`** — toda la orquestación con
  spawn/fetch/sleep/log/onSignal inyectables:
  `mcpSpawnPlan` (`process.execPath <assetsDir>/dist/mcp.js --http --host
  127.0.0.1 --port <n>`, env mínimo PATH/HOME/HANDYMAN_ROOT — patrón F104);
  `studioSpawnPlan` (`process.execPath <mastra-pkg>/dist/index.js dev -d
  studio`, cwd = package dir, env = dotenv-vars ⊲ operator-env ⊲ wiring —
  ver "Decisions"); `waitForHttp` (cualquier respuesta = escuchando, mismo
  probe que studio-local.sh; falla rápido si el hijo vigilado muere);
  `extractLocalUrl` (URL real de Studio del stdout del hijo — ventana de
  puertos 4111..4131); `runHub` (boot ordenado → banner → lifecycle:
  SIGINT/SIGTERM → SIGTERM ambos + SIGKILL tras gracia ~3s, exit 0; hijo
  muerto inesperadamente → reporta cuál, mata al otro, exit con su code;
  hijo insano → exit 1 con error accionable). `parseEnvFile` (dotenv mínimo
  KEY=VALUE/export/comillas).
- **`run-hub.ts`** (runner delgado top-level) — flags `--project
  <nombre|path>` (resolución F101; default cwd) y `--mcp-port <n>` (default
  8177; validado). Resuelve proyecto (errores accionables ya hechos),
  assetsDir y `dist/mcp.js` (error accionable si falta el build), parsea el
  `.env` raíz si existe y delega en `runHub`. Detecta su propio layout
  (src vs dist-bundle/) para fijar el package dir.
- **Registro del runner**: RUNNERS += `run-hub` en `build_bundle.mjs`
  (`dist-bundle/run-hub.mjs`), `tsconfig.json` include, script npm
  `run-hub` con los pins data/logs de la casa.
- **`scripts/smoke_hub.sh`** (nuevo, estilo casa, 5 casos): S1 build;
  S2 banner con URLs reales en <90s (poll sobre el log); S3 el MCP hijo
  responde en su puerto; S4 SIGINT → exit 0 y cero huérfanos (pgrep con
  patrones scopeados al puerto del smoke y al path del CLI mastra — delta,
  nunca kill a procesos ajenos); S5 puerto MCP ocupado por un dummy →
  exit ≠ 0 + error que nombra el puerto y `--mcp-port`.
- **README** — sección "Hub (un comando, estilo gateway)": qué levanta,
  flags, env, apagado, relación con studio-local.sh y notas honestas
  (browser aparte, loopback sin auth, camino 2 proceso-único como spike
  futuro).

## Files Changed

- `agents/mastra-handyman/src/ports/hub.ts` — **nuevo**: orquestación.
- `agents/mastra-handyman/src/ports/hub.test.ts` — **nuevo**: 11 tests.
- `agents/mastra-handyman/run-hub.ts` — **nuevo**: runner delgado.
- `agents/mastra-handyman/scripts/build_bundle.mjs` — RUNNERS += run-hub.
- `agents/mastra-handyman/scripts/smoke_hub.sh` — **nuevo**: smoke 5 casos.
- `agents/mastra-handyman/tsconfig.json` — include run-hub.ts.
- `agents/mastra-handyman/package.json` — script `run-hub`.
- `agents/mastra-handyman/README.md` — sección Hub.

## Decisions

- **`mastra dev` SIN `--port` (verificado en 1.20.3)**: elige el primer
  puerto libre en 4111..4131 (`getPort` sobre 21 candidatos) y loguea
  `Mastra Studio running` con la URL. Por eso el hub lee la URL REAL del
  stdout del hijo en vez de asumir 4111, y por eso NO existe `--studio-port`
  (el brief lo condicionaba al soporte). El filtro por ventana 4111-4131 es
  necesario: el boot de los agentes imprime la URL del MCP dentro del
  output del hijo studio — el primer smoke mío tomó
  `http://127.0.0.1:18899/` como "Studio" (bug reproducido y corregido con
  test de regresión incluido).
- **NO se usa `mastra dev -e`** (desviación respecto a la sugerencia inicial
  del brief de "mismos flags que el script studio"): el comando dev de
  mastra 1.20.3 parsea el env file y lo asigna INCONDICIONALMENTE en
  `process.env` (`DevBundler.loadEnvVars` → `for (const [k,v] of loadedEnv)
  process.env[k] = v`, verificado en el dist) — clobber del wiring del hub.
  Reproducido en vivo: el `.env` raíz define `HANDYMAN_PROJECT_ROOT=…` y el
  Studio arrancó conduciendo ESE proyecto en vez del pedido por `--project`
  (crash `project 'handyman' is not registered` contra el registry
  aislado). Fix: el hub parsea el `.env` él mismo (`parseEnvFile`) y lo
  funde como capa de MENOR precedencia (operator env > archivo; wiring >
  ambos), conservando la conveniencia (keys/model vars sin exportar).
  **Hallazgo lateral para el operador**: `scripts/studio-local.sh` pasa
  `-e ../../.env` — sus propios exports de `HANDYMAN_PROJECT_ROOT` quedan
  pisados por el `.env` bajo la misma lógica; queda reportado, no tocado
  (fuera de alcance).
- **El bin mastra se invoca como `<pkg>/dist/index.js` con
  `process.execPath`**: el `.bin/mastra` es un shim sh (verificado) —
  spawn directo del entry JS, sin depender de PATH ni del shim.
- **Health-wait + settle**: tras la primera respuesta HTTP se espera
  ~500ms y se re-verifica que el hijo siga vivo — cubre la carrera "el
  puerto responde porque OTRO server lo tiene y nuestro hijo aún no ha
  muerto por el bind".
- **Env del hijo studio = passthrough completo** (este hijo SÍ corre los
  agentes y necesita las keys — a diferencia del hijo MCP de F104);
  DATA/TELEMETRY viajan solo si el operador las exportó.
- **Sin handler de señales en los hijos más allá de SIGTERM/SIGKILL del
  hub**: los hijos mueren con el padre por diseño (pipes + señal); el smoke
  aserta el resultado (cero huérfanos), no el mecanismo.

## Test Output

```text
cd agents/mastra-handyman
pnpm test:unit          # Test Files 11 passed (11) · Tests 105 passed (105)
pnpm exec tsc --noEmit  # exit 0
pnpm build:bundle       # 4 runners · status: ok
bash scripts/smoke_hub.sh
#   PASS build:bundle emits run-hub.mjs
#   PASS banner with the access URLs appears (mastra dev may take ~90s)
#   PASS the MCP child answers on its port
#   PASS SIGINT exits 0 and leaves no mcp/studio orphans
#   PASS hub against an owned MCP port exits non-zero naming the port
# Summary: 5 run, 5 passed, 0 failed
./init.sh               # VERIFIER: all gates passed (exit 0)
```

## Evidencia del banner (smoke en vivo)

```text
[hub] review stack up:
[hub]   Studio:  http://localhost:4111/
[hub]   MCP:     http://127.0.0.1:18899/mcp (embedded child of this hub)
[hub]   project: /tmp/…/hub-probe (pinned at the agents' MCP client)
[hub] Ctrl+C stops everything
```

Desde un cwd ajeno, con `HANDYMAN_ROOT` aislado y proyecto por NOMBRE:
MCP hijo sano en su puerto, Studio real en 4111 (detectado por ventana,
no por primer-URL — ver Decisions), SIGINT limpio sin huérfanos, y el
caso de puerto ocupado fallando con el mensaje accionable.

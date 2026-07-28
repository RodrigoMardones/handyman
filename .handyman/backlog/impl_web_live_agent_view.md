---
type: Implementation Log
feature: web_live_agent_view
status: implemented
role: implementer
updated: 2026-07-28
tags: [handyman/role/implementer, handyman/feature/web_live_agent_view]
---

# Implementation Report: web_live_agent_view

## Files Changed

- `apps/web/app/agent/page.tsx` (nuevo) — RSC `force-dynamic`; `searchParams`
  como Promise; nav inline (Fleet/Timeline/Search/Agent con aria-current);
  form GET sin JS para elegir feature; `ToolboxShell` con harnesses via
  getRuntime/getBuildState + try/catch; banner `role="alert"` en degradado;
  monta `<AgentLive>`.
- `apps/web/app/agent/agentHtml.ts` (nuevo) — renderer PURO cero imports
  (`renderAgentHtml(state)`, `esc()` verbatim de fleetHtml): estados sin
  feature / runtime offline / sin telemetria / con datos (chips, actividad,
  tabla byType, toolErrors, slowOps, outcomes). Determinista.
- `apps/web/app/agent/page.module.css` (nuevo) — base copiada de timeline +
  clases propias con tokens de globals.css.
- `apps/web/components/AgentLive.tsx` (nuevo) — `"use client"`, polling
  `setInterval` 5s a `/api/agent?feature=` same-origin (desviacion documentada
  del molde SSE: no existe feed SSE para esta fuente), region con
  `dangerouslySetInnerHTML`; sin `innerHTML =`, sin keydown, sin origenes
  externos.
- `apps/web/app/api/agent/loadAgentState.ts` (nuevo) — loader compartido
  route/page: validacion `^[A-Za-z0-9_-]+$`, tail de 256 KB del JSONL de
  telemetria (`FLUE_AGENT_LOGS_DIR`, default `agents/flue-handyman/logs`),
  parseo tolerante, agregacion (total/byType/lastType/lastTimestamp/outcomes/
  toolErrors/slowOps con mirror de SLOW_OPERATION_MS), probe de liveness a
  `FLUE_BASE_URL` con timeout 1.5s. Nunca lanza.
- `apps/web/app/api/agent/route.ts` (nuevo) — GET `force-dynamic`, 400 con
  body nombrado, 200 `{ ok, runtime, feature, telemetry }` via `sendJson`;
  try/catch final que degrada (nunca 500).
- `tests/test_web_agent.sh` (nuevo, 10 casos) + registro en `tests/run_tests.sh`.

## Design Notes

- Fuente de datos: la telemetria PROPIA (`logs/agent-<feature>.jsonl`,
  formato estable y ya sanitizado por la feature 92) + probe de liveness —
  NO el wire protocol de Flue (interno e inestable en beta). Es la opcion
  honesta para un observador read-only: si el runtime no existe o el shape
  drifta, la vista degrada sin romperse.
- CSP intacta (`connect-src 'self'`): el cliente solo fetchea `/api/agent`
  same-origin; el probe a `127.0.0.1:3583` ocurre server-side.
- Cero deps nuevas (fetch nativo); cero em/en dashes (scan en suite);
  registro en nav propio solamente (precedente intake/ask: no se tocan
  palette/shortcuts ni los navs de otras vistas).
- Smoke extra del loader verificado por el implementador: fixture JSONL con
  agregacion exacta, linea invalida ignorada, offline por puerto cerrado,
  archivo inexistente -> `telemetry:null`, y tail correcto en archivo de
  ~540 KB (lee solo los ultimos 256 KB).

## Test Output

```text
tests/test_web_agent.sh: 10/10 (re-verificado por el lider tras la implementacion)
pnpm --filter @handyman/web build: compila; /agent y /api/agent como rutas dinamicas
tests/test_web_landing.sh 3/3 y test_web_fleet.sh 10/10: scans globales verdes
./init.sh → exit 0 (verificado en feature.js done)
```

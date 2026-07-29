---
type: Review Log
feature: mastra_hub_command
status: approved
role: reviewer
updated: 2026-07-29
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/mastra_hub_command]
---

# Review: mastra_hub_command

## Verdict

APPROVED   <!-- or CHANGES_REQUESTED -->

## Stage 1: Spec Compliance

_Review the change against the feature request and its acceptance criteria first. A Stage 1 failure ends the review: report CHANGES_REQUESTED without moving to Stage 2, so spec drift is never buried under style feedback._

- [x] Every acceptance criterion is satisfied
- [x] The change stays inside the feature's declared scope
- [x] The implementation report exists and matches what changed

## Stage 2: Code Quality

_Only after Stage 1 passes._

- [x] Architecture respected
- [x] Conventions respected
- [x] Tests meaningful and green
- [x] Verifier exits 0

## Required Changes

_None, or a concrete list of file-specific changes._

## Evidence

- **Spec (Stage 1):** (a) `node dist-bundle/run-hub.mjs --project <nombre>` levanta MCP + Studio con health-wait y banner con URLs reales (smoke: `Studio: http://localhost:4111/`, `MCP: http://127.0.0.1:18899/mcp`, proyecto pineado); Ctrl+C exit 0 con pgrep-delta cero en ambos hijos; (b) puerto MCP ocupado → exit≠0 nombrando el puerto y el escape `--mcp-port` (caso del smoke con MCP dummy); (c) orquestación con 11 tests unitarios (planes, precedencia dotenv, health-wait, banner, shutdown, propagación de exit code); (d) 105/105 vitest + tsc + bundle 4 runners + smoke 5/5 + init.sh all gates passed; README documenta el hub.
- **Revisión propia:** leído `src/ports/hub.ts` completo (339 líneas) — todo inyectable (spawn/fetch/sleep/log/onSignal); `waitForHttp` con detección de hijo muerto + re-check de settle (caza "el puerto respondió pero no era nuestro hijo"); `extractLocalUrl` con filtro de ventana 4111-4131 (necesario: el boot de los agentes imprime la URL del MCP en el mismo stream — bug reproducido y test de regresión); decisión correcta y documentada de NO usar `mastra dev -e` (DevBundler.loadEnvVars clobberiza process.env incondicionalmente — verificado en el dist de mastra 1.20.3; el hub funde dotenv con la MENOR precedencia); hijo MCP con env mínimo, hijo studio con env completo (necesita LLM keys); shutdown SIGTERM→SIGKILL con gracia y propagación de exit code.
- **Hallazgo lateral (registrado, fuera de scope):** `scripts/studio-local.sh` sufre el mismo clobber de dotenv con su `-e ../../.env` — candidato a feature menor.
- **C4:** `bash scripts/smoke_hub.sh` re-corrido por el reviewer: 5/5 PASS (banner <90s, MCP responde, SIGINT sin huérfanos, puerto ocupado accionable).

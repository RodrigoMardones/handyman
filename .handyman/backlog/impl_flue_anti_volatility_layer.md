---
type: Implementation Log
feature: flue_anti_volatility_layer
status: implemented
role: implementer
updated: 2026-07-28
tags: [handyman/role/implementer, handyman/feature/flue_anti_volatility_layer]
---

# Implementation Report: flue_anti_volatility_layer

## Files Changed

- `agents/flue-handyman/src/flue/index.ts` (nuevo) — barrel anti-volatilidad:
  unico modulo del paquete que importa `@flue/*`. Re-exporta solo lo usado:
  `defineAgent`, `defineAgentProfile`, `connectMcpServer`, `registerProvider`,
  `observe`, `dispatch` + tipos de `@flue/runtime`; `flue` de
  `@flue/runtime/routing`; `createFlueClient` + `FlueConversationMessage` de
  `@flue/sdk`. Comentario de cabecera fija la regla y la excepcion.
- `agents/flue-handyman/src/app.ts` — importa `flue, registerProvider` desde `./flue`.
- `agents/flue-handyman/src/agents/handyman-leader.ts` — importa
  `defineAgent, defineAgentProfile, connectMcpServer` desde `../flue`.
- `agents/flue-handyman/src/evals/harness.ts` — importa `createFlueClient` +
  tipo desde `../../flue`.
- `agents/flue-handyman/run-feature.mjs` — excepcion documentada (driver .mjs
  sin build): sigue importando `@flue/sdk` directo, con comentario que lo dice.
- `tests/test_flue_agents.sh` — caso TFA10 nuevo: barrel existe, ningun
  `from '@flue/` fuera de `src/flue/`, consumidores por ruta relativa y
  excepcion documentada. (Ajuste fino: el grep apunta a `from '@flue/` para no
  confundir prosa con imports.)
- `agents/flue-handyman/README.md` — seccion del agente documenta la capa.

## Design Notes

- Cero cambio de comportamiento: solo rutas de import + comentarios + test.
- Se re-exportan `observe` y `dispatch` aunque aun no tienen consumidor:
  entran en la superficie estable que usan las features siguientes
  (telemetry sink, intake futuro) y listarlos aqui evita tocar el barrel en
  cada feature. Workflows deliberadamente fuera (muere en 1.0).
- El barrel re-exporta tipos (`AgentProfile`, `FlueEvent`,
  `FlueEventSubscriber`, `McpServerConnection`, `ToolDefinition`) para que el
  resto del paquete tampoco necesite `import type` de `@flue/*`.

## Test Output

```text
tests/test_flue_agents.sh: 10/10 (TFA10 nuevo verde)
pnpm --filter @handyman/flue-handyman build: OK (dist/server.mjs; el barrel
resuelve via vite)
./init.sh → exit 0 (verificado en feature.js done)
```

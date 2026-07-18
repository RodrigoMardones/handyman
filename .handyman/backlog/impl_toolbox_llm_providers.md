---
feature: toolbox_llm_providers
status: implemented
role: implementer
updated: 2026-07-17
tags: [handyman/role/implementer, handyman/feature/toolbox_llm_providers]
---

# Implementation Report: toolbox_llm_providers

## Files Changed

- `handyman/src/toolbox_llm.ts` (nuevo): puerto `LlmProvider` (id, model,
  `available()`, `draft()` con deltas por callback), adapter Anthropic
  Messages (Claude via x-api-key; Z.ai Coding Plan via Bearer contra
  `api.z.ai/api/anthropic`), adapter OpenAI-compatible (Z.ai `paas/v4` con
  `Z_AI_API_MODE=paas`; Ollama con health check), `buildProviders(env)`,
  `providersInfo()` (copilot declarado como id futuro) y `loadDotEnv()`
  (sin dependencia dotenv; el env existente siempre gana; nunca loggea).
- `handyman/src/toolbox_serve.ts`: carga `.env` del cwd al arrancar,
  construye providers una vez, y `GET /api/providers` responde
  `{providers:[{id,available,model}]}` (500 si el chequeo falla). Header
  doc actualizado.
- `tests/test_toolbox_llm.js` (nuevo): 15 casos con fetch mockeado — sin
  red: factory por env, streaming de ambos adapters, auth por vendor,
  thinking disabled por defecto en GLM y cap de max_tokens 131072,
  401→unauthorized, 1113→insufficient_balance, política de red de
  `available()`, shape de `providersInfo` sin material de keys, loadDotEnv.
- `tests/test_toolbox_serve.sh`: caso black-box de `/api/providers`
  (shape + copilot futuro).
- `tests/run_tests.sh`: suite nueva cableada.
- `handyman/references/toolbox.md`: endpoint y sección "LLM layer".

## Design Notes

- Sin dependencias nuevas: fetch nativo de Node ≥20 y ReadableStream
  async-iterable para el parse SSE (generador `sseData` compartido).
- Dos adapters parametrizados por `baseUrl` en vez de uno por vendor:
  el hallazgo empírico 2026-07 es que el GLM Coding Plan solo sirve
  GLM-5.2 por el protocolo Anthropic, así que zai default usa ese adapter
  y `paas` queda como modo explícito.
- Errores mapeados a códigos estables (`unauthorized`,
  `insufficient_balance`, `provider_error`) para que la UI futura (#25/#26)
  los traduzca sin parsear texto de vendor; cuerpo truncado a 300 chars.
- `available()` no toca la red salvo el probe de Ollama (timeout 1.5s,
  degrada a false); providers sin key no se instancian.
- Chequeo funcional manual (fuera de CI): server desde el repo root con
  `.env` real → `/api/providers` = zai available:true model glm-5.2,
  ollama false (no corre), copilot false/null. Sin material de keys.

## Test Output

```text
toolBox LLM suite (test_toolbox_llm.js): Summary: 15 run, 15 passed, 0 failed
toolBox observer suite (test_toolbox_serve.sh): Summary: 24 run, 24 passed, 0 failed
  (nuevo) PASS /api/providers reports id/available/model and declares copilot future
bash tests/run_tests.sh: ALL SUITES PASSED
```

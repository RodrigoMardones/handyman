---
type: Implementation Log
feature: flue_telemetry_sink
status: implemented
role: implementer
updated: 2026-07-28
tags: [handyman/role/implementer, handyman/feature/flue_telemetry_sink]
---

# Implementation Report: flue_telemetry_sink

## Files Changed

- `agents/flue-handyman/src/ports/telemetry-sink.ts` (nuevo) —
  `createTelemetrySink({dir, info, warn})` (subscriber puro testeable) e
  `installTelemetrySink({dir?})` (wire a `observe()` via barrel; dir default
  `process.cwd()/logs`, override `HANDYMAN_TELEMETRY_DIR`). `projectEvent()`
  sanitiza cada `FlueEvent`: verbatim solo ids de correlacion + escalares
  seguros + `usage`; `error` se proyecta a `{type, message}` (caller-safe por
  convencion Flue); todo lo demas (deltas, mensajes, args/results) -> `{chars}`.
  Consola por outcomes: `submission_settled`, `run_end` con error, operacion
  fallida, operacion lenta (>5 min, `SLOW_OPERATION_MS`).
- `agents/flue-handyman/src/ports/telemetry-sink.test.ts` (nuevo) — 4 tests
  unitarios vitest (eventos fake, dir temporal, consola inyectada): correlacion
  por instancia, omision de contenido, escalares/usage verbatim, outcomes en
  consola sin ruido de tool calls.
- `agents/flue-handyman/src/app.ts` — instala el sink tras registrar providers.
- `agents/flue-handyman/.gitignore` (nuevo) — `logs/`, `dist/`, `.flue-vite/`.
- `agents/flue-handyman/package.json` — script `test:unit` (`vitest run`;
  los evals `*.eval.ts` no matchean el include por defecto, asi que unit y
  evals quedan separados).
- `tests/test_flue_agents.sh` — caso TFA11: sink existe, esta cableado en
  app.ts, `logs/` ignorado y `pnpm test:unit` verde.
- `agents/flue-handyman/README.md` — seccion "Telemetria" (politica de
  privacidad, outcomes vs errores anidados, correlacion con history.md).

## Design Notes

- Privacidad como invariante de diseno: NUNCA contenido de mensajes en logs
  (PII); el formato JSONL ya nace sanitizado, no hay modo "verbose" que lo
  rompa. OTel GenAI queda como siguiente paso opt-in (`@flue/opentelemetry`).
- Consola orientada a outcomes siguiendo la guia oficial de Flue: las tool
  calls con error son dato para el modelo (recuperables) — quedan en el JSONL
  pero no alertan.
- Correlacion sin duplicar: `instanceId` = feature; el JSONL es pista de
  ejecucion, `history.md` sigue siendo la pista de negocio.

## Test Output

```text
pnpm test:unit: 4/4 (vitest, ~0.3s, sin API ni runtime)
tests/test_flue_agents.sh: 11/11 (TFA11 nuevo)
pnpm --filter @handyman/flue-handyman build: OK (dist limpiado tras el smoke)
./init.sh → exit 0 (verificado en feature.js done)
```

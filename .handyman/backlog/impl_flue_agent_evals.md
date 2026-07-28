---
type: Implementation Log
feature: flue_agent_evals
status: implemented
role: implementer
updated: 2026-07-27
tags: [handyman/role/implementer, handyman/feature/flue_agent_evals]
---

# Implementation Report: flue_agent_evals

Trabajo ejecutado en la sesión 2026-07-27 (commit `7f5d945`); este reporte
formaliza el cierre.

## Files Changed

- `agents/flue-handyman/src/evals/handyman-leader.eval.ts` — 2 casos vivos
  (camino verde con secuencia MCP completa + verifier en rojo con rechazo del
  close y cleanup por CLI).
- `agents/flue-handyman/src/evals/harness.ts` — harness vitest-evals sobre la
  frontera HTTP pública (`FLUE_BASE_URL`), adaptado a `send`+`wait` y con
  aserciones de verdad en disco (`feature_list.json` del scratch).
- `agents/flue-handyman/vitest.evals.config.ts` + script `pnpm evals`
  (`evals:json` para reporte JSON).

## Design Notes

- Acceptance: (1) "eval suite runs via vitest-evals against flue dev and
  passes" — 2/2 verdes, 483 s, ~86k tokens (documentado en README §Evals);
  (2) "no API calls in structural tests; evals documented as API-cost tests" —
  `tests/test_flue_agents.sh` es 100 % estructural (archivos, manifest,
  greps de contrato, cero red); los evals viven fuera de `run_tests.sh` y el
  README los marca como tests con coste de API real.
- Sin jueces de modelo: aserciones deterministas (secuencia de tools + estado
  en disco). `toSatisfyJudge` con juez independiente queda como siguiente paso
  natural (recogido en el roadmap del explore de arquitectura).

## Test Output

```text
pnpm evals: 2/2 passing (483s, ~86k tokens, coste API real)
tests/test_flue_agents.sh: 9/9 sin llamadas API
./init.sh → exit 0 (verificado en feature.js done)
```

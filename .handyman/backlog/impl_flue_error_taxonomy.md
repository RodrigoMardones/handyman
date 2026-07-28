---
type: Implementation Log
feature: flue_error_taxonomy
status: implemented
role: implementer
updated: 2026-07-28
tags: [handyman/role/implementer, handyman/feature/flue_error_taxonomy]
---

# Implementation Report: flue_error_taxonomy

## Files Changed

- `agents/flue-handyman/src/domain/errors.ts` (nuevo) — taxonomia de 3 clases
  (`domain_outcome` / `transient_infra` / `protocol_error`) + `retryPolicy`
  (`never` / `reconnect` / `model_corrects`). `FLUE_TYPE_CLASS` mapea los
  `type` snake_case de FlueError (contrato estable, no `message`);
  `classifyHandymanToolResult` marca todo `mcp__handyman__*` con isError como
  outcome de dominio; `classify` unifica (type -> client -> default
  transient_infra acotado).
- `agents/flue-handyman/src/domain/client-error-classes.mjs` (nuevo, JS plano)
  — tabla de errores de cliente compartida por TS y por el driver standalone
  (UNA fuente de verdad): nombres transientes (HeadersTimeoutError, FetchError,
  StreamClosedError, DurableStreamError), terminales (FetchBackoffAbortError,
  FlueExecutionError, UnsupportedFlueEventVersionError), status 429/5xx vs
  4xx, y default transient documentado. Duck-typing por name/status (sin
  instanceof: el driver captura lo que sea que lance undici).
- `agents/flue-handyman/src/domain/errors.test.ts` (nuevo) — 5 grupos de
  tests unitarios (types, client, status, MCP, policy) sin API ni runtime.
- `agents/flue-handyman/run-feature.mjs` — loop de reconexion: ante fallo
  transiente del `wait`, re-adjunta al MISMO admission con backoff
  exponencial (1s->15s, max 5) en vez de re-dispatch; no transiente o budget
  agotado -> throw.
- `agents/flue-handyman/README.md` — seccion "Taxonomia de errores y politica
  de retry" (tabla de 3 clases + detalles de diseno).
- `tests/test_flue_agents.sh` — caso TFA13 (errors.ts + retryPolicy, driver
  con la tabla compartida, unit tests verdes).

## Design Notes

- Regla central del diseno (del explore secc. 5.2): los rechazos de negocio
  NO son errores a reintentar — son outcomes que el leader reporta; solo la
  infra transiente se reconecta, siempre al mismo admission (Durable Streams:
  re-dispatch duplicaria el ciclo).
- El default de desconocidos a `transient_infra` es deliberado y esta
  documentado: el budget acotado del driver evita loops infinitos de bugs
  reales; el caso peor termina en throw tras 5 reconexiones.
- Sin cambios en el agente: la taxonomia ya era respetada por el prompt del
  leader (outcomes de dominio) y ahora tambien por el driver (infra).

## Test Output

```text
pnpm test:unit: 15 tests (4 telemetry + 11 taxonomy) verdes
node --check run-feature.mjs: OK
tests/test_flue_agents.sh: 13/13 (TFA13 nuevo)
pnpm build: OK
./init.sh → exit 0 (verificado en feature.js done)
```

---
type: Implementation Log
feature: flue_model_catalog
status: implemented
role: implementer
updated: 2026-07-28
tags: [handyman/role/implementer, handyman/feature/flue_model_catalog]
---

# Implementation Report: flue_model_catalog

## Files Changed

- `agents/flue-handyman/src/ports/model-catalog.ts` (nuevo) — unico modulo que
  conoce endpoints, env keys y tuning por provider: `registerModelProviders()`
  (override `anthropic`->Z.AI con tuning GLM + `kimi-coding` con KIMI_API_KEY),
  `resolveRoleModels()` (HANDYMAN_*_MODEL con default `anthropic/glm-5.2`),
  `DEFAULT_ROLE_MODEL` y `AGENT_TUNING` (`thinkingLevel: 'minimal'` + la
  razon: GLM quema max_tokens en thinking).
- `agents/flue-handyman/src/app.ts` — queda solo composicion HTTP:
  `registerModelProviders()` + Hono + `flue()`.
- `agents/flue-handyman/src/agents/handyman-leader.ts` — `MODELS =
  resolveRoleModels()` y `...AGENT_TUNING` en vez de env vars y thinkingLevel
  inline; comentario moonshot obsoleto eliminado.
- `.env` (raiz) — `MOONSHOT_API_KEY` renombrada a `KIMI_API_KEY` via sed
  (valor intacto, nunca impreso; el token siempre fue de Kimi for Coding).
- `tests/test_flue_agents.sh` — TFA6 apunta al catalogo (+`resolveRoleModels`
  en el agente); TFA8 aserta `registerModelProviders` en app.ts, los dos
  `registerProvider` en el catalogo y **cero** `MOONSHOT_API_KEY` en src/.
  `CATALOG` se define una vez al inicio del script.
- `agents/flue-handyman/README.md` — seccion "Modelos por rol" reescrita:
  catalogo como fuente, KIMI_API_KEY sin fallback, Moonshot plataforma
  documentado como NO configurado (401 con token coding).

## Design Notes

- Cero cambio de comportamiento observable: mismos providers, mismos defaults,
  mismo tuning; solo cambia el dueno del conocimiento (un modulo).
- `resolveRoleModels`/`registerModelProviders` toman `env = process.env`
  inyectable: quedan testeables sin tocar el entorno real.
- Moonshot plataforma queda deliberadamente fuera: registrarla con la key
  equivocada era la fuente del 401 documentado en el spike; si se necesita,
  se registra explicitamente con su propia key (comentario en el catalogo).

## Test Output

```text
tests/test_flue_agents.sh: 10/10 (TFA6/TFA8 reescritos)
pnpm --filter @handyman/flue-handyman build: OK (dist/server.mjs; se limpio tras el smoke)
./init.sh → exit 0 (verificado en feature.js done)
```

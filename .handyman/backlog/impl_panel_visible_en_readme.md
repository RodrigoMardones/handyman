---
type: Implementation Log
feature: panel_visible_en_readme
status: implemented
role: implementer
updated: 2026-07-19
tags: [handyman/role/implementer, handyman/feature/panel_visible_en_readme]
---

# Implementation Report: panel_visible_en_readme

## Files Changed

- `apps/web/README.md` (nuevo): arranque del panel en 4 pasos (`pnpm install`,
  `pnpm --filter handyman build`, `toolbox.js register` que crea
  `$HANDYMAN_ROOT/registry.json`, `pnpm --filter @handyman/web dev` en :3210),
  requisito Node >= 22.13 (pnpm 11 usa `node:sqlite`; el toolchain soporta >= 20),
  tabla de providers LLM opcionales (`ANTHROPIC_API_KEY`, `Z_AI_API_KEY`,
  Ollama sin key) leida de `PROVIDER_REGISTRY` en `toolbox-core/src/llm.ts`,
  nota de que el registry es allowlist de lectura, produccion (build/start) y
  mapa del workspace.
- `README.md` (raiz): seccion nueva "Estructura Del Monorepo" con las tres
  unidades (`handyman/`, `packages/toolbox-core/`, `apps/web/`) y los tres
  comandos de arranque; dos filas nuevas en la Guia Rapida enlazando el panel
  y la estructura.

## Design Notes

- El paso 2 compila `@handyman/toolbox-core` transitivamente: el build es
  `tsc -b` y `handyman/tsconfig.json` declara la project reference. Verificado
  en el clon (aparece `packages/toolbox-core/dist/index.js` sin paso extra).
- El panel no necesita `toolbox.js serve`: `apps/web/lib/runtime.ts` embebe el
  observer in-process (`buildProviders` + registry + fs.watch). El README lo
  dice explicito para que nadie busque un server aparte.
- Primera version del titulo usaba em-dash y lo cazaron los checks de estilo
  (`test_web_landing/fleet/harness.sh`: "apps/web has zero em-dashes");
  reescrito con `:`. La regla cubre `apps/web` completo, README incluido.
- Keys LLM: documentado `.env` en el directorio de arranque con `TOOLBOX_ENV_DIR`
  como override (contrato de `runtime.ts`), y advertencia de no commitear keys
  reales (el whitelist de la feature 64 debe excluir `handyman/.env`).

## Test Output

```text
bash scratchpad/verify_clone_66.sh (clon limpio de HEAD, HANDYMAN_ROOT aislado)
  == paso 1: pnpm install ==            OK
  == paso 2: pnpm --filter handyman build == OK (+ toolbox-core dist via references)
  == paso 3: register ==                OK registry.json en HANDYMAN_ROOT
  == paso 4: panel dev ==               OK panel responde 200 en :3213
bash tests/run_tests.sh -> ALL SUITES PASSED
```

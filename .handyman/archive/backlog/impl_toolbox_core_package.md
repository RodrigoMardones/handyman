---
type: Implementation Log
feature: toolbox_core_package
id: 42
role: implementer
date: 2026-07-18
verdict: implemented
tags: [handyman/backlog/impl]
---

# Impl: toolbox_core_package (feature 42)

Fase 2 del plan [[../docs/sprints/plan-migracion-toolbox-nextjs]] segun
[[explore_toolbox_next_unification]]: nace `packages/toolbox-core`
(`@handyman/toolbox-core`), la capa HTTP-agnostica del toolBox importable por
`apps/web` sin HTTP. Cero cambio de comportamiento observable: el oraculo de
paridad corre 48/48 sin editar una sola asercion.

## Que se movio (mover, no reescribir)

| Paquete (`packages/toolbox-core/src/`) | Origen | Ajuste |
|---|---|---|
| `llm.ts` | `handyman/src/toolbox_llm.ts` | copia verbatim (autocontenido) |
| `summary.ts` | `toolbox_summary.ts` | import `./llm.js` |
| `ask.ts` | `toolbox_ask.ts` | import `./llm.js` |
| `draft.ts` | `toolbox_draft.ts` | imports locales + `buildDraftSystem(assetsDir)` pasa a parametro requerido (el template es asset de handyman) |
| `workspace.ts` | `core/workspace.ts` | copia verbatim |
| `registry.ts` | bloque registry de `toolbox.ts` (`handymanRoot`, `registryPath`, `loadRegistry`, `saveRegistry`, `isHarnessRoot`, tipos) | copia verbatim; `saveRegistry`/`isHarnessRoot` ahora exportados |
| `state.ts` | guards/corpus/md/tags/CSP de `toolbox_serve.ts` (`isRegisteredRoot`, `containedPath`, `resolveTagFile`, `listTagFiles`, `readTagFiles`, `readFeatures`, `buildCorpus`, `resolveMd`, `CSP_HEADER`, caps) | copia verbatim |

`buildState` NO se movio al paquete: necesita `snapshots`/`harnessSignals`/
`fleetAggregate`/`toolboxTimeline`/`currentSkillVersion` (maquinaria del CLI).
Vive en `handyman/src/toolbox_state.ts` y se expone con el export
`"./state"` de `handyman/package.json` (extraccion gradual: la fase 4 puede
completar el movimiento cuando el CLI se parta en su propia feature).

## Shims (entrypoints dist/ estables)

`handyman/src/toolbox_llm.ts`, `toolbox_ask.ts`, `toolbox_summary.ts`,
`core/workspace.ts` re-exportan del paquete; `toolbox_draft.ts` ademas
conserva el default historico de `buildDraftSystem` (`../assets` relativo a
si mismo). `toolbox.ts` importa el registry del paquete y re-exporta
`handymanRoot/loadRegistry/registryPath` + tipos. Resultado: los tests
existentes (`test_toolbox_llm.js`, `test_toolbox_draft.js`,
`core/workspace.test.ts`) corren sin editar y `LlmError` conserva identidad
de modulo (instancia unica via symlink pnpm; asertado en la suite nueva).

## Cableado

- `pnpm-workspace.yaml` += `packages/*`; `handyman` y `apps/web` dependen
  `workspace:*`; `apps/web/next.config.ts` declara `serverExternalPackages`
  (no bundlear: preserva `import.meta.url` de assets).
- Build: `handyman npm run build` = `tsc -b` con project reference (el
  paquete compila primero, emite d.ts). `handyman/tsconfig.json` +=
  `references`.
- CI (`.github/workflows/ci.yml`): `npm ci` (que no entiende `workspace:*`)
  se reemplaza por pnpm/action-setup + `pnpm install --frozen-lockfile` en la
  raiz; `handyman/package-lock.json` eliminado (era el lockfile del flujo
  npm). Validado localmente: frozen-lockfile pasa y `pnpm-lock.yaml` registra
  el paquete (+22 lineas).
- `apps/web/lib/toolboxCore.ts`: smoke de resolucion (typecheck verde); la
  feature 43 lo reemplaza por `lib/runtime.ts`.

## Verificacion

- `tests/test_toolbox_state.js` (nuevo, 17 casos): corpus/kinds/refs,
  allowlist `resolveMd` (traversal, root no registrado, nombre fuera de
  whitelist), `listTagFiles`/`readTagFiles` (binarios fuera, dedupe,
  escapes), identidad de shims, shape de `buildState`. Cableado en
  `run_tests.sh` (20 suites).
- Oraculo `test_toolbox_serve.sh`: **48/48 sin editar aserciones**.
- Suites previas intactas: llm 25/25, draft 24/24, toolbox 23/23.
- Biome: 0 errores en archivos tocados (auto-fix de formato/orden de
  imports); las 23 warnings restantes son deuda preexistente de archivos no
  tocados (`feature.ts` etc.).
- `bash tests/run_tests.sh` + `./init.sh`: **VERIFIER: all gates passed**.

## Notas / desvios

- `docs/architecture.md` actualizado (capa "Paquete toolbox-core").
- El script npm `toolbox:serve` sigue apuntando a `--port 3000` (desalineado
  con el default 8765); se alineara en la feature de decomisionado (50).
- Deuda que esta feature NO toca: `vendorFiles`/`packageRoot`/`vendorText` y
  el lookup de `/graph` siguen en `toolbox_serve.ts`; se extraen en la 44.

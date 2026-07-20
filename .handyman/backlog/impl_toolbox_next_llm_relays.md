---
type: Implementation Log
feature: toolbox_next_llm_relays
id: 45
role: implementer
date: 2026-07-18
verdict: implemented
tags: [handyman/backlog/impl]
---

# Impl: toolbox_next_llm_relays (feature 45)

Los tres relays SSE-over-POST robados a Next. Con esto Next sirve
nativamente toda la lectura + relays del observer; quedan proxeados solo
`POST /api/intake` (feature 46) y el panel de `GET /` (feature 49).

## Piezas

- `packages/toolbox-core/src/summary.ts` gana `resolveSummaryModel` (movida
  VERBATIM de toolbox_serve.ts, firma con `Record<string,string|undefined>`);
  el serve la importa via el shim toolbox_summary (cero duplicacion).
- `apps/web/lib/relay.ts`: `readJsonObject(request, cap 256KB)` espejo del
  observer (null en oversize/malformado/no-objeto, cancelando el reader) y
  `relayResponse(handler)`: Response SSE con los 5 headers exactos del
  relay del observer y `sse(event, data)` emitiendo
  `event: X\ndata: <json>\n\n` byte-estable.
- Route handlers (POST, force-dynamic):
  - `app/api/draft/route.ts`: validaciones 400 identicas (invalid body /
    root not registered / unknown provider, todas antes del LLM),
    readTagFiles + buildDraftContext + composeSystem con
    `buildDraftSystem(getHandymanAssetsDir())` (el template sigue siendo
    asset de handyman; el loader expone el dir) + relayDraft.
  - `app/api/summarize/route.ts`: digest de buildState (loader runtime) +
    summaryHash; hit en `runtime.summaryCache` -> un solo `event: result`
    {cached:true, hash} SIN llamar al provider; miss -> stream + cache.set +
    {cached:false, hash}.
  - `app/api/ask/route.ts`: validaciones identicas, buildCorpus filtrado por
    root + retrieveTopK (BM25), relayAsk con fragments {ref,kind,title,score}
    (excerpts server-side).
  Providers siempre del runtime singleton (fake OLLAMA_BASE_URL intacto).
- `proxy.ts`: += `/api/draft`, `/api/summarize`, `/api/ask`.
- `apps/web/lib/toolboxState.ts`: += `getHandymanAssetsDir()`.
- `tests/test_web_relays.sh` (nuevo, 6 casos estructurales) + run_tests.sh
  (23 suites); `docs/verification.md` con el parrafo de la feature.

## Verificacion

- `./init.sh` exit 0 (23 suites OK); oraculo default (Node) 48/48 sin editar
  aserciones; test_toolbox_llm.js 25/25 y test_toolbox_draft.js 24/24
  intactos tras mover resolveSummaryModel.
- Corrida dual real: oraculo `TOOLBOX_BASE_URL` -> Next **42/48** con los
  MISMOS 6 fallos del carve-out de `GET /`; pasan servidos NATIVAMENTE:
  summarize delta+result cached:false, cache-hit con `GET /v1/calls == 1`
  contra el fake compartido (la SummaryCache del runtime de Next), ask con
  cita `[fuente: backlog:impl_alpha.md]` + fragments, y los 400 de draft.
  `/api/state` parity IDENTICAL re-verificada en la misma corrida.
- typecheck + next build (Turbopack) + biome verdes.

## Notas

- El dynamic `import("minisearch")` de draft/ask se bundlea sin problemas
  (dep del paquete core, bundle-safe); el unico modulo runtime-loaded sigue
  siendo handyman/dist/toolbox_state.js (buildState + assets).
- Con la 45 cerrada se desbloquean por depends_on las features 32-35
  (blocked -> elegibles cuando el leader las re-active) y la 46 (intake con
  server action) es el siguiente paso natural del plan.

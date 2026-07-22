---
type: Implementation Log
feature: toolbox_next_read_api
id: 44
role: implementer
date: 2026-07-18
verdict: implemented
tags: [handyman/backlog/impl]
---

# Impl: toolbox_next_read_api (feature 44)

Los seis GET de lectura restantes robados a Next como route handlers
delgados; el server Node conserva su superficie (oraculo default 48/48).

## Piezas

- `handyman/src/toolbox_assets.ts` (nuevo): `vendorText` (whitelist de UMDs
  + `packageRoot` con `createRequire(import.meta.url)`, resolucion relativa
  al paquete handyman) y `graphFile` (lookup por project_name + rewrite
  unpkg -> `/vendor/vis-network.js`), extraidos VERBATIM de
  toolbox_serve.ts. El serve los consume (handlers reescritos a las mismas
  respuestas byte-identicas); `toolbox_state.ts` los re-exporta para que el
  loader runtime de apps/web los alcance (jamas bundleados).
- `apps/web/lib/respond.ts`: `send`/`sendJson` espejo del serve (4 headers).
- `apps/web/lib/toolboxState.ts`: loader generalizado a `getToolboxEntry()`
  ({buildState, vendorText, graphFile}); `getBuildState()` se conserva.
- Route handlers (force-dynamic): `app/api/corpus`, `app/api/md` (allowlist
  400/404), `app/api/files` (guard root registrado), `app/api/providers`
  (providersInfo del singleton; 500 "provider check failed"),
  `app/graph/[...slug]` y `app/vendor/[...slug]` (catch-all reproduciendo el
  404 generico JSON del observer para shapes no matcheados; regex y bodies
  identicos, decodeURIComponent sobre el pathname crudo como serve).
- `proxy.ts`: pathnames `/api/corpus|files|providers|md` + prefijos
  `/graph/` y `/vendor/`.
- `tests/test_web_readapi.sh` (nuevo, 6 casos estructurales: handlers +
  force-dynamic + bodies exactos + strangler + logica compartida sin
  duplicar + loader). Cableado en run_tests.sh (22 suites).
- `docs/verification.md`: parrafo de la feature.

## Verificacion

- `./init.sh` exit 0, 22 suites OK; oraculo default (Node) 48/48 sin editar
  aserciones (el serve refactorizado a los helpers compartidos es
  byte-equivalente).
- Corrida dual real (mismo procedimiento que la 43): oraculo
  `TOOLBOX_BASE_URL` -> Next 42/48; los 6 fallos siguen siendo EXACTAMENTE
  el carve-out documentado de `GET /`; los casos de
  md/corpus/providers/files/graph/vendor pasan ahora servidos NATIVAMENTE
  (proxy ya no reenvia esos paths). `/api/state` parity IDENTICAL se
  re-verifico en la misma corrida.
- `pnpm --filter @handyman/web typecheck`, `next build` (Turbopack) y biome
  verdes.

## Notas

- El 405 de metodos no-GET sobre estas rutas lo produce Next (solo GET
  exportado); el oraculo asserta status, no body, y pasa (verificado en la
  corrida dual, caso guards).
- Deuda para la 45: relays LLM (draft/summarize/ask) siguen proxeados.

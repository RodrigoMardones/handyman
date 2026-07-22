---
type: Implementation Log
feature: toolbox_next_runtime_events
id: 43
role: implementer
date: 2026-07-18
verdict: implemented
tags: [handyman/backlog/impl]
---

# Impl: toolbox_next_runtime_events (feature 43)

Proceso unico en marcha: Next sirve `/events` y `/api/state` NATIVAMENTE
sobre un runtime singleton (providers + SummaryCache + watchers fs.watch),
y las paginas migradas leen el estado por llamada directa a `buildState`
en lugar de fetch al upstream. El server Node conserva su superficie
completa (el default del oraculo no cambia: 48/48 intactos).

## Piezas nuevas

- `apps/web/lib/changeHub.ts`: espejo puro del closure armWatchers/
  onFsEvent/broadcast del serve (guard por key de targets, debounce, re-arm
  tras cada broadcast). Deps inyectadas (listTargets/watchTarget/debounceMs)
  para testearlo transpilado sin fs ni Next.
- `apps/web/lib/runtime.ts`: singleton en `globalThis` (HMR-safe):
  `loadDotEnv(TOOLBOX_ENV_DIR ?? cwd)`, `buildProviders(env)`,
  `SummaryCache`, hub con `fs.watch recursive` sobre
  `[hroot, ...workspaces]` (mismos targets que serve).
- `apps/web/instrumentation.ts`: `register()` (solo NEXT_RUNTIME nodejs)
  arma el runtime en el boot.
- `apps/web/app/events/route.ts`: ReadableStream force-dynamic; framing
  identico a serve (`retry: 2000`, frames sin nombre `{"type":"change"}`,
  keepalive 25 s, mismos 3 headers; serve no manda CSP en esta ruta).
- `apps/web/app/api/state/route.ts`: mismos 4 headers del sendJson + mismo
  JSON.
- `apps/web/lib/toolboxState.ts` (**hallazgo central de la feature**): los
  dos bundlers de Next (Turbopack y webpack) bundlean los paquetes workspace
  symlinkeados IGNORANDO `serverExternalPackages` (su realpath vive fuera de
  node_modules), y el paquete CLI handyman no es bundleable: resuelve
  SKILL.md y assets via `import.meta.url` (el build fallaba con
  module-not-found, y un import dinamico con variable produce el stub
  "expression is too dynamic" en runtime). Solucion: loader runtime con
  `new Function("s","return import(s)")` (import nativo opaco al bundler)
  sobre `handyman/dist/toolbox_state.js`, raiz del repo por walk-up desde
  cwd (`TOOLBOX_REPO_ROOT` como override), cacheado en `globalThis`. El core
  (@handyman/toolbox-core) si es bundle-safe y sus imports estaticos quedan.

## Cambios

- `proxy.ts`: `NEXT_HANDLED_PATHNAMES` += `/api/state`, `/events`.
- `/fleet` y `/harness/[name]`: `loadState()` via `getRuntime()` +
  `getBuildState()` (force-dynamic explicito); Live components con
  `eventsUrl="/events"`, `stateUrl="/api/state"`, `mdUrl="/api/md"`
  relativos (md sigue proxeado hasta la 44); comentarios actualizados al
  contrato same-origin.
- `tests/test_web_fleet.sh` (TWF6) y `test_web_harness.sh` (TWH7):
  aserciones actualizadas DELIBERADAMENTE al contrato same-origin
  (documentado en el propio caso).
- `tests/test_web_runtime.sh` (nuevo, 7 casos): archivos + strangler +
  framing/force-dynamic + singleton + comportamiento del hub (arm una vez,
  no re-arm con set igual, burst -> 1 broadcast, re-arm con registry
  cambiado cerrando watchers viejos, unsubscribe, close) + paginas sin
  fetch al upstream. Cableado en run_tests.sh (21 suites).
- `apps/web/lib/toolboxCore.ts` (smoke de la 42) eliminado: el runtime real
  lo reemplaza.
- `docs/verification.md`: seccion nueva con la corrida dual y la nota del
  loader runtime.

## Verificacion

- `./init.sh` exit 0 (21 suites OK); oraculo default (Node) 48/48 sin editar
  aserciones.
- Corrida dual real (Node fixture + Next standalone build, HANDYMAN_ROOT y
  fake OLLAMA_BASE_URL compartidos):
  - `/api/state` Next: 200, headers identicos, JSON **IDENTICO** al del Node
    normalizando solo `generated_at` (skill_version 2.1.1 incluido).
  - `/events` Next nativo: `retry: 2000` + frame `{"type":"change"}` ante un
    append real a `progress/current.md`.
  - Oraculo `TOOLBOX_BASE_URL` -> Next: **42/48**; los 6 fallos son
    exactamente el carve-out documentado de `GET /` (5 de markup del panel +
    CSP sobre `/`). Verificado tambien que el run requiere limpiar
    fixtures previos del HROOT compartido (un harness extra registrado
    rompe las aserciones posicionales del oraculo).
- `pnpm --filter @handyman/web typecheck` y `next build` verdes (build con
  4 rutas dinamicas: /api/state, /events, /fleet, /harness/[name]).

## Notas / deuda

- El caso CSP del oraculo golpea `GET /`; cuando la 49/50 redefinan `/`, ese
  caso debe reapuntarse (ya registrado en el explore).
- Los scripts de corrida dual viven en el scratchpad de la sesion; la 50
  formalizara el arranque unico via `TOOLBOX_SERVE_CMD` wrapper.

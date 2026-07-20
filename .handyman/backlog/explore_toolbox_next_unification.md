---
type: Explore Report
topic: toolbox-next-unification
role: explorer
updated: 2026-07-18
tags: [handyman/backlog/explore]
---

# Explore: unificar TODO el toolBox en una sola app Next.js (server incluido)

Objetivo pedido: migrar toda la funcionalidad del toolBox a Next.js, con el
server dentro de la misma app (server actions donde corresponda), y dejar de
tener dos procesos separados. Este informe cubre el inventario completo, la
decision de arquitectura, el plan por features y los riesgos.

Fuentes: lectura directa de `handyman/src/toolbox_serve.ts` (1471 lineas),
`apps/web/proxy.ts`, `next.config.ts`, paginas `/fleet` y `/harness/[name]`,
[[../docs/sprints/plan-migracion-toolbox-nextjs]] (plan vigente), y tres
inventarios de exploracion (panel UMD, CLI/registry/LLM, tests/restricciones).

## 1. Donde estamos (esto ya NO es un big-bang)

La migracion ya empezo con patron strangler y la Fase 0 esta cerrada:

| Hecho | Feature | Evidencia |
|---|---|---|
| Oraculo de paridad parametrizable (`TOOLBOX_SERVE_CMD` / `TOOLBOX_BASE_URL`) | 36 done | 48/48 verdes contra Next standalone via `TOOLBOX_BASE_URL` |
| Registro declarativo de proveedores (`PROVIDER_REGISTRY`) | 37 done | `toolbox_llm.ts:334-373`, test T8 |
| Scaffold Next 16 + strangler en `proxy.ts` (no rewrites) | 38 done | `apps/web/proxy.ts:51-79`, `output: standalone` |
| `/fleet` en Next (RSC + SSE + renderer de strings puro) | 39 done | `app/fleet/` + `FleetLive.tsx` |
| Landing `/` | 40 done | `app/page.tsx` |
| `/harness/[name]` en Next | 41 done | `app/harness/[name]/` + `HarnessLive.tsx` (sin commitear en la rama aun) |

Lo que pide esta investigacion equivale a ejecutar las Fases 1 (resto de UI),
2 (endpoints), y 4 (decomisionar `toolbox_serve.ts`) del plan vigente, con la
decision nueva de donde entran los server actions. La Fase 3 (AI SDK) es
ortogonal y NO es requisito para unificar (ver decision D5).

## 2. Inventario de lo que hay que mover

### 2.1 Superficie HTTP del server Node (13 rutas)

GET (9): `/` (panel UMD), `/api/state`, `/api/corpus`, `/api/files?root=`,
`/api/providers`, `/api/md?root=&file=`, `/graph/NAME/graph.(html|json)`,
`/vendor/*.js` (7 UMDs desde node_modules), `/events` (SSE change feed).

POST (4, los unicos no-GET; todo lo demas es 405): `/api/draft`,
`/api/summarize` (cache por hash sha256 del digest), `/api/ask`,
`/api/intake` (LA UNICA escritura a disco: `feature-request.md`, cap 256 KB,
`spawned_process:false`).

Dos protocolos SSE distintos:
- `/events`: evento SIN nombre `data: {"type":"change"}`, `retry: 2000`,
  keepalive `: keepalive` cada 25 s. El cliente re-fetchea `/api/state`.
- Relays LLM: eventos nombrados `event: delta|result|error` con
  `data: <json>`. El cliente los consume con fetch + reader (SSE-over-POST),
  no con EventSource.

### 2.2 Estado en RAM que exige UN proceso long-running

Hoy vive en el closure de `serveMain` (`toolbox_serve.ts:924-1203`):
`clients: Set<ServerResponse>` (SSE), `watchers: FSWatcher[]` (fs.watch
recursive sobre hroot + workspace de cada harness registrado, re-armados si
cambia el registry), debounce 250 ms, `SummaryCache` (max 16, por proceso),
`providers` construidos una vez tras `loadDotEnv(process.cwd())`.

No hay handlers de SIGINT/SIGTERM ni `server.close()`: todo muere con el
proceso. En Next eso se traduce a: runtime nodejs, jamas edge, singleton de
modulo via `globalThis` (sobrevive HMR en dev) y arranque en
`instrumentation.ts` (`register()`).

### 2.3 UI del panel UMD sin migrar (todo en `handyman/assets/toolbox_panel.js`)

Ya migrado a Next: FleetView (parcial: faltan columnas Version/Session/Last
closure, link a harness y FleetSummary), HarnessView (paridad alta; el dialog
markdown degrada a texto plano).

Sin migrar:
1. `#/timeline` (solo consume `state.timeline` de `/api/state`).
2. `#/search` (indice BM25 MiniSearch client-side sobre `/api/corpus`).
3. `#/intake` (providers + files + draft SSE-over-POST + submit intake +
   tag-picker + clipboard).
4. `#/ask` (Q&A con citas `[fuente: ref]` linkeadas a `/api/md`).
5. FleetSummary (`POST /api/summarize` con `(cached)` y model).
6. Transversales: command palette (Cmd+K, ranking MiniSearch), atajos
   (`g` + `f/t/s/i/a`, `/`, `?`), HelpDialog, ThemeToggle persistente
   (`localStorage hw-theme:1` + anti-flash), live regions a11y (`announce`),
   `renderMd` (marked + DOMPurify con FORBID_TAGS/ATTR).

### 2.4 Lo que NO cambia con la unificacion

- CLI del toolbox (`register/unregister/list/discover/status/health/
  heartbeat/timeline/moc`): contrato sagrado, byte a byte. Solo `serve`
  cambia de implementacion en la Fase final.
- `registry.json` en `$HANDYMAN_ROOT` (o `~/HANDYMAN`), shape v1.
- `buildToolboxMoc` / `buildToolboxHtml` (`toolbox moc [--html]`): CLI puro,
  cero dependencia del server.
- Modulos LLM: `toolbox_llm.ts`, `toolbox_draft.ts`, `toolbox_ask.ts`,
  `toolbox_summary.ts` ya son HTTP-agnosticos (callbacks onDelta/onResult/
  onError, seam `draft(req, onDelta)` inyectable). Se MUEVEN, no se
  reescriben.

## 3. Decision de arquitectura: que rol juegan los server actions

Hallazgo central: **no todo puede (ni debe) ser server action**, y no es una
limitacion del proyecto sino del protocolo. Razones tecnicas:

1. Los server actions son RPC de React: POST con action-id opaco, protocolo
   interno de Next no estable entre versiones, no invocable con curl. El
   oraculo de paridad (48 casos black-box por HTTP crudo) quedaria ciego, y
   es el contrato que decide si cada pieza migrada es equivalente
   (principio 2 del plan, no negociable).
2. `EventSource` solo hace GET: `/events` jamas puede ser una action.
3. Las actions no devuelven streams crudos con framing propio: los relays
   LLM deben conservar el framing `event: delta|result|error` byte-estable
   que el oraculo asserta (summarize cache-hit `calls==1` incluido).
4. `/graph/*` y `/vendor/*` sirven HTML/JS con content-type propio.

El reparto correcto dentro de la app unica:

| Pieza | Mecanismo en Next | Por que |
|---|---|---|
| Lecturas de paginas (`/fleet`, `/harness/[name]`, `/timeline`) | RSC llama `buildState()` DIRECTO (import, sin HTTP a si mismo) | menos latencia, cero self-fetch; hoy hacen fetch al upstream |
| `/api/state`, `/api/corpus`, `/api/md`, `/api/files`, `/api/providers` | Route Handlers GET | contrato publico + oraculo + refresh del cliente |
| `/events` | Route Handler GET con `ReadableStream` + `dynamic="force-dynamic"` | SSE nativo, sin buffering (probado: proxy.ts ya streamea SSE con este mecanismo) |
| `/api/draft`, `/api/summarize`, `/api/ask` | Route Handlers POST que serializan los callbacks a SSE | framing byte-estable, oraculo intacto |
| `/api/intake` | Route Handler POST (paridad) que delega en la MISMA funcion core que el server action | el oraculo asserta 400/422/200 + escritura |
| Submit del intake desde la UI nueva | **Server Action** `submitIntake` (`"use server"`) sobre esa funcion core + `revalidatePath` | progressive enhancement del form; unica mutacion real del sistema |
| `/graph/*`, `/vendor/vis-network.js` | Route Handlers GET | reescritura del script src de unpkg + CSP same-origin |

Conclusion honesta para el pedido "todo como server actions": la app queda
100% unificada (un solo proceso, un solo puerto, cero server separado), la
logica del server vive dentro de Next, y los server actions se usan donde el
patron aplica (mutaciones desde la UI: hoy exactamente una, el intake). El
resto de la superficie queda como route handlers de la misma app; borrar esa
superficie HTTP significaria tirar el oraculo de 48 casos y quedarse sin red
de seguridad justo durante la migracion.

## 4. Diseno objetivo

```
apps/web/
  instrumentation.ts            # register(): loadDotEnv + runtime singleton
  proxy.ts                      # queda SOLO el Host guard (el forward muere al final)
  app/
    fleet/page.tsx              # RSC: import directo de buildState
    harness/[name]/page.tsx     # idem
    timeline/page.tsx           # nueva
    search/page.tsx             # nueva (MiniSearch client-side)
    intake/page.tsx             # nueva (form + server action + draft SSE)
    ask/page.tsx                # nueva
    api/{state,corpus,files,providers,md,draft,summarize,ask,intake}/route.ts
    events/route.ts             # SSE ReadableStream
    graph/[name]/[file]/route.ts
    vendor/[name]/route.ts      # solo vis-network tras retirar el panel
  actions/intake.ts             # "use server": submitIntake -> core.writeIntake
  lib/runtime.ts                # globalThis.__toolboxRuntime ??= create()
packages/toolbox-core/          # movido desde handyman/src (no reescrito):
                                # buildState, buildCorpus, resolveMd, listTagFiles,
                                # readTagFiles, guards, CSP const, relays draft/ask/
                                # summary, toolbox_llm (PROVIDER_REGISTRY)
handyman/                       # CLI intacto; toolbox.ts serve -> spawn de Next
```

Runtime singleton (`lib/runtime.ts` + `instrumentation.ts`):
- `createRuntime()`: `loadDotEnv(dir de arranque)`, `buildProviders(env)`,
  `new SummaryCache()`, bus de eventos (los watchers empujan un tick; cada
  route handler de `/events` suscribe su stream al bus), `armWatchers()` con
  el mismo re-arm por cambio de registry.
- `globalThis` para sobrevivir HMR en dev; `register()` de instrumentation
  garantiza el arranque en produccion standalone.
- Shutdown: hoy no existe cleanup; opcionalmente anadir `SIGTERM -> close`
  en el wrapper del CLI (mejora, no requisito de paridad).

Seguridad preservada (invariantes del oraculo y docs):
- Host guard anti DNS-rebinding: ya esta en `proxy.ts` y aplica a TODA
  request de la app (`:492` del oraculo).
- Bind 127.0.0.1: el wrapper de arranque fija `HOSTNAME=127.0.0.1`.
- CSP identica (`default-src 'self' ...`) y `Cache-Control: no-store` +
  `X-Content-Type-Options: nosniff`: helper compartido `sendJson`/`send` en
  el core, usado por todos los route handlers (mismo valor byte a byte).
- Registry como allowlist de lectura, `MD_NAME_RE`, containment anti
  traversal, caps de tags e intake: viajan intactos dentro del core.
- Claves LLM: solo en server code (route handlers / actions / RSC). Nunca
  `NEXT_PUBLIC_*`, nunca imports de `toolbox_llm` desde componentes client.

## 5. Plan por features (una a la vez, oraculo verde en cada cierre)

Numeracion sugerida siguiendo `feature_list.json` (42+). Cada una cierra con
`bash tests/run_tests.sh` y `./init.sh` exit 0.

**42 `toolbox_core_package`** (fundacion, sin cambio de comportamiento)
Crear `packages/toolbox-core` (agregar `packages/*` a `pnpm-workspace.yaml`),
MOVER: buildState/buildCorpus/resolveMd/listTagFiles/readTagFiles/guards/CSP,
`toolbox_draft|ask|summary|llm`. `handyman` y `toolbox_serve.ts` pasan a
importar del paquete (server Node sigue sirviendo todo). `apps/web` gana la
dependencia workspace. Gate: oraculo 48/48 sin editar aserciones + suites
node existentes verdes. Decide una version unica de TypeScript para el
paquete (hoy handyman usa ^7 y apps/web ^5.7).

**43 `toolbox_next_runtime_events`** (el corazon del proceso unico)
`instrumentation.ts` + `lib/runtime.ts` (providers, SummaryCache, watchers,
bus). Robar `/events` (ReadableStream, force-dynamic, retry 2000 + keepalive
25 s identicos) y `/api/state`. `FleetLive`/`HarnessLive` pasan a
`eventsUrl="/events"` y `stateUrl="/api/state"` same-origin (se editan las
aserciones de `test_web_fleet.sh`/`test_web_harness.sh` que hoy exigen
upstream absoluto: cambio deliberado y documentado de esa suite, NO del
oraculo). Paginas `/fleet` y `/harness` pasan a llamar `buildState()` por
import directo con `dynamic="force-dynamic"`. Gate: casos `/events` y
`/api/state` del oraculo verdes contra Next.

**44 `toolbox_next_read_api`**
Robar `/api/corpus`, `/api/md`, `/api/files`, `/api/providers`, `/graph/*`,
`/vendor/*` como route handlers sobre el core (incluida la reescritura
unpkg -> `/vendor/vis-network.js`). Gate: sus casos del oraculo verdes.

**45 `toolbox_next_llm_relays`**
Robar POST `/api/draft`, `/api/summarize`, `/api/ask`: route handlers que
traducen onDelta/onResult/onError al framing SSE nombrado, con providers y
SummaryCache del runtime singleton. Gate: casos SSE del oraculo (framing,
cache-hit `calls==1` con el fake `OLLAMA_BASE_URL`) verdes contra Next.

**46 `toolbox_next_intake_action`** (aqui entran los server actions)
Funcion core `writeIntake(root, draftMd, files)` unica; POST `/api/intake`
route handler (paridad oraculo: 400/422/200, footer de files, cap 256 KB) y
server action `submitIntake` que usa la misma funcion. Gate: casos intake
del oraculo + test del action (puede ser unit sobre la funcion core).

**47 `toolbox_next_timeline_search`**
Paginas `/timeline` y `/search` + command palette + atajos de teclado +
theme toggle persistente (anti-flash) + live regions a11y. MiniSearch pasa a
dependencia de `apps/web` (ya vive en el monorepo; justificar en C3).

**48 `toolbox_next_intake_ask_ui`**
Paginas `/intake` (form + tag-picker + draft por SSE-over-POST con reader +
submit via action) y `/ask` (citas linkeadas a `/api/md`), y FleetSummary
dentro de `/fleet`. Decision D2 aplicada (render markdown sanitizado).

**49 `toolbox_panel_retirement`**
Borrar `panelHtml`, `PANEL_CSS`, `toolbox_panel.js` y el serving de UMDs
react/react-dom/htm/marked/dompurify/minisearch (queda `/vendor/
vis-network.js`). Actualizar en la MISMA feature los 17 casos del oraculo
que grep-ean el asset del panel y los 5 que assertan el HTML de `/` (cambio
de aserciones deliberado y documentado; el resto sigue intacto). Podar
react 18/htm del package.json de handyman.

**50 `toolbox_serve_decommission`** (Fase 4)
`toolbox.ts serve` deja de importar `toolbox_serve.js` y pasa a: build/
verificar standalone, copiar estaticos, elegir puerto (soporta `--port 0`
eligiendo puerto libre), spawn de `server.js` con `HOSTNAME=127.0.0.1`,
`PORT`, `HANDYMAN_ROOT` y dir de `.env`, e imprimir `toolBox observer:
<URL>` (contrato de `TOOLBOX_SERVE_CMD`). Borrar `toolbox_serve.ts`, quitar
el forward del strangler en `proxy.ts` (queda el Host guard), default de
`TOOLBOX_SERVE_CMD` -> wrapper, `run_tests.sh` construye `apps/web` una vez
(o reusa `.next` cacheado), `init.sh` extiende el gate build, docs
(`architecture.md`, `verification.md`) actualizados y plan cerrado a
`docs/sprints/`.

Relacion con las features pendientes 32-35 (triage, acceptance,
review-notes, retro): recomiendo re-secuenciarlas DESPUES de la 45 y
re-redactar sus acceptance para nacer como route handlers de la app
unificada (la suite del oraculo es parametrizable por URL, asi que sus
nuevos casos sirven igual). Implementarlas hoy sobre `toolbox_serve.ts`
seria trabajo doble.

## 6. Impacto en tests

- Oraculo `test_toolbox_serve.sh`: 48 casos; 31 golpean HTTP (sobreviven
  identicos hasta la 49) y 17 grep-ean el asset UMD congelado (mueren con el
  panel en la 49, junto con los 5 del HTML de `/`). `TOOLBOX_BASE_URL` ya
  permite correr todo contra Next (48/48 probado); `TOOLBOX_SERVE_CMD`
  exige `--port 0` + linea stdout `toolBox observer: <URL>`, que cumplira el
  wrapper de la 50.
- `test_web_fleet.sh` / `test_web_harness.sh`: sus aserciones de EventSource
  al upstream absoluto se actualizan en la 43 (same-origin). El patron
  renderer-puro-importable-sin-build se conserva para las vistas nuevas.
- Coste nuevo: el oraculo contra Next requiere un build de `apps/web`
  (`next build` + copia de estaticos). Mitigacion: build una vez en
  `run_tests.sh` solo cuando se necesita, y mantener las suites de renderers
  puros (rapidas, sin build) como primera linea.
- Los tests de los relays no cambian de estrategia: fake OpenAI-compat via
  `OLLAMA_BASE_URL`, cero red.

## 7. Riesgos y mitigaciones

1. **Actions como API**: tentacion de exponer todo como actions y perder el
   oraculo. Mitigado por el reparto de la seccion 3 (core compartido, dos
   entradas delgadas).
2. **SSE bufferizado**: route handler con `ReadableStream` +
   `force-dynamic`; ya esta probado que este mecanismo streamea (proxy.ts
   reenvia `/events` sin buffering con el mismo primitive). Limpiar
   keepalive y suscripcion en `request.signal.abort`.
3. **Singletons vs dev/HMR**: `globalThis` + instrumentation; en dev pueden
   duplicarse watchers si no se guarda el flag en global (patron conocido,
   cubierto en `lib/runtime.ts`).
4. **Prerender en build**: `next build` no debe leer el registry real;
   `dynamic="force-dynamic"` en toda pagina/handler que toque disco (hoy
   `/fleet` y `/harness` ya son dinamicas por el fetch no-store; al pasar a
   import directo hay que declararlo explicito).
5. **.env y claves**: Next solo auto-carga `apps/web/.env*`; las claves
   viven en el `.env` de la raiz. `instrumentation.register()` llama
   `loadDotEnv(dir)` con el dir que pase el wrapper del CLI (default: cwd
   de arranque). Nunca `NEXT_PUBLIC_`.
6. **Choques de version**: React 18 (UMD panel) vs 19 (web): muere con la
   49. TypeScript ^7 vs ^5.7: decidir en la 42. marked v12 UMD vs ESM:
   apps/web importa la build ESM normal.
7. **Puerto y contrato de arranque**: default 8765 vs script npm viejo en
   3000 (`handyman/package.json toolbox:serve`): alinear en la 50. `--port 0`
   lo resuelve el wrapper eligiendo puerto libre antes del spawn.
8. **Perdida temporal de funcionalidad**: el panel UMD sigue siendo el
   default en el puerto Node hasta la 49; ninguna vista se borra antes de
   tener su equivalente verde en Next (strangler, principio 1 del plan).
9. **Doble server mientras dure**: sin cambios respecto a hoy; el CLI sigue
   levantando ambos hasta la 50, donde pasa a UN proceso.

## 8. Decisiones abiertas (recomendacion incluida)

- **D1 Stack UI de las vistas restantes**: el plan Fase 1 sugeria Tailwind +
  shadcn + TanStack + cmdk, pero las features 39/40/41 establecieron el
  patron contrario (CSS nativo + tokens + renderers de strings + cero deps
  nuevas) y CHECKPOINTS C3 exige justificar cada dep. Recomendacion: seguir
  con el patron cero-deps actual; reevaluar el stack pesado solo si una
  vista lo pide a gritos (la palette y el theme toggle salen baratos a mano,
  ya estan resueltos en el panel UMD como referencia).
- **D2 Markdown en Next**: hoy `/harness` degrada a texto plano. Para
  FleetSummary/Ask/Intake (salida LLM) eso empobrece mucho. Recomendacion:
  adoptar `marked` + `dompurify` como deps de `apps/web` (ya viven en el
  monorepo, misma politica FORBID_TAGS/ATTR del panel), justificado en C3.
- **D3 Ubicacion del core**: `packages/toolbox-core` (plan) vs exports del
  paquete `handyman`. Recomendacion: `packages/toolbox-core`; direccion de
  dependencia limpia (apps/web -> core <- handyman CLI) y evita que Next
  compile el arbol completo del CLI.
- **D4 Features 32-35**: re-secuenciar despues de la 45 y nacer en Next.
- **D5 AI SDK (Fase 3)**: fuera del alcance de la unificacion; el contrato
  `LlmProvider` + `PROVIDER_REGISTRY` ya da lo necesario. Retomar despues
  de la 50 si se quiere `useChat`/registry estandar.
- **D6 El `/` de la app unica**: hoy es la landing de marketing. Decidir si
  el observer home pasa a `/` y la landing a `/about` (o se elimina), o si
  `/fleet` queda como home del observador. Afecta que reemplaza a los casos
  del oraculo sobre `GET /` en la 49/50.

## 9. Criterio de exito global

Al cierre de la feature 50: `node dist/toolbox.js serve` levanta UN solo
proceso (Next standalone) en un puerto, con TODA la funcionalidad del panel
(fleet, harness, timeline, search, intake con action, ask, summary, palette,
theme, a11y), el oraculo completo verde via `TOOLBOX_SERVE_CMD` apuntando al
wrapper, `toolbox_serve.ts` y `toolbox_panel.js` eliminados,
`bash tests/run_tests.sh` y `./init.sh` exit 0, y docs/plan actualizados.

## Proximos pasos inmediatos

1. Commitear el trabajo de la feature 41 que sigue sin commitear en
   `feat/llm-toolbox-tasks` (arbol sucio: `apps/web/app/harness/`,
   `HarnessLive.tsx`, `test_web_harness.sh`, proxy.ts, harness docs).
2. Registrar las features 42-50 en `feature_list.json` (via
   `feature-request.md` o directo por el leader) con las acceptance de la
   seccion 5, y decidir D1/D2/D3/D6.
3. Actualizar [[../docs/sprints/plan-migracion-toolbox-nextjs]] con la
   seccion de server actions (hoy el plan no los menciona) y el nuevo
   orden de fases.

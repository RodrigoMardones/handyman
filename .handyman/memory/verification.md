---
type: Doc
---

# Verification

El agente no afirma que funciona; lo demuestra. Evidencia obligatoria antes de `done`.

## Required Commands

```bash
# Verificador del harness + proyecto (compuerta de cierre; debe salir 0).
# Fases bloqueantes, en orden:
#   tools -> files -> state -> lint -> build -> harness -> test
# `harness` corre handyman/dist/validate_harness.js sobre .handyman: un gap
# estructural bloqueante hace fallar la compuerta. Va despues de `build` para
# que dist/ este fresco, y es silenciosa en exito a proposito -- los NOTEs no
# bloqueantes (frontmatter, deuda de evidencia, colision de actor, rama) los
# imprime el advisory `check_preflight` al final, que ya corre el mismo
# validador; imprimirlos en ambos lados duplicaria cada linea.
./init.sh

# Suite de tests del proyecto (la invoca init.sh). Black-box sobre node dist/.
bash tests/run_tests.sh
```

La toolchain y la suite son **single-track Node**: los CLIs son TypeScript
compilados a `handyman/dist/` (gitignored) y los tests de contrato
(`tests/test_docs.js`) corren bajo node con `ajv` desde `handyman/node_modules`.
Antes de la suite hay que instalar dependencias y compilar (desde `handyman/`):

```bash
cd handyman
npm ci            # instalar dependencias
npm run build     # tsc -> dist/  (requerido: la suite invoca node dist/<x>.js)
```

Calidad de la fuente TS (desde `handyman/`):

```bash
cd handyman
npm run typecheck   # tsc --noEmit
npm run lint        # biome check .
npm run test        # vitest run   (tests unitarios del core TS)
```

Lint de shell (parte de CI; mantener verde el bash que queda). El alcance exacto
difiere por capa: CI lintea `scripts tests`, mientras `init.sh` lintea
`handyman/scripts tests`; `assets/*.template.sh` se excluye a proposito (placeholders
que se rellenan al hacer scaffold).

```bash
find handyman/scripts tests -name '*.sh' -print0 | xargs -0 shellcheck -S warning
```

## CI

`.github/workflows/ci.yml` es single-track Node: `actions/setup-node` 20,
`npm ci`, `npm run build` (todo en `handyman/`), luego `bash tests/run_tests.sh`;
un job paralelo corre ShellCheck. No queda setup-python ni `pip install`.

## Test Levels

1. **Paridad / caracterizacion (black-box):** `tests/test_*.sh` ejercitan cada CLI
   (`node dist/<x>.js`) y fijan stdout/stderr/exit code. Es el nivel critico: garantiza
   que "las ordenes se mantienen" a traves de cualquier refactor.
2. **Unit (core TS):** comportamiento publico del core en `handyman/src/core/`
   (`npm run test` = vitest).
3. **Docs/estructura:** `tests/test_docs.js` valida estructura de la skill, links de
   markdown y JSON Schemas (ajv) con paridad con el anterior `test_docs.py`.
4. **Observer:** `tests/test_toolbox*.sh` cubren `toolbox serve`, `/api/state`,
   `/api/providers`, `/api/draft` (con provider fake) y el markup del panel.
5. **Smoke:** correr un flujo real de bootstrap sobre un repo temporal.

## toolBox observer

El observador se valida sin tocar la red: `tests/test_toolbox_serve.sh` aserta el
markup servido, `/api/state` con metricas, `/api/providers` con `available()`, el
relay `POST /api/draft` con un provider fake, `POST /api/intake` (write a
`feature-request.md`), el guard de Host (403 anti-DNS-rebinding) y la cabecera
CSP en paginas HTML **y** en las APIs. No hay un test que levante un puerto real
contra un LLM.

### Oraculo de paridad (migracion a Next.js)

`tests/test_toolbox_serve.sh` es el oraculo negro-caja (**28 casos**: status
codes, formas JSON, framing SSE, cache-hit, seguridad) del observador. Nacio
como oraculo de *paridad* contra el server Node `toolbox_serve.ts` durante la
migracion strangler; desde la feature 50 ese server no existe y el oraculo es
simplemente la suite de contrato del proceso unico Next. Dos variables de
entorno lo parametrizan sin tocar ninguna asercion:

- `TOOLBOX_SERVE_CMD`: comando alternativo de arranque que reemplaza el default
  **`node handyman/dist/toolbox.js serve`** (el wrapper que levanta el Next
  standalone). Historico: antes de la feature 50 el default era
  `node handyman/dist/toolbox_serve.js`, el server Node ya borrado.
- `TOOLBOX_BASE_URL`: URL de un servidor YA arrancado (por el operador, fuera
  de la suite). Presente: la suite no arranca nada y, como no lo arranco
  ella, tampoco mata nada al finalizar (ni siquiera con `trap ... EXIT`).

El default (sin ninguna de las dos) es el que corre `tests/run_tests.sh`.

**Contrato de readiness.** El wrapper imprime `toolBox observer: <URL>` SOLO
despues de que un probe HTTP a `/api/state` responde (retry cada 100ms, timeout
~10s). Sin eso la URL aparecia en stdout ~100ms antes de que Next aceptara
conexiones y el oraculo disparaba sus aserciones contra bodies vacios: 3-4
fallos intermitentes que parecian de contenido y eran de timing.

**Requisito del fixture compartido.** El registro de harnesses
(`registry.json`) se lee del disco en cada request (sin cache), así que un
servidor ya corriendo SI puede descubrir el harness de fixture que la suite
registra durante su propia ejecucion — con tal de que ambos apunten a la
misma raiz. Por eso, cuando se usa `TOOLBOX_BASE_URL`, el llamador debe
tambien exportar:

- `HANDYMAN_ROOT` apuntando a la MISMA raiz de registry con la que se
  arranco el servidor externo (la suite reusa esa raiz para su `register`
  en lugar de crear un directorio temporal descartable propio).
- `OLLAMA_BASE_URL` apuntando al MISMO fake LLM (compatible OpenAI, expone
  `GET /v1/models` y `GET /v1/calls`) con el que se arranco ese servidor
  externo — si no, la suite arranca su propio fake desconectado y el
  cross-check de cache-hit (`GET /v1/calls`) no refleja el trafico real del
  servidor bajo prueba.

Si `TOOLBOX_BASE_URL` esta presente pero `HANDYMAN_ROOT`/`OLLAMA_BASE_URL`
no coinciden con el fixture del servidor externo, los casos que dependen del
registro (`/api/state`, `/api/md`, `/api/corpus`, `/graph`, los relays LLM)
fallaran — comportamiento esperado: el llamador es responsable de un fixture
compatible, no la suite.

Verificado con una corrida real: `dist/toolbox_serve.js` arrancado a mano en
un puerto efimero (compartiendo `HANDYMAN_ROOT` y `OLLAMA_BASE_URL` con un
fake LLM tambien arrancado a mano) + `TOOLBOX_BASE_URL=<url> HANDYMAN_ROOT=...
OLLAMA_BASE_URL=... bash tests/test_toolbox_serve.sh` -> `48 run, 48 passed,
0 failed`, y los procesos arrancados a mano seguian vivos (y el servidor
seguia respondiendo) despues de que la suite terminara.

**(RETIRADO 2026-07-28: `apps/web` y sus suites `test_web_*` + `test_toolbox_serve.sh` se eliminaron; el panel es Mastra Studio via `pnpm studio`. Lo que sigue es historia de la migracion Next.)**

**apps/web (Next.js strangler, feature `toolbox_next_scaffold`).** Mismo
mecanismo `TOOLBOX_BASE_URL`, apuntando esta vez al puerto de
`apps/web/.next/standalone/apps/web/server.js` (arranque real documentado en
`docs/sprints/plan-migracion-toolbox-nextjs.md`) en lugar del server Node
directo. Verificado: `48 run, 48 passed, 0 failed` — incluye los casos SSE
(`/events`), que el proxy de `apps/web/proxy.ts` reenviaba sin bufferizar
porque hacia `fetch()` manual y usaba el `ReadableStream` de la respuesta del
upstream como body de la `Response` que devolvia. **(Historico:** ese forward
se elimino en la feature 50 junto con el upstream; `proxy.ts` hoy es solo el
guard de Host y `/events` se sirve nativamente.**)**

**Carve-out desde `toolbox_next_landing`.** Esta feature agrego
`apps/web/app/page.tsx`: una landing real en la ruta `/` dentro del puerto de
Next (ver el comentario actualizado en `apps/web/app/layout.tsx`). El caso de
paridad `GET / returns the React panel` de `tests/test_toolbox_serve.sh`
sigue pasando byte a byte cuando la suite corre en su modo por defecto (sin
`TOOLBOX_BASE_URL`, contra el server Node directo, que es lo que ejecuta
`tests/run_tests.sh`), pero deja de aplicar cuando `TOOLBOX_BASE_URL` apunta
al puerto de Next: ahi `/` devuelve la landing de marketing, no el panel
legado. Ningun otro caso cambia: cada endpoint JSON (`/api/state`,
`/api/corpus`, `/api/providers`, `/api/md`, `/graph/*`) y el feed `/events`
se siguen proxeando byte-equivalentes a traves de `proxy.ts`, que esta
feature no toco.

**Rutas nativas desde `toolbox_next_runtime_events` (feature 43).** Next
sirve `/api/state` y `/events` NATIVAMENTE (route handlers sobre el runtime
singleton de `apps/web/lib/runtime.ts` + `instrumentation.ts`); el resto
sigue proxeado. Corrida dual verificada (server Node de fixture + Next
standalone compartiendo `HANDYMAN_ROOT` y el fake `OLLAMA_BASE_URL`):

- `/api/state` de Next: 200 con los mismos cuatro headers del `sendJson` del
  server Node y JSON **IDENTICO** al del server Node (normalizando solo
  `generated_at`), incluido `skill_version`.
- `/events` de Next: `retry: 2000` inicial y frame `data: {"type":"change"}`
  ante un append real a `progress/current.md` (fs.watch + debounce del hub,
  sin buffering).
- Oraculo completo `TOOLBOX_BASE_URL` -> puerto Next: **42/48**, donde los 6
  fallos son EXACTAMENTE el carve-out de `GET /` ya documentado arriba (5
  casos de markup del panel + el caso CSP, que golpea `GET /`): contra Next,
  `/` es la landing. El modo default (server Node) sigue 48/48 sin editar
  aserciones.

**API de lectura nativa desde `toolbox_next_read_api` (feature 44).** Next
sirve ademas `/api/corpus`, `/api/md`, `/api/files`, `/api/providers`,
`/graph/*` y `/vendor/*` nativamente (route handlers delgados sobre el core
+ `handyman/src/toolbox_assets.ts` via el loader runtime; helper de
respuesta con los 4 headers byte-identicos). Corrida dual verificada tras el
robo: oraculo `TOOLBOX_BASE_URL` -> Next **42/48** con los MISMOS 6 fallos
del carve-out de `GET /` (los casos de md/corpus/providers/files/graph/
vendor pasan ahora servidos por Next, no proxeados); default Node 48/48.

**Relays LLM nativos desde `toolbox_next_llm_relays` (feature 45).** Next
sirve tambien `POST /api/draft`, `/api/summarize` y `/api/ask` nativamente:
route handlers que leen el body con cap 256 KB, validan con los mismos 400
byte-identicos ANTES de tocar el LLM, y traducen los callbacks de
relayDraft/relaySummary/relayAsk al framing `event: delta|result|error` con
los headers exactos del observer. La SummaryCache vive en el runtime
singleton; `resolveSummaryModel` se comparte desde el core (mismo
precedence body > TOOLBOX_SUMMARY_MODEL > zai-paas glm-4.7-flash). Corrida
dual verificada: oraculo `TOOLBOX_BASE_URL` -> Next **42/48** con los MISMOS
6 fallos del carve-out de `GET /` - los casos SSE de summarize (delta+result,
cache-hit con `GET /v1/calls` == 1 contra el fake compartido), ask
(citaciones + fragments) y los 400 de draft pasan servidos nativamente.
Con esto, toda la superficie de lectura + relays del observer (/api/state,
corpus, md, files, providers, draft, summarize, ask, /events, /graph/*,
/vendor/*) se sirve desde Next; quedan proxeados solo `POST /api/intake`
(la unica escritura, feature 46) y el panel UMD de `GET /`.

**Intake unificado desde `toolbox_next_intake_action` (feature 46).** La
unica escritura tambien es nativa: `writeIntake` + `intakeHttp` viven en
@handyman/toolbox-core (orden de validacion, footer de files y mapeo
status/body byte-identicos), compartidos por el observer Node, el route
handler `POST /api/intake` de Next (cap 256 KB) y el server action
`submitIntake` (`apps/web/actions/intake.ts`, el UNICO lugar donde entran
server actions: la superficie publica sigue en route handlers porque las
actions son RPC opaco que el oraculo no puede ejercitar). Corrida dual
verificada: 42/48 con los mismos 6 fallos del carve-out de `GET /`; los 4
casos de intake (422 draft vacio, 400 malformado, 400 no registrado, 200
con escritura REAL de feature-request.md) pasan servidos nativamente. Lo
unico que queda proxeado al server Node es el panel UMD de `GET /`.

**Panel retirado desde `toolbox_panel_retirement` (feature 49, decision D6).**
Con la paridad visual alcanzada en apps/web (features 39-48, cubiertas por
`tests/test_web_*.sh`), el panel UMD legacy se borra: se elimina
`handyman/assets/toolbox_panel.js`, las constantes `panelHtml`/`PANEL_CSS`/
`PANEL_JS_PATH` de `toolbox_serve.ts`, los seis vendors UMD
(react/react-dom/htm/marked/dompurify/minisearch) del `vendorFiles` de
`toolbox_assets.ts` y las seis deps equivalentes de `handyman/package.json`
(el lockfile baja 6 paquetes). Queda solo `/vendor/vis-network.js` (renderer
de graphify, rewrite same-origin de unpkg).

**Decision D6 (que sirve `/` en la app unificada).** La app unificada
sirve en `/` la landing de apps/web (`app/page.tsx`, feature
`toolbox_next_landing`, cubierta por `tests/test_web_landing.sh`). Durante la
migracion strangler el server Node convivio y su `GET /` respondia un
placeholder HTML minimo que apuntaba a apps/web; la feature 50
(`toolbox_serve_decommission`) **borro** ese server y dejo un unico proceso
Next standalone via `node dist/toolbox.js serve`. El placeholder ya no existe.

**Re-apuntado del oraculo (cambio deliberado, caso a caso).** El oraculo
pasa de 48 a **27 casos**. Los 21 casos retirados se documentan con un
puntero a su equivalente migrado en `tests/test_web_*.sh`:
- 17 casos que grep-eaban el asset del panel (`$PANEL`) -> vistas FleetView,
  HarnessView, palette, shortcuts, theme, live regions, safe markdown,
  #/intake, #/ask, fleet summary, file-tag picker (test_web_fleet.sh,
  test_web_harness.sh, test_web_timeline_search.sh, test_web_intake.sh,
  test_web_intake_ask.sh).
- 4 casos que assertaban el HTML de `GET /` especifico del panel
  (anti-flash theme posicional, live regions antes de `#root`,
  prefers-reduced-motion, command palette) -> apps/web (ToolboxShell,
  layout anti-flash, globals.css).
El caso `GET / returns the React panel` se re-apunta a
`GET / serves the retirement placeholder (no panel, no UMD vendors,
same-origin only)`. El caso CSP se mantiene intacto (sigue golpeando
`GET /`, ahora el placeholder, que hereda `CSP_HEADER` via el helper
`send()`). El caso de vendors se re-apunta a "vis-network sirve; los
seis UMDs retirados ahora 404". Los otros 24 casos (state, corpus, md,
providers, graph, draft/summarize/ask/intake, files, SSE, security) quedan
sin editar.

Estado verificable post-49: oraculo default (server Node) **27/27**; el
dual-run `TOOLBOX_BASE_URL` -> Next **25/27**, donde los 2 fallos son el
carve-out reducido de `GET /`: el caso del placeholder y el caso CSP (que
golpea `GET /`). Esos 2 casos eran contratos del server Node; contra Next `/`
era la landing de marketing, asi que divergian a proposito durante el
strangler. El carve-out pre-49 eran 6 fallos (panel + CSP); tras retirar el
panel bajo a 2 y desaparece del todo en la feature 50. Las views reales
siguen cubiertas por `tests/test_web_*.sh` (structural, sin build).

**Cierre del carve-out en `toolbox_serve_decommission` (feature 50).** Sin
server Node no hay dos implementaciones que comparar: el oraculo bootea el
wrapper por default y queda en **28 casos**, todos verdes en un solo modo.
Los 2 casos del carve-out se resolvieron asi:

- `GET / serves the retirement placeholder` -> `GET / serves the unified
  Next.js landing (no UMD vendors, same-origin only)`. Conserva el contrato
  estructural (sin los seis vendors UMD retirados, sin `id="root"`, sin
  `<script src="https?://">`); las imagenes placeholder de picsum.photos de la
  landing son contenido editorial, no ejecucion, y siguen permitidas.
- El caso CSP paso a asertar **las dos superficies**: las paginas HTML
  (`/`, `/fleet`) y `/api/state`. Motivo: entre las features 49 y 50 hubo una
  **regresion real** — el server Node aplicaba `CSP_HEADER` a su HTML via
  `send()`, y al borrarlo las paginas de Next quedaron **sin CSP** mientras el
  caso, re-apuntado solo a `/api/state`, seguia verde. CSP es un control a
  nivel de DOCUMENTO: sobre JSON es casi inerte. Se restauro con
  `headers()` en `apps/web/next.config.ts` aplicando `HTML_CSP_HEADER`
  (`@handyman/toolbox-core`) a todo salvo `/api/*` y `/events`. Las `/api/*`
  conservan el `CSP_HEADER` estricto de `lib/respond.ts`; `/events` **no lleva
  CSP** (fija sus headers inline en `app/events/route.ts` y el observer Node
  tampoco enviaba una ahi: byte-parity, y sobre un stream SSE es inerte).
  `HTML_CSP_HEADER` es `CSP_HEADER` mas `https://picsum.photos` en `img-src`,
  la unica concesion, derivada por `.replace` para que no puedan divergir. El
  caso aserta las dos direcciones: que las paginas SI llevan la concesion (si
  el `.replace` dejara de aplicar en silencio, las imagenes de la landing
  quedarian bloqueadas con todas las sub-aserciones en verde) y que la CSP de
  las APIs **no** la hereda. Si algun dia se quitan esas imagenes de la
  landing, las dos constantes colapsan en una.

Casos nuevos en la feature 50: el guard de Host (`Host: evil.example` -> 403,
`Host: localhost` -> 200) contra el servidor real, que antes no tenia
cobertura. Y en las suites `test_web_*.sh`, las 11 aserciones que grep-eaban
el manifiesto de rutas de `proxy.ts` pasaron a asertar que el archivo de ruta
nativo existe (`app/**/page.tsx` o `route.ts`), porque ese manifiesto se
elimino junto con el upstream.

Nota de implementacion: ambos bundlers de Next tratan los paquetes workspace
symlinkeados como codigo propio (ignoran `serverExternalPackages` cuando el
realpath vive fuera de `node_modules`), y el paquete CLI handyman no es
bundleable (resuelve `SKILL.md`/assets via `import.meta.url`). Por eso
`apps/web/lib/toolboxState.ts` carga `handyman/dist/toolbox_state.js` en
RUNTIME como ESM real (import dinamico opaco al bundler), con la raiz del
repo detectada por walk-up desde `cwd` y `TOOLBOX_REPO_ROOT` como override.
`TOOLBOX_ENV_DIR` permite apuntar el `.env` cuando el cwd del standalone no
es la raiz del repo.

Feature 53 agrega la suite `tests/test_toolbox_cli_llm.sh` (9 casos): el
primer subcomando LLM del CLI, `toolbox.js review-notes`, verificado **sin
levantar ningun servidor**. Corre contra `tests/lib/mock_openai.js`, un mock
OpenAI-compatible minimo en `127.0.0.1` inyectado por `OLLAMA_BASE_URL`;
ningun caso toca la red. `HANDYMAN_ROOT` se redirige a un temporal para que
el registry real del desarrollador nunca se lea ni se escriba.

Dos casos merecen nombre propio. C7 cuenta las completions servidas por el
mock antes y despues de las corridas que deben ser rechazadas (root no
registrado, nombre de feature invalido): el conteo no puede moverse, es decir
que **un rechazo no cuesta tokens**. C2 asserta que el checklist no contiene
`APPROVED` ni `CHANGES_REQUESTED`: la salida prepara una revision, no la
firma.

El mock es deliberadamente **distinto** al de `test_toolbox_serve.sh`: aquel
tiene contador de llamadas y ruteo por prompt para seis relays, y sus bytes
estan pinneados por el oraculo black-box. Compartir uno solo haria que un
cambio en la suite del CLI pudiera romper la paridad de serve.

## Anti-patterns

- Marcar `done` con tests en rojo o con el verificador != 0.
- Cambiar el contrato de un CLI y "adaptar" el test para que pase en vez de reproducir
  el contrato exacto (eso rompe la paridad, que es justamente lo que protegemos).
- Tests que solo aseguran "no lanza excepcion".
- Mockear el comportamiento de nucleo (resolucion de workspace, maquina de estados).
- Confiar en el draft del observador sin revision humana: `POST /api/draft` nunca
  escribe disco; solo `POST /api/intake` persiste el draft revisado, y la feature entra
  a `feature_list.json` via `node dist/feature.js add`, no por spawn desde el panel.

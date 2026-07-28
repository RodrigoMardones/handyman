---
type: Doc
---

# Architecture

Define que es "buen trabajo" en este repo. Los reviewers evaluan el codigo contra esto.

> **Runtime (Node/TypeScript):** la migracion desde Python + Bash esta
> **completada**. Todos los CLIs viven en `handyman/src/*.ts` y corren como
> `node handyman/dist/<x>.js`; `handyman/scripts/` conserva solo `scaffold.sh`.
> Los invariantes de abajo son *runtime-agnosticos* y se sostienen igual. La
> superficie CLI (subcomandos, flags, exit codes, stdout) es sagrada y esta
> protegida por suites black-box de paridad byte-a-byte (`tests/test_*.sh`).

## Principles

1. **Capas.**
   - **CLI (entrypoints):** cada `handyman/src/*.ts` es un entrypoint delgado; parsea
     argumentos (paridad con `argparse`), llama a la logica y traduce a exit code +
     salida estable. Se ejecutan como `node handyman/dist/<x>.js`.
   - **Core compartido:** `handyman/src/core/` concentra los helpers reutilizados
     (resolucion de `HARNESS_WORKSPACE`, carga/validacion de `feature_list.json`,
     IO byte-identica, `unifiedDiff` equivalente a `difflib`, frontmatter). Es
     importado por todos los CLIs; la ubicacion de los role files vive en
     `core/workspace.ts` (`PLATFORM_ROLE_DIRS`).
   - **Paquete toolbox-core:** `packages/toolbox-core/` (workspace pnpm,
     `@handyman/toolbox-core`) contiene la capa HTTP-agnostica del toolBox
     movida desde handyman en la feature 42: proveedores LLM + relays
     (`llm/draft/ask/summary`), registry (`handymanRoot/loadRegistry/...`),
     `resolveWorkspace` y el data layer allowlisted del observador
     (`state.ts`: guards, corpus, md, tags, CSP). handyman lo consume via
     `workspace:*` y deja shims re-export en `src/` para que los entrypoints
     `dist/` historicos (tests, serve) no cambien; `buildState` vive en
     `handyman/src/toolbox_state.ts` (necesita snapshots/metrics del CLI) y
     se expone a `apps/web` con el export `"./state"` del package.json. El
     build es `tsc -b` con project reference (el paquete compila primero);
     CI instala el workspace con pnpm.
   - **Datos/plantillas:** `handyman/assets/` (templates + `schemas/*.json`) son datos,
     no codigo. Los JSON Schema son la fuente de verdad del contrato de estado.
   - **Observador (toolBox):** `node dist/toolbox.js serve` levanta un solo
     proceso read-only sobre el registro de harnesses: el Next standalone de
     `apps/web`. `handyman/src/toolbox*.ts` aportan el CLI y el armado de estado
     (`toolbox_state.ts` / `buildState`); la UI y todas las rutas HTTP viven en
     `apps/web`. El panel UMD legacy (`assets/toolbox_panel.js`) se retiro en la
     feature `toolbox_panel_retirement` y el server Node (`toolbox_serve.ts`) en
     la feature 50, asi que `GET /` ya no es un placeholder: sirve la landing
     unificada. Los writes siguen en los CLIs de rol (la unica ruta que escribe
     disco es `POST /api/intake`).
2. **Politica de dependencias.** Minimalismo agresivo: solo stdlib de Node +
   `ajv` (validacion de los mismos JSON Schema) + `vis-network` (renderer de
   graphify, servido como UMD desde `node_modules` en `/vendor/vis-network.js`).
   Las deps de UI del antiguo panel UMD (marked/dompurify/minisearch/react/htm)
   se retiraron de `handyman/package.json` con el panel y viven ahora en
   `apps/web` (ESM) y `packages/toolbox-core` (minisearch Node-side). Toda dep
   nueva requiere justificacion explicita.
   - **`minisearch` en `apps/web`** (feature 47, CHECKPOINTS C3): la vista
     `/search` de la app Next construye el indice BM25 client-side sobre
     `GET /api/corpus` y responde por tecla sin red, exactamente el mismo
     motor y opciones (`title`+`text`, boost x2, prefix, fuzzy 0.1) que el
     panel UMD legado ya carga como vendor; es la misma version que handyman
     ya trae en el monorepo, importada como ESM en vez de UMD. No hay
     equivalente en la plataforma (el ranking BM25 con prefix/fuzzy no se
     replica razonablemente a mano) y desaparece del lado Node al retirar el
     panel (feature 49). Las vistas nuevas mantienen el patron cero-deps en
     todo lo demas (D1 de backlog/explore_toolbox_next_unification.md): CSS
     nativo + tokens + renderers de strings; la command palette usa un
     ranker propio determinista, sin dependencia.
   - **`marked` + `dompurify` en `apps/web`** (feature 48, CHECKPOINTS C3,
     decision D2 de `backlog/explore_toolbox_next_unification.md`): las
     vistas `/intake`, `/ask` y el resumen de `/fleet` renderizan salida LLM
     como markdown sanitizado, el mismo par `marked`+`DOMPurify` (con la
     politica `FORBID_TAGS`/`FORBID_ATTR` del panel UMD legado) que el panel
     ya cargaba como vendor. Son las mismas versiones que handyman ya trae
     en el monorepo (`marked@^12`, `dompurify@^3.2`), importadas como ESM en
     vez de UMD; la politica vive una sola vez en `apps/web/lib/md.ts`
     (`FORBID_TAGS`/`FORBID_ATTR` + `DOMPURIFY_OPTIONS`), puerto byte-exacto
     del `renderMd` del panel, y `renderSanitized` toma las libs como
     parametros inyectables para que la suite transpilada
     (`tests/test_web_intake_ask.sh`) las ejerza contra fakes deterministicos
     sin red. No hay equivalente en la plataforma (reescribir marked + un
     sanitizer a mano no se replica razonablemente) y desaparecen del lado
     Node al retirar el panel (feature 49); dompurify 3.x ademas empaqueta
     sus propios tipos, asi que `@types/dompurify` queda como devDep nominal.
3. **Errores explicitos.** Cada CLI expone un contrato de exit code estable
   (convencion: `0` ok, `1` error, `2` usage, `3` sin trabajo listo en `ready`). Los
   mensajes van a stderr; la salida machine-readable va a stdout con forma estable
   (p.ej. ultima linea `status: ok|warn|error`, o payload `--json`). **Este contrato
   es sagrado: ningun cambio puede alterar exit codes ni la forma de salida.**
4. **Politica de datos.** `feature_list.json` es una maquina de 4 estados
   (`pending`/`in_progress`/`done`/`blocked`) validada contra
   `assets/schemas/feature_list.schema.json` con `additionalProperties:false`. A lo
   sumo una feature `in_progress`. Escrituras deterministas y estables (indentacion,
   orden de claves, newline final) para que los tests black-box no rompan.
5. **Politica de IO.** Toda mutacion de estado pasa por un CLI (`feature.js`,
   `sprint.js`, `backlog.js`), nunca por edicion a mano. El scaffold es determinista y
   nunca sobreescribe. Los role files viven en la ruta de plataforma
   (`.claude/agents/` o `.github/agents/`), nunca dentro de `HARNESS_WORKSPACE`.

## Data Flow

Invocacion CLI (`node dist/<x>.js`) -> resolucion de `PROJECT_ROOT` /
`HARNESS_WORKSPACE` (config -> feature_list config -> `.handyman/` -> fallback) ->
carga + validacion de estado (ajv contra `assets/schemas`) -> operacion atomica sobre
`feature_list.json` / `progress/` / `backlog/` -> salida machine-readable (stdout) +
exit code. Toda mutacion de estado pasa por un CLI (`feature.js`, `sprint.js`,
`backlog.js`), nunca por edicion a mano. El verificador (`init.sh`) orquesta
`validate -> lint -> build -> test` y compuerta el cierre.

## Intake y toolBox

- **Intake.** La peticion de una feature nace como `feature-request.md` (plantilla
  `assets/feature-request.template.md`), ya sea redactada a mano o asistida por el
  toolBox (`POST /api/draft` arma el prompt con plantilla + contexto del harness y lo
  retransmite por SSE; `POST /api/intake` persiste el draft revisado en
  `feature-request.md`); `node dist/feature.js add` la convierte en entrada de
  `feature_list.json`.
- **Observador.** `node dist/toolbox.js serve` publica un panel read-only atado a
  `127.0.0.1`: snapshots + señales + cola de features + timeline (`/api/state`),
  corpus para el BM25 en el cliente (`/api/corpus`), disponibilidad de proveedores
  LLM (`/api/providers`), markdown quick-view (`/api/md`), grafo graphify
  (`/graph/<name>/...`), feed SSE (`/events`) y la vista `#/intake`. La unica ruta
  que escribe disco es `POST /api/intake`; el resto es lectura.
- **Timestamps.** `feature.js start` sella `meta.started_at` (ISO 8601) y
  `feature.js done` sella `meta.done_at`; el cierre de sprint registra `closed_at`.
  Estos timestamps enriquecen las metricas del observador (throughput, verdicts).
- **`toolbox_serve.ts` ya no existe.** Era el observador Node (`node:http`) que
  la migracion strangler reemplazo; se borro en la feature 50 y hoy
  `toolbox.js serve` levanta **un solo proceso**: el Next standalone de
  `apps/web`. Los comentarios en `apps/web/**` que dicen "byte-parity con
  `toolbox_serve.ts`" son **procedencia historica**, no referencias vivas:
  documentan de donde salio el contrato que esa ruta preserva. `apps/web/proxy.ts`
  quedo solo con el guard anti-DNS-rebinding (Host no-loopback -> 403, fijado en
  `tests/test_toolbox_serve.sh`); no hay manifiesto de rutas ni upstream: cada
  ruta tiene su propio `app/**/page.tsx` o `route.ts` y las suites `test_web_*.sh`
  asertan esos archivos.

### Decision D-B: por que los relays LLM no comparten un contrato unico

Antes de sumar el cuarto relay (features 32-35) se releyeron los tres existentes
(`/api/draft`, `/api/summarize`, `/api/ask`). **La coreografia compartida ya
esta extraida**: `apps/web/lib/relay.ts` es dueño del body capado a 256 KB
(`readJsonObject`) y del framing SSE con sus headers (`relayResponse`),
`lib/respond.ts` de los 400, y `packages/toolbox-core` de la orquestacion
`delta|result|error` (`relayAsk` / `relayDraft` / `relaySummary`). Lo que queda
en cada `route.ts` (~70 lineas) **no es ceremonia duplicada sino la declaracion
de en que difiere ese relay**, y difieren de verdad:

| | root | provider | modelo | contexto |
|---|---|---|---|---|
| `draft` | requerido | **requerido** (sin default) | el del provider | tag files + duplicados |
| `summarize` | **ninguno** (es de flota) | default `zai` | `resolveSummaryModel` | digest + cache por hash |
| `ask` | requerido | default `zai` | `resolveSummaryModel` | corpus BM25 top-k |

Un contrato unico para los tres necesitaria flags (`requiresRoot`,
`requiresProvider`, `defaultProvider`, `resolvesModel`) mas un string de error
propio por ruta: un objeto de configuracion tan largo como el codigo que
reemplaza. Ademas **los cuerpos de esos 400 son contrato fijado byte a byte**
por `tests/test_web_relays.sh` (caso TWL2) y por el oraculo; refactorizarlos no
compra nada y arriesga la paridad.

**Regla adoptada:** los tres relays existentes **se quedan como estan**. Los
cuatro nuevos (32-35) si comparten forma entre si — todos son
`POST {root, provider?, model?}` -> leer el workspace via el registry -> prompt
-> SSE -> sin escribir disco — asi que comparten el prelude de resolucion
(root registrado + provider + modelo barato) y siguen usando `lib/relay.ts`
para el resto. Si un quinto relay no encaja en ese prelude, se deja aparte y se
anota aqui en vez de doblar el helper.

## Frontera del MCP

`handyman/src/mcp.ts` es el servidor MCP (stdio) — un cuarto consumidor de
`@handyman/toolbox-core`, igual que `apps/web` y los CLIs de rol. La frontera:

- **Imports del MCP:** `@handyman/toolbox-core/registry` (`handymanRoot`,
  `loadRegistry`), `@handyman/toolbox-core/workspace` (`resolveWorkspace`,
  `resolveDocsDir`), el SDK MCP, `zod`. **Cero imports de la skill** (no lee
  `SKILL.md`, no toca `assets/`, no consulta `metadata.version`). La unica
  dependencia con el paquete `handyman-harness` es por ubicacion
  (`mcp.ts` vive en `handyman/src/`) y por build (`tsc -b` lo compila a
  `handyman/dist/mcp.js`); el contrato funcional es shellear los mismos
  `dist/*.js` que los roles ya corren (cero segunda fuente de verdad).
- **Contrato "shellear el CLI":** cada tool MCP envuelve un CLI hermano
  (`feature.js`, `preflight.js`, `sprint.js`, `upgrade_harness.js`) via
  subprocess. El paquete MCP **nunca** importa `cmdStart`/`cmdLog` como modulo
  de `feature.ts`; depende de `handyman-harness` como dep npm y sigue
  shellear `dist/feature.js`. Esto preserva el invariant "verifier-gated close
  refused by the subprocess, not by convention".
- **Descentralizacion postergada (Camino B):** mover `mcp.ts` a su propio
  paquete `packages/handyman-mcp/` es arquitectonicamente correcto pero
  prematuro mientras el unico consumidor sea este repo. La migracion ya es
  barata: el acoplamiento restante es solo por ubicacion, y los imports ya
  apuntan a `toolbox-core` (no a `./core/index.js`). Cuando aparezca un
  consumidor externo que solo quiere el servidor, mover `mcp.ts` y cambiar
  los `runCli("feature.js")` para resolver el binario desde
  `node_modules/handyman-harness/dist/` es trivial.

## Capa de agentes Flue (bounded contexts y puertos)

Desde las features 90-96 el repo tiene un tercer consumidor del dominio (junto
a los CLIs y el MCP): el agent runtime Flue en `agents/flue-handyman/`. La
lectura hexagonal formal (propuesta completa en
`backlog/explore_flue_runtime_api.md` y decision en
`docs/adr-flue-harness-architecture.md`):

- **Dominio (harness core):** la maquina de estados de feature, sprints,
  reportes, verifier y el layout `.handyman/` viven en `handyman/src/core/` +
  CLIs + `assets/schemas/*.json`. No importa nada hacia afuera.
- **Tool gateway (MCP):** `handyman/src/mcp.ts` es el anti-corruption layer
  entre el LLM y el dominio: los tools son comandos de aplicacion
  (`feature_close`), no primitivas de persistencia. El modelo propone; el CLI
  dispone. Sus rechazos son outcomes de dominio, nunca errores a reintentar.
- **Agent orchestration:** `agents/flue-handyman/` — roles como profiles
  (prompts desde `handyman/assets/role-*.template.md`, fuente unica), una
  instancia de agente por feature (`id` = nombre del feature), delegacion
  leader->subagent via `task()`.
- **Agent execution:** propiedad del framework Flue (sesiones, compaction,
  sandbox, Durable Streams). Se consume por su contrato publico; no se
  construye dominio ahi.
- **Model provisioning:** `agents/flue-handyman/src/ports/model-catalog.ts`
  es el unico modulo que conoce endpoints, env keys y tuning por provider
  (Z.AI GLM via override `anthropic`; Kimi for Coding via `kimi-coding` +
  `KIMI_API_KEY`).
- **Observability:** `agents/flue-handyman/src/ports/telemetry-sink.ts`
  (`observe()` -> `logs/agent-<feature>.jsonl` sanitizado) + consola orientada
  a outcomes; la vista `/agent` de `apps/web` la consume read-only via
  `app/api/agent/loadAgentState.ts` (nunca el wire interno de Flue).
- **Exposure (niveles):** 0 = CLIs/MCP (sagrado) · 1 = `flue dev` + driver SDK
  · 2 = servidor compilado (`agents:build`/`agents:start`) + sqlite persistente
  (`src/db.ts`) · 3 = vista `/agent` · 4 = channels/schedules (postergado:
  channels sin API publica en beta.9).

Reglas duras de la capa de agentes:

1. **Anti-volatilidad.** Todo import de `@flue/*` pasa por
   `agents/flue-handyman/src/flue/index.ts` (unico importador; excepcion
   documentada: `run-feature.mjs`, driver standalone). Diseñar contra
   conceptos estables (agents, profiles, tools, sessions, dispatch, observe,
   registerProvider). **Workflows prohibidos**: mueren en Flue 1.0.
2. **Taxonomia de errores de 3 clases** (`src/domain/errors.ts`):
   `domain_outcome` (nunca retry; el leader reporta y para),
   `transient_infra` (reconexion acotada al MISMO admission, nunca
   re-dispatch), `protocol_error` (lo corrige el modelo). Clasificar por
   contratos estables (`type` snake_case, nombre/status del error), nunca por
   `message`.
3. **Privacidad de logs.** Nunca contenido de mensajes en telemetria (deltas
   y payloads -> `{chars}`); `usage` numerico si.
4. **Un proceso vivo por instancia**; la flota paraleliza por feature, no por
   replica. Servidor compilado para sesiones largas (el watcher de `flue dev`
   no tolera edits con un run en vuelo).

## What Not To Do

- Importar `@flue/*` fuera de `agents/flue-handyman/src/flue/` (rompe la capa
  anti-volatilidad; el caso TFA10 de `tests/test_flue_agents.sh` lo enforcea).
- Usar workflows de Flue para el ciclo de features (eliminados en 1.0), ni
  reintentar rechazos de dominio de los CLIs (verifier rojo, duplicados,
  conflicto de veredicto).
- Cambiar el contrato de un CLI (subcomandos, flags, exit codes, forma de stdout) sin
  actualizar su test oracle **y** todas las referencias en `SKILL.md` / `references/`.
- Editar `feature_list.json` a mano o introducir claves fuera del schema.
- Hacer que el leader o el reviewer editen codigo de producto.
- Introducir una dependencia externa evitable (preferir stdlib / plataforma).
- Migrar un script a TS sin dejar verde su suite black-box existente (paridad).
- Requerir un runtime de JS para correr el **verificador** en repos destino (ver conventions).

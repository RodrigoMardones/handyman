---
type: Explore Report
topic: flue_native_actions_workflows
role: explorer
updated: 2026-07-28
tags: [handyman/role/explorer]
---

# Exploration: migrar workflow y acciones de Handyman (MCP) a APIs nativas de Flue

## Question

¿Cómo mudar las herramientas del harness handyman —hoy servidas vía MCP— hacia `flue-handyman` usando las APIs nativas de `actions`, `workflows` y `sessions` del runtime de Flue, para abstraer la lógica de negocio en código nativo?

## Findings

### 1. Qué se va a migrar: superficie real del MCP handyman

**25 tools exactas** (`handyman/src/mcp.ts:949-1769`, pineado por `tests/test_mcp.js:204-233`). Hecho arquitectónico clave: `mcp.ts` es un **shell delgado** — 17 de 25 tools hacen `execFileSync(node, [dist/<verb>.js, --root, ...])` (`mcp.ts:159,177,192`); la lógica vive en los CLIs hermanos cuyos `cmd*` son **privados de módulo** (solo `main()` exportado). Las 8 restantes son handlers in-process, exportados y libres de MCP — la costura natural del re-host.

| Grupo | Tools | Naturaleza |
|-------|-------|-----------|
| Ciclo | `feature_next`, `feature_add`, `feature_start`, `feature_log`, `feature_next_step`, `feature_block`, `feature_unblock`, `feature_acceptance`, `feature_close`, `feature_close_async`, `task_result` | CLI-private salvo `feature_close_async`/`task_result` (exportados, `mcp.ts:584,644`); `feature_add` ya usa `addFeature` puro exportado (`core/featureWrite.ts:89`) |
| Review | `backlog_review`, `report_write` | `report_write` in-process puro (`mcp.ts:315`); `backlog_review` CLI-private (`backlog.ts:523`) |
| Handoffs | `handoff_submit`, `handoff_claim` | In-process fs puros (`mcp.ts:785,807`) |
| Periodo | `sprint_status`, `sprint_close` | CLI-private (`sprint.ts:762,694`) |
| Observabilidad | `metrics`, `fleet_status`, `fleet_health`, `fleet_timeline` | Funciones de datos **exportadas e importables**: `metrics.collect` (`metrics.ts:193`), `harnessSnapshot`/`snapshots` (`toolbox.ts:350,405`), `harnessSignals` (`toolbox.ts:584`), `toolboxTimeline` (`toolbox.ts:797`) |
| Ops | `harness_list`, `preflight`, `verify`, `upgrade_check` | `harness_list` puro (`mcp.ts:210`); `verify` in-process exportado (`mcp.ts:345`); `preflight`/`upgrade_check` CLI-private |

Además: resources `handyman://{project}/current|resume|docs/{doc}` (`mcp.ts:1639-1726`, `buildResume` exportado en `:426`) y prompts `role_*` que leen `handyman/assets/role-*.template.md`.

**Resolución de workspace**: `resolveProject` (`mcp.ts:114`) — `project` omitido → `process.cwd()`; nombre → lookup en `$HANDYMAN_ROOT/registry.json`. Luego `resolveWorkspace(root)` (`packages/toolbox-core/src/workspace.ts:58`): `harness.config.json` → `feature_list.json` config → `.handyman/` → fallback root. **No hay env var que seleccione workspace.**

### 2. A qué se migra: APIs nativas de Flue (beta.9, instalado en `agents/flue-handyman/node_modules/@flue/`)

El claim del usuario es **correcto**: existen `defineAction`, `defineWorkflow`, `defineTool`, `defineAgent`, todos exportados desde la raíz de `@flue/runtime`. Schemas: **Valibot** (no zod).

- **`defineAction({ name, description, input, output, run(context) })`** (`dist/types-USSZhfC6.d.mts:34`). `input` = schema objeto Valibot; `context = { harness, log, input }` — la acción corre con harness (puede usar `harness.session()`). Se registra importándola en `agent.actions` (se expone al modelo como tool) o ligándola a un workflow. Docs del paquete: `docs/api/action-api.md`.
- **`defineTool({ ..., run({ input, signal }) })`** (`dist/tool-cYDWyO6V.d.mts:4`) — función directa **sin harness**. Dato decisivo: `connectMcpServer()` devuelve **el mismo tipo `ToolDefinition`** — migrar un MCP tool a nativo es cambiar el origen del array, no el shape. El agente no distingue uno de otro.
- **`defineWorkflow({ agent, action | run(context) })` + `invoke(workflow, { input }) → { runId }`** (`dist/flue-app-mTWSxItI.d.mts:31-32,266`). Discovery por `workflows/<name>.ts`. **Matiz crítico** (`docs/concepts/durable-execution.md`): un workflow NO es grafo de pasos ni state machine — es UNA invocación finita de `run()`; Flue no checkpointa TypeScript arbitrario; **en Node no hay recovery de runs interrumpidos** (quedan `active` huérfanos; el retry es una invocación nueva). Inspección: `listRuns()`, `getRun(runId)`; SDK `client.runs.stream/events`.
- **Sessions**: no hay API standalone. Una session es conversación nombrada dentro de un harness: `harness.session(name?)` → `FlueSession` con `prompt/skill/task/shell/compact/fs` (`CallHandle` con `abort()`; una operación activa por session, `SessionBusyError`). Solo accesibles dentro de Actions. El SDK ve instancias de agente, no sesiones nombradas.
- **`defineAgent(initialize → AgentRuntimeConfig)`**: ahí se atan `tools`, `actions`, `skills`, `subagents`, `model`, `cwd`, `sandbox`. Subagents vía `defineAgentProfile` + capability `task`.

### 3. Estado actual de flue-handyman

- Wiring MCP: `src/agents/handyman-leader.ts:72-74` — `connectMcpServer('handyman', { url })` en el initializer; leader recibe las 25 tools; subagents reciben subconjuntos por rol vía `toolsForVerbs()` (`:93,:119`, definido en `src/domain/role-tools.ts`).
- **Cero tools nativas**: grep de `defineTool|defineAction|defineWorkflow|invoke(` en `agents/flue-handyman/src` → 0 matches. La migración empieza de cero.
- El barrel `src/flue/index.ts` no exporta aún `defineTool`/`defineAction`/`defineWorkflow`. Su comentario *"No workflows: they die in 1.0"* **no es verificable** en el paquete instalado — los workflows siguen plenamente documentados y exportados en beta.9.
- Persistencia: `src/db.ts` = SQLite del runtime Flue (streams de conversación); el estado de negocio handyman vive en `.handyman/` y no toca Flue sessions.
- Bug colateral: `src/evals/harness.ts:4` importa desde `'../../flue'` (inexistente; debe ser `'../flue'`) — los evals no arrancan (`ERR_MODULE_NOT_FOUND`).

### 4. Mapeo propuesto: MCP → nativo

| Superficie MCP | Destino nativo | Vía |
|---|---|---|
| Lecturas puras (`feature_next`, `metrics`, `sprint_status`, `fleet_*`, `task_result`, `harness_list`, `upgrade_check`) | `defineTool` | Import directo de funciones exportadas (`metrics.collect`, `harnessSnapshot`...) o spawn async del CLI donde el cmd es privado |
| Mutaciones simples de estado (`feature_add`, `feature_log`, `feature_next_step`, `feature_block/unblock`, `backlog_review`, `report_write`, `handoff_submit/claim`) | `defineTool` | `feature_add` ya es puro en core; el resto: spawn async del CLI (fase 1) o extracción a `handyman/src/core/` (fase 2) |
| Verbos con gate de subproceso (`feature_close`, `verify`, `feature_start`→preflight) | `defineTool` con spawn async | Reusar el patrón `feature_close_async` + `W/run/<task_id>.{json,log}` (ya exportado) en vez de `execFileSync`; `signal` del tool para cancelación |
| Gates de confirmación humana (`sprint_close`, `feature_acceptance --force`) | `defineTool` con `confirm: boolean` | Flue no tiene elicitation mid-call equivalente; mantener semántica confirm-param: el leader pide confirmación al usuario **antes** de invocar |
| Resources `handyman://current|resume|docs` | `defineTool` de lectura (o composición en instrucciones) | `buildResume()` exportado |
| Prompts `role_*` | Ya resuelto: las instrucciones se leen de `assets/role-*.template.md` en el initializer | — |
| El ciclo `add→start→impl→review→close` completo | **No** un `defineWorkflow` único (ver §5) | Mantener instancia de agente por feature; workflows para orquestación determinista futura |

### 5. Decisión clave: workflows y sessions no mapean 1:1

- **Workflow Flue ≠ saga resumible.** El ciclo de feature es conversacional (el modelo decide, hay revisión humana, corre el verifier 15 min) y vive hoy como instancia persistente de agente (`agents.send/wait`, instance id = feature). Un `defineWorkflow` es finito, no se reanuda tras crash en Node, y su `run()` contendría la orquestación — encaja para tramos **deterministas** (p.ej. `close`: verify → history → post_run), no para el loop leader↔subagents completo.
- **"Session" handyman ≠ session Flue.** La sesión del harness es `progress/current.md` en disco (template en `feature.ts:79-111`); la session Flue es estado de conversación en el harness, inaccesible fuera de Actions. No hay nada que "mudar" del MCP aquí: el aislamiento por feature ya lo da el instance-id del agente. Las Flue sessions aparecerán gratis cuando haya Actions que las usen internamente.

### 6. Pitfalls del re-host (verificados en código)

1. **Lógica CLI-private**: salvo `addFeature`, los `cmd*` no se exportan. Fase 1 = wrappers sobre `dist/*.js` (requiere el paquete buildeado presente, como hoy); fase 2 = extraer cuerpos a `core/` si se quiere lógica nativa real.
2. **Paths relativos al layout del paquete**: `../assets`, `../dist`, `import.meta.url` por todas partes (`mcp.ts:92,538`, `feature.ts:75`, `core/schema.ts:26`). El host nativo debe cargar `assets/` (schemas, templates) o parametrizar.
3. **`process.cwd()` como input oculto** (`mcp.ts:117`): en un runtime de agente long-lived, pasar `--root` explícito siempre.
4. **`execFileSync` bloqueante** (timeout 15 min, `mcp.ts:94`): congelaría el event loop del runtime Flue. Nativo = spawn async + registros `W/run/` + reconciliación por pid (código ya exportado, `mcp.ts:584-686`).
5. **El verifier es un contrato de subproceso** (`bash init.sh` exit 0, `feature.ts:948`) + `post_run` como `bash -c` de strings arbitrarios (`feature.ts:285`) — side effect invisible a preservar.
6. **Contratos de formato byte-exactos**: `saveFeatureList` byte-idéntico al writer Python, pineado por `tests/test_feature.sh`; secciones de `current.md`/`history.md` parseadas por metrics/sprint/resume. Cualquier rewrite nativo debe preservarlos.
7. **Single-writer sin locking**: fine para un loop de agente; workers nativos concurrentes racearían.

## Recommended Next Steps

1. **Extender el barrel** `src/flue/index.ts` con `defineTool`, `defineAction`, `defineWorkflow` + tipos (mantener la regla anti-volatilidad).
2. **Fase 1 — tools nativas de solo lectura** (bajo riesgo, sin gates): `feature_next`, `metrics`, `sprint_status`, `fleet_status/health/timeline`, `task_result`, `harness_list`, `upgrade_check` como `defineTool` con spawn async o import directo. El tool set por rol (`domain/role-tools.ts`) pasa de filtrar MCP tools a componer arrays nativos — mismo shape `ToolDefinition`.
3. **Fase 2 — mutaciones**: `feature_add` (import directo de `core/featureWrite.addFeature`), `report_write`, `handoff_*` (handlers ya puros); resto vía spawn async con registros `W/run/`.
4. **Fase 3 — verbs con gate**: `feature_close`/`verify` como spawn async con cancelación por `signal`; confirmación humana pre-invocación (sin elicitation en Flue).
5. **Fase 4 (opcional)**: extraer `cmd*` a `handyman/src/core/` para lógica 100% nativa sin subprocesos; decidir entonces si tramos deterministas del ciclo (p.ej. close) se expresan como `defineWorkflow` con `runId` inspeccionable.
6. **Fix colateral**: corregir import de `src/evals/harness.ts:4` (`'../../flue'` → `'../flue'`).
7. Resolver la duda del barrel sobre workflows ("die in 1.0") con el equipo de Flue antes de apostar orquestación a `defineWorkflow`; en beta.9 no hay señal de deprecación.

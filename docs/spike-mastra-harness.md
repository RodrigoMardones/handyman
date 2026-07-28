# 🔬 Spike: Mastra como runtime de agentes para el harness handyman

> **Estado (2026-07-28): spike COMPLETO — fases 0–4 ejecutadas y validadas**
> en `agents/mastra-handyman/` (ver su README;
> `.handyman/backlog/impl_mastra_spike_phases_0_2.md`,
> `impl_mastra_spike_phase_3.md`, `impl_mastra_spike_phase_4.md`). Decisión
> de fase 3: workflows Mastra SÍ como runtime operativo, con verdad única de
> negocio en disco; regla derivada: cero `.map()` en grafos durables (bug de
> restart en 1.53.0). **ADR de adopción + sunset de Flue:
> `docs/adr-mastra-adopcion.md` (propuesto, a ratificar por el operador).**
>
> Documento de investigación (spike), sucesor del trabajo sobre Flue
> (`docs/adr-flue-harness-architecture.md`, `agents/flue-handyman/`).
> Responde: (1) qué es Mastra y qué tan estable es su SDK, (2) cómo
> mapear handyman como harness sobre su formato de trabajo (agents,
> workflows, memory, skills, MCP), (3) ventajas/desventajas frente al
> intento con Flue, (4) plan de acción por fases.
> Investigación hecha contra fuentes primarias (npm registry, docs
> oficiales, source en `main`) el **2026-07-28**. Las afirmaciones de las
> fases 0–2 quedaron verificadas en ejecución real; el resto (fases 3–4)
> sigue siendo documental, no probado en corrida.

---

## 0. Resumen ejecutivo

**Mastra** es un framework TypeScript para aplicaciones con agentes LLM
(agentes con tools, workflows en grafo, memoria, MCP cliente/servidor,
evals, observabilidad OTEL y servidor HTTP propio), mantenido por
**Kepler Software, Inc.** Licencia **Apache-2.0** (salvo directorios
`ee/` de auth enterprise).

Versiones vigentes (npm, 2026-07-28):

| Paquete | Versión | Publicado |
|---|---|---|
| `@mastra/core` | **1.53.0** | 2026-07-27 |
| `mastra` (CLI) / `create-mastra` | 1.20.2 | 2026-07-27 |
| `@mastra/client-js` | 1.34.0 | 2026-07-27 |
| `@mastra/mcp` | 1.15.0 | 2026-07-23 |
| `@mastra/memory` / `@mastra/libsql` | 1.23.1 / 1.17.1 | — |
| `@mastra/evals` / `@mastra/observability` | 1.6.0 / 1.16.2 | 2026-07-23 |

**Estabilidad:** línea **1.x estable** (`1.0.0` salió 2026-01-20; beta
desde 2025-11-10). El núcleo (Agent, Workflow, generate/stream) es
maduro. **Pero el ritmo es frenético**: ~53 minors en ~6 meses (2–4 por
semana) y los breaking changes post-1.0 ocurren en superficies nuevas —
caso real: en `1.47.0` renombraron `Harness` → `AgentController` y las
rutas `/harness/*` del servidor desaparecieron de golpe (esa superficie
sigue marcada "under active development"; evitarla). Conclusión:
núcleo confiable, bordes volátiles → la capa anti-volatilidad que
diseñamos para Flue **sigue siendo obligatoria**, aunque el riesgo es
menor.

**Veredicto anticipado:** Mastra encaja como driving adapter del
dominio handyman **mejor que Flue**: MCP cliente first-class (el
anti-corruption layer del ADR se mantiene intacto), memoria
thread/resource que reemplaza el patrón "instancia por feature",
workflows con suspend/resume y snapshots (lo que Flue eliminó en 1.0),
métricas de tokens con costo nativo, y skills nativas en formato
`SKILL.md` (la spec de Anthropic). Los riesgos: velocidad de releases,
superficie enorme, storage opt-in, métricas que exigen DuckDB/ClickHouse
y una empresa comercial detrás monetizando la plataforma hosted.

---

## 1. Mapeo conceptual: Flue/Handyman → Mastra 1.x

| Diseño actual (Flue beta.9 / handyman) | Equivalente Mastra 1.x |
|---|---|
| `defineAgent` (leader) | `new Agent({ id, instructions, model, tools, agents })` — supervisor |
| `defineAgentProfile` (implementer/reviewer) | `Agent` subordinado registrado en `agents: { implementer, reviewer }` del supervisor |
| tool `task` built-in (sesión hija) | Delegación supervisor→subagente como tool call; **thread fresco por delegación** + `delegation.messageFilter` para aislamiento de transcript |
| Una instancia de agente por feature | **Un agente (definición stateless); un `thread` por feature y un `resource` por proyecto**: `generate(p, { memory: { thread: featureId, resource: projectId } })` |
| Durable Streams / sesiones | Memory (threads/messages) + snapshots de workflow en storage (`LibSQLStore`, Postgres…). **Sin storage configurado, nada persiste** |
| `observe()` → JSONL sanitizado | `@mastra/observability` (spans OTEL + exporters) + `PinoLogger` con transports; filtrado de contenido vía `SensitiveDataFilter` / processors propios |
| `registerProvider` (catálogo multi-provider) | Model router `'provider/model'` (161 providers), `model: { id, url }` custom, cualquier instancia AI SDK (`createOpenAICompatible`, `createAnthropic({ baseURL })`), o `MastraModelGateway` propia |
| `agents.send` + `agents.wait` (no bloqueante) | `agent.sendMessage()/queueMessage()` con `threadId/resourceId` + `subscribeToThread()`; o HTTP vía `@mastra/client-js` |
| `agents.abort(feature)` | `abortSignal` por llamada, `run.cancel()` en workflows |
| Roles como plantillas en disco (`assets/role-*.template.md`) | `instructions: async ({ requestContext }) => readFile(...)` — instrucciones dinámicas por request |
| Tool sets por rol (TFA14) | `tools` por `Agent` (estático o función de `requestContext`); filtrado del `Record` de `MCPClient.listTools()`; `requireToolApproval` como función |
| Barrel anti-volatilidad `src/flue/index.ts` | **Misma práctica**: un único módulo importador de `@mastra/*` |
| Skill handyman (`SKILL.md` + references) | **Skills nativas**: `createSkill()` / `Workspace` con filesystem (spec agentskills.io) |
| Vista `/agent` read-only (postergada) | **Studio** incluido en `mastra dev` (playground web :4111) |

Nota de nomenclatura: dentro de Mastra existe `AgentController` (antes
`Harness`, renombrado en 1.47.0) — una API de sesiones de agente en
desarrollo activo y con breaking changes recientes. **Colisión de
nombre con nuestro "harness"; no usarla.** Documentar handyman como
harness en formato Mastra = registrar agents + workflows + tools +
skills + memory en la instancia central `Mastra`, conduciendo el
dominio por MCP.

---

## 2. Arquitectura orientada a dominio

La decisión del ADR se mantiene: **el MCP de handyman es el
anti-corruption layer** (el modelo propone, el CLI dispone; el estado de
negocio vive en `.handyman/` en disco). Mastra no compite con eso; lo
adopta — su propio ecosistema deprecó las "integrations" propias
(`@mastra/github`, `@mastra/firecrawl` están deprecadas textualmente "use
the MCP server"). El dominio nunca entra al storage de Mastra: su
storage es solo conversacional (threads), de snapshots de workflow y de
traces/métricas.

Tres topologías posibles para el paquete `agents/mastra-handyman/`:

- **A. In-process (librería).** Un driver propio (equivalente a
  `run-feature.mjs`) importa la instancia y llama
  `mastra.getAgentById('leader').generate(...)`. Cero servidor. Ideal
  para spike y para CI.
- **B. Servidor Mastra propio** (`mastra dev` / `mastra build` → Hono en
  `.mastra/output`, `:4111` default). Expone
  `POST /api/agents/{id}/generate|stream`, `/api/workflows/{id}/start|resume`,
  OpenAPI + Swagger, y **Studio** (playground). Se consume desde cualquier
  proceso con `@mastra/client-js` (`MastraClient({ baseUrl })` →
  `getAgent()/getWorkflow()` type-safe). Es la paridad directa con
  `flue dev` + `@flue/sdk`.
- **C. Server adapter embebido.** `MastraServer` monta las rutas Mastra
  dentro de una app Express/Hono/Fastify/Koa/NestJS existente (con
  `prefix` y middleware propio), o `registerApiRoute()` para endpoints
  custom dentro del servidor generado. Es la vía si `apps/web` quiere
  ser el host del agente.

Requisitos duros: **Node ≥ 22.13, ESM puro (CommonJS no soportado),
`moduleResolution: bundler`**. Layout por convención (no obligación):
`src/mastra/{index.ts,agents/,workflows/,tools/,mcp/,scorers/}` con
registro central `new Mastra({ agents, workflows, mcpServers, storage,
observability, logger })`.

---

## 3. Logs y error handling

**Logging.** `PinoLogger` (`@mastra/loggers`, pino) con niveles,
`redact`, `mixin` (p.ej. inyectar `traceId`), transports a archivo
(`FileTransport`), Upstash o custom (`createCustomTransport`). Con
`Observability` configurado, los logs se duplican al storage de
observabilidad y son consultables (`listLogsVNext`, `listLogsByRunId`).
En steps/tools se usa `mastra.getLogger()` con metadata estructurada.
Nuestra política actual (JSONL por feature, **nunca contenido de
mensajes**, consola orientada a outcomes) se reproduce con
`FileTransport` + `SensitiveDataFilter` + disciplina de metadata.

**Error handling.** No hay taxonomía nativa de errores; el patrón
documentado es: **errores de negocio → valores tipados + `.branch()`**;
**transitorios → `throw` + retries**. Nuestra taxonomía de 3 clases
(`src/domain/errors.ts` en flue-handyman) mapea así:

| Clase handyman | Mecanismo Mastra |
|---|---|
| `domain_outcome` (nunca retry) | El tool MCP devuelve `isError` (sigue siendo dato para el modelo); en workflows, `bail(payload)` termina el run **con éxito** y outcome de negocio (reject/blocked) |
| `transient_infra` (reconexión acotada) | `retryConfig: { attempts, delay }` por workflow y `retries` por step (los intentos restantes se persisten en el snapshot); reconexión de streams del cliente con backoff propio |
| `protocol_error` (el modelo corrige) | El error de validación vuelve como tool result (mismo patrón MCP); processors pueden interceptar con `processAPIError` |

Extras: callbacks `onFinish/onError` por workflow (reciben `status`,
`error`, `logger`, `runId`); status `tripwire` cuando un processor
aborta (p.ej. `CostGuardProcessor`); `run.cancel()` con `abortSignal`
en steps.

---

## 4. Workflow ordenado de revisión: operar el harness desde Mastra

Hay dos estrategias; la recomendación es **empezar por la 1** (paridad
con lo validado en Flue) y evaluar la 2 en fase 3.

**Estrategia 1 — Agente supervisor conduce por MCP (estado en disco).**
El ciclo `add → start → impl → review → close` vive en el protocolo del
leader + `feature_list.json`, exactamente como hoy. Mastra aporta el
loop, la memoria, la delegación y la observabilidad. Una sola fuente de
verdad (disco). El review lo hace el subagente reviewer vía
`backlog_review`; el veredicto lo enforcea `feature_close` + verifier.

**Estrategia 2 — Workflow Mastra con steps que llaman tools MCP.**
`createWorkflow/createStep` (schemas zod por step, `.commit()`
obligatorio) con control de flujo `.then/.parallel/.branch/.map/.dountil/.dowhile/.foreach`,
`stateSchema` compartido, y **durabilidad real**: snapshots en
`workflow_snapshots` por step; si el proceso muere, el servidor
**reinicia automáticamente los runs activos al arrancar**
(`restartAllActiveWorkflowRuns`), `run.restart()` desde el último step
activo, `run.timeTravel()` para re-ejecutar desde cualquier step. El
review humano o por subagente es **human-in-the-loop nativo**:

```ts
const reviewStep = createStep({
  id: 'review',
  suspendSchema: z.object({ reason: z.string() }),
  resumeSchema: z.object({ approved: z.boolean(), feedback: z.string().optional() }),
  execute: async ({ resumeData, suspend, bail }) => {
    if (resumeData?.approved === false) return bail({ approved: false })
    if (!resumeData?.approved) return await suspend({ reason: 'review pendiente' })
    return { approved: true }
  },
})
// Reanudar desde fuera (CLI/panel): client-js run.resume({ step: 'review', resumeData })
```

Trade-off de la estrategia 2: el estado suspendido del workflow vive en
el **storage de Mastra**, no en `.handyman/` — habría dos verdades
(snapshot Mastra + `feature_list.json`) que reconciliar. Por eso es
fase 3 y no fundación. El gate del verifier se mapea como step que
ejecuta `init.sh`: exit≠0 → `throw` (fail) o `.dountil(verifyStep,
cond)` con cota de iteraciones.

Resultado de un run: unión discriminada `status: 'success' | 'failed' |
'suspended' | 'tripwire' | 'paused' | 'canceled'`, con
`result.steps[id].{status,output,error,suspendPayload}`. Ojo:
`run.watch()` existe en el source pero está marcada `@internal` — no
depender de ella; usar `run.stream()`/`observeStream`.

---

## 5. Agentes y sub-agentes

**Agent** (`@mastra/core/agent`): `id` obligatorio, `instructions`
(string o función async de `requestContext` — leer las plantillas de
rol del repo en caliente, como hace flue-handyman), `model`, `tools`,
`agents` (subagentes), `memory`, `defaultOptions`, processors, hooks
`beforeToolCall/afterToolCall`, `requestContextSchema` (valida el
contexto por llamada). Casi todo campo acepta función dinámica por
request. En v1 `RuntimeContext` → **`RequestContext`**.

**Sub-agentes:** el patrón 1.x es el **supervisor agent**
(`new Agent({ agents: { implementer, reviewer } })`; el viejo
`.network()` está superado). La delegación se despacha como tool call
guiada por el `description` de cada subagente. Aislamiento: cada
delegación usa **thread ID fresco**; por defecto el subagente recibe el
contexto del supervisor, pero `delegation.messageFilter: () => []` lo
deja solo con su prompt (equivalente exacto al `task` de Flue). Hooks
`onDelegationStart/onDelegationComplete` (pueden modificar prompt,
acotar `maxSteps`, `bail()`); aprobaciones y `abortSignal` se propagan.

**Tool sets por rol:** cada `Agent` tiene su propio `tools`; la
política "reviewer solo read-only + `backlog_review`" (TFA14) se
implementa filtrando el `Record` de `mcp.listTools()` o con función
dinámica de `tools` por `requestContext`. Refuerzo: `requireToolApproval`
como función `({ toolName, args, annotations }) => boolean` usando las
MCP annotations (`readOnlyHint`) que nuestro servidor anuncie.

**Modelos por rol:** router `'provider/model'` con env keys; endpoints
custom verificados para nuestro catálogo: Z.AI por protocolo Anthropic
→ `createAnthropic({ baseURL: 'https://api.z.ai/api/anthropic', apiKey })`;
Kimi for Coding / GLM por OpenAI-compatible →
`createOpenAICompatible({ name, baseURL, apiKey }).chatModel(...)`; o
`model: { id: 'custom/glm-...', url }`. Fallbacks nativos con array de
modelos. `model` también puede ser función de `requestContext` → mismo
`model-catalog.ts` por env que hoy.

**Generación:** `agent.generate()` devuelve `text`, `usage`, `steps[]`
(usage por paso), `toolCalls/toolResults`, `finishReason`
('stop'|'tool-calls'|'suspended'|'error'), `runId`, `traceId`,
`suspendPayload`. `maxSteps` default 5 (subirlo en loops con
delegación). No bloqueante: `sendMessage/queueMessage` con
`{ threadId, resourceId }` + `subscribeToThread()`. Aprobación de
tools: `requireApproval` por tool, `requireToolApproval` por llamada,
`approveToolCall/declineToolCall`, y tools que suspenden a mitad
(`context.agent.suspend()`, `autoResumeSuspendedTools`).

---

## 6. Memoria y contexto (el equivalente a `.handyman/memory/`)

Modelo Mastra: **thread** = conversación (→ feature); **resource** =
entidad dueña (→ proyecto). Persistencia vía storage adapter (LibSQL,
Postgres, MongoDB, Upstash). Config clave de `new Memory({ storage,
options })`:

- `lastMessages: N` — historial reciente.
- `workingMemory: { enabled, scope: 'resource' | 'thread', template:
  '# markdown…' }` — bloque persistente que el agente actualiza.
  **`scope: 'resource'` compartido entre todos los threads del proyecto =
  `memory/business.md` + `architecture.md` + `conventions.md`.**
  `scope: 'thread'` = scratchpad por feature = `progress/current.md`.
  Se siembra programáticamente:
  `memory.updateWorkingMemory({ threadId, resourceId, workingMemory })`.
- `semanticRecall: { topK, scope: 'resource' }` — recall vectorial entre
  features (requiere `vector` + `embedder`).
- `readOnly: true` — el reviewer lee memoria sin poder mutarla.
- **Compactación real — Observational Memory**: agentes de fondo
  Observer/Reflector comprimen el historial en observaciones densas al
  superar umbrales de tokens (30k/40k default). Es el equivalente más
  cercano a la compactación de los CLI hosts.

**Advertencia de arquitectura:** la working memory nativa vive en la
**DB de Mastra**, no en nuestros `.md`. Si el disco debe seguir siendo
la fuente de verdad (filosofía handyman), la vía fiel es **inyección**:
instrucciones dinámicas que leen `.handyman/memory/*.md` en cada
request, o un processor que reemplace el bloque. La working memory
nativa es espejo conveniente, no verdad. Decisión abierta (§10).

**Processors de contexto** (pipeline input/output, con compactación
defensiva): `TokenLimiter(127k)`, `ToolCallFilter` (poda tool calls
viejos), `PromptInjectionDetector`, `PIIDetector`, `CostGuardProcessor`;
custom vía interfaz `Processor` (`processInput`, `processInputStep`
—puede cambiar `model`/`toolChoice` por paso—, `abort(reason, { retry
})`). Con memoria activa, Mastra auto-inserta `MessageHistory`,
`SemanticRecall`, `WorkingMemory` en el orden correcto.

---

## 7. Métricas basadas en uso de tokens

Tres capas, de menor a mayor esfuerzo:

1. **Programática (inmediata):** `result.usage` y `result.steps[i].usage`
  (input/output; `cachedInputTokens` y reasoning según provider);
  `onStepFinish({ usage })`. Ojo verificado en source: **`WorkflowResult`
  NO expone `usage` agregado** — por workflow-run hay que agregar a mano
  en `state` o consultar la capa 3.
2. **Tracing:** cada span `MODEL_GENERATION` lleva `usage`;
  correlación por `traceId`/`runId`/jerarquía agent→workflow→step.
  `traceId` viene en cada resultado.
3. **Métricas automáticas + costo (la que resuelve nuestra feature
  `feature_token_metrics_ledger`):** al cerrar spans se emiten
  `mastra_model_total_input_tokens`, `..._output_tokens`,
  desgloses de cache/razonamiento/audio/imagen, duraciones
  `mastra_{agent,workflow,tool,model}_duration_ms`, y —nativo—
  **`estimatedCost` por provider/modelo** (pricing registry embebido).
  Cada métrica lleva `CorrelationContext` (`runId`, `entityId`,
  `resourceId`, `threadId`) → agregación por feature vía
  `getMetricAggregate` del storage. **Requisito duro: store analítico —
  DuckDB (`@mastra/duckdb`) en local, ClickHouse en producción; LibSQL
  NO soporta métricas.** Config típica: `MastraCompositeStore` (LibSQL
  para snapshots/memoria + DuckDB para observability).

**Puente con handyman:** al cerrar una feature, escribir una línea en
`.handyman/metrics/tokens.jsonl` con `source: "mastra"` (mismo ledger
del diseño §2 de `analisis-tokens-consumo-y-metricas.md`), desde un
exporter/processor o el propio driver al recibir el resultado. Guardas
nativas: `CostGuardProcessor` (maxCost por `run|resource|thread`,
`block|warn` → tripwire) y `TokenLimiter`.

**Evals** (`@mastra/evals` 1.6.0): scorers prebuilt
(`answer-relevancy`, `faithfulness`, `tool-call-accuracy`,
`trajectory-accuracy` —secuencia de tool calls, ideal para validar el
protocolo MCP—), **Quick Checks zero-LLM deterministas y gratis**
(`checks.toolOrder`, `calledTool`, `maxToolCalls`, `noToolErrors`),
scorers custom con juez LLM, live scorers en agents y steps, y
`runEvals({ target, gates, scorers })` con `verdict:
passed|scored|failed` para **CI con exit code** — el equivalente directo
de nuestra suite vitest-evals, con menos código propio.

---

## 8. Skills, tools y MCPs

**Tools propias:** `createTool({ id, description, inputSchema,
outputSchema, requireApproval, execute })` (zod/Valibot/ArkType).
Contexto de ejecución con `requestContext`, `abortSignal`, `mastra`,
`writer`, y subcontextos `agent`/`workflow`/`mcp`. Para handyman casi
no hacen falta tools propias: las 25 ya existen detrás del MCP.

**MCP cliente (`@mastra/mcp`, `MCPClient`) — nuestro caso:**
```ts
const mcp = new MCPClient({ id: 'handyman', servers: {
  handyman: { url: new URL('http://localhost:8177/mcp') },  // streamable-http
  // o stdio: { command: 'node', args: ['handyman/dist/mcp.js'] }
}})
new Agent({ ..., tools: await mcp.listTools() })              // estático
await agent.stream(p, { toolsets: await mcp.listToolsets() }) // dinámico
```
Namespacing `handyman_feature_close`; `requireToolApproval` por
servidor con acceso a annotations; OAuth soportado. **Caveats
documentados:** (a) SSE legacy exige `eventSourceInit` además de
`requestInit` (bug del SDK MCP); (b) el GET listener de streamable-http
puede entrar en loop de reconexión ~1/s si el `fetch` lanza — patrón:
responder 405 sintético si el servidor no pushea (revisar nuestro
`mcp.ts`); (c) dos `MCPClient` con idéntica config sin `id` lanzan
error (anti memory-leak); (d) las annotations son advisory, no security
boundary.

**MCP servidor (`MCPServer`):** expone tools propias, agents (como tool
`ask_<agent>`) y workflows (`run_<workflow>`) por stdio/SSE/streamable-HTTP;
registrado en la instancia se sirve en `/api/mcp/<id>/mcp`. Permitiría
exponer el agente leader a otros hosts (Cursor, Claude Desktop) sin
escribir otro servidor.

**Skills — sí existe el concepto nativo** (desde `@mastra/core@1.1.0`,
spec Agent Skills de agentskills.io, el formato `SKILL.md` de
Anthropic): `createSkill({ name, description, instructions,
references })` inline, o descubrimiento por filesystem vía
`Workspace({ filesystem: new LocalFilesystem({ basePath }), skills:
[globs] })`. El agente recibe tools automáticas `skill`, `skill_read`,
`skill_search` (carga progresiva, stateless). **La skill handyman
actual podría portarse a skill nativa de Mastra casi sin cambio de
formato** — y coexistir con la instalación en hosts (Claude Code, Kimi
Code). Prioridad local > managed > external; versionado
content-addressable disponible.

---

## 9. Ventajas y desventajas

**Ventajas (vs Flue beta y en absoluto):**

- **Estabilidad del núcleo**: 1.x desde 2026-01; Agent/Workflow/generate
  maduros. Flue sigue en beta con rework anunciado.
- **MCP first-class en ambos sentidos**: cliente (consume nuestras 25
  tools) y servidor (expone el leader). El anti-corruption layer del
  ADR queda intacto y validado por el ecosistema.
- **Modelo de memoria superior**: thread/resource elimina el patrón
  "instancia por feature"; working memory + semantic recall +
  Observational Memory cubren `memory/*.md`, `current.md` y
  compactación sin código propio.
- **Workflows durables con HITL**: suspend/resume, snapshots,
  auto-restart de runs activos, time-travel. Flue **eliminó** workflows
  en su 1.0 ("conversations are the only durable unit").
- **Métricas de tokens y costo nativas** con correlación por
  run/resource/thread — alimenta directo el ledger `tokens.jsonl`.
- **Evals en CI con gates deterministas** (checks zero-LLM) + scorers
  con umbral; menos infra propia que vitest-evals.
- **Skills nativas en formato SKILL.md**: la skill handyman es portable.
- **Studio incluido** (playground/observabilidad web): cubre la "vista
  read-only del loop" que el ADR postergó construir en `apps/web`.
- **SDK cliente tipado + server adapters**: operable desde CLI, panel
  web o embebido en Express/Hono; OpenAPI generado.
- Licencia Apache-2.0, documentación amplia, comunidad activa.

**Desventajas / riesgos:**

- **Velocidad de releases**: 2–4 minors/semana; breaking changes en
  superficies nuevas (caso `Harness`→`AgentController`). Mitigación:
  pin de versión + barrel anti-volatilidad + cadencia de upgrade
  (misma disciplina que con Flue; test enforced).
- **Superficie enorme**: ~100 paquetes; curva de aprendizaje y riesgo
  de adoptar features inmaduras. Mitigación: dieta estricta (Agent,
  MCPClient, Memory, Observability, evals; workflows solo en fase 3).
- **Storage opt-in**: sin `storage` no hay durabilidad de nada (ni
  memoria ni snapshots). No es default seguro.
- **Métricas exigen DuckDB/ClickHouse**: LibSQL no sirve para
  observability → un store más que operar (composite).
- **Vendor risk**: empresa comercial (Kepler) monetizando plataforma
  hosted; directorios `ee/` con licencia aparte. El core es Apache-2.0,
  pero el centro de gravedad del producto puede moverse a la nube.
- **Sin taxonomía de errores nativa**: hay que portar
  `domain_outcome`/`transient_infra`/`protocol_error` como convención
  propia (valores + `bail` vs `throw` + retries).
- **Aislamiento de subagentes no es default**: el supervisor pasa su
  contexto completo salvo que configures `delegation.messageFilter`.
- **Doble verdad potencial** si los workflows de Mastra modelan el
  ciclo de feature (snapshot en DB vs `feature_list.json` en disco).
- **ESM-only, Node ≥ 22.13**: verificar compatibilidad con el toolchain
  del monorepo (hoy compilamos CJS con `tsc`).
- Caveats de MCP cliente (loop de reconexión GET, SSE legacy) que hay
  que probar contra nuestro `mcp.ts`.

---

## 10. Plan de acción por fases

Mismo patrón que el rollout de Flue: exposición por niveles, verdad en
disco, cada fase con gate verificable. Vehículo: features del harness.

| Fase | Acción | Gate de validación | Feature propuesta |
|---|---|---|---|
| **0 — Spike mínimo** | Scaffold `agents/mastra-handyman/` (workspace pnpm, ESM); barrel `src/mastra/index.ts` como único importador de `@mastra/*`; `MCPClient` → MCP `:8177`; **un agente plano** con las 25 tools; scratch project con verifier trivial. Corrida verde (ciclo completo → `done` en disco) y roja (verifier exit 1 → close rechazado, feature queda `in_progress`) | Estados finales en `feature_list.json` del scratch (no en la prosa del modelo); `result.usage` capturado; caveats MCP (GET loop, SSE) probados contra `mcp.ts` | `spike_mastra_minimal` |
| **1 — Roles** | Supervisor + `implementer`/`reviewer` en `agents: {}`; tool sets por rol (filtro de `listTools()`); aislamiento con `delegation.messageFilter`; instrucciones desde `assets/role-*.template.md` (fs); catálogo de modelos por env (port de `model-catalog.ts`) vía `createAnthropic({ baseURL })` (Z.AI) y `createOpenAICompatible` (Kimi) | 3 corridas `done` con `validate_harness: OK`; reviewer **no puede** mutar (tools inexistentes para su rol — equivalente TFA14); corrida mixta GLM+Kimi | `mastra_supervisor_roles` |
| **2 — Memoria y observabilidad** | Thread por feature / resource por proyecto; `Memory` con `LibSQLStore`; siembra de working memory desde `.handyman/memory/*.md` **o** inyección por instrucciones dinámicas (decidir fuente de verdad, §6); `Observability` + `MastraCompositeStore` (LibSQL + DuckDB) + `SensitiveDataFilter`; puente a `.handyman/metrics/tokens.jsonl` (`source: "mastra"`) al cierre; JSONL por feature sin contenido de mensajes | Métricas agregables por `runId`/feature vía `getMetricAggregate`; línea de ledger escrita en `history.md`; logs auditados sin payloads | `mastra_memory_threads` + `mastra_telemetry_bridge` |
| **3 — Workflow de revisión (evaluativa)** | Reimplementar el ciclo como `createWorkflow` con steps que llaman tools MCP; review con `suspend/resume` (humano desde CLI o panel); política de errores: negocio→`bail`, transitorio→`retryConfig`; probar crash-recovery (kill a mitad de run, auto-restart al arrancar) | Kill -9 a mitad de ciclo → el run retoma desde el snapshot y cierra; reject → `bail` con outcome tipado; **decisión documentada**: workflow Mastra sí/no (doble verdad) | `mastra_review_workflow` |
| **4 — Evals y skills** | `runEvals` en CI: gates `checks.toolOrder` (`feature_add` < `feature_start` < `feature_close`), `noToolErrors`, + scorer `trajectory-accuracy` con umbral; portar la skill handyman a skill nativa (`Workspace` + filesystem) en modo espejo | Evals verdes con exit code en CI; skill nativa carga `SKILL.md` + references y dispara el protocolo; **ADR de adopción/rechazo** redactado | `mastra_evals_ci` + `mastra_skill_native` |

Decisiones transversales desde el día 1 (heredadas del ADR Flue):
capa anti-volatilidad enforced por test; un proceso vivo por
deployment; el MCP sigue siendo el único camino de mutación del
dominio; `logs/` y `data/` gitignored; telemetría sin contenido de
mensajes.

---

## 11. Puntos abiertos para el humano

1. **Topología**: ¿servidor Mastra propio (B, paridad Flue), embebido en
   `apps/web` (C, el panel como host) o solo in-process (A, CI/CLI)?
2. **Fuente de verdad de la memoria**: ¿working memory en DB Mastra
   (cómodo, duplica) o inyección desde `.handyman/memory/*.md` (fiel al
   disco)? Recomendación del spike: inyección, espejo opcional.
3. **¿Workflows de Mastra para el ciclo de feature?** La fase 3 es
   exploratoria; si la doble verdad pesa más que el HITL gratis, se
   queda en supervisor+MCP (estrategia 1) y los workflows se reservan
   para procesos internos del agente.
4. **Cadencia de upgrade**: con 2–4 minors/semana, ¿pin estricto +
   upgrade mensual con suite verde? (La lección Flue aplica.)
5. **Coexistencia**: si la fase 0–1 pasa los gates, ¿sunset de
   `agents/flue-handyman/` o doble mantenimiento hasta que Flue 1.0
   estabilice? Coste de mantener dos runtimes: dos barrels, dos suites
   de evals.
6. **Store analítico**: ¿DuckDB local alcanza, o se prevé ClickHouse si
   el harness se opera en flota (multi-repo)?

---

## 12. Fuentes primarias

- npm registry (consulta directa 2026-07-28): `@mastra/core@1.53.0`,
  `mastra@1.20.2`, `@mastra/client-js@1.34.0`, `@mastra/mcp@1.15.0`,
  `@mastra/memory@1.23.1`, `@mastra/libsql@1.17.1`, `@mastra/evals@1.6.0`,
  `@mastra/observability@1.16.2`, `@mastra/loggers@1.2.0`.
- Repo: github.com/mastra-ai/mastra (README, LICENSE.md,
  packages/core/CHANGELOG.md, pnpm-workspace.yaml, source de
  workflows/tools en `main`).
- Docs oficiales (mastra.ai/en/docs y /reference): agents/overview,
  agents/supervisor-agents, agents/agent-approval, agents/processors,
  agents/skills; memory/{message-history,working-memory,
  observational-memory,memory-processors}; workflows/{overview,
  control-flow,workflow-state,snapshots,suspend-and-resume,
  human-in-the-loop,error-handling}; observability/{logging,
  tracing/overview,metrics/overview,integrations/overview};
  evals/{overview,built-in-scorers,custom-scorers,running-in-ci,
  gates-and-verdicts}; tools-mcp/{overview,mcp-overview};
  server/{mastra-server,server-adapters}; storage/overview;
  deployment/overview; getting-started/project-structure;
  reference/{agent,generate,create-tool,mcp-client,mcp-server,
  memory-class,mastra-client,cli/mastra,cost-guard-processor}.
- AI SDK: sdk.vercel.ai/providers/ai-sdk-providers/anthropic
  (`baseURL`); readme npm `@ai-sdk/openai-compatible`.
- Contexto local: `docs/adr-flue-harness-architecture.md`,
  `agents/flue-handyman/README.md`,
  `docs/analisis-tokens-consumo-y-metricas.md`,
  `docs/analisis-mcp-extension.md`.

**No verificado (declarado):** nada se ejecutó contra 1.53.0; la
signature exacta de `execute` en `createTool` (doc y source difieren en
forma, probar ambas en fase 0); `requireApproval` como función (en el
tipo fuente, no en la página de referencia); entradas de Z.AI/Kimi en
el model router (las vías custom están verificadas y bastan); estado de
`.network()` en 1.53 (en desuso según guía de migración); comportamiento
real de los caveats MCP contra nuestro servidor.

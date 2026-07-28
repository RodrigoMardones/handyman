---
type: Explore Report
topic: flue-runtime-api-architecture
role: explorer
updated: 2026-07-28
tags: [handyman/role/explorer]
---

# Exploration: flue-runtime-api-architecture (feature 89)

## Question

Revisar completamente la superficie de API de `@flue/runtime` / `@flue/sdk` / `@flue/cli` (ground truth del paquete instalado `1.0.0-beta.9`, cruzado con docs oficiales) para: (1) inventario de API, (2) mapa de conceptos handyman ↔ Flue, (3) censo de capacidades, (4) propuesta de arquitectura formal del harness con entidades de negocio limpias (DDD / hexagonal), y (5) estrategia de trabajo para arquitectura, logs/errores, exposición y consumo. Brief completo: `progress/handoff-2026-07-27.md` §3.

---

## 1. Inventario de API (ground truth: paquete instalado 1.0.0-beta.9)

Fuente: `agents/flue-handyman/node_modules/@flue/{runtime,sdk,cli}/dist/*.d.mts` + `package.json` (exports map). **Ningún paquete incluye CHANGELOG.md** — la deriva hacia 1.0 solo se puede seguir por el repo (`github.com/withastro/flue`, CHANGELOG "Unreleased" en `main`) y el README (que ya exhibe la API de hooks `'use agent'` del rework).

### 1.1 `@flue/runtime` — barrel (`.`)

**Agents / profiles**
- `defineAgent(init)` → `AgentDefinition` (`init` recibe `{ id, env }`, devuelve `AgentRuntimeConfig`). `createAgent` existe pero está **`@deprecated`** (renombrado).
- `defineAgentProfile(profile)` → `AgentProfile` validado (`name/description/model/instructions/skills/tools/actions/subagents/thinkingLevel/compaction`; `durability` rechazado en profiles).
- Tipos: `AgentRuntimeConfig` (profile + `cwd`, `sandbox`), `AgentInitializerContext`, `AgentManifestEntry`, `AgentRouteHandler` (middleware Hono), `DispatchReceipt { dispatchId, acceptedAt }`, `ThinkingLevel`.

**Tools / actions / skills**
- `defineTool({ name, description, input, output, run })` — schemas **Valibot**; input validado antes de `run`, output validado y serializado. Tipos `ToolDefinition`, `ToolContext`, `ToolInput/Output`, `ValidationIssue`.
- `defineAction({ name, description, input, output, run })` — unidad de trabajo determinista con harness (`ActionContext { harness, log, input }`). **Es el reemplazo conceptual de los workflows en 1.0.**
- `defineSkill({ name, description, instructions?, files?, allowedTools? })` → `SkillReference`; también `import skill from './SKILL.md' with { type: 'skill' }` (módulos ambientales declarados en `types/index.d.ts`) y auto-descubrimiento de `<cwd>/.agents/skills/`.

**Sessions / harness**
- `FlueHarness { session(name?), sessions, shell(), fs }`; `FlueSession { prompt, skill, task, shell, compact, fs, conversationId }` — **una operación activa por sesión** (`SessionBusyError`); sesiones `task:` reservadas.
- `CallHandle<T> = Promise<T> & { signal, abort() }`; `PromptOptions { result, tools, model, thinkingLevel, signal, images }`; `TaskOptions { agent, cwd }`.
- Respuestas: `PromptResponse { text, usage, model }` / `PromptResultResponse<T> { data, usage, model }`; `PromptUsage { input, output, cacheRead, cacheWrite, totalTokens, cost }`.
- `CompactionConfig { reserveTokens, keepRecentTokens, model }` (`false` desactiva); `DurabilityConfig { maxAttempts = 10, timeoutMs = 1h }`.
- `SessionEnv` (exec + fs completo + cwd) — interfaz universal de entorno; `FlueFs` = fs out-of-band (no aparece en el transcript).

**Sandboxes**
- `bash(factory)` (virtual, just-bash en memoria), `local({ cwd, env })` **`[node]`** (host real, env opt-in por allowlist), `cloudflareSandbox(stub)` **`[cf]`**.
- Contratos: `SandboxFactory { createSessionEnv({id}), tools? }`, `SandboxApi` (para providers remotos: E2B, Daytona…), `createSandboxSessionEnv(api, cwd)`.

**MCP**
- `connectMcpServer(name, { url, transport: 'streamable-http'|'sse', headers, timeoutMs, resetTimeoutOnProgress })` → `McpServerConnection { tools: ToolDefinition[], close() }`. Tools adaptadas como `mcp__<server>__<tool>`. **Es nuestra integración actual.**

**Routing / dispatch / workflows**
- `flue()` **`[subpath ./routing]`** → sub-app Hono: `POST /agents/:name/:id` (202 + `streamUrl/offset/submissionId`), `GET ...?view=updates&live=sse`, `POST /workflows/:name`, `GET /runs/:runId`.
- `dispatch(agent, { id, input })` → `DispatchReceipt` (admisión asíncrona, at-least-once; durabilidad según target).
- `defineWorkflow` / `invoke` / `listRuns` / `getRun` / `listAgents` — **presentes en beta.9 pero workflows muere en 1.0** (README del repo: "conversations are the only durable unit"). `RunRecord`/`RunStatus`/`ListRunsOpts` siguen siendo los tipos de inspección de runs.

**Durabilidad / stores** (subpath `./adapter`, para adapters custom de persistencia)
- Interfaces: `PersistenceAdapter`, `PersistenceStores`, `AgentExecutionStore`/`AgentSubmissionStore` (ciclo admit/claim/settle/lease/abort — JSDoc: *"subject to change until 1.0"*), `RunStore`, `EventStreamStore`, `ConversationStreamStore` (fence/epoch, append atómico), `AttachmentStore`.
- Constantes: `FLUE_SCHEMA_VERSION = 4`, `DURABILITY_DEFAULT_MAX_ATTEMPTS = 10`, `DURABILITY_DEFAULT_TIMEOUT_MS = 3_600_000`, `LEASE_DURATION_MS = 30_000`.
- `./node`: `sqlite(path?)` → `PersistenceAdapter` (`node:sqlite`, `':memory:'` por defecto; archivo para durabilidad real).

**Observabilidad**
- `observe(subscriber)` → unsubscribe: eventos vivos del proceso (no replay durable). `instrument({ observe, interceptor, dispose })` — interceptor alrededor de operaciones `workflow|agent|model|tool|task` con ids de correlación + `traceCarrier`.
- `FlueLogger { info, warn, error }` (estructurado, persistido en runs). Constantes `FLUE_EVENT_SCHEMA_REVISION = 3`, `IMAGE_DATA_OMITTED`.

**Providers / modelos**
- `registerProvider(providerId, { api?, baseUrl?, apiKey?, headers?, contextWindow?, maxTokens?, models?, telemetry? })` — override de catálogo pi-ai o provider nuevo (así conectamos Z.AI y kimi-coding hoy). `registerApiProvider({ api, stream, streamSimple })` para wire-protocols nuevos.
- Tipos normalizados: `ModelRequest/Response`, `LlmMessage/LlmToolCall/LlmTool`, `LlmTurnPurpose ('agent'|'compaction'|...)`.

### 1.2 Superficie de errores (jerarquía real del paquete)

```
Error
├── ResultUnavailableError            // el modelo llamó give_up (reason, assistantText)
└── FlueError { type, details, dev, meta?, cause? }   // type snake_case estable; message NO es API
    ├── RuntimeUnavailableError [./internal]          // loading/draining/failed (HTTP 503)
    ├── ActionInput/OutputValidationError · ActionOutputSerializationError
    ├── ToolInput/OutputValidationError · ToolOutputSerializationError · ToolNameConflictError
    ├── SessionBusyError · SessionAlreadyExistsError · SessionNotFoundError
    ├── SubagentNotDeclaredError · DelegationDepthExceededError
    ├── SkillDefinitionValidationError · SkillNotRegisteredError
    ├── ProviderRegistrationError · SandboxOperationUnsupportedError
    ├── SubmissionAbortedError · SubmissionInterruptedError ·
    │   SubmissionRetryExhaustedError · SubmissionTimeoutError
    ├── Attachment*Error · ConversationStreamStoreError · PersistedSchemaVersionError [./adapter]
    └── Workflow*Error (×6; familia condenada en 1.0)
```

Convención del propio paquete: `type` + clase son el contrato estable; `message`/`details` son caller-safe (van al wire), `dev` solo en desarrollo. `toHttpResponse(err)` (interno) renderiza el envelope canónico y **oculta errores no-Flue como 500 genérico**. SDK (jerarquía separada): `FlueApiError` (status+body), `FlueExecutionError`, `UnsupportedFlueEventVersionError`, + `DurableStreamError/FetchError/StreamClosedError` de `@durable-streams/client`.

### 1.3 Eventos — unión `FlueEvent` (`v: 3`, 26 variantes)

Correlación opcional en todos: `runId/instanceId/dispatchId/submissionId/agentName/conversationId/session/parentSession/taskId/operationId/turnId`.

- Runs: `run_start/run_resume/run_end` · Ciclo agente: `agent_start/agent_end`
- Turnos LLM: `turn_start/turn_request/turn_messages/turn` (con `ModelRequest`/`ModelResponse` + usage)
- Streaming: `message_start/end`, `text_delta`, `thinking_start/delta/end`
- Tools: `tool_start/tool` · Tasks: `task_start/task` · Compaction: `compaction_start/compaction`
- Operaciones: `operation_start/operation` (`prompt|skill|task|shell|compact`) · Varios: `log`, `idle`, `submission_settled` (`completed|failed|aborted`)

### 1.4 `@flue/sdk` (cliente HTTP)

`createFlueClient({ baseUrl, token?, headers?, fetch? })` →
- `agents.prompt/send/wait/abort/history/observe/attachmentUrl` — `send` admite sin esperar (`{ streamUrl, offset, submissionId }`); `wait` sondea hasta resultado terminal (resuelve `{ text, usage, model }` plano); `observe` da snapshots vivos (long-poll|sse) con fases `loading|connecting|live|absent|error|closed`.
- `runs.get/events/stream` (async iterable con checkpoint por offset) · `workflows.invoke/run` (condenado).

### 1.5 `@flue/cli`

`flue dev [--target node|cloudflare] [--port]` · `flue run <name> [--id] [--input json]` · `flue build` (→ `dist/server.mjs` en target node) · `flue init` · `flue add/update <kind> <name>` (blueprints Markdown para coding agents) · `flue docs` (docs offline empaquetadas). Requiere Node ≥22.19 (23.0–23.5 rechazado; Bun rechazado).

### 1.6 Cross-check docs ↔ paquete (beta drift)

- `docs/api/agent-api/` **coincide** con el barrel instalado (defineAgent, defineAgentProfile, defineTool, connectMcpServer, dispatch, bash, errores tipados, FlueHarness/FlueSession). Tratar esa página como autoritativa.
- El **quickstart** sigue mostrando `createAgent()` (deprecated en el paquete) y `flue connect`: drift de docs, ignorar.
- El **README del repo** exhibe la API de hooks (`'use agent'`, `useModel`, `useTool`) que **no existe** en beta.9: es la dirección 1.0 (plugin Vite). Diseñar contra conceptos estables: agents, profiles, tools, actions, sessions, dispatch, Durable Streams, observe, registerProvider.
- **Channels**: no hay API pública en el barrel; la superficie real es `channelHandlers` (interno) + blueprints `flue add channel`. Postergar.
- Paquetes del ecosistema **no instalados** pero disponibles: `@flue/postgres` (+libsql/mongodb/mysql/redis), `@flue/opentelemetry`, `@flue/react`, `@flue/slack`.

---

## 2. Concept map handyman ↔ Flue (adopt / wrap / ignore)

| Handyman (dominio) | Flue (primitiva) | Decisión |
|---|---|---|
| Roles leader/implementer/reviewer (prompts en `assets/role-*.template.md`) | `defineAgent` + `defineAgentProfile` + delegación `task` | **Adoptado** (v1 ya corre). Roles = prompts; enforcement = código |
| Máquina de estados de feature, verifier-gate, reportes | Tools MCP `mcp__handyman__*` (25) | **Adoptado** como ToolGateway único. Flue NO reimplementa dominio |
| Una feature a la vez / instancia por feature | Agent instance `id = <feature>` + `dispatch` | **Adoptado**; el invariante lo enforcea `feature.js`, no el modelo |
| Estado de negocio `.handyman/` (fuente de verdad) | Durable Streams (conversación) | **Complementarios**: disco handyman = verdad de negocio; streams = verdad de conversación. Nunca mezclar |
| Verifier `./init.sh` | Tool boundary (`feature_close` en subproceso) | **Adoptado**: gate en código confiable, nunca shell arbitrario del modelo |
| Modelos por rol (`HANDYMAN_*_MODEL`) | `registerProvider` + `model` por profile | **Adoptado**; aislar en un ModelCatalog propio (wrap) |
| handoffs rol→rol (cola en disco) | `task()` (sesión hija sin transcript) | **Wrap**: protocolo en el prompt del leader; no duplicar máquina de estados |
| `metrics.js`, `toolbox` (observabilidad propia) | `observe()` → `FlueEvent` v3 | **Wrap** en un TelemetrySink propio (JSONL + correlación con `history.md`) |
| Verbos deterministas futuros (p.ej. preflight cron) | `defineAction`, schedules | **Adoptar cuando toque** (post-workflows) |
| Intake humano (`feature-request.md`, `POST /api/intake`) | Channels (GitHub/Slack) | **Ignorar por ahora** (sin API pública estable en beta.9) |
| Workflows | `defineWorkflow`/`invoke` | **IGNORAR**: muere en 1.0 |
| Cloudflare target | `./cloudflare` | **Ignorar por ahora**: single-node Node + sandbox `local()` encaja con tocar el repo |
| Panel `apps/web` | `agents.observe/history` del SDK | **Adoptar** para vista viva por feature (roadmap) |
| Capa anti-volatilidad | Todo `@flue/*` | **Wrap**: un solo módulo `src/flue/` importa la librería |

---

## 3. Capability census (qué queda "a una tarde" de distancia)

1. **Vista viva del agente en `apps/web`** — `agents.observe(name, id)` con SSE/long-poll ya da snapshots + fases; el panel podría mostrar el loop del leader por feature sin tocar el runtime.
2. **Durabilidad real en Node** — cambiar `sqlite(':memory:')` por `sqlite('./data/flue.db')` (subpath `./node`): recovery ante caídas del proceso sin cambiar código de agente.
3. **Servidor estable para sesiones largas** — `flue build --target node` → `node dist/server.mjs` evita el `Runtime drain timed out` del watcher de `flue dev`.
4. **Logs estructurados por feature** — `observe()` + correlación `submissionId ↔ instanceId`: un JSONL por feature con los 26 eventos, sin infra extra.
5. **OTel GenAI** — `@flue/opentelemetry` (spans semconv `invoke_agent > chat > execute_tool`, contenido off por defecto): vocabulario estándar y exportable.
6. **Verbos deterministas sin LLM** — `defineAction` (post-1.0) para `preflight`, `metrics`, `validate_harness`: hoy ya se pueden invocar como tools MCP sin modelo.
7. **Evals con juez independiente** — `vitest-evals` `toSatisfyJudge` (el harness de evals ya corre; falta el juez con modelo distinto al evaluado).
8. **Mock determinista de modelo** — `registerProvider('openai-compat', { baseUrl: mock })` apuntando a `tests/lib/mock_openai.js` (pendiente de validar).
9. **Intake por GitHub issues** — channel + `dispatch` → `feature_add` (bloqueado hasta API pública de channels; hacerlo por webhook propio si urge).
10. **Skills empaquetadas** — `defineSkill`/import `with { type: 'skill' }`: la skill handyman ya sigue la spec Agent Skills y auto-descubre en `.agents/skills/`.

---

## 4. Propuesta de arquitectura formal

Tesis: **handyman ya es hexagonal de facto**. Los CLIs son driving adapters delgados, `src/core/` + schemas JSON son el dominio (máquina de estados de feature, política de IO, verifier-gate), `toolbox-core` y el MCP server son adapters. Lo que falta es **formalizar los bounded contexts y los puertos** ahora que entra un tercer consumidor (el agent runtime Flue) y múltiples providers de modelo.

### 4.1 Entidades de negocio (el core limpio)

| Entidad | Tipo DDD | Invariantes (enforcement en código, hoy) |
|---|---|---|
| `Feature` | Agregado raíz | Máquina de 4 estados (`pending/in_progress/done/blocked`); **a lo sumo uno `in_progress`**; cierre solo con verifier verde; timestamps sellados por CLI |
| `Sprint` | Agregado | Período = rama; `open`/`close` archivan y compactan historia |
| `RoleReport` (`impl/review/explore`) | Entidad | Frontmatter sellado; veredicto único sin `--force`; reviewer ≠ implementer (independencia) |
| `VerifierResult` | Value object | Exit code 0/1/2/3 **sagrado**; stdout machine-readable estable |
| `HarnessWorkspace` | Agregado | Layout `.handyman/` versionado; escrituras atómicas (temp+rename); scaffold nunca sobreescribe |
| `MemoryDocument` | Entidad | business/architecture/conventions/verification; leída al editar y al cerrar |
| `Handoff` | Value object | Continuidad de sesión; deriva del período al cerrar sprint |
| `Agent` / `AgentSession` / `ModelRoute` | Entidades **nuevas** (lado Flue) | `Agent` = defineAgent; `AgentSession` = instancia por feature (`id = feature`); `ModelRoute` = (rol → provider/modelo) resuelto por env |

**Regla DDD clave (de la investigación):** el output del modelo es una *propuesta no confiable*; el dominio conserva la autoridad. Los tools MCP ya son **comandos de aplicación** (`feature_close`), no primitivas de persistencia — el MCP es nuestro anti-corruption layer entre el LLM y el dominio. Un schema Valibot valida la *forma*; `feature.js` enforcea el *significado*.

### 4.2 Bounded contexts

```
┌────────────────────────────────────────────────────────────────────┐
│ EXPOSURE (driving)                                                 │
│  HTTP flue (routing) · run-feature.mjs (SDK) · apps/web · channels │
└──────────────┬─────────────────────────────────────────────────────┘
               ▼
┌──────────────────────────┐   task()   ┌───────────────────────────┐
│ AGENT ORCHESTRATION      │───────────▶│ AGENT EXECUTION (Flue)    │
│ agents/flue-handyman     │            │ sesiones, compaction,     │
│ leader + profiles,       │            │ sandbox, Durable Streams  │
│ protocolo de delegación  │            │ → propiedad del framework │
└──────────────┬───────────┘            └───────────────────────────┘
               │ mcp__handyman__*
               ▼
┌────────────────────────────────────────────────────────────────────┐
│ HARNESS CORE (dominio — sin dependencias hacia afuera)             │
│ Feature · Sprint · RoleReport · Verifier · Workspace · Memory      │
│ handyman/src/core + CLIs + assets/schemas                          │
└──────────────▲─────────────────────────────────────────────────────┘
               │ shell-out dist/*.js (contrato sagrado exit 0/1/2/3)
┌──────────────┴───────────┐  ┌──────────────────────────────────────┐
│ TOOL GATEWAY (MCP)       │  │ MODEL PROVISIONING                   │
│ handyman/src/mcp.ts      │  │ registerProvider · ModelCatalog      │
│ (driven port del core)   │  │ Z.AI GLM · Kimi Coding · Moonshot    │
└──────────────────────────┘  └──────────────────────────────────────┘
               ▲
┌──────────────┴─────────────────────────────────────────────────────┐
│ OBSERVABILITY (transversal)                                        │
│ observe()→TelemetrySink · metrics.js · OTel GenAI · history.md     │
└────────────────────────────────────────────────────────────────────┘
```

- **Context map antes que agent graph**: los roles son *profiles dentro* del contexto de orquestación, no contextos separados (un agente ≠ un bounded context).
- **Agent execution es del framework**: no construimos dominio ahí; lo consumimos por su contrato público (agents/sessions/dispatch/observe).

### 4.3 Capas y puertos (hexagonal explícito)

**Puertos driving (casos de uso, entrada):**
- `RunFeatureCycle(featureName)` — hoy lo implementa el prompt-protocolo del leader + `run-feature.mjs`.
- `ObserveFeatureRun(featureName)` — `agents.history/observe` (para apps/web).
- Futuros: `IntakeFromChannel`, `RunDeterministicVerb` (defineAction).

**Puertos driven (salida, definidos por nosotros):**
- `HandymanGateway` — único camino al dominio: hoy = `connectMcpServer('handyman')`. Candidato futuro read-only: `toolbox-core` directo para lecturas de alta frecuencia (open question del reporte previo).
- `ModelCatalog` — resolución rol → `(provider, model, apiKey, tuning)` desde env; envuelve `registerProvider` (hoy disperso en `app.ts` + initializer del agente).
- `TelemetrySink` — consume `FlueEvent`; emite JSONL por feature + (opt-in) OTel.
- `SandboxPort` — `local({ cwd: PROJECT_ROOT, env: allowlist })` cuando el agente necesite tocar archivos fuera del MCP (hoy no lo necesita: todo pasa por tools).

**Capa anti-volatilidad (la decisión estructural más importante):** `agents/flue-handyman/src/flue/` como **único módulo que importa `@flue/*`**, re-exportando lo que usamos (`defineAgent`, `defineAgentProfile`, `connectMcpServer`, `dispatch`, `observe`, tipos). El resto del paquete importa de `./flue/`. Cuando 1.0 rompa (`'use agent'`, plugin Vite, SDK colapsado), el diff toca un archivo. Diseñar contra conceptos estables, nunca contra la superficie beta.

### 4.4 Layout propuesto para `agents/flue-handyman`

```
agents/flue-handyman/
├── src/
│   ├── flue/                  # ANTI-VOLATILITY: único import de @flue/*
│   │   └── index.ts           # re-exports acotados + tipos propios
│   ├── domain/                # entidades del lado agente (sin @flue/*)
│   │   ├── roles.ts           # Role = { name, modelSpec, promptTemplate }
│   │   └── feature-cycle.ts   # pasos del ciclo como datos (add→start→impl→review→close)
│   ├── ports/
│   │   ├── handyman-gateway.ts    # interface + McpHandymanGateway (connectMcpServer)
│   │   ├── model-catalog.ts       # interface + EnvModelCatalog (registerProvider)
│   │   └── telemetry-sink.ts      # interface + JsonlTelemetrySink (observe)
│   ├── agents/
│   │   └── handyman-leader.ts     # composition root del agente (defineAgent)
│   ├── app.ts                     # composition root HTTP (providers + flue())
│   └── evals/                     # contrato vivo (vitest-evals)
└── run-feature.mjs                # driver SDK (consumidor driving)
```

Los prompts de rol **siguen leyéndose de `handyman/assets/role-*.template.md`** (fuente única). `domain/` y `ports/` no importan `@flue/*` — testeable sin el runtime.

---

## 5. Estrategia de trabajo

### 5.1 Arquitectura

1. **Formalizar lo que ya es** (no reescribir): documentar en `memory/architecture.md` la lectura hexagonal del repo (CLIs = driving adapters, core = dominio, MCP = adapter) + los bounded contexts de §4.2. Un ADR corto: "Flue como tercer driving adapter; MCP como anti-corruption layer".
2. **Capa anti-volatilidad primero** (antes de cualquier feature nueva sobre Flue): `src/flue/` barrel + mover los 3 imports actuales (`app.ts`, `handyman-leader.ts`, evals). Sin cambio de comportamiento; suite estructural `test_flue_agents.sh` debe seguir verde.
3. **Extraer `ModelCatalog`** de `app.ts`/`handyman-leader.ts` a `ports/model-catalog.ts`: un solo sitio conoce Z.AI-override, kimi-coding vs moonshotai (el 401 documentado), GLM thinking/maxTokens. Limpieza pendiente: renombrar `MOONSHOT_API_KEY` (es un token de Kimi for Coding) y dropear el fallback.
4. **Mantener el dominio fuera de Flue**: ninguna regla de negocio en prompts que no esté enforceada en CLI (el caso rojo del spike ya lo demostró: el gate aguanta con el modelo bajo presión).

### 5.2 Logs y manejo de errores

**Taxonomía de 3 clases (decide retry):**

| Clase | Ejemplos | Política |
|---|---|---|
| **Outcome de dominio** (no es error) | verifier rojo en `feature_close`, feature ya existe, segundo veredicto distinto | **Nunca reintentar**. El leader reporta y para (comportamiento ya validado en spike) |
| **Fallo transiente de infra** | provider 429/5xx, `HeadersTimeoutError`, `StreamClosedError`, `RuntimeUnavailableError` | Retry con budget (alineado a `DurabilityConfig maxAttempts=10/timeout 1h`); el backend continúa aunque el cliente muera — reconectar con `send`+`wait`, no re-dispatch |
| **Error de protocolo** | `ToolInputValidationError`, `SubagentNotDeclaredError`, `SessionBusyError` | El modelo corrige (el error vuelve como tool result); si escala a humano, es bug nuestro |

**Mapeo en fronteras:**
- Exit codes sagrados `0/1/2/3` de los CLIs llegan vía MCP como `isError` + payload; el gateway los clasifica en la taxonomía (dominio vs infra).
- Errores Flue: contrato estable = `type` snake_case + clase (nunca parsear `message`). Errores no-Flue llegan como 500 genérico vía `toHttpResponse` — no fiar semántica a eso.
- `ResultUnavailableError` (give_up del modelo) ≠ fallo: es outcome agéntico; el leader lo trata como "no pude" y escala.

**Logging:**
- `TelemetrySink` suscrito con `observe()`: un JSONL por instancia (`logs/agent-<feature>.jsonl` en el runtime, no en el proyecto target) con los 26 eventos `v:3`; correlación `submissionId ↔ instanceId ↔ feature ↔ entrada en history.md`.
- Vocabulario **OTel GenAI semconv** para atributos propios (`gen_ai.agent.name`, `gen_ai.conversation.id`, `gen_ai.usage.*`); contenido de mensajes **off por defecto** (PII); `@flue/opentelemetry` opt-in después.
- Alertar **outcomes**, no errores anidados recuperables (guía oficial Flue): `submission_settled: failed`, operaciones lentas, verifiers rojos repetidos.
- El log de handyman (`feature_log` → `progress/current.md`) sigue siendo la pista de negocio; el JSONL es la pista de ejecución. No duplicar: correlacionar por feature.

**Idempotencia:**
- Instancia por feature ya es la dedup key natural (`id = feature`): re-`dispatch` al mismo id reanuda la conversación, no duplica el ciclo.
- Efectos externos (cuando los haya: channels, escrituras fuera del MCP): claves `{feature}:{verb}` derivadas de estado durable; las mutaciones de dominio ya son idempotentes-hostiles por diseño (`feature_add` rechaza duplicado = outcome de dominio).
- Escrituras de estado en handyman ya son crash-safe (temp+rename); Durable Streams cubre la conversación. Matar el proceso a mitad de ciclo = resume desde stream + disco consistente (validado como caso de prueba propuesto en el reporte anterior).

### 5.3 Exposición y consumo

**Niveles (de estable a experimental):**

| Nivel | Superficie | Consumidores | Estado |
|---|---|---|---|
| 0 | CLIs `dist/*.js` + MCP `:8177` | humanos, editores, agente Flue | **Sagrado** (paridad black-box) |
| 1 | HTTP `flue dev :3583` (`POST /agents/handyman-leader/:feature`) | `run-feature.mjs` (SDK `send`+`wait`) | Actual |
| 2 | `flue build` → `node dist/server.mjs` + `sqlite('./data/flue.db')` | sesiones largas, CI | Propuesto (estabilidad + durabilidad) |
| 3 | `apps/web` ← `agents.observe/history` | panel humano del loop | Roadmap |
| 4 | Channels (GitHub/Slack) + schedules (preflight cron) | intake automático | Bloqueado por API pública de channels; schedules sí viables |

**Reglas de exposición:**
- El runtime Flue se expone **solo en loopback** en esta fase (mismo criterio que el toolBox: `127.0.0.1`); auth antes de admission cuando se exponga (`route` middleware por agente ya existe).
- Consumo externo **siempre por SDK** (`createFlueClient`), nunca scrapeando HTTP ni leyendo streams a mano: el SDK ya versiona su contrato (`UnsupportedFlueEventVersionError`).
- Nada de secretos en inputs despachados ni en historial (guía oficial): las keys viven en env del runtime, el `ModelCatalog` las inyecta, el modelo nunca las ve.
- Un proceso vivo por instancia (regla dura de Flue): el leader por feature no se escala horizontal; la flota se paraleliza por feature distinta, no por réplica.

### 5.4 Roadmap propuesto (features para `feature_list.json`, tras resolver 86–89)

1. `flue_anti_volatility_layer` — `src/flue/` barrel + mover imports; suite estructural verde. *(bajo riesgo, habilita todo lo demás)*
2. `flue_model_catalog` — `ports/model-catalog.ts`; renombrar `MOONSHOT_API_KEY`→`KIMI_API_KEY` dropeando fallback; doc de tuning por provider.
3. `flue_telemetry_sink` — `observe()`→JSONL por feature + correlación history.md + política de alertas por outcome.
4. `flue_stable_server` — `flue build` + `sqlite` archivo + runbook de operación (reinicios, recovery, abort por feature).
5. `flue_error_taxonomy` — clasificación de fallos en el gateway + políticas de retry en driver y prompt del leader; doc en `memory/verification.md`.
6. `web_live_agent_view` — vista del loop en `apps/web` vía SDK `observe` (read-only, coherente con el observador).
7. `architecture_memory_update` — volcar §4 en `memory/architecture.md` + ADR (contexts, puertos, anti-volatilidad).
8. (Condicionado a 1.0) `flue_actions_migration` — `defineAction` para verbos deterministas; re-evaluar channels y `'use agent'`.

---

## 6. Open Questions

- ¿`HandymanGateway` read-only directo a `toolbox-core` para lecturas de alta frecuencia (la vista viva), o todo por MCP para mantener una sola frontera? Coste: publicar/estabilizar `toolbox-core`.
- ¿Dónde vive el JSONL de telemetría: junto al runtime (`agents/flue-handyman/logs/`) o en el `HARNESS_WORKSPACE` del proyecto target (junto a history.md pero sin ser pista de negocio)?
- ¿Schedules de preflight/metrics como `defineAction` propio o como cron externo que llama al MCP directamente (cero Flue)?
- ¿Cuándo subir de beta.9? El rework 1.0 toca routing (plugin Vite, `'use agent'`); con la capa anti-volatilidad el coste baja, pero conviene esperar a guía de migración (hoy 404).
- ¿Publicar el agente como paquete consumible (`@handyman/flue-handyman` público) o mantenerlo privado en el monorepo? Depende del consumidor externo del MCP (Camino B de `memory/architecture.md`).

## 7. Sources

**Locales (ground truth):**
- `agents/flue-handyman/node_modules/@flue/runtime/dist/index.d.mts` + 14 chunks de tipos, subpaths `node/`, `cloudflare/`, `adapter/`, `internal/`, `tool/`, `test-utils/`
- `agents/flue-handyman/node_modules/@flue/{sdk,cli}/dist/*` + `package.json` (exports map; sin CHANGELOG empaquetado)
- `agents/flue-handyman/src/{app.ts,agents/handyman-leader.ts}` (integración actual)
- `memory/architecture.md`, `backlog/explore_flue-framework-integration.md`, `progress/handoff-2026-07-27.md`

**Externas:**
- Flue docs: [Agent API](https://flueframework.com/docs/api/agent-api/) · [Building Agents](https://flueframework.com/docs/guide/building-agents/) · [Workflows](https://flueframework.com/docs/guide/workflows/) · [Observability](https://flueframework.com/docs/guide/observability/) · [Why Flue](https://flueframework.com/docs/introduction/why-flue/) · [repo + README 1.0](https://github.com/withastro/flue)
- Arquitectura de agentes: [Anthropic — Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) · [Harnessed LLM Agent (Pachaar)](https://vishalsood.com/summaries/akshay-pachaar-agent-harness-architecture) · [Claude Code: six harness layers](https://mer.vin/2026/05/claude-code-architecture-explained-six-harness-layers-beyond-the-llm/) · [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/agents/) · [harness-architecture comparison](https://github.com/veithly/harness-architecture)
- DDD/hexagonal: [Dubrov — DDD for AI Agents](https://slavadubrov.github.io/blog/2025/10/20/domain-driven-design-ai-agents/) · [Croft — DDD multi-agent systems](https://www.jamescroft.co.uk/applying-domain-driven-design-principles-to-multi-agent-ai-systems/) · [Cockburn — Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture) · [ableneo — Hexagonal for AI](https://www.ableneo.com/insight/hexagonal-architecture-for-ai-integration/)
- Errores/observabilidad: [OTel GenAI semconv](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-agent-spans.md) · [Idempotency in agentic tool calling](https://tianpan.co/blog/2026-04-19-idempotency-agentic-tool-calling-saga-deduplication) · [Agent retries & idempotency](https://www.motomtech.com/blog-post/ai-agent-retries-idempotency-tool-failures/)

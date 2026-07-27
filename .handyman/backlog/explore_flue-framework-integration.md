---
type: Explore Report
topic: flue-framework-integration
role: explorer
updated: 2026-07-27
tags: [handyman/role/explorer]
---

# Exploration: flue-framework-integration

## Question

¿Cómo integrar Flue Framework (framework TS de agentes del equipo de Astro, sobre el harness Pi, 1.0.0-beta.9) con handyman para construir un agente handyman personalizado, cubriendo: (1) arquitectura de Flue, (2) SDK/herramientas, (3) casos de uso, (4) integración con las herramientas handyman existentes, (5) mejoras/adaptaciones propuestas, (6) recursos para desarrolladores, (7) ejemplos y mejores prácticas, (8) test y validación de la integración.

## Findings

### 1. Arquitectura de Flue

- Fórmula central: **Agente = Modelo + Harness**. El harness es lo que rodea al LLM (filesystem, tools, sandbox, contexto, subagents); Flue es harness-first: no scripteas pasos, llenas el harness de contexto y apuntas el modelo a la tarea.
- Stack de 3 capas: **Framework (Flue)** = estructura/convenciones/CLI/DX · **Harness (Pi, pi.dev)** = loop agéntico, 15+ providers, sesiones en árbol, compaction, skills · **Runtime** = Node o Cloudflare Agents SDK (Durable Objects). Build con Vite; transporte con **Durable Streams** (log append-only replayable: "the source of truth is the log").
- Un agente es un archivo `src/agents/<name>.ts` con `defineAgent(...)` como default export; cada instancia se identifica por `id` y posee **un stream de conversación canónico** append-only (mensajes, tool calls, compaction, topología de subagents, recovery facts).
- Durabilidad: si el proceso muere, otro retoma el stream desde el último paso; tool calls sin resultado durable se marcan `interrupted` (no se reejecutan); re-dispatch at-least-once. En Node: SQLite en memoria por defecto, `src/db.ts` con `sqlite('./data/flue.db')` o `@flue/postgres` para durabilidad real. **Regla dura: un proceso vivo por instancia** (no active-active).
- `DurabilityConfig`: `maxAttempts: 10`, `timeoutMs: 1h`. Abort vía `client.agents.abort(name, id)`.

### 2. SDK y herramientas (beta.9)

- `defineAgent(({ id, env }) => ({ model, instructions, skills, tools, actions, subagents, sandbox, thinkingLevel, compaction, durability, cwd }))`. Named exports: `description`, `route` (middleware Hono), `attachments`.
- `defineAgentProfile(...)` para subagents: `instructions/tools/skills/subagents` son **profile-owned** (nunca heredan del padre); `model/thinkingLevel/compaction` heredan como default; `durability` rechazado en profiles. Delegación vía tool `task` built-in (sesión hija sin transcript del padre, compartiendo sandbox) o programática `session.task(text, { agent, result, cwd, model, signal })`.
- `defineTool({ name, description, input: v.object({...}), output, async run({ input, signal }) })` — Valibot; input validado antes de `run`, output validado y JSON-stringified para el modelo.
- **Skills**: spec Agent Skills (`SKILL.md` + archivos). Import `with { type: 'skill' }`; auto-descubrimiento de `<cwd>/.agents/skills/<name>/SKILL.md`; invocación manual `session.skill('review', { args, result })`. `allowed-tools` aceptado pero **no enforced**.
- **Sandboxes**: virtual (default, en memoria, just-bash, permite red), `local({ cwd, env })` de `@flue/runtime/node` (acceso al host, sin aislamiento, solo hosts confiables), remotos (Cloudflare, Daytona, E2B, Modal, Vercel...). Adapter API: `SandboxApi` (`readFile/writeFile/exec → { stdout, stderr, exitCode }/stat/readdir/exists/mkdir/rm`), `timeoutMs` es el contrato principal (exit 124).
- **MCP**: `connectMcpServer('nombre', { url, headers, transport: 'streamable-http' | 'sse' })` → `.tools` listos para `tools: [...]`; prefijo `mcp__<server>__<tool>`.
- **Sessions/harness**: `harness.session(name?)` → `session.prompt(text, { result, tools, model, signal })` → `{ text, usage, model }` o `{ data }` con schema; `session.shell()` grabado en conversación; `harness.fs.*` fuera de banda; una operación activa por sesión (`SessionBusyError`).
- **Channels** (17+ first-party: Slack, GitHub, Linear, Discord, Teams, Telegram, WhatsApp, Stripe, Notion...): `src/channels/<name>.ts` con `createSlackChannel({ signingSecret, events })` / `createGitHubChannel({ webhookSecret, webhook })`; stateless, solo HTTP inbound, dedup e idempotencia son responsabilidad de la app.
- **Routing**: `src/app.ts` Hono montando `flue()`; `POST /agents/:name/:id` (202 + `streamUrl/offset/submissionId`, `?wait=result` para 200), `GET /agents/:name/:id?view=updates&offset=-1&live=sse`, `POST /workflows/:name`, `GET /runs/:runId`, `/channels/:name/*`. `dispatch(agent, { id, input })` para entrega asíncrona.
- **`@flue/sdk`**: `createFlueClient({ baseUrl, token })` → `agents.prompt/send/abort/observe/history`, `workflows.invoke`, `runs.get/events/stream` (async iterable con checkpoint por offset). **`@flue/react`**: `FlueProvider`, `useFlueAgent({ name, id })`, `useFlueWorkflow({ runId })`.
- **Observabilidad**: `observe((event) => ...)` con unión `FlueEvent` (formato `v: 3`); providers OpenTelemetry (`@flue/opentelemetry`, spans GenAI, contenido off por defecto), Braintrust, Sentry.
- **CLI** (`@flue/cli`, Node ≥22.19): `flue init/dev(3583)/run/build/add(blueprints md para coding agents)/update/docs(offline)`.

### 3. Casos de uso

- Triage de issues end-to-end (ejemplo insignia, <25 líneas): reproduce bug en sandbox, diagnostica, verifica, intenta fix.
- Translation agent con salida Valibot `{ translation, confidence }` (template Render: Hono + `flue build --target node` → `dist/server.mjs` + Postgres sessions).
- Support assistant por ticket (`POST /agents/support-assistant/ticket-8472`), code reviewer con `local()` + resultado estructurado, bots Slack/GitHub vía channels + `dispatch`.
- Origen: motor de AI workflows dentro del repo de Astro. "Like Claude Code, but 100% headless and programmable" (Fred Schott).

### 4. Integración con handyman (herramientas ya disponibles)

Handyman ya expone tres superficies de integración (ver mapa en backlog/impl y §Source Locations):

- **Servidor MCP** (`node handyman/dist/mcp.js --http --port 8177`): 25 tools que envuelven los 13 CLIs, resources `handyman://{project}/current|/docs/{doc}|/resume`, prompts `role_leader/implementer/reviewer/explorer`. El verifier-gate vive en el subproceso: `feature_close` exige `./init.sh` verde; verbos destructivos requieren confirmación humana. **Es el punto de integración diseñado.**
- **13 CLIs** (`npx handyman-harness@3 <verb>`): contrato congelado por ~40 suites de paridad (flags, stdout, exit codes 0/1/2/3).
- **`@handyman/toolbox-core`** (privado): `resolveWorkspace`, registry, providers LLM, relays.

Mapeo conceptual directo:

| Handyman | Flue |
|---|---|
| Roles leader/implementer/reviewer (prompts) | `defineAgentProfile` + `subagents` (coordinator delega vía `task()`) |
| SKILL.md + references (Agent Skills spec) | Import nativo `with { type: 'skill' }` o auto-descubrimiento en `.agents/skills/` |
| feature_list.json / un feature a la vez | Instancia de agente por feature (`id = feature-<n>`) + tools MCP `feature_*` |
| Verifier `./init.sh` | Tool MCP `verify` / `feature_close` (gate ya enforceado) — o `defineTool` propio que corre `bash init.sh` en sandbox `local({ cwd: projectRoot })` |
| Estado en disco `.handyman/` (fuente de verdad) | Complementario: Durable Streams para conversación; disco handyman para estado de negocio |
| Panel `apps/web` (Next.js, SSE) | `@flue/react` (`useFlueAgent`) para vistas vivas de sesiones |
| `evals/` (trigger-eval) | `vitest-evals` + `createFlueAgentHarness` contra `flue dev` |
| `post_run` hooks, `toolbox heartbeat` | `observe()` events → OTel / webhooks |

### 5. Mejoras/adaptaciones propuestas (agente handyman personalizado)

- **A. Coordinator con subagents de rol**: `handyman-leader` como `defineAgent` que conecta al MCP de handyman y declara `implementer` y `reviewer` como profiles (instructions desde `handyman/assets/role-*.template.md`). Respeta la filosofía handyman: roles = prompts, enforcement = código (los CLIs/MCP).
- **B. Instancia por feature**: `POST /agents/handyman-leader/feature-86` → conversación canónica durable por feature; recovery gratis ante caídas; `abort` por feature. El invariante un-feature-a-la-vez sigue enforceado por `feature.js start`, no por el modelo.
- **C. Verifier como boundary de código confiable**: exponer el verifier solo vía tool MCP (o `defineTool` cerrando sobre `cwd`), nunca como shell arbitrario del modelo — alineado con la práctica Flue "los parámetros del tool no son un boundary de autorización".
- **D. Skills handyman en Flue**: el skill handyman ya sigue la spec Agent Skills; puede vivir en `<cwd>/.agents/skills/handyman/SKILL.md` y auto-descubrirse, con references bajo progressive disclosure.
- **E. Intake por channels**: GitHub channel (`webhook` de issues) → `feature-request.md` vía MCP intake / `feature add`; Slack channel para comandos de leader. Idempotencia con `deliveryId`.
- **F. Observabilidad unificada**: `observe()` → OTel exporter; correlación `submissionId` ↔ entradas de `history.md`; métricas handyman (`metrics.js`) + spans Flue.
- **G. Schedules**: cron (Croner en Node) que invoque `preflight`/`metrics` y despache un resumen al leader.
- **H. Capa anti-volatilidad**: encapsular detrás de un adapter propio todo lo que está en rework camino a 1.0 (workflows, file-based routing, forma del SDK). Diseñar contra conceptos estables: agents, actions, tools, sessions, dispatch, Durable Streams.
- **I. NO usar Workflows de Flue** para el loop de features: se eliminan en la próxima versión ("conversations are the only durable unit"); el equivalente futuro es agent + `defineAction` en `actions: [...]`.

### 6. Documentación y recursos

- Docs: flueframework.com/docs (quickstart, concepts/agents, concepts/durable-execution, guide/*, api/*, sdk/*, cli/*, ecosystem/*). `flue docs` da docs offline para coding agents.
- Blog 1.0 Beta: flueframework.com/blog/flue-1-0-beta/ · Cloudflare: blog.cloudflare.com/agents-platform-flue-sdk/
- Repo: github.com/withastro/flue (Apache-2.0, ~7.5k stars; contribución "Surgical Team": solo issues/discussions, PRs auto-cerrados).
- Paquetes npm: `@flue/runtime`, `@flue/cli`, `@flue/sdk`, `@flue/react`, `@flue/postgres` (+libsql/mongodb/mysql/redis), `@flue/opentelemetry`, `@flue/slack` — todos 1.0.0-beta.x.
- Ejemplo runnable: `examples/vitest-evals` en el repo.
- ⚠️ Riesgo: el CHANGELOG de `main` trae breaking changes masivos (Flue como plugin Vite, `'use agent'` en vez de file-based routing, **eliminación de Workflows**, SDK colapsado a `createFlueClient({ url })`, `dispatch` con `DeliveredMessage`). La guía de migración aún es 404.

### 7. Ejemplos y mejores prácticas

Snippets verbatim recopilados en el informe de investigación (defineAgent de triage, defineTool con Valibot, delegación `session.task(..., { agent: 'reviewer', result: Review })`, channel Slack + dispatch, route handler con auth por instancia, `useFlueAgent`, `db.ts`). Prácticas oficiales aplicables:

1. Credenciales/tenant/destinos fijados por código confiable, nunca por parámetros del modelo.
2. Sandbox más estrecho posible; `local()` solo en hosts confiables; env opt-in.
3. Idempotency keys de aplicación para efectos externos (recovery at-least-once).
4. No secretos en skills, contexto, inputs despachados ni historial.
5. `description` de subagent como guía de delegación (el padre la lee para decidir).
6. Autenticar antes de admission; sumar usage solo en hojas model-turn.

### 8. Test y validación de la integración

- **Flue no trae mocks de modelo** (no documentado). Estrategia oficial: evaluar en la frontera HTTP pública con `vitest-evals` (`describeEval`, `toSatisfyJudge` con juez independiente del modelo evaluado, tool replay, `FLUE_BASE_URL` contra `flue dev`).
- **Truco de mock determinista** (idea propia): `registerProvider('openai-compat', { baseUrl: 'http://localhost:<mock>/v1' })` apuntando a un mock OpenAI-compatible — handyman ya tiene `tests/lib/mock_openai.js` reutilizable. Pendiente de validar experimentalmente.
- **Tests de contrato**: las suites de paridad de handyman (`tests/test_*.sh`) no cambian — validan CLIs/MCP bajo la integración.
- **Test de integración E2E propuesto**: sandbox `local()` con `HARNESS_WORKSPACE` temporal; agente leader real hace `feature add → start → (edit trivial) → close` con verifier stub; se aserciona transición de `feature_list.json`, exit codes y frontmatter de `backlog/impl_*.md`. Réplica del patrón de las suites bash existentes.
- **Validación de durabilidad**: matar el proceso a mitad de un `feature_close_async` y verificar resume desde el stream + estado consistente en disco (handyman ya es crash-safe por escritura atómica temp+rename).
- **Evals de trigger**: portar `handyman/evals/trigger-eval.json` al harness vitest-evals.

## Source Locations

- Handyman MCP server: `handyman/src/mcp.ts` (25 tools, helpers `registerTool`/`registerCliTool` en mcp.ts:893-947)
- CLIs: `handyman/src/{feature,backlog,sprint,preflight,validate_harness,update_harness,upgrade_harness,tools_discovery,metrics,index_md,evals,toolbox,mcp}.ts` → `handyman/dist/`
- Schemas contrato: `handyman/assets/schemas/*.json` (feature_list, harness.config, ...)
- Plantillas de rol: `handyman/assets/role-{leader,implementer,reviewer,explorer}.template.md`
- Workspace resolver: `packages/toolbox-core/src/workspace.ts:58-90` (`resolveWorkspace`)
- Verifier: `./init.sh` (fases tools→files→state→lint→build→harness→test)
- Tests de paridad: `tests/test_*.sh`, `tests/lib/{assert.sh,mock_openai.js}`, `tests/test_mcp.js`
- Skill handyman (spec Agent Skills): `handyman/SKILL.md` + `handyman/references/`
- Panel web (candidato a `@flue/react`): `apps/web/`

## Spike ejecutado (2026-07-27)

Spike mínimo construido y validado en `spikes/flue-handyman/` (README propio con
topología y reproducción). Resultado: **la integración vía MCP funciona end-to-end**.

- Agente Flue `handyman-leader` (modelo `anthropic/glm-5.2` vía override del
  provider de catálogo `anthropic` → `api.z.ai/api/anthropic`) conectado con
  `connectMcpServer('handyman', { url: 'http://127.0.0.1:8177/mcp' })`.
- **Caso verde:** ciclo `feature_add → feature_start → feature_log → feature_close`
  ejecutado por el modelo sobre `/tmp/hm-flue-spike`; `feature_list.json` validado
  en disco: `done` con timestamps reales e `history.md` con "verifier exit 0".
- **Caso rojo:** con el verifier en `exit 1`, `feature_close` fue rechazado por el
  gate de `feature.js` y el feature quedó `in_progress` — el enforcement es de
  código, no del modelo.
- Hallazgo GLM: requiere `thinkingLevel: 'minimal'` y `maxTokens` ≥ 16k (quema
  max_tokens en thinking; con defaults respondía 1 token vacío).
- Patrón validado: una instancia de agente por feature (instance id = nombre del
  feature).

### Agente personalizado v1 (leader + subagents)

`spikes/flue-handyman/src/agents/handyman-leader.ts` evolucionado al diseño real:
leader (`defineAgent`) con subagents `implementer` y `reviewer` (`defineAgentProfile`),
prompts de rol cargados en runtime desde `handyman/assets/role-*.template.md` (los
roles siguen siendo prompts; las plantillas del repo son la fuente única). Validado
sobre `/tmp/hm-flue-spike` con el feature `flue_subagent_loop`:

- El leader ejecutó el protocolo completo: `feature_add → feature_start →
  task(implementer) → task(reviewer) → feature_close`.
- En disco: `backlog/impl_*.md` (status implemented, role implementer),
  `backlog/review_*.md` (status approved, role reviewer), history.md con
  "review: APPROVED · verifier exit 0", feature en `done`.
- **Hallazgo de cliente:** `agents.prompt` (bloqueante) muere con
  `HeadersTimeoutError` (~300 s) en loops con delegación largos, **pero el backend
  continúa y termina el trabajo** (la conexión observa, no posee — confirma la
  tesis de Durable Streams). Driver corregido a `agents.send` + `agents.wait`.

### Modelos por rol (multi-provider)

Los `defineAgentProfile` aceptan `model` propio; el agente lee
`HANDYMAN_{LEADER,IMPLEMENTER,REVIEWER}_MODEL` (default GLM-5.2 en los tres).
Validado con corridas mixtas:

- **Token Kimi:** el token del workspace es de **Kimi for Coding**
  (`api.kimi.com/coding`, anthropic-messages), NO de la plataforma Moonshot:
  `api.moonshot.ai` lo rechaza con 401. Provider correcto: `kimi-coding`
  (modelos `k2p7`, `k3`) con `apiKey` desde env; `moonshotai`/`moonshotai-cn`
  quedan disponibles para tokens de plataforma (`MOONSHOT_API_KEY`).
- **Corrida mixta verde:** leader GLM-5.2, implementer GLM-5.2, reviewer
  `kimi-coding/k2p7` → feature `done` con review `approved`. Evidencia A/B: con
  `moonshotai` la delegación fallaba 401 ×3; con `kimi-coding` aprobó — el único
  cambio fue el provider del reviewer.
- **Gate de protocolo verificado bajo fallo real:** cuando el reviewer no pudo
  dar veredicto (401), el leader NO cerró el feature y declinó explícitamente
  auto-firmar la review. La independencia de revisión se sostiene incluso con
  el modelo bajo presión.

## Open Questions

- ¿Target de deploy del agente handyman personalizado: Node local (single-node, más simple, encaja con `local()` sobre el repo) o Cloudflare (multi-instancia real pero exige sandbox remoto para tocar el repo)?
- ¿El mock de modelo vía `registerProvider({ baseUrl })` funciona con el runner de evals de Flue? Validar con un spike.
- ¿Merece la pena publicar `toolbox-core` (o una fachada) para que el agente Flue lea estado sin pasar por MCP en operaciones de solo lectura de alta frecuencia?
- ¿Cómo mapear `handoffs` rol→rol de handyman (cola en disco) al `task()` de Flue sin duplicar protocolo?
- Impacto del rework 1.0 (`'use agent'`, sin workflows): conviene un spike sobre `@flue/vite` nightly antes de comprometer diseño, o esperar a beta estable.

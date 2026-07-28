# @handyman/mastra-handyman — agente handyman sobre Mastra

Agente handyman corriendo sobre el runtime **Mastra 1.x** (`@mastra/core`
1.53.0): un leader supervisor que orquesta subagentes `implementer`/`reviewer`
y conduce el harness handyman a través de su servidor MCP, ejecutando el ciclo
completo de un feature (`add → start → impl → review → close`). Nació de
`docs/spike-mastra-harness.md` (fases 0–3 ejecutadas; 4 pendiente) como
sucesor del spike con Flue (paquete `agents/flue-handyman/`, eliminado el
2026-07-28 tras la ratificación del ADR).

## Topología

```
run-feature.ts (tsx, in-process) ──> Mastra app (agente handyman-leader)
run-workflow.ts (tsx, in-process) ─> Mastra app (workflow feature-cycle)   [fase 3]
                                          │ MCPClient (streamable-http)
                                          ▼
                            handyman MCP server :8177  (node handyman/dist/mcp.js --http)
                                          │ shell-out a dist/feature.js --root <PROJECT>
                                          ▼
                            <PROJECT>/.handyman/feature_list.json  (+ verifier init.sh)
```

- **In-process (topología A del spike)**: sin servidor Mastra; el driver importa
  la app y llama `agent.generate()`. Ideal para spike y CI.
- **Dos orquestaciones, una definición de roles** (fase 3): el mismo par
  `implementer`/`reviewer` (`createRoleAgents`) sirve al supervisor leader
  (run-feature, estrategia 1) y al workflow `feature-cycle` (run-workflow,
  estrategia 2), donde **el orden del ciclo es código, no decisiones del LLM**
  — sin tokens de leader para routing.
- Modelo por rol vía env (ver abajo); ambos providers hablan protocolo
  Anthropic con baseURL propia **con `/v1` final** (AI SDK pega
  `${baseURL}/messages`; sin el `/v1` Z.AI devuelve 404 disfrazado de 200).
- **Un thread por feature, un resource por proyecto** (memoria conversacional
  en LibSQL): reemplaza el patrón "una instancia de agente por feature" de
  Flue. El `Agent` es una definición stateless; el aislamiento vive en
  thread/resource.
- El proyecto objetivo se elige con `HANDYMAN_PROJECT_ROOT` (default: la raíz
  del monorepo; para spikes, un scratch como `/tmp/hm-mastra-sup1`).

## Cómo ejecutar

```bash
# 0. Dependencias (una vez, desde la raíz del monorepo)
pnpm install

# 1. Proyecto scratch con verifier trivial (exit 0) — solo para pruebas
mkdir -p /tmp/hm-mastra-spike
bash handyman/scripts/scaffold.sh local /tmp/hm-mastra-spike spike-project
#    (sustituir /tmp/hm-mastra-spike/init.sh por un `exit 0` trivial)

# 2. Servidor MCP handyman (desde la raíz)
node handyman/dist/mcp.js --http --port 8177

# 3. Ejecutar el ciclo de un feature (desde agents/mastra-handyman)
set -a && . ../../.env && set +a
HANDYMAN_PROJECT_ROOT=/tmp/hm-mastra-spike pnpm run-feature -- <nombre_feature>

# 4. O como WORKFLOW durable con gate humano (fase 3)
HANDYMAN_PROJECT_ROOT=/tmp/hm-mastra-spike pnpm run-workflow -- start <feature>
#    … corre add→start→implement→review y se SUSPENDE en human-review
HANDYMAN_PROJECT_ROOT=/tmp/hm-mastra-spike pnpm run-workflow -- resume <feature> approve|reject [feedback]
HANDYMAN_PROJECT_ROOT=/tmp/hm-mastra-spike pnpm run-workflow -- restart <feature>   # crash recovery
HANDYMAN_PROJECT_ROOT=/tmp/hm-mastra-spike pnpm run-workflow -- status <feature>    # estado persistido
```

## Decisiones de diseño (y por qué)

- **Barrel anti-volatilidad** (`src/mastra/index.ts`): único importador de
  `@mastra/*` y `@ai-sdk/*` del paquete. Mastra publica 2–4 minors/semana y ha
  roto superficies nuevas post-1.0 (rename `Harness`→`AgentController` en
  1.47.0); la adaptación toca un solo archivo.
- **El MCP es el anti-corruption layer** (inalterado del ADR Flue): los 25
  tools son comandos de aplicación; el modelo propone y el CLI dispone. Las
  reglas de negocio jamás viven en prompts sin enforcement en código.
- **Tool sets por rol en código** (`src/domain/role-tools.ts`): leader = las
  25; implementer = probes read-only + `feature_log` + `report_write`;
  reviewer = probes + `backlog_review`. Un reviewer NO PUEDE mutar estado:
  las tools no existen para su perfil (test unitario enforced).
- **Aislamiento de subagentes**: `delegation.messageFilter: () => []` — cada
  delegación ve solo su task prompt, nunca el transcript del leader
  (equivalente al `task` de Flue). El reviewer juzga artefactos, no el
  razonamiento del implementer.
- **Memoria de negocio por INYECCIÓN, no por espejo**: `.handyman/memory/*.md`
  sigue siendo la fuente de verdad en disco; se inyecta un snapshot read-only
  en las instrucciones del leader en cada llamada (instrucciones dinámicas).
  No se usa la working memory de Mastra (vive en SU base de datos = segunda
  verdad). La memoria conversacional (threads) sí es de Mastra.
- **Storage compuesto**: LibSQL (memoria/snapshots) + DuckDB (dominio
  observability — LibSQL no soporta métricas) vía `MastraCompositeStore`.
- **Observabilidad**: `Observability` + `MastraStorageExporter` +
  `SensitiveDataFilter` (nunca contenido de mensajes en spans) +
  `requestContextKeys: ['feature']` para correlación por feature. Métricas
  automáticas `mastra_model_*` (tokens in/out/cache, duraciones, costo
  estimado por modelo) consultables en DuckDB.
- **Telemetría JSONL por feature** (`src/ports/telemetry.ts` →
  `logs/agent-<feature>.jsonl`): pista de EJECUCIÓN sanitizada (nombres de
  tools, usage, finishReason; texto como `{ chars }`). `history.md` sigue
  siendo la pista de NEGOCIO. Misma regla que el sink de Flue.
- **Ledger de tokens** (`src/ports/tokens-ledger.ts`): al cerrar el feature,
  una línea en `<PROJECT>/.handyman/metrics/tokens.jsonl` con
  `source: "mastra"` (diseño §2 de `docs/analisis-tokens-consumo-y-metricas.md`;
  best-effort, nunca bloquea). Solo aplica a la topología supervisor: en la
  topología workflow el `WorkflowResult` no expone `usage` — la agregación
  debe derivarse de `metric_events` en DuckDB (pendiente, fase 4).
- **Workflow durable con verdad única de negocio** (fase 3,
  `src/workflows/feature-cycle.ts`): el snapshot del workflow en mastra.db es
  **estado operativo desechable** (step actual, suspend payloads); la verdad
  de negocio sigue en `feature_list.json`, escrita solo vía MCP. No hay
  reconciliación bidireccional: si discrepan, el disco gana y el run se
  abandona. Los side effects de negocio (add/start/close) son steps
  deterministas que llaman tools MCP directamente; solo implement/review son
  llamadas a agentes. Errores de negocio → outcome tipado (`bail` con el
  output del workflow); infra transitoria → `throw` + retries.
- **Regla de estilo: cero `.map()` en grafos durables** — Mastra 1.53.0 tiene
  un bug de restart: tras un kill, un step cuyo predecesor es un mapping
  recibe `undefined` de input (reproducido en `wf_crash` y con toy workflow;
  hallazgo §7 abajo). Los steps de agente son steps regulares que llaman
  `agent.generate()` en `execute`, no `createStep(agent)` + mappings.

## Reglas duras de operación

- **Un proceso vivo por data dir**: el store DuckDB toma un lock nativo
  exclusivo (single writer) y el error es FATAL para el run (rechaza el
  stream del modelo, no degrada a "sin métricas"). Para corridas paralelas:
  `HANDYMAN_DATA_DIR=/tmp/dir-único` por proceso.
- **El driver cierra el MCPClient** (`close()`): un MCPClient abierto mantiene
  el event loop vivo y el proceso nunca sale.
- `data/` y `logs/` están gitignored; borrarlos resetea el estado del runtime
  (el estado de negocio handyman NO se toca: vive en el `.handyman/` del
  proyecto target).

## Hallazgos del spike (fases 0–3)

1. **Endpoint Anthropic custom**: `createAnthropic({ baseURL })` debe incluir
   `/v1` (AI SDK pega solo `/messages`). Verificado con curl contra
   `api.z.ai/api/anthropic/v1/messages` y `api.kimi.com/coding/v1/messages`.
2. **Una delegación NO hereda `maxSteps` del leader**: el subagente cae al
   default de 5 y el implementer quedaba cortado antes de `report_write`
   (el leader narraba "reporte escrito" y el disco decía lo contrario —
   mismo síntoma que el `demo_estable` de Flue). Fix en código:
   `defaultOptions.maxSteps: 15` por rol + `onDelegationStart →
   modifiedMaxSteps: 15`, e instrucciones que prohíben probes exploratorios
   al implementer (su presupuesto es para sus DOS escrituras).
3. **Modelo desconocido en el registry**: Mastra no conoce `glm-5.2` y limita
   el output a 4096 tokens con un warning. Fix: `modelSettings:
   { maxOutputTokens: 16384 }` (GLM quema output en thinking).
4. **DuckDB single-writer**: ver regla dura arriba.
5. **MCP streamable-http contra `mcp.ts` funciona sin ajustes**: 25 tools
   como `handyman_<verb>`; sin loop de reconexión GET observado (el caveat
   documentado de MCPClient no se reproduce con nuestro servidor).
6. **El protocolo se sostiene ante estados rotos**: con el scratch sin
   bootstrap, el leader sondeó, detectó la ausencia del harness y pidió
   bootstrap en vez de alucinar el ciclo — en 2 de 3 corridas. En la tercera
   el leader **cambió de proyecto**: descubrió el monorepo vía
   `harness_list` y ejecutó el protocolo completo ahí (feature 98 +
   reportes en el `.handyman/` real). Se limpió quirúrgicamente y se añadió
   la regla HARD STOP al prompt del leader (nunca cambiar de proyecto; las
   probes fleet_* son observación, no fallback). **Deuda estructural:** la
   mitigación real debe ser de código — pinning del proyecto a nivel MCP
   (una sesión MCP por proyecto) o un wrapper de tools que rechace
   `project != PROJECT`; el prompt solo reduce la probabilidad.
7. **`bail()` con el output del workflow → run `success`** (verificado con
   toy probe): el resultado del run es el payload tipado y todos los steps
   quedan `success` — la distinción entre "cerró" y "outcome de negocio" se
   lee en `result.outcome`, no en el status del run.
8. **Bug de restart con mappings (1.53.0)**: kill -9 a mitad de un step cuyo
   predecesor es un `.map()` → al `run.restart()` ese step recibe `undefined`
   de input y el run muere con `WORKFLOW_STEP_INPUT_VALIDATION_FAILED`.
   Reproducido dos veces (corrida real `wf_crash` + toy workflow mínimo) y
   confirmado que SIN mappings el restart es correcto (steps completados se
   restauran del snapshot; solo el interrumpido se re-ejecuta). Workaround
   adoptado: grafos durables sin `.map()`; steps de agente como steps
   regulares con `agent.generate()` dentro de `execute`. Candidato a issue
   upstream.
9. **~~El reviewer no lee el backlog por MCP~~ RESUELTO (2026-07-28,
   mandato operador):** el reviewer tiene ahora filesystem READ-ONLY sobre
   el project root vía Workspace (`src/ports/workspace.ts`) y lee
   `.handyman/backlog/impl_<f>.md` directo de disco — sin tool MCP nuevo y
   SIN meter informes en la DB de Mastra (la verdad de negocio queda en
   disco, git-tracked; `feature.js done` lee el veredicto de disco, así que
   moverlo a LibSQL rompería el gate del verifier). El task del reviewer
   sigue llevando el output del implementer como fallback.
10. **La trayectoria por trace es inútil para agent targets** (1.53.0): la
    extracción de `runEvals` vía trace store deja como top level UN step
    `llm: 'glm-5.2'` (los MCP calls anidan 3 niveles abajo:
    agent_run → model_generation → model_step → mcp_tool_call). El scorer
    prebuilt `trajectory-accuracy` nunca matchea nombres de tools ahí, y en
    la forma plana recibe mensajes crudos y revienta. Scorer propio:
    `extractTrajectory(output)` → subsecuencia (ver
    `src/evals/protocol-trajectory.ts`).
11. **El leader diverge bajo verifier rojo** (no-determinismo real, 3 formas
    en 3 corridas): `feature_close_async` + polling de `task_result` con ids
    inventados; doble delegación + `feature_log` propio + agotamiento de
    steps. Mitigación: instrucciones de disciplina (close solo SYNC, una
    delegación por rol, nunca `task_result`) + caso rojo del eval sin
    `close` en la trayectoria esperada (el rechazo lo cubre
    deterministamente el workflow de fase 3, no el modelo).
12. **`checks.noToolErrors` no ve errores de envelope MCP**: `isError` vuelve
    como tool result con texto, no como tool-error del SDK. Los gates se
    complementan con trayectoria + verdad en disco.
13. **La skill nativa funciona pero su carga es cara**: 376k input tokens en
    la primera corrida (relectura de references) → 129k con instrucciones de
    disciplina; supervisor agregado ≈ 90k; workflow ≈ la mitad. La topología
    workflow es la más barata por feature. **Decisión (2026-07-28): el
    workflow es el camino por defecto del ciclo; la skill mirror queda como
    validación de formato/adopción, no como path de ejecución rutinario.**
14. **`pnpm` no strippea `--`** en ningún driver (`run-feature`,
    `run-workflow`, `run-skill`): todos filtran `--` de argv. Dato lateral:
    el agente RECHAZÓ correr con feature `--` explicando la regla de
    naming — el protocolo se sostiene ante input roto del operador.
15. **Las workspace tools NO aparecen en `agent.listTools()`**: se inyectan
    por run dentro del loop del agente (`createWorkspaceTools` sobre
    `getWorkspace({ requestContext })`). La verificación del wiring es por
    ejecución (sonda live: el implementer llamó `mastra_workspace_write_file`
    y escribió en el project root), no por inspección.
16. **`LocalFilesystem.readOnly` se enforcea en código**
    (`WorkspaceReadOnlyError` al escribir; verificado por sonda para leader y
    reviewer) y el sandbox solo existe para roles escribibles — la regla
    "leader/reviewer no editan código" es construcción, no prompt. Ojo:
    `listFiles` no está en la interfaz `WorkspaceFilesystem` (solo las tools
    del agente la exponen); la API programática es `readFile`/`writeFile`/
    `stat`/…

## Modelos por rol (multi-provider)

| Rol | Env var | Default |
|---|---|---|
| leader | `HANDYMAN_LEADER_MODEL` | `zai/glm-5.2` |
| implementer | `HANDYMAN_IMPLEMENTER_MODEL` | `zai/glm-5.2` |
| reviewer | `HANDYMAN_REVIEWER_MODEL` | `zai/glm-5.2` |

Providers (`src/ports/model-catalog.ts`): `zai` → Z.AI GLM (protocolo
Anthropic, key `Z_AI_API_KEY`); `kimi-coding` → Kimi for Coding
(`api.kimi.com/coding`, modelos `k2p7`/`k3`, key `KIMI_API_KEY`). Un token de
Kimi for Coding NO es válido en `api.moonshot.ai` (401) — productos distintos.

Ejemplo mixto validado:

```bash
HANDYMAN_IMPLEMENTER_MODEL=kimi-coding/k3 \
HANDYMAN_REVIEWER_MODEL=kimi-coding/k3 \
HANDYMAN_PROJECT_ROOT=/tmp/hm-mastra-mixed pnpm run-feature -- sup_mixed_kimi
```

## Resultados de validación (2026-07-28)

**Fase 0 (agente plano, spike_mastra_green/red en /tmp/hm-mastra-spike):**

- Verde: ciclo completo en 35s → `done` en disco con `started_at`/`done_at`
  reales, impl + review en backlog, usage capturado (in 42 046 / out 916).
- Roja (verifier exit 1): `feature_close` rechazado, feature queda
  `in_progress`, el agente reporta la denegación textual y para.

**Fase 1 (supervisor + subagentes, 3 corridas + 1 roja):**

| Feature | leader | implementer | reviewer | Estado | impl | review |
|---|---|---|---|---|---|---|
| `sup_loop_1` | GLM-5.2 | GLM-5.2 | GLM-5.2 | `done` | ✓ | ✓ |
| `sup_loop_2` | GLM-5.2 | GLM-5.2 | GLM-5.2 | `done` | ✓ | ✓ |
| `sup_mixed_kimi` | GLM-5.2 | **kimi-coding/k3** | **kimi-coding/k3** | `done` | ✓ | ✓ |
| `sup_red_verifier` (verifier exit 1) | GLM-5.2 | GLM-5.2 | GLM-5.2 | `in_progress` (close rechazado) | ✓ | ✓ |

Las 4 con `validate_harness: OK`; duraciones 75–115s; el ledger se omitió
correctamente en la roja (`[ledger] skipped (feature not done)`).

**Fase 2 (memoria + observabilidad + tokens + telemetría):**

- Thread por feature persistido en LibSQL (`id="sup_mixed_kimi"`,
  `resourceId="project:_tmp_hm-mastra-mixed"`).
- Métricas automáticas en DuckDB por entidad y modelo — la corrida mixta:
  leader glm-5.2 in 45 045 / out 887; implementer k3 in 9 480 / out 789
  (229 reasoning); reviewer k3 in 12 612 / out 668 (237 reasoning).
  Correlación `threadId`/`resourceId`/`runId` verificada en `metric_events`.
- Ledger `tokens.jsonl` con `source:"mastra"`, `scope:"leader"` en las 3
  corridas verdes. **Limitación conocida:** la línea registra solo el uso
  del LEADER (`result.usage`); el total del run (con subagentes) se agrega
  desde `metric_events` por `threadId`/`runId` — en la mixta, ~45k
  registrados vs ~67.6k reales.
- Telemetría `logs/agent-<feature>.jsonl`: secuencia del protocolo
  (`feature_add → feature_start → agent-implementer → agent-reviewer →
  feature_close → stop`) con usage por step, nombres de tools y ningún
  contenido de mensajes. Los pasos INTERNOS del subagente no aparecen en el
  `onStepFinish` del leader (solo la delegación `agent-*`): su detalle vive
  en los spans de DuckDB.

Reporte completo: `.handyman/backlog/impl_mastra_spike_phases_0_2.md`.

**Fase 3 (workflow durable + HITL, 4 corridas en /tmp/hm-mastra-wf-*):**

| Corrida | Escenario | Resultado |
|---|---|---|
| `wf_green` | start → suspend → resume approve | `done` en disco, `validate_harness: OK` |
| `wf_reject` | start → suspend → resume reject | `bail` tipado `changes_requested`; feature queda `in_progress`, close nunca intentado |
| `wf_red` | verifier exit 1; humano **override** al reviewer y aprueba | `close-feature` rechazado por el verifier → `bail` `close_rejected`; `in_progress` (el gate es código, no el reviewer) |
| `wf_crash2` | kill -9 a mitad de `review` → restart → approve | `done`; solo el step interrumpido se re-ejecutó (timestamps 17:32:55→17:33:12 pre-kill restaurados del snapshot; `review` re-corrió 17:33:31→17:33:53) |

- `suspend/resume` cross-proceso verificado: el resume corre en un proceso
  nuevo contra el mismo data dir (0.2s; los steps previos no se re-ejecutan).
- Observabilidad en la topología workflow: 158 spans con jerarquía
  `workflow_run → workflow_step → agent_run → model_generation → mcp_tool_call`
  y `metric_events` de tokens en DuckDB (corrida crash2).
- `wf_crash` (primera corrida de crash) murió en el restart por el bug de
  mappings (hallazgo §8) — quedó como evidencia del bug, no del diseño.
- Reporte completo: `.handyman/backlog/impl_mastra_spike_phase_3.md`.

**Fase 4 (evals en CI + skill nativa + ledger fiel):**

- **Evals con exit code** (`pnpm test:eval`, 2 casos reales): `runEvals` con
  gates `checks.toolOrder` + `checks.noToolErrors` y scorer propio
  `protocol-trajectory-order` (zero-LLM, threshold 1.0). Verde → verdict
  `passed` + `done`; roja (verifier exit 1) → verdict `passed` +
  `in_progress`. `[eval] PASSED`, **EXIT_CODE=0**. Scores persistidos en la
  tabla `mastra_scorers` de LibSQL (scorers registrados en la instancia).
- **Skill handyman nativa espejo** (`pnpm run-skill`): el `handyman/SKILL.md`
  canónico (+ `references/`) cargado como skill agent-level por path — cero
  duplicación — sin role instructions. Ciclo completo: `skill → feature_add →
  feature_start → feature_log → report_write ×2 → backlog_review →
  feature_close` → `done` en 74.8s, `validate_harness: OK`.
- **Ledger por traceId**: la línea `scope:"run"` registra el total real
  (leader + delegaciones comparten traza): in 89 782 / out 2 356 vs
  `result.usage` del leader in 49 614 / out 774 (1.8×). threadId NO sirve:
  las delegaciones corren en threads frescos por aislamiento.
- Reporte completo: `.handyman/backlog/impl_mastra_spike_phase_4.md`.
- **ADR: `docs/adr-mastra-adopcion.md`** — **ratificado por el operador el
  2026-07-28** (adopción + sunset de Flue ejecutado ese día).

## Superficie de sistema (2026-07-28, mandato del operador)

Los agentes tienen acceso real al sistema, a la manera documentada de Mastra:

| Capacidad | Vía | Alcance por rol |
|---|---|---|
| Filesystem | `Workspace` + `LocalFilesystem` (`src/ports/workspace.ts`) | implementer/skill: escritura · leader/reviewer: read-only (enforced por `WorkspaceReadOnlyError`) |
| Shell / git | `LocalSandbox.execute_command` (git CLI, tests, verifier) | solo implementer/skill |
| Búsqueda web | `web_search` + `web_fetch` propios (`src/ports/web-tools.ts`, DuckDuckGo Lite + fetch, cero API keys, output capado) | leader + skill mirror |
| GitHub | MCP oficial `api.githubcopilot.com/mcp/` en el mismo `MCPClient` cuando hay `GITHUB_TOKEN`/`GH_TOKEN` | solo leader (los filtros por verb exactos nunca dejan pasar `github_*` a subagentes); alternativa sin token: `gh` CLI autenticado en el sandbox |
| Observabilidad | las workspace/MCP tool calls caen en los spans ya exportados (`MastraStorageExporter`) | todos |

Verificado por sonda live (eliminada tras extraer hallazgos): búsqueda real
devuelve resultados; fetch de página OK; escritura denegada a leader/reviewer
y permitida a implementer/skill; tool call `mastra_workspace_write_file`
ejecutada en una corrida GLM real. `tsc` limpio, `vitest` 23/23.

## Pendiente (post-spike; ADR ratificado 2026-07-28)

- ~~Ratificación del ADR~~ **ratificado**: Flue eliminado con la vista
  `/agent` el mismo día.
- Deuda: pinning de proyecto a nivel MCP (sube de prioridad: 2 incidentes);
  issue upstream restart+`.map()`.
- ~~Lectura de backlog~~ **resuelta** con el filesystem read-only del
  reviewer (ver hallazgo §9).
- Aditivos (capa conversacional, nunca negocio): semantic recall,
  Observational Memory, Studio como panel; web search con backend dedicado
  (`@mastra/tavily`) si se provee `TAVILY_API_KEY` — el par `web_search`/
  `web_fetch` actual cubre investigación sin credenciales.

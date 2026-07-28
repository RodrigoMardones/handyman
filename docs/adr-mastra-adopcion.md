# ADR: Mastra como runtime de agentes del harness handyman (y sunset de Flue)

- **Fecha:** 2026-07-28
- **Estado:** **ratificado por el operador** (2026-07-28, misma sesión: sunset ejecutado — ver §Decisión 5)
- **Contexto:** spike completo `docs/spike-mastra-harness.md` (fases 0–4 ejecutadas con gates reales) · evidencia: `.handyman/backlog/impl_mastra_spike_phases_0_2.md`, `impl_mastra_spike_phase_3.md`, `impl_mastra_spike_phase_4.md` · sucesor de `docs/adr-flue-harness-architecture.md` (mismo día)

## Contexto

El ADR Flue dejó al agente handyman conduciendo el harness por MCP sobre un runtime **beta en rework** (Flue 1.0.0-beta.9: plugin Vite anunciado, `'use agent'`, workflows eliminados en su 1.0, SDK colapsado). El mismo día se ejecutó el spike Mastra (1.x estable desde 2026-01-20) en 4 fases, cada una con gate verificable en disco:

| Fase | Gate | Resultado |
|---|---|---|
| 0 — agente plano | ciclo verde→`done` / rojo→close rechazado | ✅ (35s; roja correcta) |
| 1 — supervisor + roles | 3 corridas `done` + reviewer sin poder mutar (tool sets en código) + mixta GLM+Kimi | ✅ |
| 2 — memoria/observabilidad/tokens | thread=feature/resource=proyecto en LibSQL; métricas por entidad en DuckDB; ledger; telemetría sanitizada | ✅ |
| 3 — workflow durable + HITL | suspend/resume cross-proceso; reject→bail tipado; override humano→verifier rechaza; **kill -9→restart solo re-ejecuta el step interrumpido** | ✅ (+ bug restart+`.map()` encontrado y evitado por regla de estilo) |
| 4 — evals + skill + tokens | evals deterministas con exit code (verde+rojo PASS); skill handyman nativa completa el ciclo; ledger = total real del run por traceId (89 782 vs 49 614 del leader, 1.8×) | ✅ |

`vitest` 23/23 · `tsc --noEmit` limpio · ~15 corridas reales en el spike total.

## Decisión

1. **Adoptar Mastra como runtime de agentes del harness** (cuarto driving adapter, paquete `agents/mastra-handyman/`), con **dos topologías sobre una sola definición de roles** (`createRoleAgents`):
   - **Supervisor** (`run-feature.ts`): leader que rutea el ciclo por LLM — para operación conversacional/multi-feature con threads y memoria.
   - **Workflow** (`run-workflow.ts`): el orden del ciclo es código — para el ciclo de UN feature con gate humano y CI (durabilidad real, HITL nativo, sin tokens de routing).
2. **El MCP sigue siendo el anti-corruption layer** (inalterado del ADR Flue): el modelo propone, el CLI dispone; la mutación de negocio solo por tools MCP.
3. **Verdad única en disco, dos capas por tiempo de vida** (del análisis de memoria pedido por el operador): `mastra.db`/DuckDB guardan lo que muere con el run (threads, snapshots de workflow, spans, `metric_events`); `.handyman/` guarda lo que debe sobrevivir al runtime (`feature_list.json`, `memory/*.md`, backlog, progress, sprints — git-tracked). **Nada de negocio entra al storage de Mastra**; la memoria de negocio se inyecta read-only en instrucciones. La migración Flue→Mastra (el disco sobrevivió intacto al cambio de runtime) es la prueba de la regla.
4. **Capa anti-volatilidad obligatoria** (misma disciplina que con Flue): barrel único `src/mastra/index.ts`, pin `@mastra/core@1.53.0`, upgrade mensual con suite verde; la eval de trayectoria actúa además como tripwire de cambios de superficie.
5. **Sunset de `agents/flue-handyman/`**: no doble mantenimiento (dos barrels, dos suites de evals, un runtime beta en rework). **Ratificado y ejecutado el 2026-07-28:** el operador ordenó la eliminación inmediata (sin ventana de deprecación) — paquete `agents/flue-handyman/` eliminado, vista `/agent` de `apps/web` retirada (`app/agent`, `app/api/agent`, `components/AgentLive.tsx`), suites `tests/test_flue_agents.sh` y `tests/test_web_agent.sh` eliminadas, scripts raíz `agents:*` repuntados a `@handyman/mastra-handyman`, entradas `allowBuilds` de `@flue/*` limpiadas en `pnpm-workspace.yaml` (−203 paquetes del grafo). El ADR Flue queda como registro histórico. El panel futuro se evalúa sobre Mastra (Studio o server adapter).
6. **Reglas de estilo derivadas del spike** (enforced en el paquete):
   - Cero `.map()` en grafos durables (bug de restart en 1.53.0); steps de agente como steps regulares con `agent.generate()` en `execute`.
   - Errores de negocio → outcomes tipados (`bail`/valores), nunca retries; transitorios → `throw` + `retryConfig`.
   - Ledger de tokens siempre agregado por **traceId** (las delegaciones usan threads frescos; threadId solo ve al leader).
   - Un proceso vivo por data dir (DuckDB single-writer, lock fatal).

## Alternativas consideradas

- **Doble runtime mantenido (Flue + Mastra)**: rechazado. Coste doble permanente; Flue sigue beta y eliminó workflows en su 1.0 ("conversations are the only durable unit") — exactamente lo que la fase 3 necesitaba y Mastra sí da.
- **Quedarse en Flue esperando su 1.0**: rechazado. Mastra cumple hoy los gates que Flue no llegó a tocar (workflows durables con auto-restart, métricas con costo, skills nativas, evals con gates); el riesgo de velocidad de Mastra (2–4 minors/semana) se mitiga igual que el de Flue: pin + barrel + cadencia.
- **Servidor Mastra propio o embebido en `apps/web` (topologías B/C)**: postergado. In-process (A) basta para CLI/CI; Studio y los server adapters quedan como camino documentado para el panel read-only.
- **Working memory / semantic recall / Observational Memory de Mastra para la memoria de negocio**: rechazado para negocio (doble verdad, escritura por tool call sin gate ni diff, DB binaria single-writer, lock-in del runtime). Quedan como **aditivos** post-ADR exclusivamente para la capa conversacional (recall cross-feature, compactación), sin tocar el disco.
- **Workspace completo (filesystem/sandbox) para el skill mirror**: postergado. La skill espejo validó el formato nativo (`skill`/`skill_read`/`skill_search` sobre el `handyman/SKILL.md` canónico, ciclo completo en 74.8s). Para implementación real en proyectos reales el camino es `Workspace` + `@mastra/workspace-fs-local` o el implementer con file tools vía host — no es necesario para el ciclo de proceso.

## Consecuencias

**Positivas:**
- Núcleo 1.x estable (Agent/Workflow/generate maduros) con MCP first-class en ambos sentidos; el anti-corruption layer del ADR queda intacto y re-validado.
- Memoria thread/resource que reemplaza "una instancia por feature"; aislamiento por `messageFilter` equivalente al `task` de Flue.
- Workflows durables reales: suspend/resume cross-proceso (0.2s de reanudación), crash-recovery con re-ejecución solo del step interrumpido (probado con kill -9 y timestamps de snapshot).
- Métricas con costo nativo y correlación por traza: el ledger `tokens.jsonl` registra por fin el **total real del run** (leader + subagentes), no solo el leader.
- Evals deterministas en CI con exit code (`checks.toolOrder`, `noToolErrors`, scorer de trayectoria propio zero-LLM) — menos infra propia que vitest-evals y con persistencia de scores (score_events).
- La skill handyman es portable a Mastra sin cambio de formato (spec SKILL.md de Anthropic) y coexistirá con la instalación en hosts.
- Skill mirror como tercer camino de adopción: un agente genérico + la skill nativa ejecuta el protocolo sin role instructions.

**Costes y riesgos (con mitigación):**
- **Velocidad de releases** (2–4 minors/semana, breaking changes en superficies nuevas — caso `Harness`→`AgentController`): pin + barrel + upgrade mensual con suite verde + eval tripwire. Dieta estricta de superficie (Agent, MCPClient, Memory, workflows, Observability, evals; nada de `AgentController`/servidor por ahora).
- **Bugs propios ya encontrados**: restart + `.map()` → input `undefined` (workaround: regla cero mappings; candidato a issue upstream); trayectoria por trace inútil para agents (top level = `llm: 'glm-5.2'`; workaround: scorer propio sobre output messages).
- **DuckDB single-writer con lock fatal**: un proceso por data dir, `HANDYMAN_DATA_DIR` por corrida paralela.
- **Coste de tokens por topología** (medido): supervisor ≈ 90k por corrida (agregado traceId), skill mirror ≈ 129k (la carga progresiva de references paga), workflow ≈ la mitad del supervisor (sin leader de routing). El workflow es la topología más barata por feature.
- **No-determinismo residual del leader** en el path rojo (doble delegación, probes especulativos de `task_result`): mitigado con prompt; el enforcement real sigue siendo el verifier (código), no el modelo — y en la topología workflow desaparece por construcción.
- **`noToolErrors` no ve errores de envelope MCP** (`isError` vuelve como tool result con texto, no como tool-error del SDK): los gates lo complementan con trayectoria + disco.

**Deuda conocida (registrada para el backlog):**
- Pinning de proyecto a nivel MCP (una sesión por proyecto o wrapper que rechace `project != PROJECT`) — la mitigación del incidente de deriva sigue siendo solo prompt, y ya son **dos incidentes** (fases 0–2: feature 98 en el monorepo; fase 4: `report_write` del caso `eval_red` escrito en el backlog del monorepo — detectado por git status, limpieza quirúrgica verificada). **Sube de prioridad: es la única vía de contaminación real observada.**
- El MCP no expone lectura de backlog (el reviewer juzga por task text + probes).
- Issue upstream candidato: restart + `.map()`.
- Aditivos post-ADR: semantic recall / Observational Memory (capa conversacional), agregación del ledger por breakdown de entidad, Studio como panel.

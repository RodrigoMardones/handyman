---
type: Implementation Log
feature: mastra_spike_phase_3
status: implemented
role: implementer
updated: 2026-07-28
tags: [handyman/role/implementer, handyman/feature/mastra_spike_phase_3]
---

# Implementation Report: mastra_spike_phase_3

Ejecución de la fase 3 del plan de `docs/spike-mastra-harness.md` §10:
reimplementar el ciclo de feature como `createWorkflow` con steps que llaman
tools MCP, revisión con `suspend/resume` humano desde CLI, política de
errores (negocio → `bail`/valores tipados, transitorio → retry), y
crash-recovery demostrado. Precedente: `impl_mastra_spike_phases_0_2.md`.

Incluye además el análisis pedido por el operador sobre si la memoria de
handyman (`.handyman/` en disco) es reemplazable por la memoria tipo
mastra.db — conclusión en §5.

## Files Changed

Todo en `agents/mastra-handyman/` salvo indicación:

- `src/workflows/feature-cycle.ts` (+test) — **nuevo**: el workflow del
  ciclo. 6 steps: `add-feature` y `start-feature` (deterministas, llaman
  tools MCP directo), `implement` y `review` (steps regulares que llaman
  `agent.generate()` con los mismos role agents del supervisor),
  `human-review` (gate HITL con `suspend`/`resume`), `close-feature`
  (verifier-gated). `callHandymanTool` normaliza el envelope MCP
  (`structuredContent` > text JSON > payload bare; `isError` y throws →
  `ok:false`). Helpers puros testeados (9 tests nuevos).
- `run-workflow.ts` — **nuevo**: driver `start|resume|restart|status
  <feature>`; runId determinista `wf-<feature>` (sin UUID que acarrear entre
  procesos); imprime status por step + outcome tipado.
- `src/app.ts` — registra los subagentes top-level y el workflow
  (`workflows: { 'feature-cycle' }`) en la instancia Mastra.
- `src/agents/handyman-leader.ts` — refactor mínimo: extrae
  `createRoleAgents(tools)` (una definición de implementer/reviewer para dos
  orquestaciones); `createHandymanLeader` acepta `subagents` opcional.
  Comportamiento del supervisor sin cambios.
- `src/mastra/index.ts` — barrel: + `createStep`, `createWorkflow`.
- `package.json` — + script `run-workflow`, + dep `zod` ^3.25.76 (peer de
  `@mastra/core`; necesaria para los schemas de steps).
- `tsconfig.json` — include `run-workflow.ts`.
- `README.md` — topología dual, decisiones (verdad única, cero `.map()`),
  hallazgos 7–9, resultados fase 3.

## Gates verificados (evidencia en disco)

**Corrida verde (`wf_green`, scratch `/tmp/hm-mastra-wf-green`, verifier exit 0):**
`start` → steps add/start/implement/review `success` → **suspended** en
`human-review` (43.6s; suspendPayload con el veredicto del reviewer).
`resume approve` en **proceso nuevo** (0.2s — steps previos restaurados del
snapshot, no re-ejecutados) → `close-feature` → outcome `done`. Disco:
feature `done` con `started_at`/`done_at` reales, `impl_wf_green.md` +
`review_wf_green.md` con frontmatter de la casa, entrada en `history.md`,
`validate_harness: OK`.

**Reject humano (`wf_reject`):** `resume reject` → run `success` con outcome
tipado `changes_requested` (bail con el output del workflow — hallazgo 7:
`bail` termina el run en `success`, el outcome se lee en `result.outcome`).
`close-feature` nunca aparece en los steps; feature queda `in_progress` sin
`done_at`; `history.md` sin entrada de cierre.

**Verifier rojo con override humano (`wf_red`, verifier exit 1):** el
reviewer estampó `changes_requested` (probó `verify`, exit 1); el humano
**aprueba en override** → `close-feature` intenta el cierre → el verifier lo
rechaza → `bail` `close_rejected`; feature `in_progress`. Demuestra que el
gate de cierre es **código** (verifier vía MCP), no el reviewer ni el humano.

**Crash-recovery (`wf_crash2`):** kill -9 a los ~25s (step `review` a mitad
de generación; `impl_wf_crash2.md` ya en disco). `restart` en proceso nuevo
→ los steps completados se restauran del snapshot con sus timestamps
originales (add 17:32:55, start 17:32:56, implement 17:32:56→17:33:12 —
todos pre-kill) y **solo el step interrumpido se re-ejecuta** (review
17:33:31→17:33:53, nuevo `review_wf_crash2.md`) → suspend → `resume approve`
→ outcome `done` con `validate_harness: OK`. Sin side effects duplicados
(el impl report se escribió una sola vez, pre-kill).

**Observabilidad (topología workflow):** 158 spans en DuckDB con jerarquía
`workflow_run(7) → workflow_step(22) → agent_run(7) → model_generation(7) →
mcp_tool_call(24)` + `metric_events` de tokens (corrida crash2). La
correlación por run queda vía `runId`/`resourceId`.

**Tests/tipos:** `vitest run` 19/19 (9 nuevos) · `tsc --noEmit` limpio.

## Hallazgos nuevos (detalle en README §Hallazgos)

7. `bail()` con el output del workflow → run `success` con `result` = payload
   tipado (verificado con toy probe). La lectura correcta del outcome de
   negocio es `result.outcome`, no el status del run.
8. **Bug de restart con mappings (1.53.0)**: kill a mitad de un step cuyo
   predecesor es un `.map()` → al `restart()` ese step recibe `undefined` de
   input (`WORKFLOW_STEP_INPUT_VALIDATION_FAILED`). Reproducido en la corrida
   real (`wf_crash`, que quedó `failed`) y con un toy workflow mínimo;
   confirmado a la inversa que SIN mappings el restart es correcto.
   **Workaround adoptado: grafos durables sin `.map()`**; steps de agente =
   steps regulares con `agent.generate()` en `execute` (además elimina el
   ruido de mappings anónimos en el resultado). Candidato a issue upstream.
9. El reviewer sin el texto del implementer en su task sondeó `feature_next`
   (solo lista pendientes) y concluyó "la feature no existe". Mitigado
   pasando el output del implementer en el prompt del step `review` (paridad
   con la delegación del leader). La deuda estructural (el MCP no expone
   lectura de backlog) sigue abierta.

## Decisión documentada: workflow Mastra SÍ, con verdad única de negocio

El gate de la fase pedía decidir sobre la doble verdad (snapshot Mastra vs
`feature_list.json`). Decisión:

**Adoptar workflows Mastra como runtime operativo del ciclo, con la regla de
que el snapshot en mastra.db es estado OPERATIVO desechable y
`feature_list.json` sigue siendo la única verdad de negocio.**

- No hay reconciliación bidireccional que diseñar: si discrepan, el disco
  gana y el run se abandona (`deleteWorkflowRunById`); dónde está el ciclo
  se re-deriva del status de la feature. El workflow nunca duplica estado de
  negocio — sus payloads llevan solo lo necesario para reanudar.
- Beneficios demostrados: HITL nativo cross-proceso (suspend → veredicto
  humano desde CLI en otro proceso); crash-recovery real (con la condición
  del hallazgo 8); orquestación determinista en código — el orden del ciclo
  deja de ser una decisión del LLM, y desaparecen los tokens de leader para
  routing (la corrida verde usó solo implementer+reviewer).
- Condiciones/reglas que salen de la fase: cero `.map()` en grafos durables
  (hallazgo 8); errores de negocio siempre como outcome tipado, nunca como
  excepción retriable; el ledger de tokens debe derivarse de `metric_events`
  (el `WorkflowResult` no expone `usage` — queda para fase 4).
- Cuándo NO: operación conversacional multi-feature (el supervisor con
  threads/memoria sigue siendo el modelo correcto ahí). El workflow es para
  el ciclo de UN feature con gate humano — estilo CI.

## Análisis previo (pedido del operador): ¿memoria handyman → mastra.db?

Conclusión: **no hay reemplazo mayoritario; la frontera correcta es por
tiempo de vida, y es la que fase 2 ya implementó.**

- **Reemplazable (muere con el run):** contexto conversacional por feature
  (ya en threads LibSQL), telemetría JSONL (los spans DuckDB la cubren), y el
  ledger de tokens como store operativo (`metric_events` es estrictamente más
  rico — queda como export derivado, fase 4).
- **No reemplazable (debe sobrevivir al runtime):** `feature_list.json`
  (estado de negocio con semántica ejecutable: lo operan CLI, verifier y
  tools MCP fuera de cualquier run), `memory/*.md` (conocimiento curado,
  git-tracked — 412 archivos de `.handyman/` versionados —, multi-runtime por
  diseño: el MCP lo sirve a cualquier runtime; la migración Flue→Mastra es la
  prueba de que el disco sobrevive a los runtimes), `backlog/`,
  `progress/history.md`, handoffs, sprints (narrativa curada o derivada
  deterministamente). Mastra working memory (`scope: resource`) podría
  alojar el markdown, pero: escritura por tool call del modelo sin gate ni
  diff, DB binaria single-writer (lock fatal, hallazgo 4 de fases 0–2),
  lock-in del runtime. El spike §6/§11.2 ya lo decidió: inyección read-only,
  el disco gana.
- **Aditivos (no reemplazo):** semantic recall cross-feature y Observational
  Memory (compactación) — candidatos de fase 4.

## Loose ends

- Fase 4 (pendiente): `runEvals` en CI, skill nativa, ledger derivado de
  `metric_events`, ADR de adopción/rechazo.
- Issue upstream candidato: restart + `.map()` → input `undefined` (hallazgo 8).
- Deuda estructural heredada (sin cambios): pinning de proyecto a nivel MCP;
  lectura de backlog por MCP.
- `wf_crash` (primera corrida de crash, con mappings) quedó `failed` en su
  data dir como evidencia del bug; scratchs `/tmp/hm-mastra-wf-*` y data dirs
  `/tmp/hm-mastra-data-wf-*` vivos como evidencia intacta.

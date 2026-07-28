---
type: Implementation Log
feature: mastra_spike_phase_4
status: implemented
role: implementer
updated: 2026-07-28
tags: [handyman/role/implementer, handyman/feature/mastra_spike_phase_4]
---

# Implementation Report: mastra_spike_phase_4

Ejecución de la fase 4 del plan de `docs/spike-mastra-harness.md` §10:
`runEvals` en CI con gates deterministas, skill handyman como skill nativa
Mastra en modo espejo, y ADR de adopción/rechazo. A ello se suman (deuda de
fases 2–3): ledger de tokens derivado de `metric_events`. Precedente:
`impl_mastra_spike_phase_3.md`. **ADR entregado:
`docs/adr-mastra-adopcion.md` (adoptar Mastra + sunset de Flue, estado:
propuesto — a ratificar por el operador).**

## Files Changed

Todo en `agents/mastra-handyman/` salvo el ADR:

- `run-evals.ts` — **nuevo**: gate de CI. Dos casos reales (verde → `done`;
  verifier rojo → `in_progress`) contra scratch. `runEvals` con gates
  (`checks.toolOrder`, `checks.noToolErrors`) + scorer propio con threshold
  1.0; exit 0 iff verdict `passed` en ambos + verdad en disco. Limpieza
  determinista del caso rojo (restore `init.sh` + cierre por CLI).
- `src/evals/protocol-trajectory.ts` — **nuevo**: scorer zero-LLM de
  trayectoria del protocolo (subsecuencia relajada sobre los tool calls del
  agente, via `extractTrajectory` del framework). Ver hallazgo 11 para por
  qué no el prebuilt.
- `src/agents/handyman-skill.ts` + `run-skill.ts` — **nuevos**: agente
  espejo — la skill handyman canónica (`handyman/SKILL.md` + `references/`)
  como skill NATIVA de Mastra (agent-level, path-based, cero duplicación),
  sin role instructions, sobre las 25 tools MCP. El driver imprime la
  secuencia de tool calls.
- `src/ports/usage-aggregate.ts` (+test) — **nuevo**: total del run por
  **traceId** desde `metric_events` (leader + delegaciones comparten traza).
- `src/ports/tokens-ledger.ts` — `scope: 'leader' | 'run'`; run-feature
  escribe con scope `run` (fallback al uso del leader si falla la consulta).
- `src/app.ts` — expone `tools` + `observabilityStore`; registra los scorers
  en la instancia (persistencia de scores en `score_events`, sin warnings).
- `src/agents/handyman-leader.ts` — disciplina anti-deriva del protocolo:
  close siempre SYNC (nunca `feature_close_async`/`task_result`), una
  delegación por rol, el leader nunca escribe como subagente.
- `src/mastra/index.ts` — barrel: + `runEvals`, `createScorer`, `checks`,
  `extractTrajectory`.
- `package.json` — scripts `test:eval`, `run-skill`; dep `@mastra/evals`
  1.6.0.
- `docs/adr-mastra-adopcion.md` — **nuevo** (raíz docs/): adopción + sunset.

## Gates verificados (evidencia en disco)

**Evals (`pnpm test:eval`, scratch `/tmp/hm-mastra-eval`, EXIT_CODE=0):**

| Caso | verdict | gates | threshold | disco |
|---|---|---|---|---|
| `eval_green_ms501src` | passed | toolOrder=1, noToolErrors=1 | trajectory=1.0 | `done` |
| `eval_red_ms503lth` | passed | toolOrder=1, noToolErrors=1 | trajectory=1.0 | `in_progress` |

**Skill nativa espejo (`skill_probe_v2`, scratch `/tmp/hm-mastra-skill`):**
`[skill] native skills loaded: handyman`; secuencia `skill → feature_add →
feature_start → feature_log → next_step → report_write ×2 → backlog_review →
feature_close`; feature `done` (74.8s, 128.7k input tokens), `impl`+`review`
en backlog, `validate_harness: OK`. Bonus de robustez: encontró
`skill_native_probe` atascada `in_progress` de la corrida anterior y la
cerró por el gate del verifier para liberar el slot — recuperación legítima
por el protocolo.

**Ledger por traceId (`ledger_trace_total`, scratch `/tmp/hm-mastra-ledger`):**
`result.usage` (solo leader) in 49 614 / out 774 → línea `scope:"run"` **in
89 782 / out 2 356** (1.8×: leader + implementer + reviewer). Hueco de fase
2 cerrado: threadId NO sirve (las delegaciones corren en threads frescos —
aislamiento por diseño); traceId es la correlación correcta (los subagentes
cuelgan de la misma traza, verificado en el árbol de spans).

**Tests/tipos:** `vitest run` 23/23 (4 nuevos) · `tsc --noEmit` limpio.

## Hallazgos nuevos (detalle en README §Hallazgos)

10. **La trayectoria por trace es inútil para agent targets**: el extraction
    de `runEvals` (vía trace store) deja como top level UN step
    `llm: 'glm-5.2'` (los MCP calls anidan 3 niveles abajo:
    agent_run → model_generation → model_step → mcp_tool_call). El scorer
    prebuilt `trajectory-accuracy` nunca puede matchear nombres de tools
    ahí; en la forma plana recibe mensajes crudos y revienta
    (`run.output.steps` undefined). Solución: scorer propio sobre
    `extractTrajectory(output)` (mismos nombres limpios que `checks.*`).
11. **El leader diverge bajo verifier rojo** (no-determinismo real):
    `feature_close_async` + polling de `task_result` con ids inventados (v2),
    doble delegación de implementación + `feature_log` propio + agotamiento
    de steps (v3). Mitigación: instrucciones de disciplina (close solo SYNC,
    una delegación por rol, nunca escribir como subagente, nunca
    `task_result`) + expectativa de trayectoria del caso rojo sin `close`
    (la semántica del rechazo la cubre deterministamente la topología
    workflow de fase 3). v4: PASS.
12. **`checks.noToolErrors` no ve errores de envelope MCP**: `isError` vuelve
    como tool RESULT con texto de error, no como tool-error del SDK — el
    check quedó en 1 pese a un `task_result` fallido. Los gates se
    complementan con trayectoria + verdad en disco.
13. **La skill nativa funciona pero su carga es cara**: primera corrida
    376k input tokens (relectura de references); con instrucciones de
    disciplina 129k. Supervisor agregado ≈ 90k; workflow ≈ la mitad (sin
    routing LLM). La topología workflow es la más barata por feature.
14. **`pnpm` no strippea `--` también en `run-feature`/`run-skill`** (mismo
    bug que fase 3 en run-workflow): los tres drivers filtran `--` de argv.
    Dato lateral: el agente RECHAZÓ correr con feature `--` explicando la
    regla de naming — el protocolo se sostiene ante input roto del operador.

## Loose ends

- **Incidente de deriva #2 (detectado por git status, ya limpiado):** el
  implementer del caso `eval_red_ms503lth` escribió su `report_write` en el
  backlog del MONOREPO en vez del scratch (el gate pasó igual — el disco del
  scratch era correcto). Limpieza quirúrgica verificada (archivo eliminado;
  `feature_list.json`, `current.md`, `run/` intactos). Refuerza la deuda
  estructural: **pinning de proyecto a nivel MCP sube de prioridad** (2
  incidentes; la mitigación por prompt reduce pero no elimina).
- **ADR propuesto, a ratificar**: `docs/adr-mastra-adopcion.md` — incluye la
  decisión de sunset de `agents/flue-handyman/` (deprecated, sin features;
  eliminación física al siguiente sprint si Mastra sigue verde). La vista
  `/agent` de `apps/web` queda ligada al SDK Flue (se retira con él).
- Deuda heredada sin cambios: pinning de proyecto a nivel MCP; lectura de
  backlog por MCP; issue upstream restart+`.map()`.
- Aditivos post-ADR (capa conversacional, nunca negocio): semantic recall,
  Observational Memory, Studio como panel.
- Scratchs vivos en /tmp: `hm-mastra-eval` (8 features eval done),
  `hm-mastra-skill` (3 done), `hm-mastra-ledger` (2 done, ledger con ambas
  líneas scope), data dirs `hm-mastra-data-{skill,ledger}` + el default
  `./data` (traces de evals).

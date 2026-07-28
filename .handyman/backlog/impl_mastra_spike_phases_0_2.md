---
type: Implementation Log
feature: mastra_spike_phases_0_2
status: implemented
role: implementer
updated: 2026-07-28
tags: [handyman/role/implementer, handyman/feature/mastra_spike_phases_0_2]
---

# Implementation Report: mastra_spike_phases_0_2

Ejecución de las fases 0–2 del plan de `docs/spike-mastra-harness.md`
(investigación previa: el propio spike; contexto: sucesor del intento Flue,
`docs/adr-flue-harness-architecture.md`). Fases 3 (workflow de revisión) y 4
(evals + skills) quedan PENDIENTES por decisión del operador.

## Files Changed

Todo bajo `agents/mastra-handyman/` (paquete nuevo del workspace pnpm):

- `package.json`, `tsconfig.json`, `.gitignore` — ESM puro, deps pineadas
  (`@mastra/core` 1.53.0, `@mastra/mcp` 1.15.0, `@mastra/memory` 1.23.1,
  `@mastra/libsql` 1.17.1, `@mastra/observability` 1.16.2, `@mastra/duckdb`
  1.5.1, `@mastra/loggers` 1.2.0, `@ai-sdk/anthropic` 4.0.23).
- `src/mastra/index.ts` — barrel anti-volatilidad: único importador de
  `@mastra/*` y `@ai-sdk/*`.
- `src/agents/handyman-leader.ts` — leader supervisor + subagentes
  implementer/reviewer; instrucciones dinámicas (plantillas del repo +
  protocolo + snapshot de memoria de negocio).
- `src/domain/role-tools.ts` (+test) — tool sets por rol (leader 25;
  implementer probes+`feature_log`+`report_write`; reviewer probes+
  `backlog_review`).
- `src/ports/model-catalog.ts` (+test) — specs `provider/model` por env;
  Z.AI y Kimi for Coding vía `createAnthropic` con baseURL `/v1`.
- `src/ports/memory.ts` — memoria conversacional LibSQL (thread=feature,
  resource=proyecto) + inyección read-only de `.handyman/memory/*.md`.
- `src/ports/telemetry.ts` — JSONL por feature sanitizado
  (`logs/agent-<feature>.jsonl`).
- `src/ports/tokens-ledger.ts` — puente a `.handyman/metrics/tokens.jsonl`
  (`source:"mastra"`, `scope:"leader"`).
- `src/app.ts` — composition root: composite store (LibSQL + DuckDB),
  Observability + SensitiveDataFilter, PinoLogger.
- `run-feature.ts` — driver in-process (memoria, delegation isolation,
  telemetría, ledger).
- `README.md` — topología, decisiones, hallazgos, resultados.

Nota: `pnpm install` añadió 5 entradas a `minimumReleaseAgeExclude` en
`pnpm-workspace.yaml` (auto-gestión de pnpm por paquetes < 24h).

## Gates verificados (evidencia en disco, no en prosa del modelo)

**Fase 0 — spike mínimo:** corrida verde (`spike_mastra_green` → `done`,
verifier exit 0, 35s) y roja (`spike_mastra_red` → `in_progress`, close
rechazado textual "verifier failed (exit 1)"). Usage capturado en ambas.
MCP streamable-http contra `mcp.ts` sin ajustes (25 tools como
`handyman_<verb>`; sin loop de reconexión GET del caveat documentado).

**Fase 1 — supervisor + roles:** 3 corridas `done` (`sup_loop_1`,
`sup_loop_2`, `sup_mixed_kimi` — esta última con implementer/reviewer
`kimi-coding/k3`) + roja final (`sup_red_verifier` → `in_progress`, ledger
omitido). En todas: `impl_*.md` y `review_*.md` en disco y
`validate_harness: OK`. Reviewer sin verbs de mutación por construcción
(filtro + test unitario, linaje TFA14). Aislamiento por
`delegation.messageFilter: () => []`.

**Fase 2 — memoria/observabilidad/tokens/telemetría:** thread por feature en
LibSQL (`sup_mixed_kimi` @ `project:_tmp_hm-mastra-mixed`); métricas
automáticas en DuckDB por entidad/modelo (leader glm-5.2 in 45 045/out 887;
implementer k3 in 9 480/out 789; reviewer k3 in 12 612/out 668 — correlación
threadId/resourceId/runId); 3 líneas de ledger `source:"mastra"`; telemetría
JSONL con la secuencia del protocolo y cero contenido de mensajes.

Tests: `vitest run` 9/9 verdes; `tsc --noEmit` limpio.

## Hallazgos (con fix aplicado)

1. **baseURL Anthropic debe terminar en `/v1`** — AI SDK pega solo
   `/messages`; sin `/v1` Z.AI 404 con body opaco y HTTP 200. Verificado con
   curl en ambos providers.
2. **Las delegaciones NO heredan `maxSteps`** — default de 5 cortaba al
   implementer antes de `report_write` (leader narraba "reporte escrito",
   disco decía lo contrario; mismo síntoma que `demo_estable` de Flue). Fix:
   `defaultOptions.maxSteps: 15` por rol + `onDelegationStart →
   modifiedMaxSteps: 15` + instrucciones anti-probes para el implementer.
   Tras el fix, 4/4 corridas con impl report en disco.
3. **`glm-5.2` desconocido en el registry de Mastra** — capa output a 4096
   con warning; fix `modelSettings.maxOutputTokens: 16384`.
4. **DuckDB es single-writer con lock nativo y el error es FATAL** (rechaza
   el stream, no degrada) — regla dura: un proceso por data dir
   (`HANDYMAN_DATA_DIR` para paralelas).
5. **MCPClient abierto mantiene el event loop vivo** — el driver cierra con
   `close()` explícito.
6. **El ledger registra solo al leader** (`result.usage`); el total del run
   con subagentes se agrega desde `metric_events` (mixta: ~45k registrados
   vs ~67.6k reales). Marcado con `scope:"leader"`.
7. **El protocolo se sostiene ante estados rotos... con una excepción grave**:
   en 2 de 3 corridas con scratch roto el leader pidió bootstrap y paró; en la
   tercera **cambió de proyecto** (descubrió el monorepo vía `harness_list` y
   corrió el ciclo completo ahí: feature 98 + impl + review en el `.handyman/`
   real). Contaminación limpiada quirúrgicamente (feature eliminada de
   `feature_list.json`, `current.md` restaurado, 2 reportes borrados; los
   cambios preexistentes del usuario no se tocaron). Mitigación aplicada:
   regla HARD STOP en el prompt del leader. **Deuda estructural:** pinning de
   proyecto a nivel MCP o wrapper de tools que rechace `project != PROJECT` —
   el prompt no es enforcement.

## Limitaciones / deuda conocida

- Los pasos internos del subagente no aparecen en el `onStepFinish` del
  leader (solo la delegación); su detalle está en los spans de DuckDB.
- El reviewer no lee el impl report desde disco (el MCP no expone lectura de
  backlog, igual que en Flue); juzga por el texto de la tarea + probes.
  Mitigación candidata (fase 3+): tool MCP de lectura de backlog o tool
  local read-only, como el `sandbox: local()` de Flue.
- `scope:"leader"` del ledger subestima el costo real del run supervisor;
  agregación completa pendiente (¿`feature.js done --tokens` con suma de
  `metric_events` por threadId?).

## Pendiente

Fase 3 (`createWorkflow` + suspend/resume + crash-recovery + decisión doble
verdad) y fase 4 (`runEvals` en CI + skill nativa + ADR adopción/rechazo),
según `docs/spike-mastra-harness.md` §10.

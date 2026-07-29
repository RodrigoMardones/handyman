---
type: Review Log
feature: mastra_runtime_decoupling
status: approved
role: reviewer
updated: 2026-07-29
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/mastra_runtime_decoupling]
---

# Review: mastra_runtime_decoupling

## Verdict

APPROVED   <!-- or CHANGES_REQUESTED -->

## Stage 1: Spec Compliance

_Review the change against the feature request and its acceptance criteria first. A Stage 1 failure ends the review: report CHANGES_REQUESTED without moving to Stage 2, so spec drift is never buried under style feedback._

- [x] Every acceptance criterion is satisfied
- [x] The change stays inside the feature's declared scope
- [x] The implementation report exists and matches what changed

## Stage 2: Code Quality

_Only after Stage 1 passes._

- [x] Architecture respected
- [x] Conventions respected
- [x] Tests meaningful and green
- [x] Verifier exits 0

## Required Changes

_None, or a concrete list of file-specific changes._

## Evidence

- **Spec (Stage 1):** (a) desacople real verificado con 2 sondas desde cwd ajeno: proyecto POR NOMBRE resuelto vía registry fixture, assets vía paquete workspace, dataDir bajo `~/HANDYMAN/agent/<id>` (no cwd), y fallo SOLO en MCP connect con error accionable; (b) `HANDYMAN_PROJECT_ROOT` acepta nombre con errores 0-match/ambigüedad coherentes con F99 (`harness-install.ts:76-97`); (c) dataDir/telemetryDir fuera de cwd con tests; (d) 77/77 vitest + tsc + init.sh verdes; flujos dev pineados explícitamente (env DATA/TELEMETRY en scripts).
- **Revisión propia:** leído `harness-install.ts` completo — env-first, inyección para tests, semántica espejo de toolbox-core/MCP con duplicación local deliberada y justificada (comentario líneas 11-14); lector de registry tolerante; `resolveToolboxCommand` con 4 peldaños y `source` loggeable. `config.ts` verificado: `projectRoot` default = cwd (como el MCP), cadena de precedencias correcta.
- **Decisiones aceptadas:** `repoRoot` pasa a `string | undefined` (solo override dev); `HANDYMAN_ASSETS_DIR` apunta al dir del paquete; el scope deployment viejo de skills no existía en disco (evidencia `ls`) — eliminado sin pin, `HANDYMAN_SKILL_DIRS` como vía documentada; excepciones fuera del paquete (`scripts/studio-local.sh`, `pnpm-lock.yaml`) justificadas y mínimas; dep `handyman-harness: workspace:*` enlazada correctamente.
- **C4:** `pnpm test:unit` re-corrido por el reviewer: 8 archivos, 77/77 verde. `./init.sh` exit 0 reportado por el implementer; el gate de `feature done` lo re-verifica al cerrar.

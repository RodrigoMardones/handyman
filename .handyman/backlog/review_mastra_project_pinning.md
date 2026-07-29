---
type: Review Log
feature: mastra_project_pinning
status: approved
role: reviewer
updated: 2026-07-29
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/mastra_project_pinning]
---

# Review: mastra_project_pinning

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

- **Spec (Stage 1):** (a) wrapper `pinToolsToProject` aplicado en `connectHandymanMcp` (choke point único — leader, subagentes vía role-tools, steps del workflow y skill mirror lo heredan sin tocar archivos); (b) tests: 9 nuevos en `mcp-pinning.test.ts` cubriendo inyección, mismo proyecto (path/resolve-igual/basename), rechazo que nunca alcanza el cliente subyacente, y passthrough de tools ajenas; (c) evidencia en vivo contra MCP real: boot log `25 tools, 21 pinned to /tmp/hm-studio` (las 4 `needsProject:false` pasan intactas), rechazo de proyecto ajeno con error que nombra pin e intento, basename y omisión pasando.
- **Revisión propia:** leído `mcp-pinning.ts` completo — wrap gate por inputSchema (no por nombre) verificado empíricamente contra @mastra/mcp 1.15.0 (comentario líneas 23-28); `isSameProject` acepta el shorthand basename que las templates enseñan (la ambigüedad real queda cubierta server-side por F99); rechazo como promise rejection (wrapper async — consumidores que solo manejan rejections no se rompen); contador `pinned` para detectar pinning inerte en boot log (drift del shape de Mastra → warning, no brick).
- **Decisiones aceptadas:** warn por console.warn (TelemetrySink es run-scoped, inalcanzable en wrap-time — justificado); sin flag de opt-out (el escape es omitir el arg o pasar el path equivalente); pinning server-side queda documentado como deuda del MCP en el README (fuera de scope según la feature).
- **C4:** re-corrido por el reviewer: `pnpm test:unit` 9 archivos 86/86 verde, `pnpm build:bundle` status ok; `./init.sh` all gates passed reportado por el implementer y re-verificado por el gate de cierre.

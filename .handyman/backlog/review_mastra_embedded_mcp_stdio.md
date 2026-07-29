---
type: Review Log
feature: mastra_embedded_mcp_stdio
status: approved
role: reviewer
updated: 2026-07-29
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/mastra_embedded_mcp_stdio]
---

# Review: mastra_embedded_mcp_stdio

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

- **Spec (Stage 1):** (a) `HANDYMAN_MCP_TRANSPORT=stdio` y SIN MCP HTTP corriendo, el bundle bootea con 25 tools / 21 pineadas (log verbatim en el impl report; pinning de F103 intacto vía el mismo choke point); (b) hijo sin huérfanos — smoke con delta `pgrep dist/mcp.js` antes/después = 0, sin tocar el MCP HTTP preexistente del operador; (c) default http intacto (tests del resolvedor: default/stdio/inválido con error accionable); (d) 93/93 vitest + tsc + build:bundle + smoke_bundle 4/4 + smoke_stdio 4/4 + init.sh all gates passed.
- **Camino revisado:** stdio nativo de @mastra/mcp 1.15.0 (unión `StdioServerDefinition|HttpServerDefinition` verificada en los tipos instalados) — plan B (spawn propio + puerto efímero) correctamente descartado: duplicaba lifecycle que el SDK ya resuelve.
- **Revisión propia:** leído `mcp-transport.ts` completo — unión descrita ESTRUCTURALMENTE sin importar @mastra (respeta la regla dura del barrel anti-volatilidad, comentario líneas 16-19); env passthrough mínimo y deliberado (HANDYMAN_ROOT/PATH/HOME — no filtra LLM keys al hijo, decisión correcta documentada); error accionable cuando falta `dist/mcp.js`; ciclo de vida apoyado en `disconnect()` en finally + stdin-EOF ante crash, asertado por el smoke.
- **studio-local.sh:** skip del boot 8177 solo cuando el operador trae el env — default dev http sin cambios. README documenta la topología de un comando y la nota honesta de Studio-aparte.
- **C4:** re-corrido por el reviewer: `smoke_stdio.sh` 4/4 PASS (boot stdio sin HTTP, sin huérfanos, error accionable con toolchain sin buildear).

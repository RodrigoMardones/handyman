---
type: Implementation Log
feature: flue_subagent_grounding
status: implemented
role: implementer
updated: 2026-07-28
tags: [handyman/role/implementer, handyman/feature/flue_subagent_grounding]
---

# Implementation Report: flue_subagent_grounding

## Files Changed

- `agents/flue-handyman/src/domain/role-tools.ts` (nuevo) — modulo puro con
  `MCP_PREFIX`, `READ_ONLY_PROBES` (11 probes), `IMPLEMENTER_EXTRA`
  (`feature_log`, `report_write`), `REVIEWER_EXTRA` (`backlog_review`),
  `implementerVerbs()`, `reviewerVerbs()` y `toolsForVerbs()`. Comentario
  inline documenta el bug de doble underscore (ver abajo).
- `agents/flue-handyman/src/domain/role-tools.test.ts` (nuevo) — 4 tests
  unitarios con los 25 verbs del contrato MCP: sets no vacios con el naming
  REAL prefijado, reviewer read-only, implementer = probes + 2 writes, y
  toda verb whitelistada existe en el contrato.
- `agents/flue-handyman/src/agents/handyman-leader.ts`:
  - `sandbox: local({ cwd: PROJECT })` en el leader — toda la instancia pisa
    el filesystem real (fin del sandbox mismatch: los `read`/`bash` de los
    subagentes ven lo que el MCP escribe en el host).
  - Profiles con tool sets por rol via `toolsForVerbs(handyman.tools,
    implementerVerbs()/reviewerVerbs())` (antes: las 25 para todos).
  - Instrucciones: el reviewer lee el impl report real antes de decidir;
    reportes SOLO via tools MCP (`report_write`/`backlog_review`), nunca
    writes directos al FS (never-overwrite y verdict-conflict son del MCP);
    el reviewer puede enriquecer el cuerpo tras sellar.
- `agents/flue-handyman/src/flue/index.ts` — barrel += `local` de
  `@flue/runtime/node`.
- `tests/test_flue_agents.sh` — caso TFA14: sandbox local, import de
  role-tools, uso de los verb lists, bloques sin verbs de estado, y pin del
  fix (`${MCP_PREFIX}${v}`, nunca `${MCP_PREFIX}__${v}`).
- `agents/flue-handyman/README.md` — seccion "Anclaje de subagentes" con las
  2 decisiones y el riesgo aceptado de `local()` (host confiable, env no se
  pasa).

## El bug que destapo la validacion (parte de la historia de la feature)

La primera version del filtro (en el agente) construia
`` `${MCP_PREFIX}__${v}` `` con `MCP_PREFIX = 'mcp__handyman__'` ->
`mcp__handyman____<verb>` (4 underscores): **sets vacios silenciosos**. Los
greps estructurales pasaban (el texto "se veia bien"). Sintoma en
`demo_grounding_2`: el reviewer reporto "no puedo acceder al verb MCP" y el
leader sello la review el mismo. Deteccion: probe directo contra el MCP
(`connectMcpServer` + el filtro) -> 0 tools. Fix: `${MCP_PREFIX}${v}` +
extraccion a modulo de dominio + unit tests contra el naming real
(verificado contra el runtime: `mcp__<server>__<tool>` en index.mjs:130).

Leccion aplicada: los filtros que resuelven nombres en runtime necesitan
tests con el naming real, no solo greps de fuente.

## Validacion (acceptance 3) — 3 corridas documentadas

- `demo_grounding` (pre-fix prompt): verde, pero los subagentes escribieron
  reportes directo al FS (sintoma del set vacio aun no diagnosticado).
- `demo_grounding_2` (prompt MCP-only): destapo el bug — "the subagent
  couldn't access the MCP verb".
- `demo_grounding_3` (filtro corregido): **validacion real verde**:
  - Leader: `feature_add`/`feature_start`/`feature_close` + 2 delegaciones.
  - Implementer: `feature_log` x4 + `report_write` + `verify` (todo MCP).
  - Reviewer: `backlog_review` + `verify`, **cero verbs de estado**; cuerpo
    enriquecido con `edit` tras sellar (como permite la instruccion).
  - Veredicto **anclado en el impl report real**: la seccion Reasoning cita
    su contenido ("Impl report is coherent. It resolves HARNESS_WORKSPACE to
    .handyman correctly...") — contraste con `demo_estable` ("no such
    implementation exists" estando en disco).
  - `demo_grounding_3` = `done` en disco; `validate_harness` OK.

## Test Output

```text
pnpm test:unit: 21/21 (4 telemetry + 13 taxonomy + 4 role-tools)
tests/test_flue_agents.sh: 14/14 (TFA14)
pnpm build: OK; probes del filtro contra MCP real: 12 tools reviewer / 13 implementer
./init.sh → exit 0 (verificado en feature.js done)
```

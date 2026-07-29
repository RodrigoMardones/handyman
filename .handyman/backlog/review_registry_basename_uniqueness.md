---
type: Review Log
feature: registry_basename_uniqueness
status: approved
role: reviewer
updated: 2026-07-29
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/registry_basename_uniqueness]
---

# Review: registry_basename_uniqueness

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

- **Spec (Stage 1):** (a) `resolveProject` (`mcp.ts`) — `find()` → `filter()` + guarda: 2+ matches de basename lanzan error explícito `project name '<name>' is ambiguous: N registered harnesses share it: <roots>. Pass the absolute project root instead of the name.`; 0/1 match conservan comportamiento; la rama de ruta absoluta intacta. (b) `cmdRegister` (`toolbox.ts`) — helper `warn()` nuevo a stderr; registrar basename compartido advierte `WARN: name '<name>' is shared with <root(s)> …` pero registra igual (exit 0); re-registrar el mismo root sale por dedup sin warning.
- **Tests nuevos:** M29 en `test_mcp.js` (ambigüedad lista ambos roots + ruta absoluta del duplicado sigue resolviendo) y TB24 en `test_toolbox.sh` (warning, ambos registrados, re-register silencioso). Diff mínimo: 2 archivos src + 2 suites.
- **C3/C4:** sin dependencias nuevas; guarda `matches[0]` + `!match` satisface `noUncheckedIndexedAccess` sin non-null assertion. `packages/toolbox-core/src/registry.ts` sin cambios (helpers de nombre viven en mcp.ts; toolbox-core no tiene suite de tests — verificado). Suite completa: ALL SUITES PASSED (test_mcp 35/35, test_toolbox 25/25). `./init.sh`: all gates passed.
- **Nota aceptada:** el error de ambigüedad lista solo los candidatos conflictivos (info accionable), no el registry completo.

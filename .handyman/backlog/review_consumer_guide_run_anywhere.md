---
type: Review Log
feature: consumer_guide_run_anywhere
status: approved
role: reviewer
updated: 2026-07-29
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/consumer_guide_run_anywhere]
---

# Review: consumer_guide_run_anywhere

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

- **Spec (Stage 1):** (a) `README.npm.md` ganó la sección "Run anywhere: one install, every registered project" con los comandos verificados contra `toolbox.ts`/`mcp.ts` (install global/npx, register/discover, status/health/timeline, mcp stdio/--http, arg `project`, resources, caveats de basename único —coherente con F99— y registry machine-local); `README.md` raíz la enlaza con anchor correcto. (b) `lab_skill_install.sh` reescrita como consumer journey (6/6: pack → fixture scaffold → register → status/list **desde otro cwd** → evals validate), fuera del gate como sonda manual (documentado en su header).
- **Hallazgo mayor aceptado (scope ampliado justificado):** la verificación de la guía destapó que el `toolbox` del tarball 3.7.5 publicado estaba roto vía CLI — esbuild colapsa `import.meta.url` de todos los módulos a la URL del bundle, así que los entry-guards `import.meta.url === file://argv[1]` de los verbos importados por toolbox.ts (`index_md`, `metrics`, `upgrade_harness`) disparaban su `main()` + `process.exit()` antes que el main real. El smoke viejo pasaba por accidente ("usage exits 0" nunca ejercía el main). Fix: guards por `basename(argv[1]) === "<verb>.js"` en los 13 entry points (+67/-43, uniforme, comentario explicativo en cada uno; `feature.ts` retira el helper `entryGuardUrl()` muerto). Válido en tsc dist, bundle, dispatcher cli.js e inmune a symlinks. Sin este fix la guía mentía y la lab no podía pasar — mismo núcleo causal que el canonicalize-tmpdir de F98.
- **Revisión propia:** diff de guards inspeccionado (uniforme, sin lógica alterada); sección README releída contra los comandos reales; `.handyman/index.md` regenerado como side effect de la primera corrida de la lab — contenido fiel al estado vivo, se mantiene (MOC idempotente por diseño).
- **C4:** `bash tests/run_tests.sh` ALL SUITES PASSED 23/23 (reportado por el implementer); re-corrido por el reviewer: `./init.sh` exit 0 (VERIFIER: all gates passed) y `bash tests/lab_skill_install.sh` 6/6, incluyendo "toolbox status from another cwd reports the registered harness" — prueba literal del fix y de la promesa de la guía.
- **Nota para el próximo publish:** el bug de guards afecta al 3.7.5 publicado; conviene publicar 3.7.6+ con este fix (publicar es acción humana, fuera de esta feature).

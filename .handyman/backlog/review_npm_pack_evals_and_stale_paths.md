---
type: Review Log
feature: npm_pack_evals_and_stale_paths
status: approved
role: reviewer
updated: 2026-07-29
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/npm_pack_evals_and_stale_paths]
---

# Review: npm_pack_evals_and_stale_paths

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

- **Spec (Stage 1):** (a) `evals validate` corre desde el tarball: `pack_npm.mjs` copia `evals/` a staging, lo añade a `files` y guarda de inventario `evals/trigger-eval.json`; smoke nuevo en `test_npm_pack.sh` ejecuta `cli.js evals validate` (exit 0 + `validate: OK`) y `evals.js` directo con contrato idéntico, en workspace vacío fuera del monorepo. (b) Grep final por `handyman/dist` / `upgrade_harness.py` en src/scripts/references: solo quedan ocurrencias justificadas (docstring histórico en `upgrade_harness.ts:5`, sección checkout de `references/mcp.md:33,40`). (c) Verifier verde (abajo).
- **Diff revisado (8 archivos, +47/-16):** `pack_npm.mjs` (+evals en files/cpSync/guarda, comentario feature 98), `mcp.ts:129,999`, `upgrade_harness.ts:339,572` (PROG), `scaffold.sh:177`, `references/toolbox.md` (loop + hook post_run portable — mejora real: el hook ya no arrastra path del checkout), `references/mcp.md`, `test_init.sh` T33, `test_npm_pack.sh` (+canonicalización tmpdir macOS, fix preexistente documentado).
- **C3/C4:** sin dependencias nuevas; módulos tocados cubiertos por test_npm_pack (17/17), test_evals (8/8), test_init (33/33), test_mcp.js (33/33), test_upgrade (15/15). Suite completa `tests/run_tests.sh`: ALL SUITES PASSED. `./init.sh`: VERIFIER: all gates passed. El output de drift ya muestra el mensaje nuevo (`apply: npx handyman-harness@3 upgrade_harness ...`).
- **Desviaciones del brief (aceptadas):** `mcp.ts:999` incluida por la misma regla del grep; forma `npx handyman-harness@3 <verb>` en strings TS y `npx -y …` en docs/scripts, consistente con el estilo previo.

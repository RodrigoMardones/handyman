---
type: Review Log
feature: panel_agent_runner
status: approved
role: reviewer
updated: 2026-07-20
actor: reviewer-subagent (sonnet, delegado por el leader)
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/panel_agent_runner]
---

# Review: panel_agent_runner

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

None.

## Evidence

Revision independiente con lupa de seguridad (es la primera ruta del panel
que spawnea un proceso), contra los 5 acceptance de la feature 70 y
CHECKPOINTS C1-C4:

- Prompt 100% server-side: `buildRunPrompt` solo interpola un nombre que ya
  paso `RUN_FEATURE_RE`, byte-identico al `FEATURE_NAME_RE` de
  `featureWrite.ts` (verificado por grep, no por comentario). Spawn con
  argv array, sin `shell: true`. `root` exige match exacto (`===`) contra
  el registry: sin traversal posible. Caso `../evil` probado -> 422.
- Orden real de guardas: disabled -> root -> regex de feature ->
  concurrencia -> pending (el filesystem se toca recien al final).
- DELETE tambien exige el opt-in (403 sin `TOOLBOX_RUNNER=1`).
- Stop con SIGTERM al grupo (`detached: true` + `kill(-pid)`), probado en
  vivo contra un fixture con `sleep 30`.
- `./init.sh` exit 0: `ALL SUITES PASSED`, `test_web_run.sh` 13/13,
  `shellcheck` exit 0, `/api/run` en la tabla de rutas del build. Sin
  procesos `toolbox.js serve` ni `claude -p` vivos antes ni despues.
- business.md/architecture.md/verification.md declaran limites que el
  codigo refuerza de verdad (apagado por defecto, un run a la vez, no
  elige ni encadena features, solo roots del registry).
- No bloqueante, nombrado para una feature futura: warning de Turbopack
  "unexpected file in NFT list" con trace `next.config.ts ->
  lib/runner.ts -> api/run/route.ts`; build verde igual. Registrado en el
  log de `progress/current.md` de esta sesion.
- Nit corregido en el impl report: la prosa describia la guarda `pending`
  antes que la de concurrencia; el codigo las aplica al reves.

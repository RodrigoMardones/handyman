---
type: Review Log
feature: web_exp_revision
status: approved
role: reviewer
updated: 2026-07-20
actor: reviewer-subagent (sonnet, delegado por el leader)
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/web_exp_revision]
---

# Review: web_exp_revision

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

Revision independiente sobre el working tree (rama `feat/usage`, cambios sin
commitear), contra los 3 acceptance de la feature 69 y CHECKPOINTS.md:

- `apps/web/app/page.tsx` es `redirect("/fleet")`; landing, `page.module.css`
  y `ScrollReveal.{tsx,module.css}` eliminados. `layout.tsx` ya no narra la
  landing como presente.
- `HTML_CSP_HEADER` eliminado de `packages/toolbox-core/src/state.ts`;
  `next.config.ts` aplica `CSP_HEADER`; dist recompilado sin rastro.
- `test_toolbox_serve.sh`: TS0 (host guard contra `/fleet`), TS1 (307/308 +
  `Location /fleet` + contrato estructural contra el body seguido), TS6b
  (CSP sin `picsum` en `/timeline`, `/fleet`, `/api/state`) pasan en vivo.
- `run_tests.sh` sin `test_web_landing.sh`; busqueda de referencias rotas a
  lo eliminado: solo hits historicos legitimos (history, backlog, sprints);
  ningun doc describe comportamiento actual falso.
- `explore_web_ux_mejoras.md` cubre navegacion (N1, N2), jerarquia (J1-J3)
  y panel-como-agente (A1, A2), todas nombradas, ninguna construida.
- `./init.sh` exit 0: 35 suites, todas `0 failed`; observer suite 40/40;
  `shellcheck -S warning` exit 0; build de Next lista `/` prerendered y
  `/fleet` en la tabla de rutas.
- CHECKPOINTS C1-C4 OK; C5 (cierre de sesion) queda para el leader tras
  esta aprobacion.

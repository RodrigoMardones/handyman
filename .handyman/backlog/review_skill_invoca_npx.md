---
type: Review Log
feature: skill_invoca_npx
status: approved
role: reviewer
actor: agente-local (reviewer subagent)
updated: 2026-07-19
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/skill_invoca_npx]
---

# Review: skill_invoca_npx

## Verdict

APPROVED

## Stage 1: Spec Compliance

_Review the change against the feature request and its acceptance criteria first. A Stage 1 failure ends the review: report CHANGES_REQUESTED without moving to Stage 2, so spec drift is never buried under style feedback._

- [x] Aceptación 1 — cero referencias a `node dist/` en SKILL.md y references/
  - Evidencia: `grep -rn 'node dist/' handyman/SKILL.md handyman/references/` → 0 hits (exit 1).
  - Conservación deliberada y documentada en el impl report: `node handyman/dist/toolbox.js`
    en toolbox.md (contexto "run from the skill repo") no matchea el criterio literal.
- [x] Aceptación 2 — instalación fresca en dir limpio corre preflight y feature add
  - Evidencia: `bash handyman/scripts/scaffold.sh local <tmpdir>` → exit 0;
    desde el tmpdir `npx -y handyman-harness@3 preflight --root .` → exit 0
    (`status: warn` por NOTEs de scaffold sin rellenar, contrato preflight);
    `npx -y handyman-harness@3 feature --root . add --name r1 --title R1 --description d --acceptance ok`
    → `added feature 2 'r1' (pending)` + `status: ok`.
- [x] Verbos válidos — verbos usados en docs ⊆ CLI publicado
  - Evidencia: `grep -rhoE 'handyman-harness@3 [a-z_]+' handyman/SKILL.md handyman/references/ | sort -u`
    → backlog, evals, feature, index_md, preflight, sprint, tools_discovery,
    update_harness, upgrade_harness, validate_harness — los 10 están en `VERBS`
    de `handyman/scripts/pack_npm.mjs` (que además trae metrics y toolbox).
- [x] Drift toolbox.md contratado en la descripción — **RESUELTO en re-review**
  - La descripción de la feature 65 pide corregir el drift porque
    `assets/toolbox_panel.js` **ya no existe** (verificado: no está en `handyman/assets/`).
  - Primera pasada: la sección "Observer (`toolbox serve`)" (línea 77) aún
    atribuía el frontend vigente al archivo retirado → CHANGES_REQUESTED.
  - Fix aplicado y re-verificado: `grep -n 'toolbox_panel.js' handyman/references/toolbox.md`
    → solo líneas 77 y 158, **ambas** menciones históricas de retiro:
    - 77: "standalone build; the legacy `assets/toolbox_panel.js` was retired). Views:"
      (el frontend ahora se atribuye al panel Next unificado `apps/web`)
    - 158: "`toolbox serve`; the legacy `assets/toolbox_panel.js` was retired)"
  - El doc queda internamente consistente y alineado con el impl report.
- [x] El cambio se mantiene dentro del scope declarado (swap mecánico + drift + tokens de tests)
- [x] El implementation report existe y coincide con el diff (tras el fix de la
  línea 77, también en la afirmación sobre la atribución del panel)

## Stage 2: Code Quality

_Stage 1 pasa tras el fix; calidad evaluada al nivel del cambio (swap mecánico
de docs + tokens de tests)._

- [x] Arquitectura respetada: instrucciones en la skill, ejecutables en npm;
  pineo por major (`@3`); verbo 1:1 con el dispatcher `cli.ts`
- [x] Convenciones respetadas: conservaciones deliberadas documentadas
  (`node handyman/dist/toolbox.js` en contexto skill-repo; guards por existencia
  en `init.template.sh`); mejora futura nombrada, no construida (ponytail)
- [x] Tests significativos y verdes: `node tests/test_docs.js` → 219 run,
  219 passed, 0 failed (re-corrido tras el fix; tokens npx al nivel del cambio)
- [x] Verifier: `./init.sh` → exit 0, status: ok (re-corrido tras el fix)

## Required Changes

1. ~~`handyman/references/toolbox.md:77` — la sección "Observer (`toolbox serve`)"
   no debe presentar `assets/toolbox_panel.js` como frontend vigente.~~
   **RESUELTO**: la línea 77 ahora atribuye el frontend al panel Next unificado
   (`apps/web`, standalone) y deja el panel legado solo como retiro histórico,
   alineada con la línea 158. Re-verificado: grep (2 menciones, ambas de retiro),
   `node tests/test_docs.js` → 0 failed, `./init.sh` → exit 0.

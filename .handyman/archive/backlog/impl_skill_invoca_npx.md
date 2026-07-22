---
type: Implementation Log
feature: skill_invoca_npx
status: implemented
role: implementer
actor: agente-local (leader/implementer)
updated: 2026-07-19
tags: [handyman/role/implementer, handyman/feature/skill_invoca_npx]
---

# Implementation Report: skill_invoca_npx

Segunda mitad del canal npm (la 64 publicó `handyman-harness@3.0.0`): la skill
deja de ordenar `node dist/*.js` (roto fuera del monorepo: dist/ gitignoreado)
y pasa a `npx handyman-harness@3 <verbo>` con major pineado. Separación de
responsabilidades: la skill lleva instrucciones; el toolchain ejecutable vive
en npm.

## Files Changed

- `handyman/SKILL.md` y `handyman/references/*.md` — swap mecánico
  `node dist/<verbo>.js` → `npx handyman-harness@3 <verbo>` (regex, 12 verbos).
  Resultado: **cero** `node dist/` en SKILL.md + references/ (aceptación 1).
- `handyman/assets/feature-request.template.md`, `sprint.template.md`,
  `init.template.sh` — mismo swap. Los assets se instancian en workspaces de
  repos ajenos donde `dist/` no existe; sin esto el canal no queda ejecutable
  de punta a punta. En `init.template.sh` solo cambian los *hints* al operador
  (echos/comentarios); las invocaciones reales quedan intactas porque están
  guardadas por existencia (`[ -f "$PROJECT_ROOT/dist/..." ] || return 0`).
- `handyman/references/toolbox.md` — drift contratado: la sección Observer UI
  ya no atribuye el panel a `assets/toolbox_panel.js` (retirado); el observer
  es el panel Next unificado (`apps/web`) servido por `toolbox serve`.
- `tests/test_docs.js` — tokens actualizados a la forma npx (anatomy readiness,
  unattended loop, description gate en workflow/examples/feature-request) y
  `tools_discovery.js` → `tools_discovery` en el check de discovery.md.

Se conservan a propósito: `node handyman/dist/toolbox.js ...` en toolbox.md
(contexto "run from the skill repo", donde el dist local sí existe) y las
rutas guardadas `$PROJECT_ROOT/dist/*.js` dentro de `init.template.sh`.

## Design Notes

- Pineo por major (`@3`) según la descripción de la feature: una instalación
  fresca resuelve siempre un toolchain compatible sin fijar parche.
- El verbo mapea 1:1 al nombre del archivo (`feature.js` → `feature`), igual
  que el dispatcher `cli.ts`; el swap fue una sola regex sin casos especiales.
- Mejora futura nombrada, no construida: `check_preflight`/`run_validate_harness`
  de `init.template.sh` podrían caer a `npx handyman-harness@3` cuando
  `$PROJECT_ROOT/dist/` no existe (hoy se saltan en silencio, comportamiento
  documentado y deliberado).

## Test Output

```text
node tests/test_docs.js -> 219 run, 219 passed, 0 failed
./init.sh -> exit 0 (0 fallos en todas las suites)

Aceptación 1: grep -rc 'node dist/' handyman/SKILL.md handyman/references/ -> 0 hits
Aceptación 2 (instalación fresca en dir limpio, solo instrucciones de la skill):
  scaffold.sh local <dir>                            -> ok
  npx -y handyman-harness@3 preflight --root .       -> status: warn (NOTEs de
     harness recién scaffoldeado sin rellenar; exit 0, contrato preflight)
  npx -y handyman-harness@3 feature --root . add ... -> added feature (pending), status: ok
  npx -y handyman-harness@3 feature --root . ready   -> ready: 2 feature(s), status: ok
```

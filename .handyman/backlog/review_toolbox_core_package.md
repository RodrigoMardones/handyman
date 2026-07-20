---
type: Review Log
feature: toolbox_core_package
id: 42
role: reviewer
date: 2026-07-18
verdict: APPROVED
tags: [handyman/backlog/review]
---

# Review: toolbox_core_package (feature 42)

Contraste de [[impl_toolbox_core_package]] contra la acceptance de la feature
42, `CHECKPOINTS.md` y `docs/architecture.md` / `docs/conventions.md`.

## Acceptance, punto por punto

1. **Paquete + tsc -b + workspace:*** — `packages/toolbox-core/` existe con
   `composite: true`; `npm run build` en handyman compila ambos (verificado:
   `dist/` con .js + .d.ts + maps en los dos proyectos). OK.
2. **Shims con dist/ estable** — `dist/toolbox_llm|draft|ask|summary.js` y
   `dist/core/workspace.js` existen; `test_toolbox_llm.js` 25/25 y
   `test_toolbox_draft.js` 24/24 **sin editar**. OK.
3. **serve consume paquete; exports ./state; web typecheck** — imports de
   `toolbox_serve.ts` apuntan a `@handyman/toolbox-core/state` +
   `./toolbox_state.js`; `handyman/package.json` expone `"./state"`;
   `pnpm --filter @handyman/web typecheck` verde con
   `lib/toolboxCore.ts` importando el paquete. OK.
4. **Suite nueva cableada** — `tests/test_toolbox_state.js` 17/17, en
   `run_tests.sh`. Cubre fixture temporal (corpus, allowlist, tags),
   identidad `LlmError`, shape `buildState`. OK.
5. **Oraculo intacto** — `test_toolbox_serve.sh` 48/48, cero aserciones
   editadas. OK.
6. **CI pnpm** — workflow instala workspace con pnpm (action-setup lee
   `packageManager`), `--frozen-lockfile` validado localmente, npm lockfile
   eliminado. Nota: la corrida real de GitHub Actions solo puede observarse
   en el push; el riesgo residual es bajo (mismos comandos locales). OK con
   nota.
7. **Gates** — `bash tests/run_tests.sh` 20/20 suites; `./init.sh` exit 0
   ("VERIFIER: all gates passed"). OK.

## CHECKPOINTS

- C1/C2: workspace resuelve; una sola in_progress (la 42); estado coherente.
- C3: capas respetadas y documentadas (architecture.md actualizado en la
  misma feature); **cero dependencias nuevas** (minisearch ya era dep;
  typescript/@types/node son devDeps espejo del paquete).
- C4: tests cubren lo cambiado (suite nueva 17 casos + 48 del oraculo como
  red de paridad); verifier muestra >0 tests y todo verde.
- C5: se completa al cierre (history/current) junto a este review.

## Riesgos señalados (no bloqueantes)

- La corrida CI real queda pendiente del proximo push (mitigado con
  frozen-lockfile local).
- `buildDraftSystem` cambio de firma en el paquete (param requerido); el
  shim preserva el default historico, y ningun consumidor externo existe
  aun. Documentado en el impl report.

**Veredicto: APPROVED** — la feature cumple su acceptance con el oraculo y
el verifier en verde.

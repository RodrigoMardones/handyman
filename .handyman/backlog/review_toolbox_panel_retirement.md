---
type: Review Log
feature: 49
role: reviewer
status: approved
updated: 2026-07-18
tags: [handyman/backlog/review]
---

# Review: toolbox_panel_retirement (#49)

## Verdict

**APPROVED.** La feature retira el panel UMD legacy de forma limpia, sin
tocar la superficie CLI ni los endpoints read-only, y re-apunta el oraculo
caso a caso con evidencia. El verificador cierra verde y la corrida dual
documenta honestamente el carve-out restante de `GET /`.

## CHECKPOINTS (docs/verification.md + CHECKPOINTS.md)

- **C1 - Harness Complete.** OK. Archivos requeridos presentes; verifier
  `./init.sh` -> `status: ok, exit 0`; `HARNESS_WORKSPACE` = `.handyman`.
- **C2 - State Coherent.** OK. Una sola feature `in_progress` (49); las
  mutaciones de estado pasaron por `node dist/feature.js start` (no edicion
  a mano); `progress/current.md` describe la sesion activa.
- **C3 - Architecture Respected.** OK. Los cambios matchean
  `docs/architecture.md` (actualizado en la misma feature). No hay deps
  nuevas: al contrario, se PODAN 6. No hay debug prints. Las deps retiradas
  de handyman viven en apps/web/packages-toolbox-core con sus propias
  declaraciones.
- **C4 - Verification Real.** OK. Tests cubren los modulos cambiados
  (`test_toolbox_serve.sh` re-apuntado, `test_web_*.sh` cubren los
  equivalentes migrados). Verifier output: `run_tests.sh` ALL SUITES PASSED;
  oraculo default 27/27.
- **C5 - Session Closed.** Pendiente del cierre formal (este review habilita
  `feature.js done`).

## Acceptance criteria (feature_list.json #49)

1. **`toolbox_panel.js` y `panelHtml`/`PANEL_CSS` eliminados; `/` placeholder;
   `/vendor` solo vis-network.** OK. Asset borrado; 0 referencias a
   `panelHtml`/`PANEL_CSS`/`PANEL_JS_PATH` en `toolbox_serve.ts`; `vendorFiles`
   reducido a `vis-network.js`; `GET /` sirve `PANEL_RETIRED_HTML` (CSP-safe
   via `send()`). grep confirma.
2. **react/react-dom/htm eliminados de handyman/package.json
   (marked/dompurify/minisearch solo si nadie las usa Node-side); pnpm-lock
   actualizado.** OK. Las 6 deps = 0 en `handyman/package.json`; grep confirma
   0 imports Node-side de las 6 en `handyman/src/**/*.ts` (justifica tambien
   marked/dompurify/minisearch, que solo se referenciaban como strings
   /vendor y panelHtml); `pnpm install` reporta "Packages: -6".
3. **Casos del oraculo re-apuntados en la misma feature (cambio deliberado
   documentado caso a caso, incluido el de CSP que golpea `/`); el resto
   sin editar.** OK. 48 -> 27 casos. 21 retirados con puntero al equivalente
   `test_web_*.sh`, 2 re-apuntados (placeholder + vendors), 1 mantenido
   (CSP), 24 intactos. Cada retiro lleva comentario documental.
4. **Corrida dual contra Next verde con el conteo nuevo documentado en
   `docs/verification.md`; decision D6 registrada.** OK con matiz honesto:
   - Default (Node): **27/27**.
   - Dual (Next standalone 3210 -> Node 8765): **25/27**. Los 2 fallos son
     el carve-out reducido de `GET /` (placeholder + CSP): contra Next `/`
     es la landing con su propio CSP, divergencia intencional durante el
     strangler. `docs/verification.md` documenta el conteo nuevo (27), el
     mapeo caso-a-caso, y el carve-out de 2 (baja de los 6 pre-49). D6
     registrada: `/` unificada = landing de apps/web; placeholder del Node
     es transitorio hasta feature 50.
5. **`bash tests/run_tests.sh` y `./init.sh` exit 0.** OK. Ambos verdes.

## Anti-patterns check

- No se marcaron `done` con tests en rojo: run_tests + init verdes, oraculo
  27/27 default.
- No se "adapto" el test para pasar rompiendo paridad: el re-apuntado es
  deliberado y documentado (la feature lo exige), y los 24 casos intactos
  preservan el contrato black-box.
- No se mockeo nucleo ni se edito `feature_list.json` a mano.
- No se introdujeron deps externas (se eliminaron 6).

## Riesgos residuales (no bloqueantes)

- El carve-out dual de `GET /` (2 casos) se resuelve en feature 50 cuando el
  server Node se decomisiona. Documentado, no sorpresa.
- `proxy.ts` no se toco (forward del strangler intacto); correcto segun el
  plan (la 50 lo poda).

## Evidencia

- `backlog/impl_toolbox_panel_retirement.md` (reporte implementador).
- `docs/verification.md` seccion "Panel retirado desde toolbox_panel_retirement".
- Salidas de gate: `run_tests.sh` ALL SUITES PASSED; `./init.sh` status: ok
  exit 0; oraculo default 27/27; dual Next 25/27.

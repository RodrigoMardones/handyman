---
type: Implementation Log
feature: toolbox_next_intake_action
id: 46
role: implementer
date: 2026-07-18
verdict: implemented
tags: [handyman/backlog/impl]
---

# Impl: toolbox_next_intake_action (feature 46)

La unica escritura del sistema queda unificada detras de UNA funcion core
con tres consumidores: el observer Node, el route handler nativo de Next y
el server action. Aqui entran formalmente los server actions a la app
unificada (y deliberadamente SOLO aqui: la superficie publica sigue en
route handlers para el oraculo black-box).

## Piezas

- `packages/toolbox-core/src/intake.ts` (nuevo): `writeIntake(hroot, root,
  draftMd, fileRels)` con resultado discriminado (orden de validacion
  identico al observer: root requerido -> draft vacio -> root registrado ->
  workspace -> escritura; footer de files capado a TAG_MAX_IN_DRAFT) e
  `intakeHttp(result)` (mapeo 400/422/500/200 con bodies byte-identicos,
  incluido `spawned_process: false`). Export en el barrel y subpath
  `./intake`.
- `handyman/src/toolbox_serve.ts`: handleIntakeRequest reducido a parseo de
  body (cap INTAKE_MAX_BYTES) + `intakeHttp(writeIntake(...))`; el serve ya
  NO escribe disco directamente (import writeFileSync eliminado).
- `apps/web/app/api/intake/route.ts`: POST force-dynamic, mismo cap y
  mismo mapeo compartido; proxy.ts roba `/api/intake`.
- `apps/web/actions/intake.ts`: `"use server"` + `submitIntake(root,
  draftMd, files)` sobre la MISMA funcion core via el runtime singleton,
  con el mismo cap de 256 KB; el consumidor UI llega en la feature 48.
- Tests: `test_toolbox_state.js` gana T7 (3 checks: escritura+footer, orden
  de validacion, mapeo HTTP; 20/20) y `tests/test_web_intake.sh` (5 casos
  estructurales: route, action, una-sola-funcion sin writeFileSync en
  serve, strings exactos, strangler). run_tests.sh queda en 24 suites.
- `docs/verification.md`: parrafo de la feature.

## Verificacion

- `./init.sh` exit 0 (24 suites OK); oraculo default (Node) 48/48 sin
  editar aserciones (serve refactorizado byte-identico).
- Corrida dual real: oraculo `TOOLBOX_BASE_URL` -> Next **42/48**, los 6
  fallos siguen siendo exactamente el carve-out de `GET /`; los 4 casos de
  intake pasan servidos NATIVAMENTE, incluida la escritura real de
  feature-request.md con el footer de files a traves del route handler de
  Next. `/api/state` parity IDENTICAL re-verificada.
- typecheck + next build verdes; biome limpio en los archivos tocados.

## Notas

- Con la 46, lo UNICO que queda del server Node como exclusivo es el panel
  UMD de `GET /` (muere en la 49); la 50 decomisiona el proceso.
- El action devuelve mensajes espejo de los errores HTTP para que la UI de
  la 48 no invente un segundo vocabulario.

---
type: Implementation Log
feature: panel_agent_runner
status: implemented
role: implementer
updated: 2026-07-20
tags: [handyman/role/implementer, handyman/feature/panel_agent_runner]
---

# Implementation Report: panel_agent_runner (70)

A2 del informe UX (`explore_web_ux_mejoras.md`): el panel dispara una sesion
de agente sobre una feature. Decisiones del operador (2026-07-20): motor
`claude` CLI headless, `--dangerously-skip-permissions`, alcance todo el
registry, runner apagado por defecto con opt-in `TOOLBOX_RUNNER=1`.

## Files Changed

- `apps/web/lib/runner.ts` (nuevo) — el runner: guardas en orden (opt-in por
  request, root del registry via `isRegisteredRoot`, nombre de feature
  `^[A-Za-z0-9_-]+$`, un run global a la vez, y recien entonces feature
  `pending` en el `feature_list.json` del workspace objetivo — la
  concurrencia se chequea antes de tocar el filesystem), prompt server-side
  (nada tipeado en el browser llega al hijo; spawn con argv array, sin
  shell), `detached: true` para poder matar el grupo de procesos completo,
  log en `<workspace>/progress/run-<feature>.log` del harness OBJETIVO (el
  fs.watch del runtime ya lo cubre: cada escritura es un tick de /events).
  `TOOLBOX_RUNNER_CMD` es el seam de tests: mismo argv, otro binario.
- `apps/web/app/api/run/route.ts` (nuevo) — GET estado, POST lanza, DELETE
  detiene (SIGTERM al grupo). Primera ruta cuyo exito responde
  `spawned_process: true` (inversion declarada del `false` pinneado de
  /api/feature). Mapeo HTTP calcado de app/api/feature/route.ts: 403
  disabled, 400 root, 422 feature, 409 concurrencia, 500 spawn.
- `apps/web/components/RunPanel.tsx` + `RunPanel.module.css` (nuevos) —
  hermano React de HarnessLive (nunca innerHTML inyectado: leccion del
  clobber de /search). Sin polling: refetch de /api/run en cada tick de
  /events (el footer de exit garantiza un tick final). Apagado, solo
  muestra el hint del opt-in.
- `apps/web/app/harness/[name]/page.tsx` — monta RunPanel con root, pending
  y el flag leido por request (force-dynamic).
- `tests/test_web_run.sh` (nuevo, 13 casos) + `tests/run_tests.sh` — dos
  boots (TOOLBOX_RUNNER=0 y =1+fixture). Detalle real encontrado: Next
  auto-carga `apps/web/.env` en el standalone y el opt-in del operador ahi
  se filtraba al boot "apagado"; el boot A fuerza `TOOLBOX_RUNNER=0`
  explicito porque el env real gana sobre `.env`.
- `.handyman/docs/business.md` — reescritura declarada del limite "no es un
  runner" (la clausula anticipaba exactamente este dia): el panel ES un
  runner con limites (humano dispara cada run, apagado por defecto, un run
  a la vez, no elige ni encadena features, solo roots del registry).
- `.handyman/docs/architecture.md` — superficie de escritura honesta
  (intake + feature + run con opt-in) en las dos secciones que la narraban.
- `.handyman/docs/verification.md` — seccion del runner (los dos boots y el
  fixture) + nota en Anti-patterns distinguiendo el spawn del run del
  no-spawn del intake.

## Design Notes

- Un solo run global: el panel expone la disciplina del harness (una feature
  a la vez), no la multiplica.
- El log en el workspace objetivo mantiene "disk is the source of truth":
  la evidencia del run queda en el harness donde corrio, visible como vault.
- Durante el desarrollo un boot de prueba spawneo un `claude` real (por el
  `.env` auto-cargado); se mato el proceso y el caso quedo cubierto por el
  boot A forzado a 0. Ningun test spawnea un agente real.

## Verification

- `bash tests/test_web_run.sh`: 13/13 PASS (incluye: 403 antes de toda otra
  guarda, argv con prompt + flag probado desde el log, 409, SIGTERM).
- `./init.sh` completo debe salir 0 (build incluye /api/run en la tabla de
  rutas).

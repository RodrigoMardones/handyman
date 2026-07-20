---
type: Review Log
feature: runner_observer
status: approved
role: reviewer
updated: 2026-07-20
actor: reviewer-copilot-run72-rereview
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/runner_observer]
---

# Review: runner_observer

## Verdict

APPROVED

## Stage 1: Spec Compliance

Los 7 acceptance de la feature 72 (`.handyman/feature_list.json`, id 72), uno
por uno contra el codigo real:

1. **RUNNER_ENGINES + GET/POST engine.** `apps/web/lib/runner.ts:88-107`
   define `RUNNER_ENGINES` como tabla declarativa (`{id,label,available,
   childEnv,unavailableHint}`), `claude` siempre disponible
   (`available: () => true`, `childEnv: () => ({})`), `glm` disponible sii
   `Z_AI_API_KEY` no vacio, con `childEnv` armando
   `ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic`,
   `ANTHROPIC_AUTH_TOKEN=<Z_AI_API_KEY>`,
   `ANTHROPIC_MODEL=<Z_AI_MODEL ?? "glm-5.2">` (linea 100-104, matchea el
   acceptance byte a byte). `GET /api/run` devuelve `engines` via
   `listEngines()` (route.ts:66, runner.ts:115-121). `POST` con `engine`
   desconocido -> `unknown_engine` (422, route.ts:47); `engine` conocido
   pero no disponible -> `engine_not_available` con el hint (422,
   route.ts:49). Verificado en vivo: `GET /api/run` con `Z_AI_API_KEY`
   vacio devuelve `glm.available=false`; con la key seteada, `true`. PASS.
2. **Env saneado del child.** `sanitizedBaseEnv()` (runner.ts:138-152 tras
   el fix) excluye `NODE_ENV`, cualquier prefijo `NEXT_`/`__NEXT_` y los
   secretos de engine (`ENGINE_SECRET_ENV_KEYS`, hoy `Z_AI_API_KEY`) antes
   de componer `childEnv = {...sanitizedBaseEnv(env),
   ...engine.childEnv(env)}`. Verificado con el fixture
   `TOOLBOX_RUNNER_CMD` volcando su env real al log en disco (boot C de
   `test_web_run.sh`, casos "engine=claude child env is sanitized" y
   "engine=glm child env carries the three ANTHROPIC_* vars"): ni
   `NODE_ENV` ni `NEXT_*`/`__NEXT_*` ni `Z_AI_API_KEY` llegan al hijo de
   `claude`; el hijo de `glm` recibe las tres `ANTHROPIC_*`. PASS.
3. **Runs history.** `RunHistoryEntry`/`store.history` (runner.ts:141-198,
   351-361), cap `RUN_HISTORY_CAP=20` documentado en un comentario (linea
   49-51), `GET /api/run` expone `runs` (runnerStatus, linea 406-432) y
   `RunPanel.tsx:242-259` renderiza la lista "Runs" con feature/engine/fase.
   Verificado en vivo: tras dos runs (`beta`, `delta`), `runs[0].feature ==
   "delta"` y `runs[1].feature == "beta"`, ambos `phase:"exited"` (orden
   most-recent-first). PASS.
4. **mode continue.** `StartRunOptions.mode` (runner.ts:261-264),
   `buildContinuePrompt` (linea 220-228) interpola solo el `feature` ya
   validado por `RUN_FEATURE_RE` -- mismo contrato que `buildRunPrompt`.
   Guard: `mode:"continue"` exige `in_progress` (linea 308-311), el `start`
   por default sigue exigiendo `pending` (linea 312-313); los 403/409/422
   preexistentes (disabled, run_in_progress, invalid_feature) se preservan
   sin tocar su orden relativo. `RunPanel.tsx` ofrece "Continue" solo
   cuando `status.phase === "exited"` (linea 120, 222-226) y muestra
   fase/exit/log tail (`status`, `log_tail`, ya existian; extendidos con
   `engine`). Verificado en vivo (ver Evidence): `mode:"continue"` sobre
   `beta` (pending) -> 422; sobre `epsilon` (in_progress) -> lanza, log
   contiene "RETOMALA" + "epsilon"; `start` normal sobre `epsilon` sigue
   422. PASS.
5. **formatFeatureName.** `apps/web/lib/featureName.ts` exporta la funcion
   pura (sin JSX/React) descrita: minusculas, NFD + strip de diacriticos
   combinantes, `[^A-Za-z0-9_-]` -> `_`, colapso y trim de `_`. Siempre
   matchea `^[A-Za-z0-9_-]*$`. `NewFeatureForm.tsx` la consume en un
   `useEffect` (linea 105-109) gateado por el flag `nameEdited` (linea 62,
   206), y el input de `name` sigue con `pattern="[A-Za-z0-9_\-]+"`
   (linea 210). Verificado leyendo el codigo: el `onChange` del input de
   name setea `nameEdited(true)` ANTES de `setName`, asi que una edicion
   manual apaga la auto-derivacion de inmediato; el flag se resetea solo
   en submit exitoso (linea 176). PASS.
6. **Cobertura de tests.** `test_web_run.sh` cubre engines (lista, 422
   engine desconocido, glm no disponible con hint), env saneado del child
   (via el log EN DISCO del fixture, no el `log_tail` capado -- decision
   correcta, ver Design Notes del impl report), `mode continue` (ambos
   guards + prompt en argv) y runs history; ningun caso llama a la red
   real (Z.ai nunca se golpea: `engine=glm` solo cambia que env vars recibe
   el FIXTURE). `test_web_new_feature.sh` cubre `formatFeatureName` con un
   transpile+require aislado (sin boot de Next) incluyendo un caso con
   diacriticos reales ("Añadir Métricas" -> "anadir_metricas"). Ambas
   registradas en `tests/run_tests.sh` (lineas 75-76, ya lo estaban desde
   la feature 70/71). PASS.
7. **Verificador.** `bash tests/run_tests.sh` y `./init.sh`, corridos por
   mi con el env saneado (ver Evidence): ambos exit 0. PASS.

**Scope.** Los archivos tocados por esta feature son exactamente los
declarados: `apps/web/lib/runner.ts`, `apps/web/lib/featureName.ts` (nuevo),
`apps/web/app/api/run/route.ts`, `apps/web/components/RunPanel.tsx` +
`.module.css`, `apps/web/components/NewFeatureForm.tsx`,
`tests/test_web_run.sh`, `tests/test_web_new_feature.sh`. `packages/
toolbox-core/` y `handyman/` estan intactos para esta feature (los cambios
`M` que aparecen ahi en `git status` son de features previas ya cerradas,
ver `git diff` -- ninguno menciona runner/engine/formatFeatureName). El
diff de `apps/web/app/harness/[name]/page.tsx` es 100% de las features 70
(wiring de `RunPanel`) y 71 (link "New request", ya en `done`/`blocked`
respectivamente), no de esta feature -- confirmado leyendo el diff completo,
sin una sola linea que toque engine/mode/history.

- [x] Every acceptance criterion is satisfied
- [x] The change stays inside the feature's declared scope
- [x] The implementation report exists and matches what changed

Stage 1 pasa completo. En Stage 2 la primera pasada encontro un hallazgo
de seguridad (abajo, marcado RESUELTO en fix round 1).

## Stage 2: Code Quality

**Arquitectura -- guards del runner.** Verificados los cuatro, no solo
leidos:

- Opt-in `TOOLBOX_RUNNER=1` sigue siendo la primera guarda (`runnerEnabled`
  chequeado antes que nada mas, runner.ts:273-275); `POST` sin el opt-in
  es 403 antes de cualquier otra validacion (probado en vivo, boot A).
- Allowlist de registry: `isRegisteredRoot(hroot, root)` intacto
  (linea 279), un root fuera del registry sigue dando 400.
- Prompt server-side: `buildRunPrompt`/`buildContinuePrompt` interpolan
  UNICAMENTE el `feature` que ya paso `RUN_FEATURE_RE` (linea 47, 282).
  `buildRunCommand` devuelve `{cmd, args}` como arreglo (linea 231-239);
  `spawn(cmd, args, {...})` sin `shell: true` en ningun lado (grep
  confirmado). Nada tipeado en el browser llega al argv salvo ese nombre
  ya validado.
- Un run global: `store.current !== null && store.current.exit === null`
  sigue devolviendo `run_in_progress` (409), verificado en vivo (delta
  corriendo -> segundo POST 409).
- 422 de engine ANTES de spawn y de escribir el log: en `startRun`, los
  checks `unknown_engine`/`engine_not_available` (linea 287-291) ocurren
  ANTES de `resolveWorkspace`, `findFeatureStatus`, `mkdirSync`/
  `appendFileSync` y `spawn` (que arrancan recien en la linea 297+).
  Confirmado leyendo el orden real de las guardas, no la prosa del reporte.
- Historial en memoria: `globalThis.__handymanToolboxRunner` (linea
  191-193), mismo patron singleton que ya usaba `store.current` en la
  feature 70 -- no introduce un segundo store paralelo. Cap `RUN_HISTORY_CAP
  = 20` documentado en un comentario explicito sobre la constante.

**Hallazgo de la primera pasada (RESUELTO en fix round 1):
`Z_AI_API_KEY` llegaba al child del engine `claude`.** La version
original de `sanitizedBaseEnv()` solo excluia `NODE_ENV` y los prefijos
`NEXT_`/`__NEXT_`; `Z_AI_API_KEY` -- un secreto real usado para
autenticar contra la API de Z.ai (`packages/toolbox-core/src/llm.ts:337`,
`apiKeyEnvKey: "Z_AI_API_KEY"`) -- pasaba sin filtrar al child de
`claude` (el engine DEFAULT), que no lo necesita. Lo reproduje en vivo
fuera de la suite en la primera pasada (log del fixture con
`Z_AI_API_KEY=<valor>` en el env real del hijo), y el caso de boot C no
assertaba su ausencia: exactamente el punto de atencion que esta review
tenia mandato de verificar, y fallaba.

**Fix verificado (re-review).** `apps/web/lib/runner.ts` agrega
`ENGINE_SECRET_ENV_KEYS` (Set, hoy solo `Z_AI_API_KEY`; runner.ts:123-128)
con un comentario que fija la regla: los secretos de engine nunca viajan
en la base saneada, cada `childEnv()` inyecta el suyo. `sanitizedBaseEnv`
lo excluye junto a `NODE_ENV`/`NEXT_*`/`__NEXT_*` (runner.ts:141-148) y
`glm.childEnv` sigue leyendo `env.Z_AI_API_KEY` del env del SERVIDOR
(no de la base saneada), reinyectandolo solo como `ANTHROPIC_AUTH_TOKEN`
cuando glm es el engine elegido (runner.ts:100-104, intacto). Mantiene el
patron declarativo: cero ramas por id. `tests/test_web_run.sh` boot C,
caso claude, suma la asercion negativa `! grep -qE '^Z_AI_API_KEY='`
sobre el log EN DISCO, con comentario; el par se auto-valida porque el
server bootea con `Z_AI_API_KEY=zai-test-key-123` pinneada y el caso glm
prueba que ESE valor si llega como `ANTHROPIC_AUTH_TOKEN=zai-test-key-123`
-- la ausencia en el caso claude es significativa, no un pase en vacio.
Corrido por mi con env saneado: 24/24. El unico otro archivo tocado por
el fix es el propio impl report (seccion "Fix round 1"); `git status`
byte-identico al de mi primera pasada -- ningun cambio nuevo fuera de
scope.

**Convenciones y resto de Stage 2.** Patron declarativo respetado
(`RUNNER_ENGINES`/`startRun` no ramifican por id en ningun punto nuevo);
naming TS (camelCase/PascalCase/SCREAMING_SNAKE) consistente; comentarios
de intencion sobre la logica no obvia (igual que el resto del modulo).
Tests al nivel de riesgo correcto (boot dedicado para el env dump, lectura
del log EN DISCO en vez del `log_tail` capado -- decision correcta y
explicada). Suites extendidas, no reescritas: las 12 aserciones
preexistentes de la feature 70 (`boot A/B server boots`, `403 antes de
cualquier guarda`, `guards 400/400`, `guards 422/422/422`, `launches...
spawned_process:true`, `phase=exited...argv`, `run log en TARGET
workspace`, `409`, `DELETE SIGTERM`, `DELETE stopped:false`, `RunPanel
heading`) siguen presentes con el mismo texto que documenta
`review_panel_agent_runner.md` (13/13 original); las 12 nuevas se suman,
ninguna reemplaza a una vieja. `tests/run_tests.sh` no cambio (ambas
suites ya estaban registradas).

- [x] Architecture respected
- [x] Security guard verified: `Z_AI_API_KEY` is absent from the `claude`
      child and is translated to `ANTHROPIC_AUTH_TOKEN` only for `glm`
- [x] Conventions respected
- [x] Tests meaningful and green
- [x] Verifier exits 0

## Required Changes

None. The two changes requested in the first review are implemented and
verified independently in this re-review.

## Evidence

Re-review independiente por `reviewer-copilot-run72-rereview`, sobre codigo y
tests reales, no sobre la afirmacion del implementer:

- `apps/web/lib/runner.ts`: `ENGINE_SECRET_ENV_KEYS` contiene
  `Z_AI_API_KEY`; `sanitizedBaseEnv()` la excluye antes de componer el env
  del child. La entrada declarativa `glm.childEnv()` la lee del env del
  servidor y la expone al child exclusivamente como
  `ANTHROPIC_AUTH_TOKEN`. `claude.childEnv()` permanece vacio.
- `tests/test_web_run.sh`: el boot C fija
  `Z_AI_API_KEY=zai-test-key-123`, lee el log completo en disco y aserta
  negativamente `^Z_AI_API_KEY=` para `claude`; el caso `glm` aserta el
  valor traducido en `ANTHROPIC_AUTH_TOKEN`.
- `bash tests/test_web_run.sh`: `24 run, 24 passed, 0 failed`.
- `bash tests/run_tests.sh`: `ALL SUITES PASSED`.
- `./init.sh`: lint, build, harness y test en verde;
  `VERIFIER: all gates passed`.
- `find handyman/scripts tests -name '*.sh' -print0 | xargs -0 shellcheck
  -S warning`: exit 0, sin diagnosticos. El comando legacy del protocolo
  que nombra `scripts/` reporta que esa ruta ya no existe; el alcance vigente
  esta definido en `.handyman/docs/verification.md`.

Los siete criterios de aceptacion pasan. El leak que motivo la primera
revision ya no es reproducible y queda protegido por una asercion negativa
significativa. No quedan cambios requeridos.

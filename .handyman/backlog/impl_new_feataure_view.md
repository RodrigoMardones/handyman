---
type: Implementation Log
feature: new_feataure_view
status: implemented
role: implementer
actor: implementer-copilot-run71-resume
updated: 2026-07-20
tags: [handyman/role/implementer, handyman/feature/new_feataure_view]
---

# Implementation Report: new_feataure_view

## Files Changed

### Encontrados ya implementados al reanudar (sin ediciones en este run)

- `apps/web/app/harness/[name]/new/page.tsx`: ruta dinamica enlazada al harness; resuelve el root registrado y el opt-in del runner en servidor.
- `apps/web/components/NewFeatureForm.tsx`: formulario unico de name/title/acceptance, picker de referencias y cadena secuencial register -> run.
- `apps/web/components/NewFeatureForm.module.css`: estilos locales del formulario y picker, sin assets externos.
- `apps/web/app/harness/[name]/page.tsx`: enlace `New request` hacia `/harness/[name]/new`. El diff tracked del archivo tambien contiene trabajo anterior de las features 69/70 (`brandMark` y `RunPanel`), que no se atribuye a la 71.
- `tests/test_web_new_feature.sh`: 15 casos estructurales, unitarios y black-box para runner off/on, refs y register -> run sin red saliente.
- `tests/run_tests.sh`: alta de `test_web_new_feature.sh`. El diff tracked del archivo tambien contiene cambios anteriores de las features 69/70 (`test_web_landing.sh` y `test_web_run.sh`).

### Superficies existentes reutilizadas (sin cambios)

- `apps/web/app/api/files/route.ts`: GET allowlisted para roots registrados; devuelve rutas relativas mediante `listTagFiles`.
- `apps/web/components/IntakeClient.tsx`: patron existente del picker `/api/files?root=` reutilizado por la vista nueva.
- `apps/web/app/api/feature/route.ts`: acepta `description` y registra la feature validada sin spawnear procesos.
- `apps/web/app/api/run/route.ts`: runner opt-in de la feature 70, consumido despues de registrar cuando el toggle esta activo.

### Editado en este run de reanudacion

- `.handyman/backlog/impl_new_feataure_view.md`: se reemplazo el placeholder por esta evidencia. No se edito codigo de producto, `feature_list.json` ni `progress/`.

## Design Notes

- El chequeo discriminante inicial paso antes de editar; por eso no se aplico un parche de producto.
- El root nunca se escribe a mano: la pagina lo obtiene del estado del registry y `/api/files`, `/api/feature` y `/api/run` vuelven a validarlo.
- Las referencias viajan como una seccion `Refs:` dentro de `description`, con rutas relativas. Sin seleccion se envia `description: null`, por lo que no aparece esa seccion y no cambia el schema.
- La auto-asignacion es deliberadamente client-side y secuencial: `POST /api/run` ocurre solo despues de un `POST /api/feature` exitoso, con `TOOLBOX_RUNNER=1` y el toggle activo.
- Con el runner apagado no se renderiza el toggle; se muestra el hint de `TOOLBOX_RUNNER=1` y registrar una feature no inicia un run.
- Esta entrega no cierra ni revisa la feature. Permanece `in_progress` para que el protocolo externo haga esas etapas.

## Test Output

```text
$ bash tests/test_web_new_feature.sh
Summary: 15 run, 15 passed, 0 failed

$ bash tests/run_tests.sh
apps/web runner:      24 run, 24 passed, 0 failed
apps/web new-request: 15 run, 15 passed, 0 failed
apps/web read-API:     6 run, 6 passed, 0 failed
apps/web feature:     13 run, 13 passed, 0 failed
ALL SUITES PASSED

$ find handyman/scripts tests -name '*.sh' -print0 | xargs -0 shellcheck -S warning
(sin output; exit 0)

$ ./init.sh
ALL SUITES PASSED
test: OK
VERIFIER: all gates passed
preflight: format OK, drift OK, sync OK, discovery OK; exit 0
```

El preflight final emitio NOTEs no bloqueantes preexistentes sobre frontmatter/evidencia historica, skills instaladas no declaradas y `worklist` sin pendientes mientras esta feature permanece `in_progress`. Ninguno altero el exit 0.

## Fix round 1

### Required Changes

1. `apps/web/components/NewFeatureForm.tsx` da al input search de referencias el nombre accesible persistente `Search reference files`.
2. `apps/web/components/NewFeatureForm.module.css` fija el target del boton remover en un minimo de 24x24 CSS px.
3. `apps/web/components/NewFeatureForm.tsx` separa `runPhase` de la fase de registro. Un fallo de lanzamiento usa `styles.error`, `role="alert"` y el mensaje explicito `Feature registered, but agent was not launched: <reason>`; el registro exitoso se conserva como tal.
4. `apps/web/lib/submitNewFeature.ts` contiene la secuencia cliente minima con `fetch` inyectable y es invocada por el `submit` del formulario. `tests/test_web_new_feature.sh` ejecuta esa funcion y prueba que `/api/feature` ocurre primero, que un registro rechazado no llama `/api/run`, y que `/api/run` solo ocurre con registro exitoso, runner habilitado y toggle activo.

### Files Changed

- `apps/web/components/NewFeatureForm.tsx`
- `apps/web/components/NewFeatureForm.module.css`
- `apps/web/lib/submitNewFeature.ts`
- `tests/test_web_new_feature.sh`
- `.handyman/backlog/impl_new_feataure_view.md`

No se agregaron dependencias. No se editaron `feature_list.json`, `progress/` ni el informe de review; la feature 71 permanece `in_progress`.

### Results

```text
$ bash tests/test_web_new_feature.sh  # baseline antes de editar
Summary: 15 run, 15 passed, 0 failed

$ bash tests/test_web_new_feature.sh  # inmediatamente despues del primer edit
Summary: 15 run, 15 passed, 0 failed

$ bash tests/test_web_new_feature.sh  # con la prueba de orquestacion cliente
Summary: 18 run, 18 passed, 0 failed

$ bash tests/run_tests.sh
ALL SUITES PASSED

$ find scripts tests -name '*.sh' -print0 | xargs -0 shellcheck -S warning
find: scripts: No such file or directory

$ find handyman/scripts tests -name '*.sh' -print0 | xargs -0 shellcheck -S warning
(sin output; exit 0)

$ ./init.sh
ALL SUITES PASSED
test: OK
VERIFIER: all gates passed
preflight: format OK, drift OK, sync OK, discovery OK; exit 0
status: ok
```

El aviso del comando ShellCheck literal corresponde al directorio legacy `scripts/`, retirado tras la migracion. El alcance vigente documentado en `.handyman/docs/verification.md` es `handyman/scripts tests` y paso sin diagnosticos.

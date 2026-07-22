---
type: Implementation Log
feature: panel_idea_to_feature
status: implemented
role: implementer
updated: 2026-07-19
actor: agente-local (single-agent session)
tags: [handyman/role/implementer, handyman/feature/panel_idea_to_feature]
---

# Implementation Report: panel_idea_to_feature

## Files Changed

- `handyman/src/core/featureWrite.ts` — **nuevo**. `addFeature(workspace, opts)`:
  el append validado, sin política y sin registry.
- `handyman/src/feature.ts` — `cmdAdd` delega en `addFeature`; se borran
  `archivedMaxId` y `ensureFeaturesArray`, que quedaron muertos.
- `handyman/src/toolbox_state.ts` — `addFeatureForRoot(hroot, root, name, acceptance, opts)`:
  registry + política + `resolveWorkspace` + `addFeature`.
- `apps/web/app/api/feature/route.ts` — **nuevo**. `POST` + `featureHttp` (mapeo de
  status a HTTP).
- `apps/web/lib/toolboxState.ts` — `ToolboxEntry` gana `addFeatureForRoot`.
- `apps/web/components/AddFeatureForm.tsx` + `.module.css` — **nuevos**.
- `apps/web/app/harness/[name]/page.tsx` — resuelve `project_root` del estado y monta
  el formulario.
- `.handyman/docs/business.md` — acota el Out Of Scope.
- `tests/test_web_feature.sh` — **nuevo**, 13 casos; `tests/run_tests.sh` lo registra.

## Las tres decisiones, y por qué las dos primeras cambiaron respecto del plan

**1. `business.md` acotado, no reescrito.** Lo excluido pasa a ser el loop
*desatendido*. Queda anotado qué tendría que pasar para volver a tocarlo: un bucle
real que elija la próxima feature y encadene stages sin un humano por paso.

**2. No se spawnea. El plan recomendaba lo contrario.** El hallazgo que lo dio vuelta:
la única otra escritura del panel devuelve `spawned_process: false` **en el cuerpo de
la respuesta**, y está fijado por tres suites (`test_web_intake.sh:62`,
`test_toolbox_state.js:218`, `test_toolbox_serve.sh:859`). No es un comentario, es
contrato. Y la pereza que hacía atractivo a (a) se evaporaba al mirar la bala del id:
habría que sacarlo de `stdout` con un regex sobre `added feature 60 'x' (pending)`,
convirtiendo una línea legible en contrato de máquina. `addFeature` lo devuelve.

**3. La acción vive en `/harness/[name]`**, donde el `project_root` se resuelve
server-side del estado que la página ya tiene. Nadie tipea un root.

## Design Notes

- **Dónde vive la extracción: `handyman/src/core/`, no `packages/toolbox-core`.**
  La decisión fue «al core»; cuál core lo decidió la evidencia. `validateFeatureList`
  resuelve `handyman/assets/schemas/feature_list.schema.json` por `import.meta.url`;
  llevarlo a toolbox-core habría significado duplicar ajv y el schema, o invertir la
  dependencia (hoy `handyman -> @handyman/toolbox-core`). Y `apps/web` **ya depende de
  `handyman`** (`workspace:*`), así que no hace falta ninguna arista nueva.
- **Dos capas, como `writeIntake` / `intakeHttp`.** `addFeature` es el write puro;
  `addFeatureForRoot` es el borde con la política. El orden de validación es contrato:
  `root -> registered -> name -> acceptance -> workspace -> write`.
- **La política NO está en el core, y eso lo enseñó el oráculo.** El primer intento
  puso las guardas de nombre y de acceptance vacía dentro de `addFeature`;
  `tests/test_feature.sh` se puso rojo en cuatro casos, porque `feature.js add` **siempre**
  aceptó una feature sin acceptance todavía — para eso existe el verbo `acceptance`.
  Endurecer un CLI que nadie pidió endurecer es el error que la feature 56 decidió no
  cometer. Las dos guardas se movieron al borde, donde sí corresponden: registrar una
  feature sin contrato desde una UI es fabricar deuda de evidencia a propósito.
- **El loader en runtime, no import estático.** `next.config.ts` documenta (feature 43)
  que ambos bundlers reescriben `import.meta.url` al inlinear un paquete del workspace
  enlazado — que es exactamente cómo `featureWrite.ts` llega al schema. La ruta usa
  `getToolboxEntry()`, el mismo mecanismo que `buildState`.
- **El formulario es hermano de `HarnessLive`, nunca markup dentro suyo.**
  `HarnessLive` es dueño de su región vía `dangerouslySetInnerHTML` derivado del
  estado vivo; cualquier cosa escrita a mano ahí se pisa en el siguiente tick de SSE.
- **La bala 5 salió gratis, y verificada.** El hub de `fs.watch` vigila recursivamente
  el workspace de cada harness registrado, así que la escritura dispara `/events` y
  `HarnessLive` refetchea solo. El formulario **no** refetchea: sería una segunda
  fuente de verdad compitiendo con la capa viva.

## Verificación end-to-end, contra el servidor real

La suite es estructural más funcional-sobre-el-core. Eso no prueba la parte más
frágil —el loader en runtime bajo el bundler—, así que se levantó el observer de
verdad contra un fixture y se le pegó por HTTP:

```text
POST /api/feature (root registrado)   -> HTTP 200 {"ok":true,"id":4,"spawned_process":false}
POST /api/feature (root ajeno)        -> HTTP 400 {"error":"root not registered"}
POST /api/feature (name "../escape")  -> HTTP 422 {"error":"name must match ^[A-Za-z0-9_-]+$"}
POST /api/feature (acceptance ["  "]) -> HTTP 422 {"error":"acceptance must not be empty"}
```

**Round-trip con el CLI**, que es lo que prueba que es el mismo contrato y no un
parecido: `feature.js ready` lista la feature que escribió el panel, `start` la toma
(`in_progress`, `meta.started_at` sellado) y `acceptance` le reescribe el contrato.

**`/events`**: suscripción SSE abierta, un POST, y llega exactamente **un** frame
`data: {"type":"change"}`. El refresco sin recarga manual está verificado, no supuesto.

## Un tropiezo que vale registrar

Tres casos estructurales de la suite fallaron contra una implementación correcta: los
`grep` negativos («no debe mencionar X») chocaban con los comentarios que explican
justamente qué se evita — `spawned_process: false` contiene «spawn», y el docstring
del formulario nombra `dangerouslySetInnerHTML` y `/api/state` mientras no hace ni una
cosa ni la otra. Se agregó `code_only()`, que despoja comentarios antes de asertar.

Y se comprobó que `code_only` no devuelve vacío —127 de 147 líneas, control positivo
sobre `/api/feature`, control negativo sobre `/api/state` (1 en el archivo, 0 en
código)—, porque un helper que devolviera vacío haría pasar los tres asertos negativos
en falso. Es el modo de falla que la feature 59 destapó.

## Test Output

```text
tests/test_web_feature.sh -> 13 run, 13 passed, 0 failed
tests/test_feature.sh     -> 40 run, 40 passed, 0 failed  (SIN modificaciones: la paridad)
bash tests/run_tests.sh   -> ALL SUITES PASSED
```

---
type: Review Log
feature: panel_idea_to_feature
status: approved
role: reviewer
updated: 2026-07-19
actor: agente-local (single-agent session)
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/panel_idea_to_feature]
---

# Review: panel_idea_to_feature

## Verdict

APPROVED

## Advertencia de procedencia

Mismo actor que el `impl_`, declarado en ambos. El NOTE de colisión de la feature 55
se dispara — y ahora corre dentro de la fase `harness` que la feature 59 agregó.

## Stage 1: Spec Compliance

- [x] Every acceptance criterion is satisfied
- [x] The change stays inside the feature's declared scope
- [x] The implementation report exists and matches what changed

1. **`addFeature` asigna el id, valida y lo devuelve.** TWF1: sobre un harness cuyo id
   vivo mayor es 7, la feature nueva sale con **8** y queda `pending` en disco.
   `archivedMaxId` se conserva, así que un archivo de sprint sigue moviendo la marca.
2. **Rechaza antes de escribir, por causa.** TWF2 (root ajeno, md5 del archivo sin
   cambiar), TWF3 (`../escape` y `two words`), TWF4 (lista vacía y lista de blancos),
   TWF5 (nombre duplicado). Los cuatro comprueban además que **no se agregó nada**.
3. **Un solo camino de escritura.** TWF9 fija la delegación en las tres puntas.
   La prueba fuerte es otra: `tests/test_feature.sh` sigue en 40/40 **sin una sola
   línea modificada por esta feature**. Si hubiera quedado una segunda implementación,
   o si el comportamiento del CLI hubiera derivado, ese oráculo lo diría.
4. **La ruta devuelve el id y no spawnea.** Verificado contra el servidor real:
   `HTTP 200 {"ok":true,"id":4,"spawned_process":false}`, y los tres rechazos con
   400/422 y cuerpo nombrando la causa. TWF6 comprueba además que el archivo no
   importa `child_process`.
5. **`/harness` expone la acción y el estado se refresca solo.** TWF11/TWF12/TWF13
   fijan la estructura; la verificación real es la suscripción SSE: un POST produce
   exactamente **un** frame `data: {"type":"change"}`, que es lo que hace refetchear a
   `HarnessLive`. Es la bala que más fácil habría sido declarar sin probar.
6. **Suite black-box sin red.** 13 casos, sin levantar servidor ni tocar la red.
7. **`business.md` acotado.** El Out Of Scope pasa a excluir el loop *desatendido*, con
   la precisión de qué sí hace el panel y qué tendría que pasar para reescribirlo.
8. **Gate verde.**

## Hallazgos

**Ninguno abierto.** Tres cosas del camino que sí merecen quedar escritas:

**1. El plan recomendaba spawnear, y estaba mal.** No por gusto: `spawned_process: false`
viaja en el cuerpo de `/api/intake` y lo fijan tres suites. Envolver `feature.js add`
en un subproceso habría contradicho la postura que el oráculo ya declara, y habría
obligado a extraer el id con un regex sobre una línea pensada para humanos. Que el
implementer haya vuelto sobre la recomendación del plan con evidencia, en vez de
seguirla, es lo correcto.

**2. El oráculo atajó un endurecimiento no pedido.** Meter la validación de nombre y de
acceptance vacía en el write compartido puso `test_feature.sh` en rojo en cuatro casos,
porque `feature.js add` siempre aceptó features sin acceptance. Mover esas guardas al
borde no es un rodeo: es la separación correcta —el core escribe, el borde tiene
política— y coincide con `writeIntake` / `intakeHttp`. TWF10 la fija en las dos
direcciones, incluido que el core **no** contenga esas comprobaciones.

**3. Los `grep` negativos chocaron con la prosa que explica el código.** Tres casos
fallaron contra una implementación correcta porque los archivos *nombran* lo que
evitan. `code_only()` lo resuelve, y —esto es lo que lo salva de ser otro falso verde—
se verificó que no devuelve vacío, con control positivo y negativo. Un helper mudo
habría hecho pasar los tres asertos negativos sin asertar nada.

## Stage 2: Code Quality

- [x] Architecture respected
- [x] Conventions respected
- [x] Tests meaningful and green
- [x] Verifier exits 0

- **Sin deps nuevas** (`architecture.md:46-52`) y **sin aristas nuevas** en el grafo de
  paquetes: `apps/web -> handyman` ya existía. La elección de `handyman/src/core` sobre
  `packages/toolbox-core` está justificada por dónde vive el schema, y evita duplicar
  ajv o invertir la dependencia. `toolbox-core` sigue leyendo `feature_list` sin
  escribirlo.
- **Respeta la restricción de la feature 43.** La ruta llega a handyman por
  `getToolboxEntry()`, no por import estático — y es lo que hace que
  `import.meta.url` siga resolviendo el schema. TWF8 lo fija. La verificación
  end-to-end contra el servidor construido es lo que lo demuestra: es justo la parte
  que una suite estructural no puede probar.
- **No repite el bug de innerHTML.** El formulario es un componente React hermano y no
  toca la región de `HarnessLive`. El comentario dice por qué, así que el próximo que
  quiera «meter un botón en la vista» encuentra la razón antes que el bug.
- **El root no se tipea.** Sale de `project_name === name` sobre el estado que la página
  ya cargó, y el formulario no se renderiza si el harness no está en el registry —
  ofrecerlo sería ofrecer un rechazo garantizado.
- **Sólo tokens de `globals.css`** en el CSS: light/dark salen por el mismo
  `[data-theme]` que el resto, sin una segunda paleta.
- **Código muerto retirado.** `archivedMaxId` y `ensureFeaturesArray` se borraron al
  quedar sin uso, en vez de dejarlos describiendo algo que ya no pasa.

## Deuda registrada, fuera de alcance

- **`featureHttp` vive en la ruta**, no junto al tipo de resultado como hace
  `intakeHttp`. Correcto por ahora —un solo consumidor— y la regla de escape de D-B
  autoriza exactamente esto: se deja aparte y se anota. Si aparece una segunda
  superficie, se mueve.
- **La acción es una, no nueve.** `start`, `block`, `done` y el resto siguen sin
  superficie en el panel. Es el «uno, no cinco» respetado por tercera vez en este repo;
  con ésta verde se decide la forma del resto.
- **`title` y `description` viajan pero `depends_on` no.** El core lo soporta; el borde
  no lo expone. Registrar dependencias desde una UI necesita un selector de features, y
  eso es otra feature.

## Verification

```text
tests/test_web_feature.sh -> 13 run, 13 passed, 0 failed
tests/test_feature.sh     -> 40 run, 40 passed, 0 failed (sin modificaciones: la paridad)
bash tests/run_tests.sh   -> ALL SUITES PASSED
./init.sh                 -> exit 0

end-to-end contra el observer real:
  POST /api/feature -> 200 {"ok":true,"id":4,"spawned_process":false}
  root ajeno -> 400 | name invalido -> 422 | acceptance vacia -> 422
  round-trip: feature.js ready / start / acceptance operan la feature del panel
  /events emite 1 frame change por escritura
```

## Required Changes

None.

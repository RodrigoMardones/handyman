---
type: Sprint
---

# Plan de acción · contrato de verbos + primera acción desde el panel

**Fecha:** 2026-07-19 · **Rama:** `feat/llm-toolbox-tasks` (base `6f08840`, **árbol sucio: 38 archivos sin commitear**)
**Diagnóstico de origen:** [analisis-mcp-toolbox.md](analisis-mcp-toolbox.md)
**Estado del backlog:** 26 features, **todas `done`**, 0 pendientes, `max id = 55`, sin campo `sprints`.

Este doc convierte el §6.4 del análisis en trabajo reclamable. Las acceptance siguen el contrato de la feature 33: verbos observables, artefacto concreto, gate verde como última bala.

---

## 0. Contexto mínimo para una sesión nueva

Leer esto antes de tocar nada:

- **El árbol está sucio.** Las features 50-55 están marcadas `done` en `feature_list.json` pero su trabajo **no está commiteado** (38 archivos entre modificados y sin trackear, incluidos los `impl_`/`review_` de 51-55 y `handyman/src/toolbox_review_notes_cli.ts`). Cualquier `git diff HEAD` va a mostrar ese lote entero, no sólo el trabajo nuevo. Esto afecta directamente a `review-notes`, que lee `git diff HEAD`.
- **De dónde salen estas features.** No de una idea nueva: de un mapeo con evidencia hecho sobre este árbol, que encontró cinco defectos en el camino de escritura del harness (A1-A5 en el análisis, §3). No son refactors de gusto — A1 mete una afirmación falsa en el registro durable.
- **Hacia dónde va el proyecto.** La meta declarada es manejar toolBox como **panel web actuando como agente**: centralizar ideas y ejecutar desde ahí sobre varios repos. Eso cambia qué *es* handyman (ver §3.1) y ordena por qué estas features van primero: **las tools del panel van a heredar el contrato de estos verbos**, así que arreglarlo antes es más barato que envolverlo roto.

---

## 1. Las features

### 56 · `harness_done_reads_review` — esfuerzo S · riesgo bajo · **empezar por acá**

> `cmdDone` escribe en `progress/history.md` la línea `- **Review:** APPROVED -> backlog/review_<name>.md` **incondicionalmente, sin abrir el archivo** (`feature.ts:852-863`). Además deja `Plan`, `Changes` y `Tools` como `...` literal.

**Descripción.** Que `done` lea el frontmatter de `review_<name>.md` y escriba el veredicto real. Es el único defecto de los cinco que **corrompe el registro durable** — el registro que el harness existe para producir.

**Acceptance:**
1. `node dist/feature.js done <name>` lee `<workspace>/backlog/review_<name>.md` y escribe en la entrada de `history.md` el `status:` que ese frontmatter declara, no una constante.
2. Cuando `review_<name>.md` declara `status: changes_requested`, `done` sale distinto de 0 y **no** cierra la feature ni escribe entrada de historia.
3. Cuando `review_<name>.md` no existe, `done` sale distinto de 0 nombrando el archivo faltante; `feature_list.json` queda intacto.
4. El comportamiento de la bala 3 se puede saltar con una bandera explícita (`--no-review`) que deja constancia en la entrada de historia de que se cerró sin reporte.
5. `tests/test_feature.sh` cubre las tres direcciones: review `approved` cierra y escribe `APPROVED`; review `changes_requested` rechaza; review ausente rechaza y `--no-review` permite.
6. `bash tests/run_tests.sh` passes y `./init.sh` exits 0.

**Nota de riesgo.** Las balas 2 y 3 **endurecen un exit code** sobre harnesses instalados: un repo que hoy cierra features sin review va a empezar a fallar. Es el único caso de este lote donde romper el gate ajeno está justificado — cerrar sin review es exactamente lo que la feature 52 ya marca como deuda, y `done` afirmando `APPROVED` sin leer nada es una mentira, no una laxitud. Aun así, ver §3.3: hay una opción más blanda.

---

### 57 · `harness_verb_write_contract` — esfuerzo M · riesgo bajo

> Sólo 2 de los 9 verbos validan contra el schema antes de escribir: `unblock` y `acceptance` llaman `saveValidated` (`feature.ts:203-217`); `add`, `start`, `block` y `done` usan el `save()` pelado. Y `acceptance` no tiene guarda de estado: reescribe en silencio la lista de una feature ya `done`, sin sello ni entrada de historia (`feature.ts:799-815`).

**Descripción.** Un solo camino de escritura validada para los 9 verbos, más la guarda que falta en `acceptance`.

**Acceptance:**
1. Los 9 verbos (`add, start, block, unblock, acceptance, done, ready, log, next`) escriben `feature_list.json` a través de `saveValidated`: un resultado que no valide contra `assets/schemas/feature_list.schema.json` aborta sin tocar el archivo.
2. `node dist/feature.js acceptance <name>` sobre una feature en estado `done` sale distinto de 0 y deja la lista intacta.
3. La bala 2 se puede saltar con una bandera explícita, y hacerlo deja entrada en `progress/history.md` registrando que se reescribió el contrato de una feature cerrada.
4. `node dist/feature.js start <name>` sobre una feature `blocked` sigue funcionando (`blocked -> in_progress` es una transición documentada en `references/workflow.md`), pero ahora valida contra el schema antes de escribir.
5. `tests/test_feature.sh` cubre: la guarda de `acceptance` sobre `done` y su bandera de escape; y que `start` desde `blocked` sigue verde.
6. `bash tests/run_tests.sh` passes y `./init.sh` exits 0.

**Por qué junto y no tres features.** Los tres defectos son la misma cosa vista tres veces: el camino de escritura no es uno solo. Separarlos haría que la segunda rebase sobre la primera en la misma función, sin comprar nada.

---

### 58 · `backlog_review_reissue` — esfuerzo S · riesgo bajo

> `backlog.js review <f> --status approved` después de un `changes_requested` previo imprime `exists (left untouched)` y sale **0** (`backlog.ts:417-428`). El ciclo normal CHANGES_REQUESTED → APPROVED **no tiene verbo**: hay que editar el archivo a mano — el patrón que el harness prohíbe para `feature_list.json`. Y el exit 0 impide que quien llama detecte el no-op.

**Descripción.** Que re-emitir un veredicto sea una operación del CLI y no una edición a mano.

**Acceptance:**
1. `node dist/backlog.js review <f> --status <s> --force` reescribe el reporte existente con el nuevo `status:` en el frontmatter y sale 0.
2. Sin `--force`, un reporte existente sigue sin tocarse — pero ahora sale **distinto de 0** cuando el `--status` pedido difiere del que el archivo ya declara, nombrando ambos.
3. Sin `--force` y con el mismo `--status` que el archivo ya tiene, sale 0 (idempotencia: re-correr el mismo comando no es un error).
4. `--force` preserva el cuerpo del reporte y cambia sólo el frontmatter, o bien lo reescribe desde plantilla dejándolo declarado en la salida — el implementer elige y lo anota.
5. `tests/test_backlog.sh` cubre las tres direcciones de las balas 1-3.
6. `bash tests/run_tests.sh` passes y `./init.sh` exits 0.

**Ojo con la bala 2.** Cambia un exit code de 0 a distinto de 0 en un caso que hoy pasa silencioso. Es el comportamiento correcto (un veredicto distinto ignorado en silencio es peor que un error), pero es cambio de contrato: la suite black-box es el oráculo y hay que actualizarla en el mismo commit.

---

### 59 · `init_runs_validate_harness` — esfuerzo S · riesgo bajo

> `init.sh` de este repo **nunca llama a `validate_harness.js`**. Los advisories de las features 52 (deuda de evidencia) y 55 (colisión de `actor`) llegan sólo por `check_preflight` (`init.sh:133-138`), no bloqueante y a stderr. Se verificaron contra fixtures en `test_init.sh`, **no contra el flujo vivo del repo**.

**Descripción.** Que el verificador propio corra el validador que este repo produce. Sin esto, dos features cerradas no ejercen ningún efecto sobre su propio harness.

**Acceptance:**
1. `./init.sh` ejecuta `validate_harness` sobre `.handyman` como fase propia, y sus gaps bloqueantes hacen salir distinto de 0.
2. Los advisories no bloqueantes (frontmatter, deuda de evidencia, colisión de `actor`, rama) se imprimen sin cambiar el exit code, igual que hoy hacen por `preflight`.
3. Los NOTEs no se imprimen dos veces cuando `preflight` también corre: o se deduplica, o `preflight` deja de invocarlo y se anota por qué.
4. `handyman/assets/init.template.sh` recibe el mismo cambio, para que los harnesses instalados lo hereden en el próximo upgrade.
5. `tests/test_init.sh` verifica que un `.handyman` con un gap bloqueante hace fallar `./init.sh`, y que uno con sólo deuda de evidencia sale 0 con NOTE.
6. `bash tests/run_tests.sh` passes y `./init.sh` exits 0.

**Efecto secundario a esperar.** Este repo tiene deuda de evidencia real (features viejas sin `review_`). Va a empezar a imprimir NOTEs. Es información correcta, no regresión. Si además aparece un **gap bloqueante** ya existente, la feature no está terminada hasta resolverlo o justificar bajarlo a NOTE.

---

### 60 · `panel_idea_to_feature` — esfuerzo M · riesgo **medio** · ⚠️ requiere §3.1 · depende de 56, 57

> Primera rebanada vertical de «panel actuando como agente». Hoy el panel puede **capturar** una idea (`writeIntake`, `intake.ts:27-59`, la única escritura a disco de toda la superficie observer) pero no puede **ejecutar** nada sobre la flota.

**Descripción.** Que desde el panel se registre una feature en un harness elegido de la flota. Es la acción más chica que ejerce el recorrido completo: registry como allowlist → root elegido → escritura validada → estado visible. **Una, no nueve**: con ésta verde se decide la forma del resto de las acciones.

**Acceptance:**
1. Una ruta `POST` en `apps/web` registra una feature (nombre + acceptance) en un root de la flota y devuelve el `id` asignado.
2. Rechaza, **antes de escribir nada**, con status distinto de 2xx y cuerpo de error nombrando la causa: root no presente en el registry (`isRegisteredRoot`), nombre de feature que no matchea `/^[A-Za-z0-9_-]+$/`, o lista de acceptance vacía.
3. La escritura pasa por el mismo camino validado que la feature 57 dejó único; la ruta **no** re-implementa la escritura de `feature_list.json` ni edita el archivo directamente.
4. El panel expone la acción sobre la flota ya listada, y tras un alta exitosa el estado mostrado refleja la feature nueva sin recargar a mano.
5. Una suite black-box cubre el camino feliz y los tres rechazos de la bala 2, **sin tocar la red**, siguiendo el patrón de `tests/test_web_relays.sh`.
6. `bash tests/run_tests.sh` passes y `./init.sh` exits 0.

**⚠️ La pregunta de diseño que esta feature decide.** `feature.ts` vive del lado `handyman/`, no en `packages/toolbox-core`. La ruta tiene tres caminos y hay que **elegir uno y anotarlo en el reporte**:

- **(a)** spawnear `node handyman/dist/feature.js add` como subproceso — cero movimiento de código, hereda exit codes, pero mete gestión de procesos en una ruta HTTP;
- **(b)** extraer la escritura de features al core y que `feature.js` y la ruta sean dos presentaciones — es lo que §2.4 del plan viejo pedía, y es el movimiento correcto **si** aparece un tercer consumidor;
- **(c)** dejarlo separado y anotar por qué, que es el escape que D-B autoriza (`architecture.md:162-164`).

**Mi recomendación: (a) para esta feature.** Es la más perezosa que funciona, no mueve código que hoy está cubierto por el oráculo, y deja la decisión de (b) para cuando haya un segundo consumidor real. Pero el reporte tiene que decir qué se eligió.

---

## 2. Orden de ejecución

```
56 ──► 57 ──► 60
58 ─┘         ▲
59 ───────────┘  (independiente; puede ir en cualquier momento)
```

**Secuencia recomendada: 56 → 57 → 58 → 59 → 60.**

- **56 primero.** Es el más barato de los tres de contrato y el único que corrompe el registro durable. Además su arreglo es el que más se nota en el próximo `done`.
- **57 después de 56**, no antes: ambos tocan `feature.ts` y 56 cambia `cmdDone`, que 57 tiene que rutear por `saveValidated`. En paralelo chocan.
- **58 es `backlog.ts`**, no `feature.ts` — se puede adelantar si conviene, pero no aporta nada hacerlo.
- **59 es independiente** de todo el resto. Ponerlo antes de 60 tiene una ventaja concreta: si el gate propio empieza a correr el validador, la 60 se verifica contra un gate más honesto.
- **60 al final**, y sólo con §3.1 resuelto.

**No paralelizar 56 y 57.** Misma función, la segunda tiene que rebasar sobre la primera.

---

## 3. Lo que hay que decidir antes de empezar

### 3.1 ⚠️ Bloqueante para la 60 · ¿handyman pasa a ser un runner?

`business.md:68-78` declara en *Out Of Scope*: «**No es un runner.** Handyman no ejecuta el loop desatendido; solo provee el contrato… El loop lo corre un agente externo».

Un panel que actúa como agente **es** ese runner. La feature 60 es su primer paso. Opciones:

- **(a) Declararlo.** Actualizar `business.md` y anotar la decisión en `architecture.md` antes de la 60. Es lo que el repo hizo con D-B: anotar antes de construir.
- **(b) Acotarlo.** Sostener que el panel *asiste* pero no corre el loop desatendido — el humano dispara cada acción. Entonces `business.md` sigue siendo cierto y la 60 no lo contradice.
- **(c) Postergar la 60** hasta tener la decisión.

**Mi recomendación: (b), y sólo pasar a (a) cuando exista un loop de verdad.** La 60 es una acción disparada por un humano desde una UI; eso no es un runner desatendido. Cuando aparezca el loop autónomo, ahí sí hay que reescribir el *Out Of Scope*, no antes.

### 3.2 Las features 51-55 siguen auto-firmadas y sin commitear

Las cinco se cerraron con leader, implementer y reviewer colapsados en un agente — `actor: agente-local (single-agent session)` en los cuatro `review_*`. La 51 llegó a `done` sin review; se escribió después, cuando el advisory de la 52 detectó el hueco. Y **nada de eso está en git**.

Es la pregunta abierta #1 del plan anterior, sin responder y ahora con cinco casos más. Apilar cinco features encima sin decidir esto compone la deuda. **No bloquea técnicamente el trabajo de abajo**, pero sí debería decidirse antes del PR — igual que la historia de la rama (`b53c9e4` agrupa 47-50, `6f08840` agrupa 32-35 más 51-55).

### 3.3 ¿La 56 endurece el exit code o sólo avisa?

Las balas 2 y 3 de la 56 hacen fallar `done` cuando falta el review o dice `changes_requested`. Eso rompe el gate de harnesses instalados que hoy cierran sin review. El repo tiene precedente en contra de eso — «romperles el gate de golpe es hostil» (`plan-huecos:39`).

- **(a) Como está.** `done` rechaza. Con `--no-review` como escape.
- **(b) Sólo la verdad.** `done` sigue cerrando siempre, pero escribe en `history.md` el veredicto real (o `NO REVIEW`) en vez de `APPROVED` constante. Cero ruptura, y la mentira desaparece igual.

**Mi recomendación: (b).** Arregla el problema real —la afirmación falsa— sin romper nada ajeno. Endurecer después es cambiar una condición, y con datos del advisory de la 52. Si se elige (b), las balas 2 y 3 de la 56 se reescriben en consecuencia.

---

## 4. Explícitamente NO en este lote

- **MCP.** Si el agente vive en el panel, MCP es un loopback: el servidor Next ya importa el core. Es el paso 4 de §6.4 del análisis, no el 1. Se vuelve correcto sólo si aparece un host externo (Claude Desktop, Cursor) manejando la misma flota.
- **Exponer los 7 relays como tools.** Seis de siete son «leer archivos y preguntarle a un modelo», con vistas truncadas y con `resolveSummaryModel` degradando a `glm-4.7-flash`. Un loop de agente los reemplaza, no los consume.
- **Las otras 8 acciones del panel.** Sale de la 60, no antes. «Uno, no cinco» ya se respetó dos veces en este repo.
- **`--from FILE` para acceptance.** Ya está nombrado como conveniencia posterior (`plan-accion-g1-g4.md:42`), y la molestia todavía no se sintió.
- **Endurecer el falso verde de `tools_discovery check`.** Es un tradeoff documentado y atado a mantener verde el test T4.

---

## 5. Registrar la cola

Los `feature.js add` **no los corrí**: pediste el plan, y registrar muta el backlog.

Avisos antes de correrlos:

- Los ids salen secuenciales desde **56** en el orden en que se ejecuten los comandos. La dependencia de la 60 asume que 56 y 57 se agregaron antes.
- `feature_list.json` no tiene campo `sprints` hoy; si se quiere agrupar este lote, hay que crearlo aparte.
- **Commitear antes de empezar.** Con 38 archivos sin trackear, `git diff HEAD` —que es lo que `review-notes` lee y lo que el reviewer inspecciona— mezcla el lote 50-55 con el trabajo nuevo. Decidir §3.2 primero es lo que destraba esto.

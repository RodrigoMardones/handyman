---
type: Explore Report
topic: web_exp_revision
role: explorer
updated: 2026-07-20
tags: [handyman/backlog/explore, handyman/feature/web_exp_revision]
---

# Informe UX: mejoras propuestas para el toolBox web

Entrevista con el operador (2026-07-20, feature 69). Dolores confirmados, en
su orden de mencion: (1) faltan acciones (panel como agente), (2) navegacion
entre vistas, (3) jerarquia y densidad visual. Regla del informe: propuestas
**nombradas, no construidas** (via perezosa); cada una puede entrar como
feature propia con `handyman-harness feature add`.

## Ejecutado en esta feature

La landing de marketing en `/` se elimino (550 lineas, fotos placeholder de
picsum.photos): un observer localhost tiene un solo visitante, su operador, y
la landing no entregaba valor formal. `/` redirige a `/fleet`, la CSP de
paginas colapso al `CSP_HEADER` estricto (sin `picsum.photos`), y murieron
`ScrollReveal` y `test_web_landing.sh`.

## N. Navegacion entre vistas

Hoy moverse exige conocer el command palette (Cmd+K), los atajos `g f/t/s`, o
la URL. Cero descubribilidad visual: ninguna vista muestra que existen las
otras.

- **N1 - Nav persistente server-rendered** (valor alto / esfuerzo bajo). Una
  fila de `<a>` (fleet · timeline · search · intake · ask) en el nav
  compartido donde ya se monta `ToolboxShell`, con `aria-current="page"` en
  la activa. Cero JS nuevo; estilo con la skill `minimalist-ui` (editorial,
  sin sombras, encaja con el panel data-dense). El palette y los atajos
  quedan como via rapida, no unica.
- **N2 - Breadcrumb en `/harness/[name]`** (valor medio / esfuerzo bajo).
  Un enlace de regreso `fleet / <name>` arriba del detalle; hoy la vuelta es
  el boton back del browser.

## J. Jerarquia y densidad visual

`/fleet` lista los harnesses planos: cuesta escanear que esta vivo, que
feature corre y que esta bloqueado.

- **J1 - "Que corre ahora" primero** (valor alto / esfuerzo bajo). Ordenar
  las cards: harnesses con feature `in_progress` arriba, luego `blocked`
  (con su `blocked_reason` visible), luego idle. Badge de estado con color
  semantico + texto (no solo color). Es un sort + clases en
  `fleetHtml.ts`, que ya recibe todo en el estado.
- **J2 - Stat tiles / sparklines por harness** (valor medio / esfuerzo
  medio). `/api/state` ya trae metrics por harness (throughput, verdicts,
  coverage) que la card no muestra. Render con la skill `dataviz` (stat
  tile + sparkline, sin libreria nueva: SVG inline).
- **J3 - Re-audit a11y post-cambios** (valor medio / esfuerzo bajo). El
  panel ya invirtio en a11y (live regions, aria-pressed, reduced-motion);
  tras N1+J1 correr la skill `accessibility` para que el orden visual nuevo
  llegue igual por lector de pantalla.

## A. Panel como agente (norte)

El norte documentado: hub multi-repo que centraliza ideas y ejecuta desde un
solo lugar. Hoy el panel observa; el unico write es `POST /api/intake`
(feature 60: registrar una feature).

- **A1 - Verbos de estado desde el panel** (valor alto / esfuerzo bajo).
  Botones `start` / `block` / `unblock` en la vista harness, cada uno un
  endpoint fino que invoca el verbo CLI atomico ya existente (`feature.js`
  garantiza single_in_progress y escritura validada). El panel no inventa
  logica de estado: solo la expone. Riesgo bajo porque los verbos ya
  refuerzan sus invariantes.
- **A2 - Disparar una sesion de agente sobre una feature** (valor alto /
  esfuerzo alto, decision pendiente). El paso que convierte el observer en
  agente: boton "run" que lanza un leader sobre la feature elegida. Exige
  resolver la pregunta runner-vs-viewer (spawn local del CLI del agente vs
  cola de trabajos). Nombrada aqui para que la decision se tome como
  feature propia, no de contrabando dentro de otra.

## Prioridad sugerida

N1 (una tarde, quita el dolor diario) -> J1 -> A1 -> J2 -> N2 -> J3 -> A2.

## Relectura post features 71 y 72

Estado observado el 2026-07-20 despues de cerrar `runner_observer` (72) y
`new_feataure_view` (71):

- **A2 esta ejecutada.** El panel puede iniciar, detener y reanudar agentes,
  elegir engine y mostrar el historial de runs.
- **N1 esta parcial.** Fleet, Timeline y Search aparecen en varias barras,
  pero Intake y Ask siguen sin ser destinos visibles. El detalle agrega
  Harness y New request, por lo que cada pagina publica una navegacion distinta.
- **La creacion esta duplicada.** `/harness/[name]/new` unifica alta,
  referencias y asignacion; aun asi `/harness/[name]` conserva
  `AddFeatureForm` y `RunPanel` como paneles independientes.
- **El archivo domina al trabajo activo.** En el harness handyman, con 43
  features done, `Register a feature` comienza cerca de los 6993 px y
  `Run an agent` cerca de los 7694 px. Las acciones quedan despues de toda la
  columna Done.
- **El nav movil se recorta.** A 390 px de viewport, la barra mide 760 px de
  contenido y no ofrece menu ni indicador de overflow.

Lectura de diseno: herramienta operativa para una persona tecnica, con lenguaje
quieto y denso. La prioridad es reducir distancia a la siguiente accion, no
sumar cards, marketing ni decoracion.

## Disposicion propuesta

### P0 - Una sola entrada para crear trabajo

Retirar `AddFeatureForm` del detalle y conservar `/harness/[name]/new` como
unica entrada. En el header del harness, una accion primaria lleva a esa vista.
Esto elimina dos formularios que escriben el mismo artefacto y evita que el
operador deba decidir entre `Register a feature` y `New request`.

**Prueba minima:** el detalle contiene un solo enlace de alta; el POST real
sigue cubierto por `test_web_new_feature.sh`; `AddFeatureForm` deja de montarse.

### P0 - Trabajo activo antes que archivo

Orden del detalle:

1. Breadcrumb `Fleet / <harness>` + nombre, salud y feature activa.
2. Barra contextual: crear, iniciar/reanudar/detener y bloquear/desbloquear solo
  cuando el estado permite cada accion.
3. Cola accionable: in progress, pending y blocked. Las columnas vacias se
  colapsan a contadores.
4. Done muestra solo los 5 cierres recientes y enlaza a Activity para revisar
  el historial completo.
5. Workspace, Docs y Graph pasan a tabs o disclosures secundarios.

No se debe renderizar el archivo completo de Done antes de las acciones. La
cola responde "que hago ahora"; Activity responde "que ocurrio".

**Prueba minima:** con 40+ features done, la accion primaria y el estado del run
son visibles en el primer viewport; el total done sigue disponible y el enlace
a Activity funciona.

### P0 - Navegacion unica y movil

Extraer una barra compartida para todas las rutas. En escritorio debe caber en
una linea; en movil, mostrar marca + contexto + boton Menu, no una fila
horizontal recortada. La barra global no debe mezclar destinos globales con el
nombre generico `Harness`: el harness actual vive en breadcrumb/subnav.

Destinos globales recomendados: `Fleet`, `Activity`, `Find`, `Draft`, `Ask`.
La accion contextual `Add feature` solo aparece cuando hay un harness elegido.

**Prueba minima:** todas las paginas publican los mismos cinco destinos y un
solo `aria-current`; a 390 px `nav.scrollWidth <= nav.clientWidth`.

### P1 - Run compacto y contextual

Conservar las capacidades de `RunPanel`, pero mover su estado cerca del header.
Sin feature pendiente, no mostrar un formulario alto con select vacio: mostrar
`No work ready` y la accion `Add feature`. Con una feature lista, el control
puede expandirse para elegir engine. El historial completo de runs pertenece a
Activity o a un disclosure, no al camino principal.

### P1 - Fleet ordenada por necesidad de accion

Aplicar J1 antes que J2: in progress, blocked y health warnings primero; idle
despues. Sparklines no resuelven el dolor actual y pueden esperar hasta que una
pregunta de negocio exija tendencia.

## Contrato de nombres y verbos

Reservar cada sustantivo para un artefacto y cada verbo para un efecto:

| Concepto | Significado unico |
|---|---|
| Request | borrador en `feature-request.md` |
| Feature | item de `feature_list.json` |
| Run | ejecucion de un agente |

| Actual | Propuesto | Efecto que comunica |
|---|---|---|
| Intake | Draft request | escribir o refinar el borrador |
| New request | Add feature | agregar un item pending a la cola |
| Register | Add to queue | confirmar la escritura en `feature_list.json` |
| Run agent | Start work | iniciar la ejecucion sobre una feature lista |
| Continue | Resume work | retomar una feature in progress |
| Stop | Stop run | detener el proceso actual, no cerrar la feature |
| Timeline | Activity | revisar eventos y cierres |
| Search | Find | buscar contexto y documentos |

En navegacion se aceptan sustantivos cortos (`Fleet`, `Activity`); en botones
se usan verbos observables (`Add`, `Start`, `Resume`, `Stop`, `Block`,
`Unblock`). Evitar `New`, `Register`, `Run` y `Continue` sin objeto porque no
explican que artefacto cambia.

## Orden recomendado de nuevas features

1. `web_harness_active_first`: retirar el alta duplicada, compactar Done y
  subir estado/acciones al primer viewport.
2. `web_shared_navigation`: barra unica, destinos completos y menu movil.
3. `web_action_vocabulary`: aplicar el contrato Request/Feature/Run y los
  verbos nuevos sin cambiar los endpoints ni la maquina de estados.
4. `web_fleet_action_order`: ordenar harnesses por trabajo activo, bloqueos y
  health warnings.
5. `web_state_actions`: exponer start/block/unblock usando los verbos atomicos
  existentes, con botones contextuales y tests de guards.

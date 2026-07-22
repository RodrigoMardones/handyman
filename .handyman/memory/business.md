---
type: Doc
---

# Business

Contexto de negocio de **Handyman**. Implementers y reviewers leen esto para
entender *por que* existe una feature, no solo *como* funciona.

> Este dominio esta documentado por el propio proyecto (README.md, handyman/SKILL.md,
> handyman/references/). No se infirio desde el codigo: se destilo de la documentacion
> autoritativa que mantiene la persona autora.

## Domain

Handyman es una **skill** (para clientes de agentes tipo Claude Code / editores con
skills) que instala, analiza y opera un **harness de trabajo con agentes**: una capa
operativa de archivos, roles y verificaciones alrededor de un repositorio de software.

El problema que resuelve: cuando uno o mas agentes trabajan sobre un repo, el trabajo
tiende a vivir en mensajes largos de chat, sin estado retomable, sin criterios de cierre
y sin trazabilidad. Handyman convierte el repo en un entorno con disciplina operativa:
el **chat coordina, pero el disco es la fuente de verdad**.

Exito para el proyecto = que un equipo de agentes pueda trabajar de forma **ordenada,
auditable y retomable**: una feature a la vez, con estado en disco, reportes en `backlog/`,
y cierre condicionado a una verificacion ejecutable (`./init.sh` verde).

## Stakeholders

- **Persona mantenedora** (Rodrigo Mardones): define que significa "done", evoluciona la
  skill, sella versiones del harness.
- **Agentes que operan bajo el harness**, cada uno con modelo y tools segun menor privilegio:
  - `leader` — coordina, resuelve estado, elige feature, delega. Nunca edita codigo de producto.
  - `implementer` — implementa una sola feature, escribe tests, deja evidencia.
  - `reviewer` — valida contra arquitectura/convenciones/checkpoints. Nunca edita codigo de producto.
  - `explorer` — exploracion de solo lectura.
- **Personas usuarias** que instalan la skill (`npx skills add "RodrigoMardones/handyman"`)
  y la aplican a sus propios repos en modo `local` o `global`.
- **Runner externo** (opcional): CI, cron o `while` de shell que encadena sesiones
  desatendidas ("ralph loop"). Handyman aporta el contrato, no el runner.

## Use Cases

Handyman define seis modos de operacion: `analyze`, `bootstrap`, `run-feature`,
`review`, `migrate-global`, `upgrade`.

- **Name:** run-feature (caso central)
  - **Actor:** leader (coordina) + implementer + reviewer.
  - **Goal:** llevar exactamente una feature `pending` a `done` con evidencia.
  - **Flow:** preflight de estabilidad -> verificador verde -> elegir la feature `pending`
    de menor id -> marcar `in_progress` -> actualizar `progress/current.md` -> implementar
    el cambio minimo + tests -> verificador verde -> revisar -> cerrar (`done`, append a
    `history.md`, reset de `current.md`, hooks `post_run`).
  - **Rules:** una sola feature a la vez; nada es `done` sin verificador verde; el leader no
    edita codigo de producto; el reviewer no edita codigo de producto.

- **Name:** bootstrap
  - **Actor:** persona usuaria + leader.
  - **Goal:** crear la estructura del harness en un repo (`local` o `global`).
  - **Flow:** `scripts/scaffold.sh <local|global> <root>` (determinista, nunca sobreescribe)
    -> entrevistar el negocio -> llenar docs -> cablear `init.sh` -> materializar role files.
  - **Rules:** el scaffold es la unica fuente de verdad del set de archivos; no reconstruir a mano.

- **Name:** sprint (cierre de periodo, stage 7)
  - **Actor:** leader / operador.
  - **Goal:** particionar features por periodo y derivar un documento de sprint al cerrar.
  - **Flow:** `sprint.py open <id>` -> trabajo normal stages 0-6 -> `sprint.py close` deriva
    `docs/sprints/sprint.<id>.md` desde artefactos ya en disco.
  - **Rules:** el documento de sprint se *deriva*, nunca se mantiene a mano en paralelo.

## Out Of Scope

- **No es un runner desatendido.** Handyman no ejecuta el loop por su cuenta; provee el
  contrato (`feature.js ready` como detector de trabajo, verificador como compuerta). El
  loop autonomo lo corre un agente externo.
  - **Precision anadida por la feature 60.** El panel *si* escribe estado de un harness de
    la flota (`POST /api/feature` registra una feature), pero siempre por una accion que
    inicia un humano en la UI, una por vez, contra un root del registry. Eso no es el loop
    que esta clausula excluye: no hay bucle, no hay decision autonoma, no hay
    encadenamiento de pasos. La linea sigue siendo *desatendido*, no *toda escritura*.
  - **Que tendria que pasar para reescribir esto de nuevo:** que aparezca un bucle real en
    el panel — algo que elija la proxima feature y encadene stages sin que un humano
    dispare cada paso. Ese dia esto deja de ser cierto y hay que decidirlo como cambio de
    producto, no colarlo por debajo (`analisis-mcp-toolbox.md` §6.5).
- **No es para tareas pequenas.** Implementaciones puntuales sin flujo formal de harness no
  necesitan Handyman.
- **No versiona el estado operativo.** En modo local solo `.handyman/docs/` se versiona; el
  estado mutable (`feature_list.json`, `progress/`, `backlog/`) queda fuera de git.
- **El harness no edita codigo de producto por el leader/reviewer.** Esa separacion de
  responsabilidades es intencional.

## Glossary

- **Harness** — la capa operativa (archivos + roles + verificacion) que Handyman instala.
- **HARNESS_WORKSPACE** — directorio del estado mutable. Local: `PROJECT_ROOT/.handyman`.
  Global: `$HOME/HANDYMAN/<project_name>`. Tambien funciona como vault de Obsidian.
- **Bridge files** — archivos que quedan en el root del repo: `AGENTS.md`, `CHECKPOINTS.md`,
  `init.sh`, `harness.config.json`, role files.
- **feature_list.json** — backlog y maquina de estados de 4 estados (`pending`,
  `in_progress`, `done`, `blocked`). Nunca se edita a mano; se muta via `feature.py`.
- **Verificador** — normalmente `./init.sh`; ejecuta lint -> build -> test. `done` exige exit 0.
- **Backlog reports** — reportes de detalle (`impl_<f>.md`, `review_<f>.md`, `explore_<t>.md`);
  el chat solo devuelve referencias (anti-telefono-descompuesto).
- **Sprint** — etiqueta de particion de periodo sobre features; su documento se deriva al cerrar.
- **Preflight** — revision de estabilidad de solo lectura (formato/drift/sync/discovery); no aplica fixes.
- **Discovery** — skills / MCP / agents que el harness declara y de los que depende.

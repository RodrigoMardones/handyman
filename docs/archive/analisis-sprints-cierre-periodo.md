# 🔬 Investigación: sprints, cierre de periodo y trabajo multi-rama

> Documento de investigación y plan de trabajo. Responde a una petición con tres
> ejes: **(1) integrar la rama de trabajo en el estado del harness para habilitar
> múltiples ramas y sesiones de handyman en paralelo; (2) separar la documentación
> del workspace en dos espacios — `sprints/` (periodos de trabajo cerrados y
> comprimidos) y `current/` (documentación sin revisar del sprint abierto); y
> (3) un proceso determinista de abrir y cerrar sprint** que marque las tareas del
> periodo, genere el documento formal de sprint y limpie `feature_list.json` para
> el siguiente. Cada hallazgo se apoya en evidencia concreta del repositorio y en
> las skills `handyman`, `skill-creator` y `ponytail` como literatura. El scope del
> plan es `handyman/references/`, `handyman/scripts/`, `handyman/assets/` y
> `tests/`; quedan fuera `graphify-out/` y `.github/`.

---

## 1. El objetivo

El patrón que la petición registra es real y tiene nombre: **generación de
contexto sin cierre de periodo**. El harness produce artefactos continuamente
(`history.md`, `backlog/`, docs de investigación) pero ningún mecanismo los
comprime ni marca el final de una carga de trabajo. Tres preguntas concretas:

1. **¿Cómo trabajar en varias ramas y sesiones a la vez?** Hoy una sesión abierta
   en una rama bloquea el intake en cualquier otra: el estado mutable es uno solo
   y el invariante single-`in_progress` lo protege globalmente, no por rama.
2. **¿Dónde vive la documentación de un periodo?** Hoy los cuatro docs de
   conocimiento (`business/architecture/conventions/verification`) conviven con
   una acumulación sin límite de reportes e investigaciones que nadie resume.
3. **¿Qué significa cerrar un sprint?** Marcar qué features pertenecieron al
   periodo, destilar sus artefactos en un documento único (`sprint.2026-SP1.md`) y
   dejar `feature_list.json` limpio para el siguiente periodo.

La tesis, simétrica a la serie (`analisis-workflow-etapas.md`,
`analisis-acciones-deterministas-por-capa.md`): **la materia prima del documento
de sprint ya existe y ya es agregable** — `metrics.py` deriva throughput por
fecha, tasa de aprobación y cobertura desde los artefactos que el workflow deja
en disco. Lo que falta no es capacidad de medir: es **la noción de periodo**
(dónde empieza y termina un sprint) y **la acción de cierre** que comprime y
limpia. La mejora no es un tracker nuevo: es nombrar el periodo y derivar su
resumen de los artefactos existentes.

---

## 2. Cómo se hace hoy (con evidencia)

### 2.1 El estado mutable es uno por checkout, no por rama

`.gitignore` línea 8 ignora `.handyman/` completo (la línea 9 `.handyman/docs`
también es ignore; la negación `!.handyman/docs/` que recomienda
`references/templates.md` no está aplicada en este repo). Consecuencia: el
workspace del harness es **un único directorio no versionado compartido por todas
las ramas** del mismo checkout. Cambiar de rama con `git checkout` no cambia
`feature_list.json` ni `progress/current.md`.

Evidencia en vivo de esta misma sesión: al arrancar en la rama
`feat/documentation-update-and-sprint-clousure`, `progress/current.md` contenía
una sesión abierta de la feature 88 (`workstation_wcag22_markup`, iniciada
2026-07-02 en otra rama, reporte de implementación presente, revisión pendiente).
`feature.py start` la rechazó — `another feature is already in_progress` — y hubo
que bloquearla (`feature.py block`) antes de poder registrar la feature 92. Es
exactamente el patrón que la petición describe: contexto generado, periodo nunca
cerrado, y la siguiente sesión paga el peaje.

### 2.2 El invariante single-in_progress es global

Dos guardianes lo aplican: `feature.py` (`cmd_start` rechaza si existe otra
feature `in_progress`) y `validate_harness.py` (líneas 101-104: gap bloqueante si
hay más de una). Ninguno conoce el concepto de rama. El invariante es correcto
para un estado compartido — dos sesiones escribiendo `current.md` a la vez sería
corrupción — pero convierte el paralelismo multi-rama en colisión frontal.

### 2.3 El contrato de feature no admite claves nuevas sin schema

`assets/schemas/feature_list.schema.json`, definición `feature`: exactamente
`id/name/title/description/acceptance/status/blocked_reason`, con
`additionalProperties:false`. Añadir `branch` o `sprint` a una feature exige
tocar el schema primero — el espejo exacto de cómo se sellaron `harness_version`
(feature 5) y `discovery` (features 33/49). Además la feature 11 fijó la regla
*"a feature list is a state machine, not a timeline"*: el contrato no lleva
fechas; la cronología vive en `progress/`. Cualquier clave nueva debe respetar
esa frontera: una **etiqueta de partición** (a qué periodo pertenece la feature)
no es una fecha; una **rama** es procedencia de sesión, no estado de la feature.

### 2.4 Los artefactos crecen sin cierre

Medido hoy: `progress/history.md` 744 líneas (86 features cerradas en 8 fechas
distintas), `backlog/` 177 reportes, `feature_list.json` 92 entradas (86 `done`
que ya nadie relee pero todos los parsers recorren), y 12 documentos
`analisis-*.md` en `docs/` del repo. Nada archiva, comprime ni rota. El coste es
doble: contexto que crece para siempre (cada sesión carga más estado muerto) y
ausencia de un resumen consumible de "qué pasó en este periodo" — hoy esa
respuesta exige recorrer history + backlog + git log a mano.

### 2.5 La materia prima del documento de sprint ya se deriva

`metrics.py` (feature 56) ya agrega las tres capas en un comando read-only:

```text
status: pending=4 in_progress=1 done=86 blocked=1 (total 92)
throughput: 2026-06-17 3 ... 2026-07-01 37, 2026-07-02 10
review verdicts: approved=87 changes_requested=0 (approval rate 100%)
coverage: 86 done, 86 with impl+review reports
```

Los headings de `history.md` son parseables (`## YYYY-MM-DD - Feature N: name`,
regex ya escrita en `metrics.py`), el frontmatter de `backlog/` lleva
`feature/status/role/updated/tags` (parser ya escrito en `tools_discovery.py`),
y 29 entradas de history llevan `- **Tools:**` (procedencia de skills/agentes,
feature 59). Un documento de sprint es, en su núcleo, **un slice por periodo de
lo que `metrics.py` ya calcula globalmente**, más la narrativa.

### 2.6 El cierre existe por feature, no por periodo

`feature.py done` ejecuta el cierre atómico de UNA feature: verifier → status
`done` → entrada rica en history → reset de `current.md` → hooks `post_run`. Es
el único punto del sistema con semántica de cierre. No existe equivalente para el
periodo: ningún script, referencia ni checklist menciona sprint, iteración o
cierre de ciclo (`grep -ri sprint handyman/` = 0 hits). `references/workflow.md`
declara 7 etapas (0-6) que terminan en Closure — de la feature. El pipeline no
tiene etapa 7: cerrar el periodo.

### 2.7 Paralelismo real: la plataforma ya lo trae

`git worktree` da un directorio de trabajo por rama — y como `.handyman/` es
untracked, **cada worktree nace con su propio workspace vacío**, sin colisión de
`current.md` ni del invariante single-`in_progress`. Es el peldaño "native
platform feature" de la escalera ponytail: paralelismo multi-rama sin escribir
una línea. Lo que la plataforma NO da es (a) detección de sesión ajena cuando se
comparte un checkout (el caso de la feature 88), y (b) partición del estado por
periodo. Eso sí es trabajo del harness.

---

## 3. Propuesta: el sprint como partición declarada, el resumen como derivado

La frontera de diseño de la serie (feature 54: *estados declarados vs etapas
derivadas*) se aplica limpia:

- **Declarado:** a qué sprint pertenece una feature (`sprint: "2026-SP1"`, una
  etiqueta de partición, no una fecha) y cuál es el sprint abierto
  (`current_sprint` en `harness.config.json`). Declarar es barato y schema-first.
- **Derivado:** todo el contenido del documento de sprint — features trabajadas,
  throughput, verdicts, tools consultadas, docs producidos — se deriva de
  `feature_list` + `history.md` + `backlog/` en el momento del cierre. No se
  registra por duplicado.
- **Procedencia, no estado:** la rama se registra donde vive la sesión
  (`current.md` y la entrada de history), no en el contrato de la feature. Una
  feature no "está" en una rama; una sesión sí. Para paralelismo real, la
  recomendación operativa es `git worktree` (sección 2.7); para el caso de
  checkout compartido, registrar la rama al `start` y avisar al retomar si no
  coincide convierte la colisión silenciosa en diagnóstico explícito.

El ciclo de vida propuesto:

```text
sprint open 2026-SP1   -> estampa sprint en pending/in_progress sin etiqueta
                          + current_sprint en harness.config.json
trabajo normal          -> feature.py add/start/done (add hereda el sprint abierto)
sprint close            -> genera docs/sprints/sprint.2026-SP1.md (derivado)
                          + archiva las done del sprint fuera de feature_list
                          + limpia current_sprint
```

### Contenido del documento de sprint (qué datos son útiles)

Núcleo derivable hoy (sin código nuevo, slice de `metrics.py` + history):

- Identidad del periodo: id de sprint, fechas primera/última closure, ramas
  registradas en las entradas de history del periodo.
- Features trabajadas: tabla id/name/status final; las `blocked` con su razón
  (carry-over explícito al siguiente sprint).
- Throughput por fecha y total del periodo.
- Verdicts de revisión y tasa de aprobación a la primera.
- Cobertura: done con par `impl_`+`review_` completo.
- Procedencia de herramientas agregada: skills/agentes/MCP consultados
  (frecuencia de cada uno — la entrada para afinar `discovery`).

Recomendados además (la petición pide ideas):

- **Logros y avances generales:** sección narrativa breve escrita al cierre
  (la única parte manual; todo lo demás se deriva).
- **Docs producidos en el periodo:** lista de `analisis-*.md` y referencias
  añadidas (derivable de git log del periodo o de los links en history).
- **Crecimiento del gate:** número de suites/casos del verifier al abrir vs al
  cerrar (hoy visible en los conteos que history registra por entrada).
- **Eventos de mantenimiento:** reseals de versión, migraciones aplicadas,
  drift detectado (derivable de `.upgrade-backups/` y de history).
- **Lecciones y decisiones:** bullets que hoy quedan enterrados en entradas
  individuales de history y merecen resurfacing al cierre.
- **Pendientes que cruzan el límite:** features `pending` sin etiqueta de sprint
  que quedan para el siguiente periodo.

### La separación de docs

`$HARNESS_WORKSPACE/docs/` gana dos subcarpetas; los cuatro docs de conocimiento
(capa estable) no se mueven:

```text
docs/
  business.md architecture.md conventions.md verification.md   (conocimiento)
  current/     borradores e investigación del sprint abierto, sin revisar
  sprints/     sprint.<id>.md — un archivo por periodo cerrado
```

`current/` es el buzón del periodo: lo que se escribe durante el sprint sin pasar
revisión formal. Al cierre, lo relevante se comprime en el doc de sprint y
`current/` queda vacío para el siguiente. Espejo exacto del par
`progress/current.md` → `progress/history.md`, aplicado a documentación.

---

## 4. Literatura: qué dicen las skills consultadas

- **handyman** (`references/workflow.md`, `references/anatomy.md`): el pipeline
  0-6 cierra features, no periodos; "a stage without its artifact did not happen"
  — un sprint sin documento de cierre no ocurrió. `history.md` es append-only y
  las entradas ricas son el registro por feature; el doc de sprint es el mismo
  patrón un nivel arriba. La regla de la feature 11 (state machine, no timeline)
  delimita qué puede entrar al contrato: etiquetas sí, fechas no.
- **skill-creator**: los contratos de formato se fijan con template + script, no
  con prosa (§ formato del doc de sprint → `assets/` template + generador en
  `scripts/`); single source of truth (el resumen se deriva de los artefactos, no
  se mantiene a mano en paralelo); disclosure progresiva (SKILL.md solo puntero,
  el detalle en una reference).
- **ponytail** (la escalera): peldaño 2 — `metrics.py`, `_parse_frontmatter`,
  `resolve_workspace` y el parser de headings ya viven en el repo, el generador
  de sprint los reutiliza; peldaño 4 — `git worktree` es la feature nativa que
  resuelve el paralelismo multi-rama sin código; YAGNI — no ampliar el enum de
  estados, no versionar el workspace, no añadir `branch` al contrato de feature
  cuando la procedencia en sesión/history basta. La solución perezosa que
  funciona: una etiqueta, un generador, dos carpetas.

---

## 5. Causas raíz (con evidencia)

1. **El workspace es singleton por checkout y las ramas lo comparten.**
   `.gitignore` L8 (`.handyman/`) + evidencia viva de la feature 88 (sección
   2.1). Ninguna referencia documenta el comportamiento multi-rama ni recomienda
   worktrees.
2. **El invariante single-in_progress no distingue procedencia.** `feature.py`
   `cmd_start` y `validate_harness.py` L101-104 rechazan globalmente; el mensaje
   de error no dice ni en qué rama ni desde cuándo está abierta la otra sesión
   (el diagnóstico de la 88 exigió leer backlog y git log a mano).
3. **No existe la noción de periodo.** `grep -ri sprint handyman/` = 0. El único
   cierre del sistema es por feature (`feature.py done`); history/backlog/
   feature_list crecen sin límite (744 líneas / 177 reportes / 92 entradas).
4. **El contrato rechaza la etiqueta que el proceso necesita.**
   `additionalProperties:false` en la definición `feature` — correcto como gate
   (feature 10) pero implica que `sprint` requiere schema-first, igual que
   `harness_version` y `discovery` en su día.
5. **La documentación de periodo no tiene casa.** `docs/` del workspace = 4 docs
   de conocimiento; los borradores de investigación del periodo van al `docs/`
   del repo o quedan en backlog; no hay `current/` ni `sprints/` ni template de
   resumen de periodo en `assets/`.

---

## 6. Plan de trabajo (A–E)

Orden recomendado: A → B → C → D → E (el schema primero porque B depende de él;
la referencia al final porque documenta lo ya construido).

- **A. `sprint` en el contrato (schema-first).** Añadir `sprint` (string,
  opcional, patrón `^\d{4}-SP\d+$`) a la definición `feature` de AMBOS schemas
  (`feature_list.schema.json` + espejo en config de `harness.config.schema.json`
  si aplica) y `current_sprint` (string opcional) a la definición `config`.
  Sentinels en las 3 plantillas. Extensión de `test_docs.py::test_discovery_config`
  o test propio. Espejo de features 5/33/49. Legacy sin etiqueta sigue validando.
- **B. `scripts/sprint.py` (el generador).** Subcomandos: `open <id>` (valida
  formato, estampa `sprint: <id>` en toda feature sin etiqueta con status
  `pending`/`in_progress`, escribe `current_sprint` en `harness.config.json`,
  rechaza si ya hay sprint abierto), `close` (deriva el documento
  `docs/sprints/sprint.<id>.md` desde feature_list + history slice + backlog
  frontmatter reutilizando los helpers de `metrics.py`, mueve las features
  `done` del sprint a un archivo `archive/feature_archive.json` del workspace,
  las elimina de `feature_list.json`, limpia `current_sprint`; `--dry-run` con
  difflib), `status` (qué sprint está abierto, qué features lleva). Exit codes
  deterministas; reusa `resolve_workspace` y `_parse_frontmatter`. Nueva suite
  `tests/test_sprint.sh` cableada en `run_tests.sh`.
- **C. Procedencia de rama en la sesión.** `feature.py start` registra la rama
  actual (`git rev-parse --abbrev-ref HEAD`, tolerante a no-git) como línea
  `- **Branch:**` en `current.md`; `feature.py done` la arrastra a la entrada de
  history. `validate_harness.py` (o `preflight.py`) gana advisory NOTE no
  bloqueante: `current.md` con rama distinta de la actual = sesión de otra rama,
  con el mensaje apuntando a `feature.py block` o a worktrees. Tests en
  `test_feature.sh`. NO se añade `branch` al contrato de feature (sección 3).
- **D. La separación de docs + template.** `scaffold.sh` crea
  `docs/current/` y `docs/sprints/` (con `.gitkeep` o equivalente); nuevo
  `assets/sprint.template.md` (frontmatter `sprint/status/updated/tags` +
  secciones Identidad/Features/Métricas/Tools/Logros/Lecciones/Carry-over) que
  `sprint.py close` rellena; `index_md.py` lista los sprint docs en el MOC.
  Extensión de `test_init.sh` (scaffold crea las carpetas) y de la suite B.
- **E. Referencia y workflow.** Nueva sección `## Sprint Protocol` en
  `references/workflow.md` (open → trabajo normal → close; la etapa 7 del
  pipeline) + fila en Stages at a Glance; párrafos en `references/anatomy.md`
  (layout de docs con `current/`/`sprints/`, el archive) y
  `references/checklists.md` (item de cierre de periodo); mención del
  comportamiento multi-rama y worktrees en `references/workflow.md` Startup.
  SKILL.md: puntero de una línea SOLO si el presupuesto lo permite (hoy
  998/1000 — probablemente requiere compensación o queda fuera con nota).

---

## 7. Features sugeridas (no añadidas)

| # | name | plan | resumen |
|---|------|------|---------|
| 1 | `sprint_schema` | A | `sprint` en feature + `current_sprint` en config, schema-first |
| 2 | `sprint_script` | B | `scripts/sprint.py` open/close/status + suite propia |
| 3 | `branch_provenance` | C | rama en current.md/history + advisory de sesión ajena |
| 4 | `docs_sprint_split` | D | `docs/current/` + `docs/sprints/` + template de sprint |
| 5 | `sprint_workflow_reference` | E | Sprint Protocol + etapa 7 en las referencias |

---

## 8. Decisión de diseño

**El sprint es una etiqueta declarada; su resumen es un derivado; la rama es
procedencia de sesión; el paralelismo es de la plataforma.** Cuatro fronteras que
mantienen el cambio pequeño y en el lugar correcto:

1. El contrato de feature gana UNA clave opcional (`sprint`) que es partición,
   no cronología — la regla de la feature 11 queda intacta.
2. El documento de sprint no se mantiene: se **genera** al cierre desde los
   artefactos que el workflow ya produce (los mismos que `metrics.py` agrega).
   Mantener el resumen a mano sería duplicar el estado — la causa de drift que
   toda la serie combate.
3. La rama NO entra al contrato: una feature archivada con `branch:
   feat/x-borrada` sería dato muerto. La rama se registra donde muere con la
   sesión: `current.md` y la entrada de history.
4. Para trabajar dos ramas A LA VEZ la respuesta es `git worktree` (workspace
   untracked = uno por worktree, gratis); el harness solo añade el diagnóstico
   del caso degradado (checkout compartido, sesión ajena detectada al arrancar).

La limpieza al cierre (`close` archiva las `done` y las saca de
`feature_list.json`) es la parte con más fricción aparente — "¿borrar estado?" —
pero es deletion over addition aplicada al estado: la state machine queda pequeña
y viva, y la memoria del periodo queda donde corresponde, en el documento de
sprint y en el archive. El peor resultado posible sería un tercer lugar donde el
contexto se acumula sin cierre: exactamente el patrón que esta investigación
vino a romper.

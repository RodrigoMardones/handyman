# 🔬 Investigación: etapas medibles del workflow y herramientas deterministas de apoyo

> Documento de investigación y plan de trabajo. Responde a una petición con tres
> ejes: **(1) ¿cómo convertir el workflow de handyman en un pipeline ordenado y
> medible, con etapas explícitas y un formato de trabajo mejor; (2) qué nuevas
> herramientas deterministas apoyarían el proyecto; y (3) cómo mejorar la selección
> y la automatización del descubrimiento de herramientas?** Cada hallazgo se apoya
> en evidencia concreta del repositorio y en las skills `handyman`, `skill-creator`
> y `ponytail` como literatura. El scope del plan es `handyman/references/`,
> `handyman/scripts/`, `handyman/assets/` y `tests/`; quedan fuera `graphify-out/`
> y `.github/`.

---

## 1. El objetivo

La petición pide tres cosas relacionadas pero distintas:

1. **Workflow ordenado y medible.** Hoy el trabajo fluye por protocolos bien
   documentados (`references/workflow.md`), pero las *etapas* por las que pasa una
   feature no están formalizadas como pipeline ni existe ninguna medida de cómo fue
   el trabajo: cuánto se tarda, cuántas veces corre el verifier, cuántas revisiones
   aprueban a la primera. La pregunta es qué etapas declarar y cómo medirlas.
2. **Nuevas herramientas deterministas.** El repo ya tiene diez scripts; la
   pregunta es qué mutación u observación del harness sigue siendo manual o
   invisible y merece script propio.
3. **Selección y automatización del descubrimiento.** El bloque `discovery` y
   `tools_discovery.py` existen (features 32–37, 48–53); la pregunta es cómo pasar
   de *verificar lo declarado* a *ayudar a declarar y a seleccionar por feature*.

La tesis del documento, simétrica a la serie (`analisis-pre-post-process.md`,
`analisis-acciones-deterministas-por-capa.md`): **las etapas ya existen de facto y
la materia prima para medirlas ya está en disco** — frontmatter de `backlog/`,
headings fechados de `history.md`, contadores de `feature_list.json` — pero nadie
las declara como pipeline ni las agrega en métricas. La mejora no es inventar un
sistema de tracking nuevo: es *nombrar las etapas existentes* y *derivar las
métricas de los artefactos que el workflow ya produce*.

---

## 2. Cómo se hace hoy (con evidencia)

### 2.1 Las etapas implícitas del workflow

`references/workflow.md` define protocolos por rol (Startup, Bootstrap, Leader,
Implementer, Reviewer, Closure, Blocked, Parallel Exploration) más una sección de
estabilidad pre-feature. Leídos en orden de ejecución, dibujan un pipeline que
nunca se declara como tal:

```text
0 estabilidad   preflight.py (5 controles read-only)
1 intake        feature-request.md -> feature.py add   (pending)
2 arranque      feature.py start                        (in_progress + current.md)
3 implementación feature.py log / next                  (bullets en current.md)
4 verificación  ./init.sh                               (exit code + suites)
5 revisión      backlog.py review --status ...          (review_<f>.md)
6 cierre        feature.py done + post_run hooks        (history.md + reset)
```

Cada etapa ya tiene guardián determinista y artefacto en disco. Lo que falta es
(a) el pipeline *nombrado* en la referencia, y (b) una vista agregada de sus
artefactos.

### 2.2 La máquina de estados es más gruesa que las etapas

El contrato de `feature_list.json` (`assets/schemas/feature_list.schema.json`)
declara exactamente cuatro estados:

```json
"status": { "enum": ["pending", "in_progress", "done", "blocked"] }
```

`in_progress` cubre cuatro etapas reales (arranque, implementación, verificación,
revisión). Esto **no es un defecto del contrato**: la feature 11
(`feature_contract_no_dates`) fijó la regla *"a feature list is a state machine,
not a timeline"* y la cronología vive en `progress/`. La consecuencia de diseño es
que la granularidad de etapas **no debe buscarse ampliando el enum** (más estados =
más transiciones que validar y más formas de corromper estado), sino leyéndola de
los artefactos que cada etapa ya deja.

### 2.3 Qué es medible hoy (y qué no)

Medible hoy, de forma determinista:

- **Verifier**: exit code binario de `./init.sh`; conteos por suite (10 suites en
  `tests/run_tests.sh`).
- **Presupuestos de tokens**: `test_token_budgets` (SKILL.md ≤1000 palabras,
  description ≤500 chars, AGENTS.template ≤250 palabras).
- **Trigger de la skill**: `evals.py measure` (matriz de confusión, accuracy,
  media±desviación por corridas) — opt-in, estocástico, degrada con NOTE.
- **Estabilidad**: `preflight.py` reporta format/drift/sync/discovery (siempre
  exit 0).

No medible hoy (sin herramienta que lo derive):

- **Throughput**: features cerradas por fecha o por rama.
- **Tasa de aprobación a la primera**: cuántos `review_*.md` dicen `approved` vs
  `changes_requested`.
- **Cobertura de reportes**: qué features `done` tienen su par
  `impl_*/review_*` en `backlog/` y cuáles cerraron sin evidencia.
- **Duración de sesión**: distancia entre el `Start` de `current.md` y el heading
  fechado de `history.md`.
- **Ruido de discovery**: cuántos NOTEs "installed but not declared" acumula el
  check (hoy: 18 en este repo).

### 2.4 La materia prima para medir ya existe, dispersa

Tres capas de artefactos ya llevan datos estructurados y fechados:

- `progress/history.md`: headings deterministas escritos por `feature.py done`:

  ```text
  ## 2026-06-18 - Feature 5: harness_versioning
  ## 2026-06-18 - Feature 6: upgrade_harness_check
  ```

  Fecha, id y nombre parseables por regex estable.
- `backlog/*.md`: frontmatter YAML por tipo, estampado por `backlog.py`
  (`feature`, `status: implemented|approved|changes_requested`, `role`, `updated`,
  `tags`), y ya validado en forma por el advisory `check_frontmatter_advisory` de
  `validate_harness.py` (feature 24).
- `feature_list.json`: conteos por status, ya parseado por `validate_harness.py`
  y validado contra schema vivo (feature 10).

Ninguna herramienta agrega estas tres capas. El paralelo exacto es el hallazgo de
`analisis-pre-post-process.md` §2.5: *"no falta capacidad, falta orquestación"* —
aplicado ahora a la **observación** en lugar de a los chequeos.

### 2.5 Cobertura determinista por etapa

Inventario de los diez scripts (`handyman/scripts/`) mapeados al pipeline de 2.1:

| Script | Etapa(s) que cubre | Tipo |
|---|---|---|
| `scaffold.sh` | bootstrap (previo al pipeline) | mutación |
| `preflight.py` | 0 estabilidad | observación (exit 0 siempre) |
| `feature.py` | 1 intake, 2 arranque, 3 log/next, 6 cierre + post_run | mutación |
| `validate_harness.py` | 0/4 (fase `validate` del verifier) | observación bloqueante |
| `update_harness.py` | 0 (sync `--check`/`--sync`) | mutación + observación |
| `upgrade_harness.py` | 0 (drift `--check`/apply) | mutación + observación |
| `backlog.py` | 3/5 (reportes impl/review/explore) | mutación |
| `index_md.py` | 6 (MOC, típico `post_run`) | mutación |
| `tools_discovery.py` | 0 (discovery `list/find/check`) | observación |
| `evals.py` | gate condicional de description | observación |

Huecos visibles en la tabla:

- **Ninguna herramienta de métricas**: todas las observaciones son *de estado
  presente* (¿está bien formado ahora?), ninguna es *histórica* (¿cómo ha ido el
  trabajo?).
- **`preflight.py` no puede gatear ni cuando el operador quiere**: exit 0
  hardcodeado está bien como advisory de sesión, pero en CI no hay forma opt-in de
  fallar ante `BEHIND`/`DRIFT` (el docstring lo declara: *"0 always"*).
- **`migrate-global` sigue siendo la única operación sin script**
  (`analisis-iteraciones.md`, mitigación C de
  `analisis-acciones-deterministas-por-capa.md`, saltada por decisión de usuario).
  Se registra y no se re-propone aquí.

### 2.6 Discovery hoy: declarado ≠ seleccionado

El descubrimiento tiene tres piezas maduras (features 33–37, 48–53): el bloque
`discovery` (`skills`/`mcp`/`agents`) en `harness.config.json`,
`tools_discovery.py list/find/check` con rutas resueltas, y el advisory no
bloqueante. Quedan tres brechas de *selección y automatización*:

1. **Declarar sigue siendo edición manual.** No hay subcomando que promueva una
   skill instalada al bloque `discovery`: el operador edita `harness.config.json`
   a mano (el mismo antipatrón que la feature 13 eliminó para `feature_list.json`
   con `feature.py add`). El síntoma vivo son los 18 NOTEs
   `installed but not declared` que el check imprime en este repo en cada corrida:
   ruido estable que nadie cura porque curarlo es manual.
2. **La selección por feature es prosa.** La sección `## Tools` de
   `feature-request.template.md` nombra skills/agents por feature, pero el Leader
   Protocol la trata como guía: `feature.py add` persiste solo contract keys
   (correcto: el schema es cerrado) y **nadie valida en intake** que lo listado
   exista en `discovery` o en disco. La validación llega tarde (preflight de la
   sesión) o nunca.
3. **No hay provenance al cierre.** La entrada rica de `history.md` registra
   Agent/Plan/Changes/Verification/Review/Closure, pero no qué skills o agentes se
   usaron de verdad — la única fuente para automatizar la *selección futura*
   (¿qué herramientas usa este repo realmente?) no se registra.

---

## 3. Propuesta: etapas declaradas, métricas derivadas

El eje 1 pide "determinar etapas". La propuesta concreta es formalizar el pipeline
de 2.1 como tabla normativa en `references/workflow.md`, con una regla de oro por
etapa: **cada etapa produce un artefacto datado en disco; una etapa sin artefacto
no ocurrió**.

| # | Etapa | Guardián | Artefacto (evidencia) | Medida derivable |
|---|---|---|---|---|
| 0 | estabilidad | `preflight.py` | reporte 4 bloques | NOTEs/drift por sesión |
| 1 | intake | `feature.py add` | entrada `pending` | tamaño de backlog |
| 2 | arranque | `feature.py start` | `current.md` frontmatter | fecha de inicio |
| 3 | implementación | `feature.py log/next` | bullets de `## Log` | pasos por feature |
| 4 | verificación | `./init.sh` | exit code, suites | corridas hasta verde |
| 5 | revisión | `backlog.py review` | frontmatter `status:` | aprobación 1ª pasada |
| 6 | cierre | `feature.py done` | heading fechado en history | throughput, duración |

Las medidas de la última columna se **derivan** de los artefactos; no se declaran
en ningún contrato nuevo. Esto respeta las dos fronteras ya selladas por la serie:
*state machine, not a timeline* (feature 11: el contrato no lleva fechas) y
*deterministic contract vs stochastic measurement* (features 38–39: lo que gatea es
determinista; lo que mide, informa). La frontera nueva que este documento propone:
**el contrato declara estados; las etapas se miden por artefactos**.

---

## 4. Literatura: qué dicen las skills consultadas

- **`handyman`** (`references/workflow.md`, `references/checklists.md`,
  `references/anatomy.md`): los protocolos por rol ya son un pipeline implícito con
  transiciones de estado recomendadas (`pending -> in_progress -> done`); el disco
  es la fuente de verdad y cada rol deja reportes con frontmatter. Todo el material
  de medición es artefacto de primera clase del harness — solo falta la vista.
- **`skill-creator`**: el loop de mejora es *medible por diseño* — evals con
  varianza (cada query N veces), train/held-out contra overfitting, y la regla
  *scripts para lo determinista/repetitivo*. Aplicado al workflow: la agregación de
  métricas es exactamente el tipo de tarea repetitiva y determinista que merece
  script, no prosa; y una métrica sin baseline (primera medición guardada) no
  permite juzgar mejora.
- **`ponytail`** (la escalera): rung 1 — ¿necesita existir un event-log nuevo, una
  base de datos de métricas, un dashboard? No: YAGNI. Rung 2 — ¿ya vive en el
  codebase? Sí: headings de history, frontmatter de backlog, counts de
  feature_list, y los helpers `resolve_workspace`/`_parse_frontmatter` ya escritos.
  La solución perezosa correcta es un lector que agrega lo que ya existe. *"The
  smallest change in the wrong place isn't lazy, it's a second bug"*: ampliar el
  enum de status para ganar granularidad sería el cambio pequeño en el lugar
  equivocado; la granularidad está en los artefactos.

---

## 5. Causas raíz (con evidencia)

1. **El pipeline existe pero nunca se declaró.** `references/workflow.md` documenta
   protocolos por rol, no etapas de extremo a extremo; la sección de estabilidad
   (features 42–47) fue el primer paso de formalización y quedó como único
   fragmento nombrado. Evidencia: 2.1.
2. **La granularidad de estados se fijó gruesa a propósito** (feature 11) y la
   cronología se delegó a `progress/`, pero nunca se construyó el lector que
   derivara de ahí las medidas que el contrato renunció a llevar. Evidencia: 2.2,
   2.4.
3. **Todas las observaciones deterministas son de estado presente.** validate,
   preflight, check, --check: fotografían *ahora*; ninguna herramienta lee la
   historia acumulada que el propio workflow estampa con formato determinista.
   Evidencia: 2.5.
4. **Declarar herramientas es manual aunque verificarlas es determinista.** El
   mismo gap que `feature_list.json` tenía antes de `feature.py add` (feature 13):
   el check detecta, pero la cura es hand-edit — y el ruido se acumula (18 NOTEs).
   Evidencia: 2.6.
5. **La selección de herramientas por feature no se valida ni se registra.** El
   form la pide, el intake la descarta (por contrato cerrado, correcto) y el cierre
   no la persiste — así que no hay datos para automatizar la selección futura.
   Evidencia: 2.6.

---

## 6. Plan de trabajo (A–E)

Cada ítem separa lo **determinista** (script/test) de lo **documental**
(references/assets). `SKILL.md` (998/1000) y `AGENTS.template.md` (249/250) quedan
**intactos**: nada de este plan necesita tocar la superficie de tokens.

- **A — Declarar las etapas en la referencia** *(eje 1, documental)*. Añadir a
  `references/workflow.md` una sección breve con la tabla etapa → guardián →
  artefacto → medida (sección 3 de este doc), y la regla "una etapa sin artefacto
  no ocurrió". Cross-ref en `references/checklists.md` (item de cierre: los
  artefactos de las 7 etapas existen). Sin tocar SKILL.md.

- **B — `scripts/metrics.py`** *(ejes 1+2, determinista)*. Nuevo script read-only
  que agrega las tres capas existentes: headings de `history.md` (regex del
  formato que `feature.py done` ya escribe), frontmatter de `backlog/*.md`
  (reutilizando `_parse_frontmatter` de `tools_discovery.py`), y counts de
  `feature_list.json` (reutilizando `resolve_workspace`). Salida: resumen por
  status, throughput por fecha, tasa de aprobación a la primera, features `done`
  sin par impl/review, con `--json` para consumo posterior. Siempre exit 0
  (observa, no gatea — espejo de `preflight.py`). Suite `tests/test_metrics.sh`
  cableada en `run_tests.sh`.

- **C — `preflight.py --strict`** *(eje 2, determinista)*. Flag opt-in que
  devuelve exit ≠ 0 si algún bloque reporta `BEHIND`/`DRIFT`/`MISSING`, pensado
  para CI de repos harness. El default sigue siendo exit 0 (advisory de sesión,
  regla actual documentada). Un caso nuevo en `tests/test_preflight.sh` por rama
  (strict limpio → 0; strict con drift → ≠0).

- **D — `tools_discovery.py declare`** *(eje 3, determinista)*. Subcomando
  `declare <skill|mcp|agent> <name>` que añade el nombre al bloque `discovery` de
  `harness.config.json` con json round-trip (indent=2), rechaza duplicados, valida
  el resultado contra `harness.config.schema.json` si `jsonschema` está presente, y
  `--dry-run` para previsualizar. Cierra el ciclo detectar → curar sin hand-edit
  (espejo exacto de `feature.py add` vs feature_list, feature 13) y da salida al
  ruido de `installed but not declared`.

- **E — Selección por feature: validar en intake, registrar al cierre** *(eje 3,
  documental + template)*. (1) Paso en el Leader Protocol: al convertir el form,
  correr `tools_discovery.py check` y confrontar la sección `## Tools` contra el
  bloque `discovery` — lo listado y ausente se declara (con D) o se corrige antes
  del `add`. (2) La entrada rica que `feature.py done` escribe en `history.md`
  gana una línea `Tools:` (junto a Agent/Plan/...) para registrar qué
  skills/agentes se usaron — provenance mínima que B puede agregar después.

Orden recomendado: A (nombra el marco) → B (lo hace visible) → D (cura el ruido)
→ C (endurece opt-in) → E (cierra el lazo de selección). B y D son independientes
entre sí; C depende solo de preflight; E toca `workflow.md` (como A) y
`feature.py` (mutación pequeña y aislada en la plantilla de entrada de history).

---

## 7. Features sugeridas (no añadidas)

Reflejando la práctica de la serie (una request = una feature; se listan para una
entrega futura, no se añaden aquí):

- `workflow_stages_reference` (A)
- `metrics_script` (B)
- `preflight_strict_mode` (C)
- `tools_discovery_declare` (D)
- `feature_tools_provenance` (E)

---

## 8. Decisión de diseño

Tres fronteras, una idea:

- **Determinista vs semántico** (heredada): lo que gatea y lo que cura es script;
  el disparo de skills y la elección fina de herramientas siguen siendo de la
  plataforma.
- **Contrato portable vs resolución local** (heredada): `discovery` guarda
  nombres; las rutas y el estado instalado se resuelven por consulta.
- **Estados declarados vs etapas derivadas** (nueva): el contrato de
  `feature_list.json` se queda en cuatro estados; las etapas finas y todas sus
  métricas se **derivan** de los artefactos datados que el workflow ya produce
  (history headings, backlog frontmatter, current.md). Medir no requiere ampliar
  ningún contrato: requiere leer lo que ya se escribe.

Con esas fronteras, el workflow queda ordenado (pipeline de 7 etapas nombradas,
cada una con guardián y artefacto), medible (un lector determinista que agrega lo
que las etapas estampan) y con el descubrimiento cerrando su ciclo completo:
detectar (`check`), curar (`declare`), validar en intake y registrar al cierre. La
entrega correcta reutiliza la maquinaria existente; no inventa infraestructura de
tracking nueva.

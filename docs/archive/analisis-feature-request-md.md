# 🔬 Investigación: un formato útil y recomendado de `feature-request`

> Documento de investigación y plan de trabajo. Responde a una pregunta concreta:
> **al ejecutar `/handyman bootstrap` se genera `feature-request.md` como copia
> exacta de una plantilla genérica, no como una recomendación nacida de la
> experiencia. ¿Cómo, a partir de las peticiones reales hechas en este proyecto,
> aproximar un formato verdaderamente útil y dejarlo como base editable dentro de
> Handyman, de modo que ese único documento de entrada baste para formular
> peticiones formales —tal como se está haciendo con esta misma petición?**
> Cada hallazgo se apoya en evidencia concreta del repositorio. El scope del plan
> es `SKILL.md`, `references/` y `assets/`.

---

## 1. El objetivo

`feature-request.md` es el **único documento de entrada** del flujo `run-feature`:
el humano lo rellena para encuadrar **una** feature, el leader lo convierte en una
entrada de `feature_list.json` con `scripts/feature.py add`, y a partir de ahí
corre el ciclo implementar → revisar → cerrar con el verifier verde. La feature
pide que ese documento deje de ser una **copia genérica** y pase a ser una
**recomendación destilada de la experiencia** del proyecto: un formato que el
usuario pueda editar y que, por sí solo, baste para hacer peticiones formales.

La pregunta no es "¿existe el formulario?" —ya existe `assets/feature-request.template.md`—
sino "¿por qué el formulario actual es una **plantilla genérica** y no una
**recomendación**, y qué enseña el propio historial de peticiones de este repo
sobre una forma más útil?". La respuesta es simétrica a la de los análisis previos
de `bootstrap`: mientras el documento siga siendo una copia plana de campos sin
guía ni ejemplos propios, la calidad de la petición queda a criterio de quien lo
rellene.

---

## 2. Cómo se usa hoy `feature-request` (el camino "copia")

### 2.1 El scaffold copia la plantilla genérica tal cual

`scripts/scaffold.sh` (línea 149) hace
`copy_template "$ASSETS_DIR/feature-request.template.md" "$HARNESS_WORKSPACE/feature-request.md"`.
Es una **copia literal**: el `feature-request.md` que recibe cada harness nuevo es
idéntico a la plantilla genérica, sin ninguna adaptación al estilo de petición del
repo destino. De ahí la observación del usuario: "es solo la copia exacta de lo que
existe y no la recomendación".

### 2.2 La plantilla tiene un único worked example, ajeno al repo

`assets/feature-request.template.md` cierra con un `## Worked example`:
`backfill_event_attendees` — el backfill de asistentes base en eventos ya iniciados
de una app con **modelo de datos y base de datos**. Es un buen ejemplo *en
abstracto*, pero **no se parece a ninguna** de las peticiones reales de este
proyecto (que es una *skill*, no una app con DB). El usuario que mira ese ejemplo no
ve reflejada su forma de pedir.

### 2.3 Los campos esenciales y los raros conviven planos

El bloque `## Template (copy and fill)` lista, al mismo nivel, secciones que en la
práctica **siempre** se rellenan (Feature, Context, Scope > Includes, Acceptance,
Verification > Gate, Tools > skills) junto a otras que **casi nunca** se usan
(Scope > Model/schema changes, Verification > Functional check, Post-feature,
Tools > sub-agents, Questions / prior investigation). Una lista plana invita a dos
fallos opuestos: dejar placeholders sin rellenar, o sobre-rellenar con ruido.

### 2.4 El form no dice qué se convierte en la entrada de `feature.py add`

`references/workflow.md` (Leader Protocol, paso 4) sí mapea form → `feature.py add`
y aclara que `add` escribe **solo** las claves de contrato
(`id`, `name`, `title`, `description`, `acceptance`, `status`). Pero el **propio
formulario calla ese mapeo**: quien lo rellena no sabe que `Verification`,
`Considerations`, `Tools` y `Post-feature` son **guía de proceso** (para el leader y
el humano), no campos que se guarden en `feature_list.json`.

### 2.5 El ejemplo canónico no modela usar el form

`references/examples.md`, `Example 2: Run One Feature`, arranca de
"Run the next pending feature" con la feature **ya presente** en `feature_list.json`.
No hay un turno que muestre al usuario **rellenando** `feature-request.md` ni al
leader convirtiéndolo en entrada. El walkthrough canónico no enseña el intake, así
que el form vive sin un ejemplo de uso que lo respalde.

---

## 3. Evidencia: qué forma tienen las peticiones reales

La mejor fuente de "experiencia ganada" son las **24 features** ya cerradas
(`feature_list.json`) más esta misma petición. Al leerlas, las peticiones reales se
agrupan en **dos arquetipos** nítidos:

| Arquetipo | Features (evidencia) | Forma típica |
|-----------|----------------------|--------------|
| **Investigación** | 9, 15, 20, y esta (25) | "Investiga X, documenta causas, deja un plan en `docs/`". Scope = `SKILL.md`/`references/`/`assets/`. Acceptance = "deja el plan en `docs/`" + gate verde. Considerations = consultar `skill-creator`. Genera features de implementación de seguimiento. |
| **Implementación** | 1–8, 10–14, 16–19, 21–24 | Hueco concreto de capacidad, a menudo "Plan X de `docs/...`". Scope = scripts/references/assets específicos. Acceptance = balas observables + **siempre** "`bash tests/run_tests.sh` passes". Considerations = a veces una skill complementaria. |

### 3.1 Campos que **siempre** aparecen (el núcleo real)

- `name` + `title`
- `Context` (el porqué)
- `Scope > Includes` (el radio de cambio del implementador)
- `Acceptance criteria` observable y testable
- `Verification > Gate` que debe seguir verde
- `Tools > skills`

### 3.2 Campos que **rara vez** se rellenan (ruido para muchas peticiones)

- `Scope > Excludes` — a veces, cuando hay riesgo de ambigüedad.
- `Scope > Model/schema changes` — **nunca** en este repo; es propio de apps con
  modelo de datos (el worked example lo usa, las peticiones reales no).
- `Verification > Functional check` — a veces; muchas veces se pliega en Acceptance.
- `Post-feature` — rara vez explícito (la publicación de PR es un flujo aparte).
- `Tools > sub-agents (read-only advice)` — rara vez.
- `Questions / prior investigation` — rara vez como sección propia; suele plegarse
  en `Context` o **convertirse en su propia feature de investigación**.

### 3.3 La invariante empírica más fuerte: el gate verde es la última Acceptance

En **las 24 features**, la **última** bala de `Acceptance` es el gate verde
(`bash tests/run_tests.sh` passes / `./init.sh` verde). No es decorativo ni
opcional: es el contrato que cierra la feature. El formulario actual lo menciona en
`Verification` y en una regla en prosa, pero **no** lo presenta como lo que la
experiencia demuestra que es: **la última bala obligatoria de Acceptance**.

---

## 4. Causas raíz (con evidencia)

| # | Causa | Evidencia |
|---|-------|-----------|
| 4.1 | La plantilla es una **forma única genérica**; no codifica los dos arquetipos reales | Las 24 features se parten limpio en investigación (9/15/20/25) vs implementación; el template tiene un solo worked example |
| 4.2 | El worked example es de una **app con modelo de datos**, ajeno a las peticiones del repo | `assets/feature-request.template.md` `## Worked example` = `backfill_event_attendees` |
| 4.3 | Campos **opcionales y esenciales conviven planos** → invita a placeholders o a ruido | `Model/schema changes`, `Functional check`, `Post-feature`, `sub-agents`, `Questions` casi nunca se rellenan en 24 peticiones |
| 4.4 | El form **no explicita** que el gate verde es también la **última** bala de Acceptance | Toda Acceptance real termina en "tests pass"; el template lo dice solo en `Verification` + una regla en prosa |
| 4.5 | El form **no dice** qué campos forman la entrada de `feature.py add` y cuáles son guía | `references/workflow.md` Leader Protocol #4 mapea form→`add`, pero el formulario calla el mapeo |
| 4.6 | `bootstrap` copia la plantilla genérica **verbatim**; nada la adapta al estilo del repo | `scripts/scaffold.sh` línea 149 (`copy_template feature-request.template.md`) |
| 4.7 | El **ejemplo canónico** no modela usar el form | `references/examples.md` `Example 2` parte de una feature `pending` existente |

La conclusión es la misma de los análisis de `bootstrap`: convertir un documento
**pasivo y genérico** en una **recomendación activa** exige (a) codificar la
experiencia en su estructura (núcleo vs opcional), (b) sustituir el ejemplo ajeno
por **ejemplos propios por arquetipo**, y (c) hacer explícitos los **contratos de
formato** que hoy viven solo en la prosa de `references/` (gate verde como última
Acceptance; qué campos forman la entrada de `add`).

---

## 5. El formato recomendado (concreto y editable)

Principio rector (de `skill-creator`): **lo determinista va en `scripts/`/contrato;
la redacción humana se guía con estructura + ejemplos, no con MUSTs sueltos.** La
recomendación reestructura el documento en un **núcleo mínimo siempre relleno**, un
bloque de **extensiones opcionales** (solo si aplican) y **dos ejemplos por
arquetipo** tomados del propio repo. Este es el cuerpo propuesto para
`assets/feature-request.template.md` (listo para levantar en la mitigación A):

```text
/handyman run-feature        # intención: sembrar la feature en feature_list.json y ejecutarla

# ── Cómo escribir una buena petición (recomendación basada en la experiencia) ──
# - Una petición = UNA feature. Si pide dos cosas, pártela en dos peticiones.
# - La Acceptance es observable y testable: cada bala se puede verificar con una prueba.
# - La ÚLTIMA bala de Acceptance es SIEMPRE el gate verde (./init.sh | bash tests/run_tests.sh).
# - Elige arquetipo: [Investigación] deja un plan en docs/ ; [Implementación] cambia código + tests.
# - Rellena el NÚCLEO siempre; borra las secciones OPCIONALES que no apliquen (no dejes placeholders).
# - Lo que se guarda en feature_list.json (vía feature.py add) es SOLO: name, title, description, acceptance.
#   El resto (Verification, Considerations, Tools, Post-feature) es guía para el leader y el humano.

## ───────── NÚCLEO (rellena siempre) ─────────

## Feature
- name: <slug_corto>            # p.ej. backlog_generator
- title: <título legible>

## Context
<por qué existe la tarea: estado actual, problema y dónde ocurre>

## Scope
- Includes: <qué se va a tocar>      # define el radio de cambio del implementador

## Acceptance criteria (observable y testable)
- <requisito concreto y verificable 1>
- <requisito 2 ...>
- bash tests/run_tests.sh passes     # o ./init.sh — el gate verde va SIEMPRE como última bala

## Verification
- Gate que debe seguir verde: <./init.sh | pytest -q | bash tests/run_tests.sh>

## Tools
- skills: <handyman, ...>

## ───────── OPCIONAL (rellena solo si aplica; si no, borra la sección) ─────────

## Scope (extensión)
- Excludes: <qué queda fuera, si hay riesgo de ambigüedad>
- Cambios de modelo/esquema: <permitido / solo si es inevitable / prohibido>   # apps con modelo de datos

## Verification (extensión)
- Chequeo funcional: <qué request/acción y el resultado esperado>

## Considerations
- <restricciones, skills complementarias, estilo — p.ej. ponytail, skill-creator>

## Post-feature
- <docs a actualizar bajo HARNESS_WORKSPACE/docs/...>
- <publicación de PR u otro cierre>

## Tools (extensión)
- sub-agents (consejo read-only): <explorer / *.agent.md>

## Questions / investigación previa
- <pregunta abierta -> resuélvela como explorer ANTES de implementar; el hallazgo guía el plan>
```

### Ejemplo A — petición de **Investigación** (espejo de las features 9/15/20/25)

```text
/handyman run-feature

## Feature
- name: deterministic_actions_per_layer
- title: Acciones deterministas por capa del harness

## Context
Varias mutaciones del harness (backlog, current.md, history.md) se hacen a mano y
carecen de un script determinista, a diferencia de feature_list.json (cubierto por
feature.py). Conviene mapear el hueco antes de construir nada.

## Scope
- Includes: docs/ (documento de investigación); el plan enfoca SKILL.md y references/.

## Acceptance criteria (observable y testable)
- documento en docs/ que mapea, por capa/artefacto, qué acciones tienen script vs. se hacen a mano
- el plan propone scripts deterministas concretos y dónde documentarlos (SKILL.md / references/)
- bash tests/run_tests.sh passes (sin romper la verificación de links de test_docs.py)

## Verification
- Gate que debe seguir verde: ./init.sh

## Tools
- skills: handyman, skill-creator
```

### Ejemplo B — petición de **Implementación** (espejo de las features 21–24)

```text
/handyman run-feature

## Feature
- name: backlog_generator
- title: scripts/backlog.py — generador determinista de entradas de backlog/

## Context
Las entradas de backlog/ (impl_/review_/explore_) se redactan a mano con el
frontmatter por tipo; no hay generador, a diferencia de feature.py para el estado.
Implementa el Plan A de docs/analisis-acciones-deterministas-por-capa.md.

## Scope
- Includes: scripts/backlog.py, assets/backlog-*.template.md, references (anatomy/templates/workflow), tests/test_backlog.sh

## Acceptance criteria (observable y testable)
- backlog.py impl <feature> crea impl_<feature>.md con el frontmatter de implementer
- backlog.py review <feature> [--status approved|changes_requested] crea review_<feature>.md coherente
- nunca sobrescribe una entrada existente (idempotente)
- tests/test_backlog.sh cubre cada subcomando y está cableado en run_tests.sh
- bash tests/run_tests.sh passes

## Verification
- Gate que debe seguir verde: ./init.sh
- Chequeo funcional: correr backlog.py impl demo_feature y ver el archivo con frontmatter correcto

## Considerations
- ponytail: el cambio más pequeño que cumple la Acceptance

## Tools
- skills: handyman
```

Ambos ejemplos están **tomados de features reales del repo** (20 y 21–24): es la
diferencia entre "una plantilla genérica" y "una recomendación basada en la
experiencia" que pide la petición.

---

## 6. Plan de acción (foco en `SKILL.md`, `references/` y `assets/`)

| # | Causa | Mitigación | Archivos (scope) | Prioridad |
|---|-------|------------|------------------|-----------|
| A | 4.1, 4.3 | Reestructurar la plantilla en **Núcleo (siempre) + Opcional (solo si aplica)** con el encabezado de recomendación de §5 | `assets/feature-request.template.md` | Alta |
| B | 4.2, 4.7 | Sustituir el worked example genérico por **dos ejemplos por arquetipo** grounded en el repo (Investigación + Implementación) | `assets/feature-request.template.md` | Alta |
| C | 4.4, 4.5 | Añadir la nota **"qué se convierte en la entrada de `feature.py add`"** y declarar el **gate verde como última Acceptance** | `assets/feature-request.template.md`, `references/templates.md` | Alta |
| D | 4.7 | Modelar el **intake form-first** en el ejemplo canónico (un turno donde el usuario rellena el form y el leader lo convierte con `feature.py add`) | `references/examples.md` | Media |
| E | 4.6 | Describir el split **Núcleo/Opcional** y los arquetipos en la sección `## feature-request.md` de `templates.md` (la recomendación pesada vive en `references/`, on-demand) | `references/templates.md` | Media |

### Detalle por mitigación

**A — Núcleo + Opcional en la plantilla.** Reescribir el bloque
`## Template (copy and fill)` de `assets/feature-request.template.md` con la
estructura de §5: encabezado de recomendación, sección NÚCLEO (Feature, Context,
Scope>Includes, Acceptance con el gate como última bala, Verification>Gate,
Tools>skills) y sección OPCIONAL (Excludes, Cambios de modelo/esquema, Functional
check, Considerations, Post-feature, sub-agents, Questions). El opcional se **borra
si no aplica** en vez de quedar como placeholder.

**B — Ejemplos por arquetipo.** Reemplazar el `## Worked example` único por los
**dos** ejemplos de §5, tomados de features reales del repo (20 y 21–24), para que
el usuario vea reflejada su forma de pedir (investigación y implementación) en lugar
de un backfill de una app con DB.

**C — Contratos de formato explícitos.** Añadir al formulario (y reflejar en la
sección `## feature-request.md` de `references/templates.md`): (1) qué campos forman
la entrada de `feature.py add` (`name`, `title`, `description`, `acceptance`) y
cuáles son guía de proceso; (2) que el gate verde va **siempre** como última bala de
Acceptance. Son **contratos de formato** → se enuncian crisp, no como prosa suelta.

**D — Modelar el intake en el ejemplo.** Añadir a `references/examples.md` un turno
(en `Example 2` o un ejemplo corto nuevo) donde el usuario rellena
`feature-request.md` y el leader lo convierte con `feature.py add`, para que el
walkthrough canónico **muestre** el uso del form (hoy ausente, causa 4.7).

**E — Recomendación en `templates.md`.** Ampliar la sección `## feature-request.md`
de `references/templates.md` para describir el split Núcleo/Opcional y los dos
arquetipos, de modo que la guía pesada viva en `references/` (disclosure
progresiva), con `SKILL.md` conservando solo su puntero actual ("offer the
`feature-request.md` form").

### Fuera de scope (documentado para no inventar workarounds)

- **`SKILL.md`** más allá del puntero actual: el presupuesto de tokens está en
  997/1000 (margen 3); cualquier texto nuevo en `SKILL.md` debe compensarse y va en
  **su propia feature**. El puntero "offer the `feature-request.md` form" ya existe
  y basta.
- **Test estático en `tests/test_docs.py`** que verifique que la plantilla lleva los
  marcadores NÚCLEO/OPCIONAL y los dos ejemplos por arquetipo (espejo de
  `test_business_intake_prompts`) → **feature propia** (capa tests).
- **Cualquier advisory/gate vivo** sobre el contenido de `feature-request.md` →
  **feature propia** (es un documento opcional, no gateado; mantenerlo así).

### Secuencia recomendada

A y C primero (fijan la estructura núcleo/opcional y los contratos de formato),
luego B (los ejemplos por arquetipo), luego E (la recomendación en `templates.md`) y
D al final (modela el intake en el ejemplo canónico). Las piezas que tocan
`SKILL.md` más allá del puntero y la capa de tests quedan como features propias,
listadas arriba.

---

## 7. Buenas prácticas de `skill-creator` aplicadas

Consultada la skill `skill-creator` para encuadrar la propuesta:

- **Las plantillas son `assets/` (files used in output).** La recomendación pesada
  (estructura + ejemplos) vive en el asset y en `references/templates.md`; `SKILL.md`
  solo guarda un **puntero corto**. Es el modelo de **disclosure progresiva** de tres
  niveles (metadata → `SKILL.md` → bundled resources) que `skill-creator` describe.
- **Examples pattern.** `skill-creator` recomienda **incluir ejemplos** y darles
  forma clara; mejor **dos ejemplos por arquetipo grounded** en el uso real que un
  único worked example genérico (causa 4.2).
- **"Explica el porqué, no MUSTs pesados — salvo en contratos de formato."** El gate
  verde como última Acceptance y el mapeo campo→contrato de `feature.py add` son
  **contratos de formato** → se enuncian crisp; el resto (cómo redactar Context,
  Considerations) es guía con el *porqué*.
- **Capture Intent / interview-first.** El formulario **es** el intake: estructurarlo
  para capturar primero la **intención esencial** (una feature, Acceptance observable,
  gate verde) y el detalle opcional después.
- **Principio de no-sorpresa.** El formato recomendado **no cambia** las claves de
  contrato de `feature.py add`; solo mejora **cómo el humano encuadra** la petición.
  El documento sigue siendo opcional y no gateado.

---

## 8. Resumen

`feature-request.md` no es hoy una recomendación porque `bootstrap` copia una
**plantilla genérica verbatim** (`scaffold.sh` L149), con un **único worked example
ajeno** al repo (`backfill_event_attendees`), **campos esenciales y raros mezclados
planos**, y **sin hacer explícitos** los contratos de formato que la experiencia
demuestra (el gate verde como última Acceptance; qué campos forman la entrada de
`feature.py add`). El historial real de **24 features** revela **dos arquetipos**
(investigación vs implementación) y un **núcleo de campos** que siempre se usa frente
a un conjunto opcional que rara vez se rellena. La solución reestructura el documento
en **Núcleo + Opcional** (A), lo dota de **dos ejemplos por arquetipo grounded** en
el repo (B), hace explícitos los **contratos de formato** (C), **modela el intake**
en el ejemplo canónico (D) y traslada la **recomendación a `templates.md`** (E),
dejando `SKILL.md` (presupuesto de tokens) y la capa de tests como features propias.
Resultado esperado: un único documento de entrada que, por sí solo, **recomienda**
cómo formular una petición formal —no solo la copia de un molde.

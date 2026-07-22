# 🔬 Investigación: tests asociados a las evaluaciones del modelo

> Documento de investigación y plan de trabajo. Responde a una pregunta concreta:
> **¿cómo se prueban hoy las evaluaciones del modelo en Handyman, por qué ese
> "test de evaluación" vive como dato suelto sin arnés que lo ejecute ni que lo
> guarde, y cuál es —según la literatura de `skill-creator` y `mcp-builder`— la
> mejor forma de mejorarlo?**
> Cada hallazgo se apoya en evidencia concreta del repositorio y en esas dos
> skills como literatura. El scope del plan es `tests/`, `handyman/scripts/`,
> `handyman/references/`, `handyman/assets/` y `.github/`. Es un documento de
> investigación: no cambia código de producto, solo lo diagnostica y propone.

---

## 1. El objetivo

La petición es honesta: *"necesito mejorar el uso de los tests asociados a las
evaluaciones del modelo, pero tengo poca idea de cómo resolverlo; investiga en la
literatura de las skills cuál puede ser la mejor solución"*. No hay un diseño
prefijado que validar, sino una pregunta abierta sobre **qué significa, en este
repo, "testear una evaluación del modelo" y cómo hacerlo bien**.

"Evaluación del modelo" aquí no es abstracto: Handyman ya tiene un artefacto que
es exactamente eso —`handyman/evals/trigger-eval.json`— y el `README`/memoria del
repo lo describen como *"el gate obligatorio antes de tocar la `description`"*. La
investigación, entonces, se concreta en tres sub-preguntas:

1. **¿Qué se prueba hoy?** ¿Qué hace ese eval, qué lo ejecuta, qué lo protege?
2. **¿Qué dice la literatura?** ¿Cómo proponen `skill-creator` y `mcp-builder`
   evaluar el comportamiento de un modelo, y qué de eso falta aquí?
3. **¿Cuál es la mejor solución?** ¿Qué parte de "evaluar al modelo" puede ser un
   test determinista (apto para CI y el verifier) y qué parte es irreduciblemente
   estocástica (medición de activación), y cómo conviven sin que una bloquee a la
   otra?

La respuesta es simétrica a los análisis previos de esta serie
(`error_inconsistency_docs`, `business_context_bootstrap`,
`deterministic_actions_per_layer`, `feature_request_md`, `tool_discovery`):
mientras la calidad de un artefacto dependa solo de prosa aspiracional —"acuérdate
de correr el eval antes de tocar la description"— y no de un contrato ejecutable,
esa calidad queda a criterio de quien recuerde hacerlo.

---

## 2. Cómo se prueban hoy las evaluaciones del modelo (evidencia)

### 2.1 El artefacto que SÍ existe: `evals/trigger-eval.json`

`handyman/evals/trigger-eval.json` contiene **20 queries** etiquetadas, en el
formato exacto que `skill-creator` define para evaluar el disparo de una skill:

```json
[
  {"query": "bootstrap a local handyman harness in my python notes-cli repo ...", "should_trigger": true},
  {"query": "just implement a recent-notes subcommand in src/notes/cli.py ...", "should_trigger": false}
]
```

Su composición es de buena calidad según los criterios de la literatura (ver §3):

- **10 positivos y 10 negativos** (balance, no sesga la métrica hacia una clase).
- Mezcla **inglés y español**, distintas longitudes, lenguaje casual, rutas y
  contexto personal ("mi repo de notas en python", "migra el estado del harness").
- Los negativos son **near-misses**: comparten vocabulario con la skill pero piden
  otra cosa (`"refactor this 300-line python module"`, `"set up a github actions
  workflow that runs pytest and ruff"`, `"i have a multi-agent langgraph app, help
  me debug..."`). Justo lo que `skill-creator` recomienda: los negativos valiosos
  son los difíciles, no los obviamente irrelevantes.

Es decir: el **dato de evaluación está bien hecho**. El problema no es el contenido
del eval.

### 2.2 Lo que NO existe: ningún test ni runner lo consume

Una búsqueda en todo el repo por `trigger-eval`, `should_trigger` o `eval` arroja
**cero referencias** en `tests/`, en `tests/run_tests.sh` o en `.github/`. El
runner real de calidad, `tests/run_tests.sh`, encadena **ocho** suites y **ninguna
es de evaluación**:

```
test_docs.py · test_init.sh · test_update.sh · test_feature.sh
test_backlog.sh · test_index.sh · test_upgrade.sh · test_tools_discovery.sh
```

Las únicas menciones de `trigger-eval.json` viven en prosa: `docs/analisis-
iteraciones.md` (ítem C4: *"Optimizar la `description` y medir activación con el
loop del `skill-creator`; ya hay 20 queries listas"*) y la memoria del repo. O
sea: el eval está **declarado como gate pero nunca cableado como gate**. Nadie lo
parsea, nadie mide la tasa de activación, nadie falla si el archivo se degrada.

> Esto es un caso de libro de la **asimetría de determinismo** que ya documentó
> `deterministic_actions_per_layer`: el estado JSON del harness recibió validación
> viva (schema + `validate_harness.py`) porque editarlo a mano causaba bugs; el
> eval del modelo, en cambio, nunca recibió ni siquiera una validación estructural.

### 2.3 El único guard de la `description` es de tamaño, no de activación

La `description` del frontmatter de `SKILL.md` es —según `skill-creator`— *"el
mecanismo primario de disparo"*. ¿Qué la protege hoy? Solo
`test_token_budgets` en `tests/test_docs.py`, que verifica que quepa en **≤500
caracteres** (hoy 472) y que `SKILL.md` quepa en ≤1000 palabras (hoy 997). Es un
**gate de tamaño**, no de **precisión de activación**. Nada comprueba que la
description efectivamente dispare para los positivos y se calle para los negativos.

La consecuencia práctica: se puede editar la description, pasar el verifier en
verde, y haber **roto el disparo de la skill** sin que ningún test se entere. El
`trigger-eval.json` existe precisamente para cubrir ese hueco, pero al no estar
cableado, no lo cubre.

---

## 3. La literatura: cómo evaluar a un modelo (skill-creator + mcp-builder)

### 3.1 `skill-creator` distingue DOS clases de evaluación

Esta es la distinción más importante para encuadrar el problema. `skill-creator`
trata dos tipos de "test de modelo" que **no se evalúan igual**:

| Clase | Pregunta que responde | Formato | Runner |
|-------|----------------------|---------|--------|
| **Trigger / description eval** | ¿La skill **se activa** para las queries correctas? | `[{query, should_trigger}]` | `scripts/run_eval.py` + `scripts/run_loop.py` |
| **Output / task eval** | ¿La skill **produce buen output**? | `evals/evals.json` (`prompt` + `expectations`) | subagentes + `scripts/aggregate_benchmark.py` |

El `trigger-eval.json` de Handyman es **exactamente** la primera clase: mismo
formato `{query, should_trigger}`. La segunda clase (¿el harness que produce la
skill es correcto?) la cubre hoy, indirectamente y de forma determinista, el
verifier (`./init.sh`) y las ocho suites de `tests/` —no hay evals de output de
modelo, ni hacen falta, porque el output de Handyman es código y archivos con
contrato testeable, no prosa subjetiva.

### 3.2 La mecánica clave del trigger eval: varianza y anti-overfit

Aquí está el oro de la literatura. `skill-creator` no corre el trigger eval una
vez y cree el resultado. `scripts/run_loop.py` hace un **loop de optimización**
con dos salvaguardas que cualquier "test de evaluación del modelo" honesto
necesita:

1. **Varianza por repetición.** Cada query se corre **3 veces** (`runs_per_query`)
   para obtener una *tasa de disparo* estable, no un sí/no. El disparo de un modelo
   es **estocástico**: una sola corrida es ruido. `run_eval.py` aplica un
   `trigger_threshold` (p. ej. 0.5) sobre esa tasa. Por eso el benchmark de output
   reporta `mean ± stddev` y el "analyst pass" marca evals de **alta varianza** como
   potencialmente flaky.
2. **Split train/test contra el overfitting.** El eval set se parte **60% train /
   40% held-out test**. Se propone mejorar la description mirando solo el train, y
   se **elige la mejor description por su score en el test held-out**, no en el
   train. Literal del `SKILL.md`: *"selected by test score rather than train score
   to avoid overfitting"*. Si afinaras la description contra las mismas queries con
   las que la mides, la estarías sobreajustando a 20 frases en vez de a la intención
   general.

> Moraleja para Handyman: medir activación **no es un assert binario**. Es una
> medición ruidosa que exige repetición, un umbral, y separación train/test. Un
> "test de evaluación del modelo" que devuelva PASS/FAIL de una sola corrida
> mentiría.

### 3.3 `mcp-builder`: evaluaciones estables, verificables y auto-resueltas

`mcp-builder/reference/evaluation.md` evalúa otra cosa (si un LLM puede usar un
servidor MCP), pero aporta principios transversales que aplican a cualquier eval:

- **Estabilidad.** Las preguntas/respuestas deben basarse en datos "cerrados" que
  **no cambien con el tiempo** ("no cuentes reacciones, miembros, hilos"). Un eval
  cuya etiqueta correcta deriva con el tiempo es inservible. Para el trigger eval
  esto significa: las queries y sus `should_trigger` deben reflejar la **intención
  estable** de la skill, no una moda pasajera de fraseo.
- **Verificabilidad por comparación directa.** Las respuestas se validan por
  *string comparison*; nada de estructuras ambiguas. El análogo del trigger eval
  es que `should_trigger` es un booleano nítido: o disparó o no.
- **Auto-resolución como verificación.** Antes de confiar en un eval, **resuélvelo
  tú mismo** con las herramientas y corrige las etiquetas equivocadas. Es decir: el
  eval set también necesita su propia validación antes de usarse como vara de medir.

### 3.4 Principios transversales que la literatura deja claros

1. **Dato de eval ≠ arnés de eval.** Ambas skills tratan el *runner + métricas +
   reporte* como ciudadanos de primera clase, separados del dato. Handyman tiene el
   dato (`trigger-eval.json`) y le falta todo el arnés.
2. **El comportamiento del modelo es estocástico → varianza.** Repetición y
   `mean ± stddev`, nunca una sola corrida.
3. **Afinar contra lo que mides → overfitting.** Split held-out.
4. **El eval depende del entorno.** Correr el disparo real necesita un modelo + el
   CLI `claude -p` + auth (lo que `run_eval.py` orquesta). Eso **no existe en CI ni
   en el verifier de Handyman**.

---

## 4. El diagnóstico: dato sin arnés, y el límite determinista/estocástico

### 4.1 La forma exacta del hueco

Juntando §2 y §3, el problema de "los tests asociados a las evaluaciones del
modelo" se descompone en cuatro carencias concretas, cada una con su evidencia:

- **No hay test estructural del eval set.** Nada comprueba que
  `trigger-eval.json` parsee, que cada ítem tenga `query` (string) y
  `should_trigger` (bool), que haya ambas clases, una cobertura mínima, y sin
  queries duplicadas. El dato de evaluación puede **pudrirse en silencio** —la
  misma clase de bug que el repo ya cerró para `feature_list.json` con la
  validación viva contra schema (feature 10 `live_schema_validation`).
- **No hay runner reproducible.** No existe contraparte de `run_eval.py`: nada
  mide la tasa de disparo con repetición ni reporta varianza.
- **No hay advisory.** El verifier tiene el patrón `check_*` no bloqueante
  (`check_graphify_context`, `check_harness_version`, `check_business_context`,
  `check_tools_discovery`) pero **ninguno** recuerda re-medir el disparo cuando la
  description cambió.
- **No hay referencia.** `handyman/references/` no tiene un documento que explique
  el contrato del eval ni el límite determinista/estocástico (sí tiene `tools.md`,
  `discovery.md`, `security.md`, etc.).

### 4.2 El límite determinista vs estocástico (el corazón del diseño)

La tensión que confunde —y la razón por la que el usuario "tiene poca idea de cómo
resolverlo"— es que **"evaluar el modelo" mezcla dos cosas de naturaleza distinta**.
Separarlas es la clave:

**Lo que SÍ puede ser determinista** (apto para `tests/run_tests.sh`, CI y el
verifier, siempre verde o siempre rojo por la misma razón):

- Que el eval set esté **bien formado** (parsea, claves correctas, tipos correctos).
- Que tenga **cobertura mínima** (≥N positivos y ≥N negativos, sin duplicados).
- Que la `description` esté en presupuesto (ya existe: `test_token_budgets`).
- Que el **runner se invoque** y produzca un reporte con el shape esperado.

Esto es un **test del *contrato* del eval**, no del modelo. Es la pieza que hoy
falta y que convierte "dato suelto" en "artefacto con garantías".

**Lo que es irreduciblemente estocástico** (no puede vivir en el verifier sin
volverlo flaky):

- La **decisión de disparo real**: dado el modelo M de la plataforma y esta
  description, ¿invoca la skill para la query Q? Depende del modelo, varía entre
  corridas, y necesita modelo + auth + CLI. Se mide con repetición y umbral
  (`run_loop.py`), nunca se asevera de una vez.

> El límite es nítido: **el contrato del eval es determinista; la medición del
> disparo es estocástica.** Confundirlos es el error —o metes no-determinismo en CI
> (verifier flaky), o crees que un gate de tamaño ya "testea el modelo" (falsa
> sensación de cobertura, que es justo el estado actual).

### 4.3 Dependencia de entorno → degradación grácil (espejo de `jsonschema`)

Como la medición real necesita un entorno que CI no tiene, el diseño **ya tiene
precedente en el repo**: `validate_harness.py` valida contra schema **solo si
`jsonschema` está instalado**, y si no, imprime un `NOTE` y sigue verde (memoria
feature 10). El mismo patrón aplica aquí: el runner de medición debe **degradar
con NOTE** si falta el CLI/modelo/auth, **nunca** tumbar el gate. La parte
determinista (validación estructural) corre siempre; la parte estocástica
(medición) es opt-in y advisory. Es exactamente la filosofía de Handyman: *managed
scaffolding determinista* vs *estado/medición que el entorno gobierna*.

---

## 5. El diseño recomendado (tres capas)

La solución reproduce la forma canónica de esta serie (schema → script → advisory
→ referencia), partida por el límite de §4.2:

**Capa determinista, siempre activa (offline, en CI y el verifier):**

- Un **schema** del eval set (`array` de `{query:string, should_trigger:boolean}`,
  `minItems`, sin duplicados) en `handyman/assets/schemas/`, hermano de
  `feature_list.schema.json` y `harness.config.schema.json`.
- Un **test estructural** (`tests/test_evals.sh` o un `test_evals` en
  `test_docs.py`) cableado como **9ª suite** en `run_tests.sh`: existe, parsea,
  cada ítem tiene ambas claves con el tipo correcto, ≥N de cada clase, sin queries
  repetidas. Es *el* "test asociado a la evaluación del modelo" que **siempre**
  puede correr porque prueba el **dato**, no el modelo.

**Capa estocástica, opt-in (online, fuera del gate):**

- Un **runner** `handyman/scripts/evals.py` con dos subcomandos:
  `validate` (offline: las comprobaciones estructurales de arriba, reutilizables
  por el test) y `measure` (online: corre cada query **N veces**, reporta tasa de
  disparo por query + `mean ± stddev` + una matriz de confusión positivos/negativos;
  **degrada con NOTE** si no hay CLI/modelo/auth). Reusa el estilo dependency-free y
  el `resolve_workspace` de los scripts existentes, y modela la mecánica de
  `run_eval.py`/`run_loop.py` (repetición, umbral) adaptada al entorno de Handyman.
- Un **advisory** `check_evals()` en `assets/init.template.sh` (patrón
  `check_graphify_context`/`check_tools_discovery`, **jamás** toca `EXIT_CODE`):
  `NOTE` si el eval set falta o está vacío, o si la `description` cambió más
  recientemente que la última medición registrada (un sentinel/marker).

**Capa de contrato (documentación):**

- Una **referencia** `handyman/references/evals.md` que explique: las dos clases de
  eval (trigger vs output) de la literatura; el límite determinista/estocástico; la
  varianza (correr N veces, `mean ± stddev`); el split held-out anti-overfit; la
  degradación grácil por dependencia de entorno; y cómo todo esto se enlaza con el
  `test_token_budgets` existente y con `evals/trigger-eval.json`. Alta en
  `references/README.md`.
- Enlazar el **gate de la description en el flujo** (`references/workflow.md` /
  `references/examples.md`): convertir "re-medir el disparo tras editar la
  description" en un **paso documentado**, y atarlo a `Verification` del
  `feature-request`. Así el gate aspiracional pasa a ser protocolo.

`SKILL.md` queda **intacto** (997/1000, sin margen; a lo sumo un puntero en una
feature aparte). El plan toca `tests/`, `handyman/scripts/`,
`handyman/assets/schemas/`, `handyman/references/` y `.github/` —las mismas
superficies que los análisis anteriores.

---

## 6. Plan de trabajo A–E

| ID | Entrega | Superficie | Espejo de |
|----|---------|-----------|-----------|
| **A** | Schema del eval set + test estructural cableado como 9ª suite en `run_tests.sh` (parse, claves/tipos, ≥N por clase, sin duplicados) | `assets/schemas/`, `tests/`, `run_tests.sh` | feat 10 `live_schema_validation`, feat 33 `discovery_config_schema` |
| **B** | `scripts/evals.py` `validate`/`measure` (offline reutilizable + medición online con varianza, degrada con NOTE) | `handyman/scripts/`, `tests/` | `run_eval.py`/`run_loop.py`; feat 34 `tools_discovery_script` |
| **C** | `check_evals()` advisory no bloqueante en `assets/init.template.sh` | `assets/init.template.sh`, `tests/test_docs.py` | feat 35 `tools_discovery_advisory`, `check_business_context` |
| **D** | `references/evals.md` (dos clases, límite determinista/estocástico, varianza, held-out, degradación) + alta en `references/README.md` | `handyman/references/` | feat 36 `discovery_reference_doc` |
| **E** | Paso "re-medir disparo tras editar la description" en `workflow.md`/`examples.md` + atado a `Verification` del `feature-request` | `handyman/references/`, `assets/feature-request.template.md` | feat 37 `feature_request_tools_link` |

Orden sugerido: **A → B → C → D → E** (el contrato determinista primero porque es
lo que da garantías hoy y porque B reutiliza el `validate` de A).

> Nota CI (`.github/`): A es la pieza que entra al pipeline (`tests` job corre
> `bash tests/run_tests.sh`). B-`measure` **no** debe entrar al gate de CI (no hay
> modelo/auth allí); a lo sumo un job manual/opcional. Esto respeta el límite de
> §4.2 y evita un CI flaky.

---

## 7. Qué queda fuera de scope (y por qué)

- **`SKILL.md`**: research-only aquí. Cualquier puntero a `references/evals.md`
  iría en una feature aparte con cuidado de presupuesto (997/1000, margen 3).
- **Reescribir `trigger-eval.json`**: el dato está bien hecho (§2.1); el problema
  es el arnés, no el contenido. A lo sumo, ampliarlo a 30-40 queries más adelante
  (la literatura sugiere "expand the test set and try again at larger scale").
- **Evals de output de modelo** (clase B de §3.1): innecesarios. El output de
  Handyman es código/archivos con contrato testeable; el verifier ya cumple ese rol.
- **Forzar el disparo en CI**: imposible y contraproducente (§4.2-4.3). La
  medición vive opt-in con degradación grácil.

---

## 8. Apéndice: features sugeridas (NO añadidas)

Coherente con la serie, este documento **solo investiga**. Las features candidatas,
no añadidas a `feature_list.json`, serían:

- `eval_set_schema_and_test` (A) — schema + test estructural, 9ª suite.
- `eval_runner_script` (B) — `scripts/evals.py validate/measure` con varianza y NOTE.
- `eval_trigger_advisory` (C) — `check_evals()` en `init.template.sh`.
- `evals_reference_doc` (D) — `references/evals.md` + alta en `README.md`.
- `description_gate_workflow` (E) — paso de re-medición en el flujo + `feature-request`.

La idea-fuerza, una sola frase: **el dato de evaluación ya existe y es bueno; lo
que falta es partir "evaluar el modelo" en un contrato determinista que el verifier
sí puede garantizar y una medición estocástica que degrada con gracia —exactamente
el patrón que Handyman ya aplica a su `feature_list`, su `discovery` y su grafo.**

# 🔬 Investigación: inconsistencia del template básico en `bootstrap` entre modelos

> Documento de investigación. Responde a una pregunta concreta: **¿por qué al
> ejecutar `/handyman bootstrap` distintos modelos generan el template básico de
> forma inconsistente** —a veces `feature_list.json` y `harness.config.json`
> juntos y a veces separados, y a veces con campos que el contrato no contempla,
> como fechas de inicio y cierre de feature—**, y cómo mitigarlo?** Cada hallazgo
> se apoya en evidencia concreta del repositorio.

---

## 1. Los síntomas reportados

Al correr `bootstrap` con modelos distintos (o el mismo modelo en sesiones
distintas) se observan tres desviaciones:

1. **En modo `local`, `harness.config.json` aparece o no.** Unas veces el
   `bootstrap` deja `feature_list.json` y `harness.config.json` como dos archivos
   separados; otras veces solo crea uno de los dos (o concentra la config en
   `feature_list.json`).
2. **El formato de `feature_list.json` no se valida.** Nada frena que un modelo
   añada claves fuera del contrato.
3. **Aparecen campos inventados**, típicamente `start_date` / `close_date` (o
   equivalentes) dentro de cada feature, que **no existen** en el contrato.

La pregunta no es "¿el `bootstrap` puede ser determinista?" —`scripts/scaffold.sh`
ya lo es— sino "¿por qué el camino determinista no es el único camino, y qué
permite que un modelo se desvíe de él sin que ningún gate lo detecte?".

---

## 2. Cómo *debería* funcionar `bootstrap` (el camino determinista)

`scripts/scaffold.sh` existe precisamente para que el `bootstrap` sea
reproducible en lugar de re-tipeado a mano en cada invocación. Su comportamiento
es inequívoco:

- Crea el esqueleto del workspace (`progress/`, `backlog/`, `docs/`).
- Copia las plantillas de estado desde `assets/` **sin sobrescribir** lo que ya
  exista.
- **Escribe `harness.config.json` en AMBOS scopes.** La rama `if`/`else` solo
  elige *qué plantilla* usar (`harness.config.local.template.json` vs
  `harness.config.global.template.json`); la llamada que crea el archivo,
  `copy_and_stamp "$CONFIG_TEMPLATE" "$PROJECT_ROOT/harness.config.json"`, está
  **fuera** de esa rama y corre siempre.

Es decir: si todo `bootstrap` pasara por `scaffold.sh`, los tres síntomas no
existirían. La inconsistencia nace de que **el camino determinista compite con
varios caminos descritos en prosa que no coinciden entre sí**.

---

## 3. Causas raíz (con evidencia)

### 3.1 Contradicción: la tabla de `SKILL.md` dice una cosa y `scaffold.sh` hace otra

`SKILL.md`, sección **Installation Scope**, describe los archivos del project
root así:

| Scope | Lo que dice la tabla de `SKILL.md` |
|-------|------------------------------------|
| `local` | "Bridge files: `AGENTS.md`, `CHECKPOINTS.md`, `init.sh`, role files" — **no menciona `harness.config.json`** |
| `global` | "Bridge files **plus `harness.config.json`**" |

Y refuerza la idea con la frase **"A config-less harness defaults to local."**

Pero `scaffold.sh` —y el propio harness dogfooded de este repo, que es `local` y
**sí** tiene `harness.config.json`— crean el config en local. La consecuencia es
directa:

- Un modelo que **corre `scaffold.sh`** obtiene `harness.config.json` en local.
- Un modelo que **lee la tabla y reconstruye a mano** concluye que en local el
  config es opcional o innecesario, y lo omite.

Esa es exactamente la observación "a veces se crean separados y otras en
conjunto": **no es aleatorio, es la tabla y el script discrepando.**

> Nota: `references/anatomy.md` está del lado correcto (marca
> `harness.config.json` como *"Recommended"* en local). El conflicto está entre
> la tabla de `SKILL.md` y `scaffold.sh`/`anatomy.md`.

### 3.2 La config está duplicada en dos archivos

Hay **dos fuentes de verdad** para los mismos datos de instalación:

- `harness.config.json` contiene `install_mode`, `project_name`, `project_root`,
  `handyman_root`, `harness_workspace`, `harness_version`, **más** los mapas
  `models` y `tools`.
- `feature_list.json` lleva un bloque `config` que **repite** un subconjunto:
  `install_mode`, `project_name`, `project_root`, `handyman_root`,
  `harness_workspace`, `harness_version` (sin `models`/`tools`).

Cuando un mismo hecho vive en dos sitios, cada modelo resuelve la redundancia a
su manera: unos crean solo `feature_list.json` con su bloque `config` (lo "juntan"),
otros crean `harness.config.json` y un `feature_list.json` sin `config`, y otros
crean ambos con bloques que luego divergen. **La duplicación es el combustible de
la variación "juntos vs. separados".**

### 3.3 El verifier nunca valida el `feature_list.json` *vivo* contra el schema

Existe un contrato formal —`assets/schemas/feature_list.schema.json`— con
`"additionalProperties": false` en los tres niveles (raíz, `config`, `feature`).
Un feature con `start_date`/`close_date` **sería rechazado** por ese schema.

El problema es **dónde** se aplica:

- El gate que corre `init.sh` es `scripts/validate_harness.py`, que solo
  comprueba: que existan los archivos núcleo, que el JSON **parsee**, que haya
  **≤1 `in_progress`**, y que cada `status` esté en el enum. **No carga el schema.**
- El schema solo se ejecuta en `tests/test_docs.py`, y **contra las plantillas**
  de `assets/`, nunca contra el `feature_list.json` real del workspace.

Resultado: **nada en el camino de ejecución detecta campos extra en el estado
vivo.** El contrato existe, pero no está cableado donde haría falta. Por eso "ni
siquiera se valida el formato".

### 3.4 Las fechas son ubicuas en el harness, salvo en el `feature_list`

¿Por qué los modelos eligen inventar *fechas* y no cualquier otra clave? Porque
el resto del harness está lleno de fechas y el `feature_list` es la única
excepción:

- `progress/current.md` lleva `updated:` en el frontmatter y `**Start:**` en el
  cuerpo.
- `progress/history.md` encabeza cada cierre con `## YYYY-MM-DD - Feature N`.
- `scripts/feature.py done` **escribe** una entrada de historia fechada al cerrar.

La cronología del harness vive en `progress/` (sesión + historia), **no** en
`feature_list.json`, que es la máquina de estados. Pero esa separación es
**implícita**: en ningún lado se dice "las features no llevan fechas". Ante el
vacío, el modelo rellena con lo que ve por todas partes y añade `start_date` /
`close_date` al feature. Es una alucinación *razonable* provocada por un contrato
que calla.

### 3.5 La prosa de `bootstrap` habilita la improvisación

`SKILL.md`, entrada **Bootstrap**, dice: *"Scaffold with `scripts/scaffold.sh`
… (never overwrites), then create or adjust only missing or approved files."*

La cláusula "create … files" más la tabla de **Installation Scope** que enumera
archivos a mano envían la señal de que **reconstruir a mano es aceptable**. No
hay un "DEBES correr `scaffold.sh` primero y nunca recrear lo que el script ya
produce". Los modelos más débiles o más rápidos saltan el script y reconstruyen
desde la prosa —y ahí heredan la contradicción de 3.1 y el vacío de 3.4.

Lo mismo ocurre con el alta de features: `scripts/feature.py add` es la entrada
atómica que respeta el contrato, pero el `bootstrap` no la exige. Un
`feature_list.json` editado a mano es justo donde se cuelan los campos extra.

### 3.6 Por qué esto **diverge entre modelos** (no solo entre ejecuciones)

Las causas 3.1–3.5 explican la variación; esta explica por qué *modelos
distintos* aterrizan en salidas distintas. Cuando hay **varias fuentes de verdad
que no coinciden** (script vs. tabla vs. plantilla) y **ningún forcing-function
determinista único**, cada modelo pondera esas fuentes de forma diferente:

- Un modelo fuerte tiende a **ejecutar el script determinista** y obtiene la
  salida canónica.
- Un modelo más barato tiende a **reconstruir desde la prosa**, hereda la
  contradicción de la tabla y el vacío del contrato, e improvisa.

Mientras exista más de un camino válido y ningún gate que colapse todos a uno
solo, la elección del camino queda a criterio del modelo. **La inconsistencia no
es un bug de un modelo; es una propiedad del diseño actual.**

---

## 4. Plan de acción (foco en `references/` y `assets/`)

Principio rector (tomado de `skill-creator`): **lo determinista va en `scripts/`,
no en prosa; un contrato de formato se hace cumplir con un gate ejecutable, no
con un MUST escrito.** El objetivo es colapsar todos los caminos de `bootstrap` a
uno solo y cerrar el hueco entre el schema y el estado vivo.

| # | Causa | Mitigación | Archivos (scope `references`/`assets`) | Prioridad |
|---|-------|------------|----------------------------------------|-----------|
| A | 3.1 | Declarar `scaffold.sh` como **único** camino de `bootstrap` y un Bootstrap Protocol explícito | `references/workflow.md`, `references/templates.md` | Alta |
| B | 3.2 | Documentar la **fuente de verdad** y la precedencia config; marcar el bloque `config` de `feature_list.json` como espejo opcional | `references/anatomy.md`, `assets/feature_list.template.json` | Media |
| C | 3.3 | Validar el `feature_list.json` **vivo** contra el schema en el verifier (degradando si falta `jsonschema`) | `assets/init.template.sh`, `references/anatomy.md`, `references/checklists.md` | Alta |
| D | 3.4 | Hacer **explícito** que las features no llevan fechas; la cronología vive en `progress/` | `references/anatomy.md` (Feature List Contract), `assets/feature_list.template.json` | Alta |
| E | 3.5 | Exigir `scripts/feature.py add` para el alta de features en el `bootstrap` | `references/workflow.md` (Leader Protocol) | Media |

### Detalle por mitigación

**A — Un solo camino de `bootstrap`.** Hoy `references/workflow.md` tiene
protocolos de Startup, Leader, Implementer, Reviewer, Closure y Blocked, pero
**no existe un "Bootstrap Protocol"**. Añadir uno que diga, en imperativo:
correr `scaffold.sh <scope> <project_root>` **primero y siempre**; nunca recrear
a mano un archivo que el script produce; rellenar las plantillas, no
regenerarlas. En `references/templates.md`, marcar `scaffold.sh` como la fuente
canónica y advertir contra la creación manual.

**B — Una sola fuente de verdad para la config.** Documentar en
`references/anatomy.md` que `harness.config.json` es el bridge canónico y que el
bloque `config` de `feature_list.json` es un **espejo opcional**, con la
precedencia que ya implementa `validate_harness.py`
(`harness.config.json` → `feature_list.json config` → `.handyman/` → root).
Evaluar (feature futura) que `assets/feature_list.template.json` **no** duplique
la config, o dejar registrado el riesgo de drift entre ambos bloques.

**C — Cablear el schema al verifier (el cambio de mayor impacto).** Hacer que
`validate_harness.py` (o una fase del verifier) valide el `feature_list.json`
**vivo** contra `assets/schemas/feature_list.schema.json`, replicando el patrón
de degradación elegante que ya usa `test_docs.py` (si falta `jsonschema`, emite
NOTE y no bloquea; en CI valida completo). Con `additionalProperties: false`,
esto **rechaza** automáticamente `start_date`/`close_date` y cualquier clave
fuera del contrato. Reflejarlo en `references/anatomy.md` (Verification Contract)
y en `references/checklists.md`. *Nota de scope:* la edición de
`scripts/validate_harness.py` queda fuera de `references`/`assets` y debe ir en
una feature aparte; aquí se documenta el diseño y se prepara
`assets/init.template.sh` para invocar el paso.

**D — Matar el hueco semántico de las fechas.** En la sección **Feature List
Contract** de `references/anatomy.md`, enunciar de forma explícita: *una feature
lleva `id`, `name`, `title`, `description`, `acceptance`, `status` y, si está
bloqueada, `blocked_reason`; **no lleva fechas** — la cronología vive en
`progress/current.md` (`Start`) e `progress/history.md` (`## YYYY-MM-DD`)*. Hacer
el contrato explícito elimina la alucinación de 3.4. La mitigación C lo **hace
cumplir**; la D lo **explica** (cinturón y tirantes).

**E — Intake atómico.** En el Leader Protocol de `references/workflow.md` (paso
4), exigir convertir el formulario `feature-request.md` en una entrada vía
`scripts/feature.py add`, nunca por edición manual del JSON. El CLI ya construye
solo las claves del contrato, lo que cierra la puerta a campos extra desde el
origen.

### Secuencia recomendada

C y D primero (cierran el síntoma de los campos inventados con un gate + un
contrato explícito), luego A y E (colapsan el camino de `bootstrap` y el de
intake a uno determinista), y B al final (limpia la duplicación estructural).
Las correcciones que tocan `SKILL.md` (alinear la tabla de **Installation Scope**
con `scaffold.sh`) y `scripts/` (validación de schema viva) quedan **fuera del
scope `references`/`assets`** de esta investigación y deberían entrar como
features propias; aquí quedan documentadas para no inventar un workaround.

---

## 5. Buenas prácticas de `skill-creator` aplicadas

Consultada la skill `skill-creator` para encuadrar las recomendaciones:

- **`scripts/` para lo determinista y repetitivo.** La skill define `scripts/`
  como "executable code for deterministic/repetitive tasks". La inconsistencia
  aparece justo cuando la prosa compite con `scaffold.sh`/`feature.py`. La
  mitigación es hacer del script el camino único, no añadir más prosa.
- **Principio de no-sorpresa / disclosure progresiva.** Un hecho, una fuente de
  verdad. La duplicación de config (3.2) y la contradicción de la tabla (3.1)
  violan este principio; A y B lo restauran.
- **Explicar el porqué en vez de MUSTs pesados — salvo en contratos de formato.**
  Para guía de criterio, la skill prefiere explicar el porqué. Pero un *contrato
  de formato* (qué claves admite `feature_list.json`) se cumple de forma fiable
  con un **gate ejecutable** (schema en el verifier, mitigación C), no con una
  advertencia escrita que un modelo puede ponderar distinto.
- **Disclosure por capas coherente.** `SKILL.md` (siempre en contexto),
  `references/` (bajo demanda) y `assets/` (plantillas) deben **coincidir**. El
  bug de fondo es una incoherencia entre capas; el plan las realinea.

---

## 6. Resumen y próximos pasos

**Diagnóstico en una frase:** el `bootstrap` es determinista en `scaffold.sh`,
pero ese no es el único camino; varias fuentes de verdad en prosa
(`SKILL.md` Installation Scope, plantillas duplicadas) discrepan entre sí, y el
único contrato formal —el JSON Schema— no está cableado al verifier, así que
ningún gate colapsa los caminos ni detecta los campos inventados. Distintos
modelos ponderan esas fuentes distinto y producen salidas distintas.

**Causas raíz:** 3.1 contradicción tabla vs. script · 3.2 config duplicada ·
3.3 schema no aplicado al estado vivo · 3.4 fechas ubicuas salvo en el contrato ·
3.5 prosa que habilita improvisar · 3.6 divergencia entre modelos por falta de
forcing-function único.

**Features sugeridas (no añadidas en esta investigación):**

- `bootstrap_protocol` — Bootstrap Protocol en `references/workflow.md` +
  `scaffold.sh` como camino único (mitigaciones A, E).
- `live_schema_validation` — validar el `feature_list.json` vivo contra el schema
  en `validate_harness.py`/verifier (mitigación C; toca `scripts/`).
- `config_source_of_truth` — desduplicar/clarificar config y fechas en
  `anatomy.md` y plantillas (mitigaciones B, D).
- `skill_table_fix` — alinear la tabla de **Installation Scope** de `SKILL.md`
  con `scaffold.sh` (fuera de scope `references`/`assets`).

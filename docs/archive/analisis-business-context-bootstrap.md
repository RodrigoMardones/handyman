# 🔬 Investigación: recoger contexto *business* desde el chat durante `bootstrap`

> Documento de investigación y plan de trabajo. Responde a una pregunta concreta:
> **¿cómo lograr que, al ejecutar `/handyman bootstrap`, el modelo pregunte
> *siempre* al usuario desde el chat por los detalles de la capa business, de
> modo que `docs/business.md` se rellene con el máximo contexto real en lugar de
> placeholders genéricos?** Cada hallazgo se apoya en evidencia concreta del
> repositorio. El scope de la feature incluye `references/anatomy.md`.

---

## 1. El objetivo

`docs/business.md` es el único de los cuatro core docs cuyo contenido **no puede
inferirse del código**. `architecture.md`, `conventions.md` y `verification.md`
se pueden deducir leyendo el repo (módulos, estilo, comandos de test); pero el
**dominio de negocio, los stakeholders, los casos de uso y las reglas** viven
casi siempre solo en la cabeza del usuario. La feature pide que el `bootstrap`
**entreviste activamente** al usuario sobre esa capa —no que la adivine— para que
implementadores y revisores entiendan *por qué* existe cada feature, no solo
*cómo* funciona.

La pregunta no es "¿el `bootstrap` puede rellenar `business.md`?" —ya copia la
plantilla— sino "¿por qué el camino actual permite cerrar el `bootstrap` con
`business.md` vacío o genérico, sin que el modelo haya preguntado nada, y qué
mecanismo del propio proyecto puede forzar la entrevista?".

---

## 2. Cómo se rellena hoy `business.md` (el camino pasivo)

### 2.1 La plantilla asume que el contexto "ya viene dado"

`assets/docs-business.template.md` abre con esta instrucción:

> "Describe the business domain and the use cases this project serves. **Fill it
> from the business context provided when the harness is set up**; implementers
> and reviewers read it to understand *why* a feature exists, not only *how* it
> works."

La plantilla tiene buenas secciones (`Domain`, `Stakeholders`, `Use Cases`, `Out
Of Scope`, `Glossary`), pero está redactada en **voz pasiva de consumo**: "fill
it from the business context *provided*". Presupone que el contexto **ya existe**
en la conversación. **No instruye al modelo a solicitarlo.** No hay una sola
pregunta que el modelo deba hacerle al usuario.

### 2.2 El Bootstrap Protocol no tiene paso de entrevista

`references/workflow.md`, sección **Bootstrap Protocol**, son ocho pasos y
**todos son operaciones de archivo**: confirmar scope, correr `scaffold.sh`, no
recrear a mano, *rellenar plantillas*, reemplazar placeholders de `init.sh`,
materializar role files, dar de alta features con `feature.py add`, correr
`init.sh`. El único enganche con el contenido business es el paso 4:

> "Fill the copied templates with project-specific content; do not leave
> placeholders."

Es **pasivo y silencioso sobre el origen del contenido**. No dice "antes de
rellenar `docs/business.md`, entrevista al usuario sobre el negocio". El modelo
queda libre de rellenar con lo que infiera —o de dejar la plantilla intacta.

### 2.3 El ejemplo canónico modela el comportamiento equivocado

`references/examples.md`, **Example 1: Bootstrap A Local Harness**, muestra al
leader rellenando los docs **sin preguntar nada**:

> "Fill the copied templates with project-specific content instead of generic
> placeholders: `.handyman/docs/business.md`: the domain and use cases the notes
> CLI serves."

En el ejemplo el leader **ya sabe** que es "a Python notes CLI" y rellena de
forma unilateral. No hay un turno modelado de "preguntar al usuario". Los modelos
imitan lo que ven: un `bootstrap` **sin entrevista**.

### 2.4 El verifier no distingue una `business.md` rellenada de la plantilla cruda

El gate (`init.sh` → `scripts/validate_harness.py`) comprueba que
`docs/business.md` **exista**, no que esté **rellenada**. Un modelo puede
scaffoldear y dejar `business.md` idéntica a la plantilla (con "Describe the
business..." literal) y el verifier sigue **verde**. Es decir: **"el modelo no
preguntó" es hoy indetectable.** A diferencia de `feature_list.json` —que tras la
mitigación C de `docs/analisis-inconsistencia-bootstrap.md` se valida contra su
schema en el estado vivo— el contenido de `business.md` **no tiene ningún gate**.

---

## 3. Causas raíz (con evidencia)

| # | Causa | Evidencia |
|---|-------|-----------|
| 3.1 | La plantilla pide **consumir** contexto, no **recogerlo** | `assets/docs-business.template.md`: "Fill it from the business context **provided**" |
| 3.2 | El Bootstrap Protocol **no tiene paso de entrevista** | `references/workflow.md` Bootstrap Protocol: 8 pasos, todos de archivo; el paso 4 es pasivo |
| 3.3 | **No hay forcing-function**: rellenar o no `business.md` cuesta lo mismo | `validate_harness.py` checa existencia, no contenido; ninguna fase grepea placeholders |
| 3.4 | El **ejemplo** modela un bootstrap sin preguntar | `references/examples.md` Example 1 paso 3: el leader rellena sin un turno de pregunta |
| 3.5 | Es justo el doc que **más** depende del usuario el que **menos** intake tiene | `docs/architecture/conventions/verification` se infieren del repo; el dominio business no |

La conclusión es simétrica a la del análisis de inconsistencia: mientras exista
un camino válido en el que el modelo **no** pregunta y **ningún** gate lo
detecta, la elección de entrevistar queda a criterio del modelo. Hacer la
entrevista **fiable** exige convertir la voz pasiva en un **intake activo** y
añadir un **detector** que haga visible su ausencia.

---

## 4. Investigación: mecanismos del proyecto que pueden forzar la entrevista

El proyecto ya tiene todas las piezas para esto; solo hay que combinarlas. Cinco
mecanismos disponibles:

### (a) Un asset de intake activo, espejo de `feature-request.template.md`

`assets/feature-request.template.md` ya demuestra el patrón: un **formulario de
preguntas** que el modelo convierte en estado. Falta su equivalente para la capa
business. Dos variantes:

- **Variante 1 (nuevo asset):** `assets/business-intake.template.md`, un
  cuestionario que el modelo **debe plantearle al usuario** sección por sección
  (Domain, Stakeholders, Use Cases con Actor/Goal/Flow/Rules, Out of Scope,
  Glossary), con preguntas explícitas ("¿Quién usa esto y qué problema les
  resuelve?", "¿Cuál es el caso de uso central de principio a fin?", "¿Qué
  invariantes o reglas de negocio no pueden romperse?").
- **Variante 2 (enriquecer la plantilla existente):** añadir a
  `assets/docs-business.template.md` un bloque "Interview prompts" por sección,
  de modo que el propio doc lleve las preguntas que originan su contenido.

Recomendación: **Variante 2** primero (menos superficie, una sola fuente), con la
puerta abierta a extraer un asset dedicado si el cuestionario crece.

### (b) Un paso de entrevista obligatorio en el Bootstrap Protocol

Añadir a `references/workflow.md` (Bootstrap Protocol) un paso, en imperativo,
**antes** de "rellenar plantillas":

> "Entrevista al usuario sobre la capa business **antes** de rellenar
> `docs/business.md`. No inventes ni infieras el dominio: pregúntalo. Como
> mínimo, recoge dominio y problema, stakeholders, el caso de uso central
> (actor → objetivo → flujo → reglas), lo que queda fuera de scope, y el
> glosario. El `bootstrap` no está completo hasta que el contexto business
> provenga del usuario."

Reflejarlo, con cuidado de presupuesto de tokens, en la entrada **Bootstrap** de
`SKILL.md` (un puntero corto: "interview the user for business context"), y
documentar el contrato en `references/anatomy.md` (ver (d)).

### (c) Un gate advisory de placeholders en el verifier

Replicar el patrón de `check_graphify_context()` / `check_harness_version()` de
`assets/init.template.sh`: una función **no bloqueante** `check_business_context()`
que grepee `docs/business.md` en busca de sentinels residuales de la plantilla
(p. ej. "Describe the business", "List the users", "Define domain terms") y emita
un `NOTE:` cuando la `business.md` siga pareciéndose a la plantilla cruda. Esto
hace que **"la entrevista no ocurrió" sea detectable** sin bloquear (un humano
puede rellenarla legítimamente más tarde). Es la misma filosofía
*managed-scaffolding vs. project-owned-state* y de *advisories no bloqueantes*
(secrets, graphify, versión) que ya usa el harness.

> Nota de scope: editar `assets/init.template.sh` está dentro de `assets/`, pero
> cablear el mismo chequeo en el `init.sh` **vivo** del repo y en la fixture
> `tests/fixtures/init.reference.sh` toca la capa de tests/verifier y debería ir
> en su propia feature. Aquí se documenta el diseño y se prepara la plantilla.

### (d) El contrato en `references/anatomy.md` (scope de la feature)

`references/anatomy.md` describe `docs/business.md` como "Business domain and the
use cases the project serves". Ampliarlo para declarar **cómo** se puebla:

> "`docs/business.md` se rellena mediante una **entrevista obligatoria al usuario
> durante el `bootstrap`**, no por inferencia del código. El cierre del
> `bootstrap` incluye 'contexto business recogido del usuario'. Un verifier puede
> emitir un advisory `NOTE:` si `business.md` sigue con el texto de la plantilla."

Esto convierte la expectativa implícita en un **contrato explícito**, igual que
la mitigación D del análisis de inconsistencia hizo explícito "las features no
llevan fechas".

### (e) Modelar la entrevista en `references/examples.md`

Añadir a **Example 1** un turno de "preguntar al usuario": el leader plantea las
preguntas business y el usuario responde **antes** de rellenar `business.md`. El
walkthrough canónico debe **mostrar** la entrevista, porque los modelos imitan el
ejemplo (causa 3.4).

---

## 5. Plan de acción (foco en `references/` y `assets/`)

Principio rector (tomado de `skill-creator`): **lo determinista y repetitivo va
en `scripts/`/gate; lo interactivo —la entrevista— se hace cumplir con un
contrato explícito más un advisory que detecte su ausencia, no con un MUST
suelto en prosa.** El objetivo es convertir la voz pasiva ("fill from context
provided") en un **intake activo** y añadir un **detector** del hueco.

| # | Causa | Mitigación | Archivos (scope `references`/`assets`) | Prioridad |
|---|-------|------------|----------------------------------------|-----------|
| A | 3.1 | Convertir la plantilla en intake activo: añadir "Interview prompts" por sección a `docs-business.template.md` | `assets/docs-business.template.md` | Alta |
| B | 3.2 | Paso de entrevista obligatorio en el Bootstrap Protocol (antes de rellenar) | `references/workflow.md` | Alta |
| C | 3.5 | Declarar el contrato: `business.md` se puebla por entrevista, no por inferencia; el cierre exige contexto del usuario | `references/anatomy.md` | Alta |
| D | 3.3 | Gate advisory `check_business_context()` que detecta placeholders residuales | `assets/init.template.sh` | Media |
| E | 3.4 | Modelar el turno de entrevista en el ejemplo de bootstrap | `references/examples.md` | Media |

### Detalle por mitigación

**A — Intake activo en la plantilla.** Hoy `assets/docs-business.template.md`
dice "fill from the business context provided". Añadir, bajo cada sección, una o
dos **preguntas que el modelo debe plantearle al usuario** (Domain: "¿qué
problema resuelve y a quién?"; Use Cases: "¿cuál es el flujo central de principio
a fin y qué reglas no pueden romperse?"; Out of Scope: "¿qué decide *no* cubrir?";
Glossary: "¿qué términos del dominio hay que fijar?"). Convierte el documento de
*plantilla a rellenar* en *guion de entrevista*.

**B — Paso de entrevista en el Bootstrap Protocol.** Insertar en
`references/workflow.md` un paso imperativo **antes** del actual "Fill the copied
templates", con el texto de §4(b): entrevistar primero, no inferir, y declarar el
`bootstrap` incompleto hasta recoger el contexto del usuario. Puntero corto en la
entrada **Bootstrap** de `SKILL.md` respetando el presupuesto de tokens (SKILL
≤1000) — esa edición de `SKILL.md` queda **fuera del scope `references`/`assets`**
y debería entrar como su propia feature (ver "Fuera de scope").

**C — Contrato en `anatomy.md`.** Texto de §4(d): documentar el método de
poblado de `business.md` (entrevista obligatoria) y añadir "contexto business
recogido del usuario" al cierre del `bootstrap`. Es el ancla del scope de esta
feature.

**D — Advisory de placeholders.** Implementar `check_business_context()` en
`assets/init.template.sh` siguiendo el patrón de `check_graphify_context()`:
grep de sentinels de plantilla en `docs/business.md`, `NOTE:` si los encuentra,
nunca toca `EXIT_CODE`. Cablear el chequeo en el `init.sh` vivo del repo + la
fixture de tests es una **feature aparte** (toca tests/verifier).

**E — Ejemplo con entrevista.** Añadir a `references/examples.md` Example 1 un
turno donde el leader pregunta y el usuario responde antes de rellenar
`business.md`, para que el walkthrough canónico **muestre** la conducta deseada.

### Fuera de scope (documentado para no inventar workarounds)

- **`SKILL.md`** (puntero "interview the user for business context" en la entrada
  Bootstrap y, si aplica, en la tabla): toca `SKILL.md`, sujeto al presupuesto de
  tokens (997/1000 actual) → **feature propia**.
- **Cableado del gate vivo**: invocar `check_business_context()` desde el `init.sh`
  del repo y la fixture `tests/fixtures/init.reference.sh`, más un test en
  `tests/test_init.sh` que siembre una `business.md` sin rellenar y verifique el
  `NOTE:` → **feature propia** (capa tests/verifier).
- **Tests de assets**: si A/D crecen, un test en `tests/test_docs.py` que verifique
  que la plantilla lleva los "Interview prompts" → **feature propia**.

### Secuencia recomendada

C y A primero (fijan el contrato explícito y convierten la plantilla en guion de
entrevista), luego B (inserta el paso obligatorio en el protocolo), luego D (el
detector que hace visible el hueco) y E al final (modela la conducta en el
ejemplo). Las piezas que tocan `SKILL.md` y la capa tests/verifier quedan como
features propias, listadas arriba.

---

## 6. Buenas prácticas de `skill-creator` aplicadas

Consultada la skill `skill-creator` para encuadrar la propuesta:

- **Patrón "Capture Intent" + "Interview and Research".** `skill-creator` define
  su propio arranque como una entrevista: "Proactively ask questions about edge
  cases, input/output formats, example files, success criteria... Wait to write
  test prompts until you've got this part ironed out." El `bootstrap` de Handyman
  debe adoptar esa **misma postura de entrevista-primero** para la capa business:
  preguntar antes de rellenar, no inferir.
- **Disclosure progresiva.** El cuestionario pesado vive en el asset/reference
  (se carga bajo demanda), no en `SKILL.md` (presupuesto de tokens). Un
  imperativo corto en el Bootstrap Protocol apunta al cuestionario completo. Es
  el mismo modelo de tres niveles (metadata → SKILL.md → bundled resources) que
  `skill-creator` describe.
- **"Explicar el porqué en vez de MUSTs pesados — salvo en contratos de
  formato."** La entrevista es conducta → se explica el *porqué* (el dominio vive
  en la cabeza del usuario; el código no lo revela). La detección de placeholders
  es un contrato de calidad → se hace cumplir con un advisory **ejecutable**, no
  con prosa.
- **Principio de no-sorpresa.** El gate es **advisory** (`NOTE:`), no bloqueante,
  para no romper un flujo legítimo de "relleno la `business.md` más tarde",
  alineado con los advisories existentes (secrets, graphify, versión).

---

## 7. Resumen

El `bootstrap` no recoge contexto business de forma fiable porque el camino
actual es **pasivo** (la plantilla *consume* contexto en vez de *recogerlo*), el
Bootstrap Protocol **no tiene paso de entrevista**, el **ejemplo** modela un
bootstrap sin preguntar y **ningún gate** distingue una `business.md` rellenada
de la plantilla cruda. La solución combina piezas que el proyecto ya tiene:
convertir la plantilla en **guion de entrevista** (A), añadir un **paso de
entrevista obligatorio** al protocolo (B), **declarar el contrato** en
`anatomy.md` (C), añadir un **advisory de placeholders** (D) y **modelar la
entrevista** en el ejemplo (E). `SKILL.md` y la capa tests/verifier se abordan en
features propias. Resultado esperado: un `bootstrap` que **siempre** entrevista al
usuario sobre la capa business y deja evidencia detectable cuando no lo hace.

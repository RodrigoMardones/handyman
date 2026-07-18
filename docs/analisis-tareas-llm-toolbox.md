# Análisis: nuevas tareas de repositorio con handyman + LLM vía toolBox

> Investigación (julio 2026) sobre **qué más puede hacer el binomio handyman +
> LLM** ahora que la capa de proveedores y el relay de intake ya existen en el
> observador `toolBox`. Continúa la línea de
> [analisis-peticiones-llm-toolbox.md](analisis-peticiones-llm-toolbox.md)
> (cómo hacer peticiones a modelos) y [analisis-rag-handyman.md](analisis-rag-handyman.md)
> (retrieval): aquí nos centramos en **tareas accionables sobre el estado del
> repositorio**, no solo en redactar el documento de intake. Acompaña a
> [analisis-ui-observador-toolbox.md](analisis-ui-observador-toolbox.md).

## 0. Hallazgo crítico (bloqueador): ningún proveedor está activo

`GET /api/providers` contra el observador corriendo devuelve:

```json
{"providers":[
  {"id":"ollama","available":false,"model":"llama3.2"},
  {"id":"copilot","available":false,"model":null}
]}
```

No aparecen `zai` ni `claude` porque **no existe `.env`** en la raíz del repo y
las variables `Z_AI_API_KEY` / `ANTHROPIC_API_KEY` no están en el entorno. La
capa `toolbox_llm.ts` está lista, pero **hoy no hay un proveedor que responda**:
cualquier tarea LLM nueva arranca desde cero operativo hasta que se provea una
key. Esto es independiente del diseño y debe resolverse antes de cualquier
exercise real. Opciones, por orden de fricción:

- **Z.ai pay-as-you-go** (`api.z.ai/api/paas/v4`, OpenAI-compatible): crear
  `.env` con `Z_AI_API_KEY=...` (recordar `git` ya ignora `.env`). Coherente
  con `harness.config.json` (`GLM-5.2` por rol). Modelo barato `glm-4.7-flash`
  o `FlashX` para clasificación; el grande sólo para redactar.
- **Anthropic** (`@anthropic-ai/sdk` ya es dependencia):
  `ANTHROPIC_API_KEY=...` en `.env`. Mejor relación costo/calidad para drafts
  si se quiere Claude; `claude-haiku-4-5` para tareas baratas.
- **Ollama** offline: levantar `ollama serve` + `ollama pull llama3.2`; cero
  keys, pero requiere hardware local.
- **Copilot SDK** (`copilot` id futuro, sin adapter aún): no disponible hasta
  que se implemente el adapter (ver §4).

**Acción recomendada inmediata**: crear `.env` con una key (Z.ai o Anthropic) y
verificar que `GET /api/providers` muestre un `available: true`. Sin esto, el
resto de este análisis es diseño sin ejecución.

## 1. Qué ya existe (línea base)

El observador `toolBox` ya integra LLM para **una** tarea, cerrada en las
features 24–27:

- `toolbox_llm.ts`: puerto `LlmProvider` + adapters `anthropic` (Claude y
  Z.ai Coding Plan) y `openai-compatible` (Z.ai paas/v4 y Ollama); `copilot`
  declarado como id futuro.
- `toolbox_draft.ts`: construye system estable (plantilla + arquetipos) y
  contexto volátil (cola de features, top-k BM25, skills discovery) y relaya
  el draft por SSE.
- `toolbox_serve.ts`: `GET /api/providers`, `POST /api/draft` (relay SSE, no
  escribe disco), `POST /api/intake` (única escritura, sólo
  `feature-request.md`), `GET /api/files` (tags de contexto).

El contrato de seguridad vigente: el observador es **read-only salvo
`feature-request.md`** (Plan B de §5 del doc anterior). Las mutaciones de
estado (`feature_list.json`, `progress/`, `backlog/`) siguen siendo exclusivas
de los role CLIs (`feature.js`, `sprint.js`). Ese límite es el que ordena todo
el menú siguiente: **el LLM genera texto; el humano + los CLIs deciden y
escriben.**

## 2. Menú de nuevas tareas (ordenado por valor/esfuerzo)

Cada ítem respeta el contrato: **pull o batch, nunca LLM-por-evento-SSE**
(anti-patrón del doc anterior §6). El retriever barato (MiniSearch/BM25) es el
que nutre al modelo; el humano aprueba antes de cualquier escritura.

### 2.1 Resumen narrativo de flota/proyecto (valor alto / esfuerzo bajo)

**Qué**: dado `GET /api/state` (señales + `status_counts` + timeline), pedirle a
un modelo barato un resumen de 5 líneas: "3 features cerradas esta semana en
`handyman`, `cmcet-back` tiene 2 pendientes, revisión de #29 aprobada". Render
con `marked`+`DOMPurify` (ya disponibles); cache por hash del estado (si el
hash no cambió, devolver el cacheado). Es el ítem #2 del roadmap del doc
anterior §7, todavía sin implementar.

**Dónde encaja**: vista de flota del panel, botón "Resumir". Modelo barato
(GLM-4.7-Flash o Haiku) — cuesta décimas de centavo por resumen.

**Riesgo**: ninguno (read-only, texto). Es el piloto ideal para validar que la
capa LLM funciona de punta a punta una vez haya key.

### 2.2 "Ask your fleet" — RAG mínimo sobre el corpus (valor alto / esfuerzo medio)

**Qué**: el índice `MiniSearch` del cliente **ya es el retriever** (indexa
features + backlog + progress + docs). Patrón: pregunta → top-k BM25 → relay
con `pregunta + fragmentos` → respuesta **citando fuentes** por SSE. Es el
ítem #3 del doc anterior §7 y el caso 4 de
[analisis-rag-handyman.md](analisis-rag-handyman.md) (candidatos baratos +
juez LLM), pero aplicado a **todo lo que el usuario pregunta** sobre la flota,
no sólo a dedup de intake.

**Dónde encaja**: nueva vista `#/ask` oentrada en la *command palette*
(feature 23). El system le exige al modelo **citar `[fuente: ruta#id]`** y
responder "no sé" si los fragmentos no alcanzan (anti-alucinación).

**Riesgo**: alucinación de citas. Mitigación: el prompt ata la respuesta a los
fragmentos provistos y la UI enlaza cada cita a su `ruta` real vía
`GET /api/md`. Read-only.

### 2.3 Triage y dedup de backlog (valor alto / esfuerzo medio)

**Qué**: salida estructurada `{ id, categoria, duplicado_de?, confianza }` en
batch sobre `backlog/*.md`. El modelo clasifica `impl_` / `review_` / `explore_`
y sugiere solapes; **nunca auto-merge** (humano en el loop). Es el ítem #4 del
doc anterior §7.

**Variante nueva**: detectar **features cerradas sin `review_`** o con
`acceptance` incompleta → lista de "deuda de evidencia". Hoy nada lo verifica
(`validate_harness` chequea forma, no cobertura de backlog).

**Dónde encaja**: vista de backlog con badges de categoría y banner
"sugerir merge de #N+#M". Read-only; el merge lo ejecuta un humano con
`mv`/`git`.

**Riesgo**: falso positivo de duplicado. Mitigación: mostrar los dos reportes
lado a lado y dejar la decisión al operador.

### 2.4 Aceptación desde el diff / desde una especificación (valor medio / esfuerzo medio)

**Qué**: dado el `git diff` de una feature `in_progress`, el LLM **propone o
refina los `acceptance`** faltantes y chequea que el gate verde
(`./init.sh` o `bash tests/run_tests.sh`) aparezca como última bala — el
contrato destilado en
[analisis-feature-request-md.md](analisis-feature-request-md.md). Caso espejo:
dado un `docs/*.md` o un issue crudo, generar la lista de `acceptance`
observable y testable **antes** de implementar.

**Dónde encaja**: en la vista de intake existente (feature 26) como modo
"aceptación" además de "intake". Read-only (genera texto).

**Riesgo**: aceptancia vaga o no observable. Mitigación: el system prompt
exige verbos observables (`runs`, `exits 0`, `greps`, `returns`) y prohíbe
"should work". El reviewer sigue siendo la autoridad.

### 2.5 Resumen de revisión (valor medio / esfuerzo medio)

**Qué**: dados `backlog/impl_<feature>.md` + el diff, el LLM produce un
**checklist de revisión** (puntos críticos, invariantes rotas, preguntas para
el reviewer) que el rol `reviewer` usa como semilla. Hoy el reviewer lee todo
a mano; esto acorta el primer pase.

**Dónde encaja**: un endpoint `POST /api/review-notes` que **no escribe disco**
(relay como `/api/draft`); el reviewer copia lo útil a
`backlog/review_<feature>.md` vía su flujo normal. Respeta la regla "el
reviewer nunca edita código" — el output es un checklist, no un patch.

**Riesgo**: el reviewer delega demasiado en el LLM. Mitigación: el prompt
marca el output como `borrador, verificar todo`; el reviewer firma
`APPROVED`/`CHANGES_REQUESTED` sobre evidencia real (verifier + diff), no sobre
el resumen.

### 2.6 Lecciones / retro de features cerradas (valor medio / esfuerzo bajo)

**Qué**: el LLM mina el `progress/history.md` + los `backlog/` cerrados y
propone **patrones recurrentes y anti-patrones** como *sugerencias* para
`docs/conventions.md`. Ejemplo real de este repo: "al portear un CLI, auditar
`post_run` del `harness.config.json` (feature stale de `python3 index_md.py`)".
Es básicamente **digest automatizado de la memoria del harness**.

**Dónde encaja**: botón "Retro" en la vista de timeline. Output: lista de
3–5 patrones con enlace al feature que los originó. El humano decide si los
promueve a `docs/conventions.md`.

**Riesgo**: generalización excesiva. Mitigación: exigir al menos 2 features
como evidencia por patrón.

## 3. Plan E: dispatch controlado de agente (el caso explícitamente pendiente)

El doc anterior §5 dejó fuera de scope "disparar al agente desde el toolBox
(ejecutar el leader)". Es **la** nueva forma de "realizar tareas dentro del
repo": que un botón del panel arranque un `leader` sobre una feature. Diseño
seguro mínimo:

- **Token de sesión**: el observador genera un `X-Toolbox-Session` efímero al
  confirmar; el `POST` que lanza el agente lo exige. Defensa CSRF sin estado.
- **Una feature, confirmada**: el panel sólo puede lanzar la feature
  `pending` de menor id **previsualizada** en la UI; el humano confirma dos
  veces (botón + diálogo nativo `<dialog>` feature 23).
- **Spawn bound al CLI**: ejecuta `node handyman/dist/feature.js start <name>`
  (o el equivalente del harness destino) con `cwd` = root registrado; **nunca**
  shell arbitrario. stdout/stderr al timeline del observador.
- **Cierre manual**: el panel **no** puede marcar `done` (sigue siendo del
  reviewer + verifier verde); sólo puede `start`. El ciclo de cierre queda
  intacto.

**Por qué es difícil / vale la pena**: convierte al observador en
**punto único de operación** de la flota, pero rompe el contrato read-only. Por
eso se aísla como Plan E con su propia investigación y feature. Valor alto
(el operador ve y actúa en el mismo lugar); esfuerzo alto (tokens, spawning,
tests de seguridad). **Recomendación**: no empezar antes de tener 2.1–2.3 en
producción, para validar la capa LLM primero.

## 4. Estado del adapter Copilot (deuda declarada)

`copilot` es un `LlmProviderId` declarado **sin adapter**. El SDK oficial
(`@github/copilot-sdk`, GA junio 2026) habla JSON-RPC con la CLI `copilot` en
modo servidor y **reutiliza la sesión `copilot login`** — cero keys nuevas,
consume el plan Copilot que el usuario ya paga. Para este repo (que ya corre
dentro de VS Code con Copilot activo) es el encaje natural: cualquier tarea de
§2 podría correr contra Copilot sin tocar `.env`.

**Bloqueador actual**: el SDK requiere Node 20+ (el repo ya lo cumple) y la CLI
`copilot` empaquetada. Implementación = un nuevo adapter bajo
`toolbox_llm.ts` que envuelva `CopilotClient` + `session.sendAndWait` (o su
API de streaming, a verificar). Es una feature propia; mientras tanto, Z.ai o
Anthropic cubren el 100% de los casos de §2.

## 5. Recomendación de ejecución (roadmap)

Ordenado para destrabar la capa LLM primero y validar con read-only antes de
cualquier escritura/lanzamiento:

1. **(bloqueador)** Crear `.env` con `Z_AI_API_KEY` o `ANTHROPIC_API_KEY`;
   verificar `GET /api/providers` con un `available: true`.
2. **2.1 Resumen narrativo de flota** — piloto read-only, valida extremo a
   extremo. Modelo barato.
3. **2.2 "Ask your fleet" (RAG)** — reusa el índice MiniSearch existente; alto
   valor de uso diario.
4. **2.3 Triage/dedup de backlog** + variante "deuda de evidencia" — cierra un
   hueco que `validate_harness` no cubre.
5. **2.4 / 2.5 Aceptación desde diff + resumen de revisión** — asisten a los
   roles sin romper su autoridad.
6. **2.6 Retro de lecciones** — digest de la memoria del harness.
7. **Plan E (§3) dispatch controlado** — sólo después de que 2–6 estén verdes;
   es el cambio de contrato más grande.
8. **(paralelo) Adapter Copilot (§4)** — en cualquier momento; desbloquea
   operación sin `.env`.

## 6. Invariantes que cualquier implementación debe respetar

- **El LLM no decide ni siembra estado.** Genera texto; los CLIs y el humano
  escriben. Único write del observador sigue siendo `feature-request.md`
  hasta que Plan E llegue con su propio contrato acotado.
- **Pull o batch, nunca LLM por evento SSE.** Resultado cacheado por hash del
  estado (anti-patrón §6 del doc anterior).
- **Todo markdown del modelo se sanea** (`marked` + `DOMPurify`, feature 21) y
  el server manda `Content-Security-Policy default-src 'self'`. El output del
  modelo es **contenido no confiable** incluso siendo local.
- **Modelo barato para clasificación/dedup; el grande sólo para redactar.**
  Mismo principio de costo del intake.
- **Citas atadas a fragmentos** en cualquier tarea tipo RAG; "no sé" explícito
  si no hay contexto suficiente (anti-alucinación).
- **Bind 127.0.0.1 + Host-header check** sin excepciones; el registry sigue
  siendo la allowlist de `/api/md`, `/api/files` y cualquier nuevo endpoint
  que lea del workspace.

## 7. Fuentes internas

- [analisis-peticiones-llm-toolbox.md](analisis-peticiones-llm-toolbox.md) —
  capa de proveedores, contrato read-only, Plan A/B de intake, roadmap §7.
- [analisis-rag-handyman.md](analisis-rag-handyman.md) — BM25 + juez LLM,
  candidatos baratos, anti-alucinación con citas.
- [analisis-feature-request-md.md](analisis-feature-request-md.md) — formato
  Núcleo/Opcional, arquetipos, gate verde como última bala.
- [analisis-ui-observador-toolbox.md](analisis-ui-observador-toolbox.md) —
  live regions (Plan D), command palette (Plan E), empty states accionables.
- `handyman/src/toolbox_llm.ts`, `handyman/src/toolbox_draft.ts`,
  `handyman/src/toolbox_serve.ts` — implementación vigente de la capa LLM.
- `.handyman/feature_list.json` features 24–29 — estado cerrado de intake,
  providers, UI y timestamps.

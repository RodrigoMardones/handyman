---
type: Sprint
---

# Análisis: ¿un servidor MCP para operar toolBox?

**Fecha:** 2026-07-19 · **Rama:** `feat/llm-toolbox-tasks`
**Pregunta:** construir un MCP para realizar acciones sobre la plataforma toolBox con el modelo.
**Antecedente:** `plan-huecos-harness-y-cli-llm.md:104` ya evaluó MCP como opción C — costo «Alto», veredicto «⏸ otra conversación» — y `:147` lo puso bajo *Explícitamente NO ahora* con la razón «contrato nuevo, sin demanda todavía».

Esto no es re-presentar una opción sin examinar: es preguntar si las condiciones que produjeron ese veredicto cambiaron. Todo lo que sigue está verificado contra el árbol.

---

## 1. Qué cambió y qué no

**Caducó.** Cuando se escribió el plan, la capa LLM era inalcanzable sin levantar un servidor. La feature 53 lo cerró: `toolbox.js review-notes` llama al core directo. Y la feature 54 cerró G4 — el reviewer ya sabe que el toolBox existe. Los dos huecos que hacían de MCP «otra conversación» están tapados.

**No caducó, y es lo que decide.** El bloqueo declarado era **demanda**, no factibilidad (`:147`). Sigue sin haber un consumidor con nombre. Y hay tres hechos nuevos que empujan en contra:

- **Los tres roles ya tienen `execute`.** `leader/implementer/reviewer.agent.md:5` lo conceden, y el idioma real del repo es shellear a CLIs de node — `reviewer.agent.md:18` invoca `node handyman/dist/toolbox.js review-notes` literalmente. Todo lo que un MCP expondría es alcanzable hoy con cero cambios de config. **MCP sería conveniencia aditiva, no habilitador.**
- **La alcanzabilidad está bloqueada por dos huecos independientes, ninguno en este repo.** Ningún `tools:` de ningún rol nombra una tool MCP, y `references/tools.md:17` dice que esos nombres son grupos lógicos que hay que mapear a mano al host. Arreglar sólo el manifiesto no habilita nada.
- **El repo ya tiene doctrina MCP escrita, y dice lo contrario de depender de él.** `references/discovery.md:167-170`: «MCP availability is host-defined… an unmatched declaration is a NOTE, not a failure». Construir algo load-bearing sobre MCP contradice la caracterización que el propio repo hizo de qué es MCP.

Además `business.md:68-78` dibuja el límite del producto: «No es un runner… solo provee el contrato. El loop lo corre un agente externo». Un servidor MCP es infraestructura de runtime que habría que correr y mantener — del otro lado de esa frontera.

---

## 2. «MCP para toolBox» son dos productos distintos

Vale la pena separarlos porque tu frase dijo **acciones**, y sólo uno de los dos es eso.

### (a) MCP sobre las acciones del harness

Los 9 verbos de `feature.ts:1007` — `add, start, block, unblock, acceptance, done, ready, log, next` — más los scaffolds de `backlog.js`. Superficie chica, cerrada, ya parseada por argv: cada verbo mapea 1:1 a una tool sin reempaquetar nada.

### (b) MCP sobre los relays LLM

Los 7 relays del core (`triage, retro, acceptance, review-notes, ask, draft, summarize`). Un modelo llamando a otro modelo.

---

## 3. Veredicto por cada uno

### (b) Los relays: no, y el motivo es más fuerte de lo que el plan suponía

**Seis de los siete relays son «leer archivos y preguntarle a un modelo»** — que es la competencia propia del agente que llamaría. Peor: la mayoría entrega una vista *degradada* de lo que el agente ya puede leer entero.

- `ask` es activamente peor: `CORPUS_TEXT_CAP=4000` (`state.ts:20`) y luego `EXCERPT_CAP=1200` (`ask.ts:29`) sobre BM25 top-6, donde el agente puede grepear y leer archivos completos.
- `summarize` no aporta nada: `buildSummaryDigest` es un pre-filtro **con pérdida** (tira sesiones, métricas por día, `blocked_reason`) armado para que un modelo barato quepa. Leer `/api/state` directo es estrictamente mejor.
- `review-notes` corta el diff en 60k (`reviewNotes.ts:20`). El agente corre `git diff HEAD` sin tope.
- `acceptance` no lee nada: es un system prompt más un regex (`acceptance.ts`, cero `node:fs`).

Y el remate cuantitativo: **`resolveSummaryModel` degrada el modelo a propósito** en 6 de 7 — resuelve a `glm-4.7-flash` cuando `provider=zai` y `Z_AI_API_MODE=paas` (`summary.ts:171-181`). Una tool MCP acá es, por defecto, un agente capaz delegando en un modelo deliberadamente más barato una pregunta sobre archivos que ya puede leer. Es un diseño sano para un panel de browser y una inversión para un agente.

> **Lo que sí tiene valor en esa capa no son los relays.** Son tres funciones deterministas, ya exportadas, que no necesitan proveedor ni red: `computeEvidenceDebt` (`triage.ts:84-89`), `lastBulletIsGreenGate` (`acceptance.ts:87-97`) y la barra de evidencia de `parseRetroPatterns` (`retro.ts:122-169`, descarta patrones con < 2 features de respaldo y **cuenta** los descartes). Responden preguntas que un modelo no es confiable para responder sobre su propia salida. Si algún día se expone algo, es esto — y no necesita MCP para ser útil.

### (a) Las acciones: el diagnóstico es real, pero MCP no es la cura

Buscando qué justificaría un MCP de acciones aparecieron cinco defectos concretos. Ninguno se arregla envolviéndolos:

| | Defecto | Evidencia |
|---|---|---|
| A1 | `done` escribe `Review: APPROVED` **incondicionalmente**, sin leer `review_<feature>.md`, y deja `Plan/Changes/Tools` como `...` literal | `feature.ts:852-863` |
| A2 | `acceptance` no tiene guarda de estado: reescribe en silencio el contrato de una feature ya `done`, sin sello ni entrada de historia | `feature.ts:799-815` |
| A3 | `backlog.js review` no puede voltear un veredicto: el segundo llamado imprime «exists (left untouched)» y sale **0** | `backlog.ts:417-428` |
| A4 | `start` es una segunda salida de `blocked` no documentada: borra `blocked_reason` sin guarda de estado y sin validar schema | `feature.ts:732-735` |
| A5 | Sólo 2 de 9 verbos validan contra el schema antes de escribir (`unblock`, `acceptance`) | `feature.ts:203-217` |

A1 explica el `history.md` degradado que ya notamos: no es que nadie lo llenó, es que **la herramienta afirma `APPROVED` sin leerlo**. Eso es una aseveración falsa en el registro durable — el registro que el harness existe para producir.

A3 es el que más duele en la práctica: el ciclo normal CHANGES_REQUESTED → APPROVED no tiene verbo, hay que editar el archivo a mano, y el exit 0 impide detectar el no-op.

**Pero todos son bugs de `feature.ts` / `backlog.ts`.** Arreglarlos en el CLI es estrictamente más barato y beneficia a todos los harnesses instalados, con o sin MCP. Un MCP que los envuelve hereda el contrato roto: `actions#2` deja claro que una capa MCP sobre estos verbos hereda una escritura inconsistente.

Y el ahorro que MCP prometería tampoco está ahí. Un ciclo completo son 10 invocaciones de shell — pero **el costo dominante son 4 corridas de `./init.sh`**, cada una con build de handyman + `pnpm web:build` + 34 suites (`init.sh:141-149`, `run_tests.sh:29-44`). Exponer los verbos 1:1 no acelera nada; la palanca está en no re-verificar cuatro veces.

---

## 4. Recomendación

**No construir MCP ahora.** No por costo — por precedente y por ausencia de consumidor.

El repo ya mató la opción B con exactamente esta objeción: «duplica transporte para nada», «mete HTTP donde no hace falta» (`plan:103,106`). MCP agrega un transporte de protocolo *encima* de código que ya es llamable. Es la misma objeción con más fuerza.

Y la decisión D-B (`architecture.md:134-164`) ya rechazó unificar los relays, nombrando el costo: haría falta un objeto de config con flags por ruta «tan largo como el código que reemplaza», delante de cuerpos de error **fijados byte a byte** por el oráculo. Un esquema de tools MCP sobre los relays necesita precisamente esos flags. La regla adoptada de D-B trae el escape explícito: *«si un quinto relay no encaja, se deja aparte y se anota aquí en vez de doblar el helper»* — anotar antes que construir, codificado como regla arquitectónica.

A eso se suma que un SDK de MCP cruza la política más aplicada del repo — `architecture.md:46-52`, «minimalismo agresivo… toda dep nueva requiere justificación explícita» — y que `CHECKPOINTS.md C3` lo convierte en falla mecánica de review. Las dos deps aprobadas (minisearch, marked+dompurify) traen justificación de varias cláusulas *inline*: no hay equivalente en plataforma, no es reinventable, y cuándo desaparece. «Es el protocolo estándar» no es esa forma de argumento.

**En su lugar, por orden de valor:**

1. **A1** — que `done` lea el frontmatter de `review_<feature>.md` en vez de afirmar `APPROVED`. Es el único que corrompe el registro durable.
2. **A3** — un `--force` en `backlog.js review` para el ciclo de re-review.
3. **A2/A4/A5** — guarda de estado en `acceptance`, y ruteo de los 9 verbos por `saveValidated`.
4. **`init.sh` de este repo nunca llama a `validate_harness.js`** — los advisories de las features 52 y 55 no corren en el gate propio; llegan sólo por el `check_preflight` no bloqueante (`init.sh:133-138`). Se verificaron contra fixtures, no contra el flujo vivo.

Si el quoting de `--acceptance` llega a doler, la respuesta es `--from FILE` — ya diseñada y ya nombrada como conveniencia posterior en `plan-accion-g1-g4.md:42`. No MCP.

### Qué tendría que volverse cierto para que MCP sea correcto

Un consumidor **sin `execute`**. Hoy no existe: los tres roles shellean. El disparador sería que el harness se maneje desde un cliente sin shell — un Claude Desktop, un panel web actuando como agente, un runner ajeno. Ese día MCP deja de ser transporte redundante y pasa a ser el único transporte.

No hay instrumentación que construir para detectarlo: el día que aparezca un consumidor sin `execute`, se sabrá porque alguien no podrá correr el comando.

---

## 5. Explícitamente NO

- **Rutear subcomandos existentes por una capa MCP.** `architecture.md:84-85` llama al contrato del CLI «sagrado» y `conventions.md:36-39` hace de las suites bash el *oráculo de paridad*. Un MCP debe ser aditivo o no ser.
- **Tools MCP con capacidad de escritura para leader o reviewer.** `architecture.md` prohíbe que editen código de producto — es arquitectura, no gusto.
- **Exponer los 7 relays.** «Uno, no cinco» se rechazó dos veces (`plan-accion-g1-g4.md:87`, `impl_toolbox_cli_review_notes.md:93-95`).
- **Endurecer el falso verde de `tools_discovery check`.** Reporta `ok` para los tres MCP declarados porque *no existe manifiesto* (`tools_discovery.ts:451-455`); es un tradeoff conocido y documentado, atado a mantener verde el test T4.

---

## 6. El consumidor apareció — §4 revisada

*(Añadido tras aclarar el propósito. La §4 de arriba se conserva como registro del razonamiento previo; esta sección la supersede.)*

**Contexto declarado.** El proyecto nació para revisar el avance de los agentes en varios repos dejando memoria local, con el fin de ordenar pedidos. Hoy hay acciones claras por actor. La meta es **manejar toolBox como panel web actuando como agente**: centralizar ideas y ejecutar desde ahí, produciendo documentos de valor para alguien que trabaja en repositorios distintos.

Eso es el consumidor sin `execute` que §4 pedía. Pero **no implica MCP como primer paso** — y la distinción decide el orden de trabajo.

### 6.1 Si el panel es el host del agente, MCP es un loopback

El panel es `apps/web`, servido por `toolbox.js serve` en loopback. Su servidor **ya importa `@handyman/toolbox-core`** y ya expone 16 rutas API. Un loop de agente server-side ahí dentro llama al core y a `feature.js` **en proceso**.

Insertar MCP en ese diseño significa: el servidor Next lanza un subproceso MCP, habla JSON-RPC por stdio, y ese subproceso importa el mismo core que el servidor ya tenía cargado. Un proceso más, un protocolo más, serialización de por medio, misma capacidad. Es transporte redundante — la objeción exacta que mató la opción B (`plan:103`).

**Lo que falta no es el transporte. Es el loop.** Hoy no hay ningún agente en el panel.

### 6.2 Lo que ya está construido para esta visión

Más de lo que parece, y conviene verlo antes de diseñar nada:

- **El allowlist de flota ya existe y acá sí es load-bearing.** En §3 anoté que `isRegisteredRoot` era inerte frente a un agente local, porque el agente ya tiene el filesystem. En el diseño panel-como-agente **deja de ser inerte**: el panel es un servidor con superficie de browser, y el registry es exactamente el guard que ese caso necesita. El modelo de seguridad ya calza (`state.ts:83-124`, más el guard anti-DNS-rebinding de `apps/web/proxy.ts`).
- **La primitiva de escritura para «centralizar ideas» ya existe.** `writeIntake` (`intake.ts:27-59`) es la única escritura a disco de toda la superficie observer, y su orden de validación es oráculo de paridad. Es literalmente «capturar una idea dentro del harness de un repo».
- **Las lecturas de flota multi-repo ya son verbos.** `list`, `status`, `health`, `timeline` operan sobre el registry completo.
- **La resolución de proveedor ya está.** `buildProviders(process.env)` es una línea.

### 6.3 Un efecto de segundo orden: el loop probablemente *retira* los relays

Los relays existen porque, antes de que hubiera un agente, era la única forma de meter salida de modelo en el panel. Un loop de agente con tools es estrictamente más capaz que un relay de un solo turno. En el diseño panel-como-agente, **los 7 relays no son tools a exponer: son el andamio que el loop reemplaza.** Todo el §3 sigue valiendo — envolverlos sería delegar en un modelo más barato una pregunta que el loop ya puede responder.

Lo que sobrevive de esa capa son las tres funciones deterministas (`computeEvidenceDebt`, `lastBulletIsGreenGate`, la barra de evidencia de `parseRetroPatterns`). Ésas sí son tools: responden lo que un modelo no puede responder confiablemente sobre su propia salida.

### 6.4 Secuencia recomendada

1. **Definir el contrato de tools, sin transporte.** Un JSON Schema por tool, en el core. Es el trabajo real y sirve idéntico a las dos salidas. Es también donde hay que decidir las guardas que §3 encontró rotas (A1-A5): una tool `done` que afirme `APPROVED` sin leer el review report propaga la misma mentira que hoy propaga el CLI.
2. **Arreglar A1-A5 primero**, porque las tools van a heredar ese contrato. A1 (`done` afirmando `APPROVED` sin leer nada) es el más urgente: corrompe el registro durable.
3. **El loop de agente en el panel**, consumiendo esas tools por llamada directa. Sin MCP.
4. **Sólo entonces, y sólo si aparece un host externo** (Claude Desktop, Cursor, VS Code) que quiera manejar la misma flota: exponer las mismas definiciones por MCP stdio. Reusa el paso 1 entero; el costo marginal es el transporte y nada más.

Definir schema-first en el paso 1 es lo que hace barato el paso 4. No cuesta nada extra ahora y compra la opción.

### 6.5 Esto cambia qué *es* handyman — conviene decirlo

`business.md:68-78` declara, en *Out Of Scope*: «**No es un runner.** Handyman no ejecuta el loop desatendido; solo provee el contrato… El loop lo corre un agente externo».

Un panel que actúa como agente **es** ese runner. Es un cambio a la definición del producto, no una feature más. Puede ser el cambio correcto — la visión de hub multi-repo es coherente y buena parte de la infraestructura ya está — pero debería entrar como decisión declarada en `business.md` y `architecture.md`, no colarse por debajo. El repo tiene precedente para eso: D-B se anotó antes de construir.

---

## 7. Puntos abiertos para el humano

1. **La pregunta abierta #1 del plan anterior empeoró y sigue sin respuesta.** Las features 51-55 se cerraron igual que las 32-35: un agente en los tres roles, auto-firmado — `actor: agente-local (single-agent session)` en los cuatro `review_*`. La 51 llegó a `done` sin review; se escribió después, cuando el advisory de la 52 detectó el hueco.

2. **¿El agente corre *dentro* del panel, o el panel es sólo la vista?** §6 asume lo primero (tu frase: «panel web actuando como agente»). Si en realidad querés que Claude Desktop o VS Code manejen la flota y el panel sólo muestre, entonces MCP **sí** es el primer paso y no el cuarto. Es la única bifurcación que queda.

3. **`business.md` necesita una decisión explícita** sobre el límite «no es un runner» (§6.5).

4. **La historia de la rama sigue abierta** (`b53c9e4` agrupa 47-50, `6f08840` agrupa 32-35 más 51-55). El plan decía que esto se decide antes del PR.

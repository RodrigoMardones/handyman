# 🔬 Investigación: extender el MCP de handyman

> Documento de investigación. Responde a tres preguntas del operador:
> (1) **qué herramientas de alto y medio valor** conviene añadir al MCP,
> (2) **qué código muerto** encontrar antes de crecer la superficie,
> (3) **cómo descentralizar el MCP de la skill** para que viva como producto
> independiente. Cada afirmación se apoya en evidencia del árbol (rutas y
> números de línea al momento de la inspección, rama `feat/rework-tools`).
> El scope de la salida es `src/mcp.ts`, `src/feature.ts`, `src/metrics.ts`,
> `src/toolbox.ts`, `src/sprint.ts`, `src/upgrade_harness.ts` y
> `packages/toolbox-core/`. No es un plan de ejecución; es la base para uno.

---

## 0. Contexto que cambia el veredicto previo

Existe un análisis anterior: `.handyman/memory/sprints/analisis-mcp-toolbox.md`
(2026-07-19). Concluyó «no construir MCP» (§4) y luego lo **supersadió** (§6) cuando
apareció el consumidor «panel web como agente». Este doc no repite esa discusión;
asume que el MCP **ya existe** (feature 72 `handyman_mcp_server`, `done`), y trabaja
sobre la consecuencia práctica que §6.4 dejó anotada:

> §6.4 secuencia: (1) definir contrato schema-first en el core, (2) arreglar
> A1-A5 primero, (3) loop de agente en panel, (4) recién entonces MCP para hosts
> externos.

El paso (2) era bloqueante: «las tools van a heredar ese contrato» (A1-A5,
diagnosticados en `feature.ts`/`backlog.ts`). Verificación línea por línea en la
rama actual:

| Bug | Diagnóstico original | Estado hoy | Evidencia |
|-----|----------------------|------------|-----------|
| A1 | `done` afirmaba `Review: APPROVED` sin leer `review_<feature>.md` | **Arreglado** | `feature.ts:412` define `reviewVerdict()` y `feature.ts:962-963` lo usa en la entrada de `history.md` |
| A2 | `acceptance` reescribía en silencio el contrato de una feature `done` | **Arreglado** | `cmdAcceptance` rechaza con `wasDone && !args.force` y `--force` escribe entrada en `history.md` (`appendAcceptanceOverride`) |
| A3 | `backlog review` no podía voltear un veredicto (exit 0 silencioso) | **Arreglado** | `backlog.ts:22-25` y `backlog.ts:262-263`: `review --force` re-stampa verdict y el conflicto ahora sale 1 |
| A4 | `start` era segunda salida de `blocked` sin guarda | **Arreglado** | pasa por `saveValidated` (`feature.ts:763`); el borrado de `blocked_reason` queda validado por schema |
| A5 | Sólo 2 de 9 verbos validaban contra el schema antes de escribir | **Arreglado** | `start`(763), `block`(790), `unblock`(818), `acceptance`(863), `done`(944) todos por `saveValidated`; `add` vía `addFeature` del core que valida |

**La precondición que el análisis previo puso como requisito está cumplida.** El
contrato que las nuevas tools heredarían ya no está roto. Esto cambia la
recomendación: extender el MCP hoy no propaga mentiras en `history.md`.

---

## 1. Inventario de superficies

### 1.1 Lo que el MCP ya expone (6 tools + 2 resources)

Fuente: `src/mcp.ts:238-499`, suite `tests/test_mcp.js` (8 casos, M1-M8).

| Tool | Envuelve | Tipo |
|------|----------|------|
| `harness_list` | `registry.json` directo (`mcp.ts:131`) | read-only |
| `preflight` | `preflight.js` vía `runCli` (`mcp.ts:144`) | read-only |
| `feature_next` | `feature.js ready --json` (`mcp.ts:144`) | read-only |
| `feature_close` | `feature.js done` con verifier gate (`mcp.ts:156`) | write |
| `report_write` | escritura directa a `backlog/` (`mcp.ts:170`) | write |
| `verify` | `<root>/init.sh` directo (`mcp.ts:200`) | read-only |

Resources: `handyman://{project}/current` y `handyman://{project}/docs/{doc}`.

### 1.2 CLIs con `export function main(argv)` fuera del MCP

| CLI | LOC | Subcomandos relevantes | Valor MCP |
|-----|-----|------------------------|-----------|
| `feature.ts` | 1706 | `start, block, unblock, acceptance, log, next` ( además de `ready/done` ya expuestos) | **Alto** |
| `metrics.ts` | 337 | `--json` (status counts, throughput, verdicts, coverage) | **Alto** |
| `toolbox.ts` | 1604 | `status, health, timeline, list` ( observador multi-repo) | **Alto** |
| `sprint.ts` | 814 | `status` ( read-only puro), `open/close --dry-run` | **Medio** |
| `upgrade_harness.ts` | 659 | `--check` ( read-only), `--dry-run` | **Medio** |
| `tools_discovery.ts` | 1015 | `list, find, check` ( validación declaración vs disco) | **Medio** |
| `validate_harness.ts` | 622 | ( sin subcomandos) | Bajo (redundante con `preflight`) |
| `update_harness.ts` | 871 | `--list, --check` | Bajo (invasivo, toca `harness.config.json`) |
| `evals.ts` | 675 | `validate, measure` | Bajo (mide triggers, no encaja en el flujo) |
| `index_md.ts` | 270 | regenera MOC del toolBox | Bajo (mejor como hook `post_run`) |
| `backlog.ts` | 652 | `impl, review, explore` | **Ninguno** (redundante con `report_write`) |

---

## 2. Recomendación por herramienta (alto y medio valor)

El principio retor del propio `mcp.ts:3-6`: *«every verb shells out to the same
dist/*.js CLIs the roles already run (zero second source of truth)»*. Migrar es
barato: cada tool nueva es un `runCli("X.js", [...args], project)`. No hay lógica
nueva; hereda paridad y tests del CLI.

### 2.1 P1 — Completar el ciclo de feature (alto valor)

El MCP expone `feature_next` (reclamar) y `feature_close` (cerrar) pero **no** las
transiciones intermedias. El agente debe salir del MCP para las operaciones del
día a día del rol implementer/leader. Las tres que faltan:

**`feature_start`** ← `feature.js start <name>`. Marca `in_progress`, enforcea el
single-in_progress, corre preflight ( salvo `--no-preflight`), escribe
`progress/current.md` con la rama git. Es el complemento natural de `feature_next`:
reclamar-listar y reclamar-tomar son dos caras del mismo paso.

**`feature_log`** ← `feature.js log <line>`. Append a `## Log` de `current.md`.
Operación del implementer en cada paso del trabajo; sin esto, el agente edita el
archivo a mano ( el patrón que `feature.ts` existe para evitar).

**`feature_next_step`** ← `feature.js next <step>`. Set `## Next Step` de
`current.md`. Marca donde retomar la próxima sesión.

Riesgo: §5 del análisis previo prohíbe tools de escritura para leader/reviewer.
`start`/`log`/`next` son del implementer, no de esos roles; la guarda es de
arquitectura, no de superficie. El `start` ya no tiene el bug A4 (valida schema).
El naming `feature_*` ( prefijo ya usado) mantiene coherencia.

### 2.2 P2 — Observabilidad (alto valor, cero riesgo)

**`metrics`** ← `metrics.js --json`. Snapshot de salud derivado:
`status_counts`, `throughput` ( cierres por día de `history.md`), `approval_rate`
( de frontmatter de `review_*.md`), `coverage` ( features `done` con reportes
impl+review). Sin contraparte MCP hoy; el agente puede responder «¿qué throughput
tiene este harness?» sin parsear markdown. Read-only puro (`metrics.ts:17-19`:
«this script observes; it never gates»).

**`fleet_status`** y **`fleet_health`** ← `toolbox.js status/health --json`. Vista
multi-harness sobre el registry. Complementa `harness_list` (que sólo lista
nombres) con estado vivo por harness: métricas, sesión, drift de versión, señales
derivadas (`INVARIANT`, `STALE_WIP`, `BEHIND`, `IDLE`). `health` ya tiene
`--strict` en el CLI; la tool MCP lo expone como flag.

**`fleet_timeline`** ← `toolbox.js timeline --json`. Cronología mergeada de
cierres a través de la flota. Útil para el resumen multi-repo.

### 2.3 P3 — Gestión de periodo (medio valor, con restricciones)

**`sprint_status`** ← `sprint.js status` ( read-only puro, reporta el periodo
abierto y sus features). Safe.

`sprint open` y `sprint close` son **destructivos** ( este último archiva
features, compacta history, deriva el doc del periodo). El análisis previo §5
prohíbe rutear subcomandos destructivos por una capa MCP sin más. Si se exponen,
sólo `close --dry-run` ( preview sin escribir) y `open` con confirmación explícita
del operador. Recomendación: dejar fuera por ahora; el operador ya corre
`sprint.js open/close` a mano en hitos de rama ( dogfood en `AGENTS.md:16`).

### 2.4 P3b — Drift de versión (medio valor)

**`upgrade_check`** ← `upgrade_harness.js --check`. Read-only: resuelve workspace,
lee `harness_version` instalada, la compara con la `metadata.version` de la skill
que corre el script, reporta migraciones pendientes. Exit non-zero cuando
atrás/sin-sello. Ya es advisory en `init.sh` (`check_harness_version`); la tool MCP
lo haría consultable bajo demanda sin correr `preflight` completo.

Nunca exponer el modo `apply` default de `upgrade_harness.js` ( reescribe
`harness.config.json` y archivos managed); si se quiere, sólo `--dry-run`.

### 2.5 Lo que NO se recomienda migrar

- **`validate_harness`**: ya cubierto por `preflight` ( que lo subprocesa en su
  bloque format). Redundante.
- **`update_harness`**: modifica `harness.config.json` y role files (`.agent.md`,
  `.claude/agents/*`). Muy invasivo para una tool MCP.
- **`tools_discovery list/find`**: el host MCP ya provee `tool_search`; `check`
  ( declaración vs disco) sí podría ser una tool de auditoría separada, pero su
  valor es bajo fuera del flujo de bootstrap.
- **`backlog impl/review/explore`**: **redundante con `report_write`** del MCP,
  mismo propósito ( generar reportes con frontmatter house).
- **`evals`**: mide triggers de skills con un runner externo; no encaja en el
  flujo del harness ni tiene consumidor en el MCP.
- **`index_md`**: regenera el MOC del toolBox; mejor como hook `post_run` que como
  tool MCP.

---

## 3. Código muerto y redundancias

Búsqueda sistemática de exports sin consumo, CLIs sin invocantes, y artefactos
de build persistentes.Resultado: **cero código muerto real en `src/`**. Cada CLI con `main(argv)` tiene
entre 2 y 5 referencias vivas ( tests + init.template.sh + otros CLIs vía
subprocess). Hallazgos específicos:

### 3.1 Falsos positivos descartados

- **`toolbox_review_notes_cli.ts`** ( 171 LOC): a primera vista «0 referencias»,
  pero `toolbox.ts:62` lo importa (`REVIEW_NOTES_USAGE`, `reviewNotesMain`) para el
  subcomando `toolbox.js review-notes` que el reviewer invoca
  (`.github/agents/reviewer.agent.md:18`). **Vivo.**
- **`.pack-staging/` y `apps/web/.next/dev/`**: aparecen en el filesystem pero
  están gitignored ( `.gitignore`: `handyman/.pack-staging/`, `apps/web/.next/`).
  Build artifacts, no código fuente. Se regeneran con `npm run build`.
- **Handlers exportados de `mcp.ts`** (`harnessList`, `featureNext`, etc.):
  consumidos sólo por `tests/test_mcp.js`. No es muerte: el consumo real es por
  JSON-RPC sobre stdio ( el handler exportado existe para el test black-box, no
  para un importador en runtime). `buildServer` ni siquiera se testea directamente
  ( sólo su efecto cuando `main()` conecta el transport).

### 3.2 Deuda más sutil ( no muerte, sí consolidación)

- **`resolveProject` vs `resolveWorkspace`**: `mcp.ts:58` define `resolveProject`
  ( valida feature_list.json), pero su lógica de «nombre registrado → root»
  duplica parcialmente `listHarnesses`. No es muerte pero es una capa fina que
  podría vivir en el core si se descentraliza ( ver §4).
- **`runCli` shell-out vs import directo**: `mcp.ts` shellear `feature.js done` en
  vez de importar `cmdDone`. Es **intencional** ( comentario `mcp.ts:3-6`:
  «contract in code, not prose; zero second source of truth») — el subprocess
  hereda el exit code del verifier gate. Si se descentraliza a un paquete MCP
  propio, el contrato «shellear el CLI» se mantiene: el paquete MCP dependería de
  `handyman-harness` como dep npm, no de su código fuente.

### 3.3 El patrón repetido que sí conviene limpiar antes de crecer

`mcp.ts:121` (`runCli`) + `mcp.ts:131-200` ( handlers) + `mcp.ts:238-499`
(`registerTool` × 6). Añadir 6 tools más dobla el archivo y repite el boilerplate
`resolveProject → runCli → textResult → errorResult`. Antes de crecer, conviene
extraer un helper `registerCliTool(name, schema, script, argsFn)` que elimine la
repetición. Es refactor, no feature; pero hacerlo primero reduce el costo de cada
tool nueva de ~40 líneas a ~10.

---

## 4. Descentralizar el MCP de la skill

La pregunta: hoy `mcp.ts` vive en `handyman/src/` ( el paquete de la skill).
¿Tiene sentido moverlo a su propio paquete? Evidencia sobre el acoplamiento real:

### 4.1 El MCP ya está casi descentralizado

Inspección de imports de `src/mcp.ts:26-34`:

```
node:child_process, node:fs, node:path, node:url          ← stdlib
@modelcontextprotocol/sdk/server/mcp.js, .../stdio.js     ← SDK MCP
zod                                                       ← validación
@handyman/toolbox-core/registry                           ← handymanRoot, loadRegistry
./core/index.js                                           ← resolveWorkspace, resolveDocsDir
```

**Cero imports de la skill**: no lee `SKILL.md`, no toca `assets/`, no consulta
`metadata.version`. La dependencia «con la skill» es puramente **por ubicación**
( `mcp.ts` está en `handyman/src/`) y **por build** ( `tsc -b` lo compila a
`handyman/dist/mcp.js`).

Lo único que el MCP necesita de `handyman/` es `./core/index.js`
( `resolveWorkspace`, `resolveDocsDir`) — y eso ya es código compartido candidato
a `toolbox-core`, no skill-specific.

### 4.2 El patrón de descentralización ya existe en el repo

`apps/web` ya consume `@handyman/toolbox-core` directamente ( 18 imports en
`apps/web/actions/`, `apps/web/app/api/*/route.ts`, `apps/web/lib/`). El core es
**privado** ( `packages/toolbox-core/package.json: "private": true`), sin embargo
es la capa compartida entre el observer Node, el panel Next y el toolbox CLI.

El MCP es un cuarto consumidor del mismo core. La descentralización es trivial
desde el punto de vista de dependencias: ya no depende de la skill.

### 4.3 Dos caminos viables

**Camino A — MCP dentro de `handyman-harness` ( estado actual).** Ventaja: cero
trabajo; el paquete publicado ya exporta `"./mcp": "./dist/mcp.js"`
( `handyman/package.json:15`) y `references/mcp.md:46` documenta `npx -y
handyman-harness@3 mcp`. Desventaja: la skill ( `SKILL.md`, `assets/`, `evals/`,
el repo entero de la skill) arrastra el paquete; un usuario que sólo quiere el
MCP instala todo.

**Camino B — MCP en su propio paquete `packages/handyman-mcp/`.** Ventaja:
separación limpia; el paquete MCP depende de `@handyman/toolbox-core` y del SDK
MCP, nada más; publicación independiente; la skill deja de ser dependencia.
Desventaja: trabajo de migración + mantener un paquete más.

### 4.4 Recomendación: Camino B postergado, con准备工作 ahora

El Camino B es arquitectónicamente correcto pero **no tiene consumidor que lo
exija** hoy. El paquete `handyman-harness` ya es publicable ( `npm publish`,
documentado en `references/mcp.md`) y el costo de mantener el MCP dentro es
soportable. Es el mismo principio del análisis previo §4: «no construir hasta que
aparezca el consumidor».

Lo que sí conviene hacer **ahora** para que el Camino B sea barato después:

1. **Mover `./core/index.js` ( o las partes que el MCP usa:
   `resolveWorkspace`, `resolveDocsDir`) a `@handyman/toolbox-core`.** Ya está
   casi ahí: `toolbox-core/src/workspace.ts` existe y `resolveWorkspace` ya vive
   en core ( verificado: `mcp.ts:34` importa de `./core/index.js` pero
   `toolbox-core/src/workspace.ts` exporta funciones equivalentes). Mover la
   dependencia del MCP de `./core/` a `@handyman/toolbox-core/workspace` lo
   desacopla de la skill por completo.
2. **Documentar la frontera en `architecture.md`.** Declarar que `mcp.ts` es un
   consumidor de `toolbox-core`, no de la skill, igual que `apps/web`.
3. **Mantener el contrato «shellear el CLI».** La descentralización NO significa
   que el MCP importe `cmdStart`/`cmdLog` de `feature.ts` como módulo: significa
   que el paquete MCP depende de `handyman-harness` como dep npm y sigue
   shellear `dist/feature.js`. El contrato de «zero second source of truth» se
   preserva.

El día que el Camino B sea correcto ( un consumidor externo que sólo quiere el
MCP, o un split publicación/versión), los pasos 1-3 ya habrán hecho la migración
trivial: mover `mcp.ts` a `packages/handyman-mcp/src/`, cambiar el import de
`./core/` a `@handyman/toolbox-core/`, cambiar los `runCli("feature.js")` para
resolver el binario desde `node_modules/handyman-harness/dist/`.

---

## 5. Síntesis y orden propuesto

**Sobre extender el MCP:** sí, con prioridad P1 ( completar el ciclo de feature)
y P2 ( observabilidad). La precondición del análisis previo ( bugs A1-A5) está
cumplida, así que extender ya no propaga contrato roto. Antes de crecer, extraer
un helper `registerCliTool` para reducir el boilerplate por tool.

**Sobre código muerto:** no hay. Los falsos positivos (`toolbox_review_notes_cli`,
`.pack-staging`, handlers del MCP) se explican por consumo indirecto ( import /
subprocess / JSON-RPC). La única deuda real es la repetición en `mcp.ts`
( sección 3.3), enderezable con refactor.

**Sobre descentralizar:** el MCP ya está ~95% desacoplado de la skill ( cero
imports de `SKILL.md`/`assets`). Moverlo a su propio paquete es correcto pero
prematuro. Lo que sí ahora: (a) mover el último pegamento ( `./core/index.js`)
a `toolbox-core`, (b) declarar la frontera en `architecture.md`, (c) preservar el
contrato «shellear el CLI».

Orden propuesto si se ejecuta:

1. **Refactor `registerCliTool` helper** en `mcp.ts` ( reduce boilerplate).
2. **P1: `feature_start`, `feature_log`, `feature_next_step`** ( 3 tools; cerran
   el ciclo del rol implementer dentro del MCP).
3. **P2: `metrics`, `fleet_status`, `fleet_health`, `fleet_timeline`** ( 4 tools
   read-only; observabilidad sin riesgo).
4. **Descentralización suave:** mover `resolveWorkspace`/`resolveDocsDir` del MCP
   a `toolbox-core`, declarar frontera en `architecture.md`.
5. **P3 ( opcional): `sprint_status`, `upgrade_check`** ( read-only puros).
6. **Camino B ( postergado):** paquete `packages/handyman-mcp/` cuando aparezca
   un consumidor que sólo quiera el servidor.

## 6. Puntos abiertos para el humano

1. **¿Tools de escritura para implementer dentro del MCP, o se mantiene la línea
   «claiming stays on the CLI» de `references/mcp.md:43`?** `feature_start` rompe
   ese principio declarado. Es la decisión de diseño que abre o cierra P1.
2. **¿Observabilidad multi-repo en el MCP (`fleet_*`) o se reserva para el panel
   web?** §6.1 del análisis previo advierte que si el panel es el host, el MCP es
   loopback redundante para esas tools. Depende de si se quiere operar la flota
   desde VS Code/Claude Desktop ( sí) o sólo desde el panel ( no).
3. **¿El MCP se versiona junto a la skill o independientemente?** Hoy
   `handyman/package.json: "version": "3.2.1"` y `SKILL.md metadata.version` están
   sellados juntos. Descentralizar el paquete ( Camino B) permite versionarlos
   aparte, pero añade coordinación de release.

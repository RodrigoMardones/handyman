# @handyman/mastra-handyman — agente handyman sobre Mastra

Agente handyman corriendo sobre el runtime **Mastra 1.x** (`@mastra/core`
1.53.0): un leader supervisor que orquesta subagentes `implementer`/`reviewer`
y conduce el harness handyman a través de su servidor MCP, ejecutando el ciclo
completo de un feature (`add → start → impl → review → close`). Nació de
`docs/spike-mastra-harness.md` (fases 0–3 ejecutadas; 4 pendiente) como
sucesor del spike con Flue (paquete `agents/flue-handyman/`, eliminado el
2026-07-28 tras la ratificación del ADR).

## Topología

```
run-feature.ts (tsx, in-process) ──> Mastra app (agente handyman-leader)
run-workflow.ts (tsx, in-process) ─> Mastra app (workflow feature-cycle)   [fase 3]
                                          │ MCPClient (streamable-http)
                                          ▼
                            handyman MCP server :8177  (node handyman/dist/mcp.js --http)
                                          │ shell-out a dist/feature.js --root <PROJECT>
                                          ▼
                            <PROJECT>/.handyman/feature_list.json  (+ verifier init.sh)
```

- **In-process (topología A del spike)**: sin servidor Mastra; el driver importa
  la app y llama `agent.generate()`. Ideal para spike y CI.
- **Dos orquestaciones, una definición de roles** (fase 3): el mismo par
  `implementer`/`reviewer` (`createRoleAgents`) sirve al supervisor leader
  (run-feature, estrategia 1) y al workflow `feature-cycle` (run-workflow,
  estrategia 2), donde **el orden del ciclo es código, no decisiones del LLM**
  — sin tokens de leader para routing.
- Modelo por rol vía env (ver abajo); ambos providers hablan protocolo
  Anthropic con baseURL propia **con `/v1` final** (AI SDK pega
  `${baseURL}/messages`; sin el `/v1` Z.AI devuelve 404 disfrazado de 200).
- **Un thread por feature, un resource por proyecto** (memoria conversacional
  en LibSQL): reemplaza el patrón "una instancia de agente por feature" de
  Flue. El `Agent` es una definición stateless; el aislamiento vive en
  thread/resource.
- El proyecto objetivo se elige con `HANDYMAN_PROJECT_ROOT`: ruta absoluta o
  NOMBRE del registry handyman (match por basename; error accionable si no
  existe o es ambiguo). Default: el cwd. Para spikes, un scratch como
  `/tmp/hm-mastra-sup1`.

## Cómo ejecutar

```bash
# 0. Dependencias (una vez, desde la raíz del monorepo)
pnpm install

# 1. Proyecto scratch con verifier trivial (exit 0) — solo para pruebas
mkdir -p /tmp/hm-mastra-spike
bash handyman/scripts/scaffold.sh local /tmp/hm-mastra-spike spike-project
#    (sustituir /tmp/hm-mastra-spike/init.sh por un `exit 0` trivial)

# 2. Servidor MCP handyman (desde la raíz)
node handyman/dist/mcp.js --http --port 8177

# 3. Ejecutar el ciclo de un feature (desde agents/mastra-handyman)
set -a && . ../../.env && set +a
HANDYMAN_PROJECT_ROOT=/tmp/hm-mastra-spike pnpm run-feature -- <nombre_feature>

# 4. O como WORKFLOW durable con gate humano (fase 3)
HANDYMAN_PROJECT_ROOT=/tmp/hm-mastra-spike pnpm run-workflow -- start <feature> [declaracion.json]
#    … corre add→start→implement→review y se SUSPENDE en human-review
HANDYMAN_PROJECT_ROOT=/tmp/hm-mastra-spike pnpm run-workflow -- resume <feature> approve|reject [feedback]
HANDYMAN_PROJECT_ROOT=/tmp/hm-mastra-spike pnpm run-workflow -- restart <feature>   # crash recovery
HANDYMAN_PROJECT_ROOT=/tmp/hm-mastra-spike pnpm run-workflow -- status <feature>    # estado persistido
```

La `declaracion.json` de `run-workflow -- start` ancla la corrida de forma
declarativa — se valida EN LA PUERTA (una declaración inválida falla antes de
ejecutar nada) y cada concepto queda verificado y propagado:

```json
{
  "project": "/abs/path",
  "title": "Mi feature",
  "description": "Qué hace y por qué",
  "acceptance": ["criterio 1", "criterio 2"],
  "skills": ["nombre-skill"],
  "mcps": ["verify", "metrics"]
}
```

- **project** (opcional, default = el configurado): debe ser EXACTAMENTE el
  project root configurado — el HARD STOP es código, no prompt.
- **acceptance** (requerido, mínimo 1): criterios reales que viajan a
  `feature_add` (verdad en `feature_list.json`) y se citan verbatim al
  implementer y al reviewer.
- **skills**: SUGERENCIAS para el feature — validadas contra el registro
  multi-ubicación (`skillRegistry`: paquete `<pkg>/skills` (resuelto
  package-relative, sin ancla repoRoot), proyecto `<projectRoot>/.agents/
  skills` y `<projectRoot>/.github/skills`, y usuario `~/.agents/skills`; en
  colisión gana la primera; `HANDYMAN_SKILL_DIRS` (separador `:`) reemplaza
  TODA la cadena). En el formulario de Studio el campo ofrece las disponibles
  (enum) y el `.describe` las lista como ayuda. El implementer las carga
  primero con `load_skill` y puede descubrir más on-demand con
  `search_skills` (`SkillSearchProcessor` sobre las skills del workspace,
  BM25 local — sin inyección eager de contexto; `[]` = sin sugerencias).
- **mcps**: verbos extra validados contra el set del rol (enum en el
  formulario); el step activa exactamente `obligatorios ∪ declarados`
  (`activeTools` por corrida); por defecto el set completo del rol.

### Boot desde cualquier cwd (runtime desacoplado, 2026-07-29)

El agente NO asume el layout del monorepo (`HANDYMAN_REPO_ROOT` ya no tiene
default `<cwd>/../..`): bootea desde un cwd arbitrario contra cualquier
proyecto del registry handyman. Resolución de recursos
(`src/ports/harness-install.ts`, env primero en todo):

| Recurso | Precedencia |
|---|---|
| Assets handyman (role templates, `SKILL.md` canónica) | `HANDYMAN_ASSETS_DIR` > paquete `handyman-harness` instalado (dependencia workspace → `handyman/`) > fallback dev `<HANDYMAN_REPO_ROOT>/handyman` |
| Model catalog | `HANDYMAN_MODEL_CATALOG` > `<pkg>/model-catalog.json` (package-relative) |
| Skill scopes | `HANDYMAN_SKILL_DIRS` (`:`-separados) > `<pkg>/skills` > `<proyecto>/.agents/skills`, `<proyecto>/.github/skills` > `~/.agents/skills` |
| `dataDir` / `telemetryDir` | `HANDYMAN_DATA_DIR` / `HANDYMAN_TELEMETRY_DIR` > `<HANDYMAN_ROOT>/agent/<harnessId>/{data,logs}` (`HANDYMAN_ROOT` default `~/HANDYMAN`); los npm scripts del paquete pinnean `$PWD/data`/`$PWD/logs` — el flujo dev NO cambia |
| Comando toolbox (auto-register) | `HANDYMAN_TOOLBOX_CMD` (prefijo; se anexa el root) > bin `handyman` en PATH (`handyman toolbox register`) > `node <pkg>/dist/cli.js toolbox register` > fallback dev `node <HANDYMAN_REPO_ROOT>/handyman/dist/toolbox.js register` |
| Proyecto | `HANDYMAN_PROJECT_ROOT`: ruta absoluta directa, o NOMBRE del registry por basename (0 matches → error con la lista de registrados y la sugerencia `handyman toolbox register`; >1 → error de ambigüedad con candidatos, misma regla que el MCP) > default cwd |

`HANDYMAN_REPO_ROOT` queda SOLO como override dev (sin default). Ejemplo fuera
del monorepo: `cd /tmp && HANDYMAN_PROJECT_ROOT=hm-studio tsx
<repo>/agents/mastra-handyman/run-feature.ts mi_feature`.

### Bundle runnable con node puro (feature 102)

`pnpm build:bundle` empaqueta los runners en `dist-bundle/` (`run-feature.mjs`,
`run-workflow.mjs`, `run-skill.mjs`; esbuild, target node20, ESM) para
ejecutarlos con NODE PURO — sin tsx — desde cualquier cwd:

```bash
pnpm build:bundle
cd /tmp
HANDYMAN_PROJECT_ROOT=hm-studio \
  node <repo>/agents/mastra-handyman/dist-bundle/run-feature.mjs mi_feature
```

- **Externos por diseño** (`@mastra/*` —incluidos los bindings nativos
  duckdb/libsql que esos paquetes traen—, `@ai-sdk/*`, `zod`, `mastra`,
  `handyman-harness`): se resuelven de `node_modules` en runtime RELATIVO AL
  BUNDLE, nunca al cwd del caller. El bundle es thin (~50 KB por runner, solo
  src propio) porque el paquete es `private` y siempre corre desde su
  instalación — `node_modules` está garantizado. `handyman-harness` ni
  siquiera es import estático: `src/ports/harness-install.ts` lo resuelve con
  `createRequire(import.meta.url)`, que en el bundle apunta a
  `dist-bundle/<runner>.mjs` y sube al `node_modules` del paquete (link
  workspace → assets/ y dist/ reales).
- **Sin banner `createRequire`**: nada de lo inlined es CJS (src propio ESM).
  Si algún día se inlinea una dep CJS, copiar el banner de
  `handyman/scripts/pack_npm.mjs`.
- Los runners ejecutan TOP-LEVEL (son drivers, no unidades importables): sin
  entry-guard — cada archivo del bundle ES la entrada (contraste con el
  dispatcher `cli.js` del toolchain, feature 100).
- El build borra y regenera `dist-bundle/` (gitignored) con guards de
  inventario: los 3 runners presentes y `@mastra/*` sin inlinear.
- Requisito de runtime: un MCP handyman vivo (`handyman mcp --http`, o
  `node handyman/dist/mcp.js --http` desde un checkout) salvo que
  `HANDYMAN_MCP_URL` apunte a otro endpoint — el error de boot lo indica.
- Smoke automatizado: `bash scripts/smoke_bundle.sh` — build + boot node desde
  cwd ajeno con `HANDYMAN_ROOT` aislado y MCP apagado; debe fallar SOLO en el
  connect MCP (4 casos).

### Pinning de proyecto a nivel cliente MCP (feature 103)

La regla HARD STOP ("toda tool call apunta EXACTAMENTE al proyecto
configurado") deja de ser solo prompt: `connectHandymanMcp` envuelve las
tools `handyman_*` que declaran arg `project` con el guard de
`src/ports/mcp-pinning.ts`, UNA vez, en el choke point — leader,
implementer/reviewer (filtros de role-tools), steps deterministas del
workflow y skill mirror reciben el mismo mapa pineado:

- Call SIN `project` → se INYECTA `config.projectRoot` (path absoluto —
  inequívoco tras F99/F101).
- Call con el MISMO proyecto (el path absoluto, un path absoluto que resuelve
  igual, o el basename del root — el shorthand por nombre del registry) →
  pasa tal cual.
- Call con proyecto AJENO → RECHAZO con error que nombra el pin y el intento
  (`[pinning] <tool> rejected: … pinned to project "<root>" … attempted
  "<otro>" …`) más un `console.warn` estructurado. Rechazo, no rewrite
  silencioso: el modelo aprende del error y reintenta con el proyecto
  correcto.

No se tocan: tools que no son del handyman MCP (`github_*`, workspace, web) y
las tools handyman SIN arg `project` (`harness_list`, `fleet_*` — el set
`needsProject: false` del servidor), detectadas por su inputSchema
(`getSchema().properties`, verificado contra `@mastra/mcp` 1.15.0). El boot
log lo hace visible: `[mcp] connected …: 25 tools, 21 pinned to <root>`; un
`[pinning] WARNING` suena si 0 tools quedan pineadas (drift del shape del
inputSchema → pinning inerte). **Fuera de alcance:** el pinning server-side
(una sesión MCP por proyecto) — deuda del MCP, no del cliente.

### Un solo comando (MCP embebido por stdio, feature 104)

Con `HANDYMAN_MCP_TRANSPORT=stdio` el runtime SPAWNEA el MCP handyman como
proceso hijo (`node <handymanAssetsDir>/dist/mcp.js` — stdio es el transporte
por defecto del toolchain; `--http` es opt-in) vía el transport stdio del
propio `MCPClient` (`@mastra/mcp` 1.15.0, `StdioServerDefinition
{command, args, env}`). Un solo comando corre cliente + servidor, sin MCP
HTTP aparte:

```bash
cd /tmp
HANDYMAN_MCP_TRANSPORT=stdio HANDYMAN_PROJECT_ROOT=hm-studio \
  node <repo>/agents/mastra-handyman/dist-bundle/run-feature.mjs mi_feature
# boot log: [mcp] connected via stdio (embedded …/handyman/dist/mcp.js): 25 tools, 21 pinned to …
```

- **Topología**: el hijo habla stdio con ESTE proceso (loopback ni puerto);
  el pinning (F103) envuelve el toolset exactamente igual — el transporte es
  invisible para el wrap. Passthrough de env al hijo, deliberado y mínimo:
  `HANDYMAN_ROOT` (sus lecturas del registry), `PATH` (el server shellea
  git), `HOME`. El comando es `process.execPath` — no depende de PATH para
  encontrar node.
- **`HANDYMAN_MCP_TRANSPORT=http` (default)** deja todo intacto: conecta a
  `HANDYMAN_MCP_URL` y la guarda accionable de F102 aplica. Valor inválido →
  error en `loadConfig`. Si stdio no encuentra `<handymanAssetsDir>/dist/
  mcp.js` (toolchain sin buildear), el error lo dice y sugiere el build o
  volver a `http`.
- **Ciclo de vida**: los runners cierran con `mcp.disconnect()` en su
  `finally` (el transport stdio mata al hijo); en salida anormal (SIGINT,
  crash) el hijo ve EOF en stdin y muere solo — verificado por
  `scripts/smoke_stdio.sh`: tras el exit NO queda `dist/mcp.js` huérfano
  (aserción por delta de `pgrep`, sin tocar procesos ajenos). Señales: no
  hay handler propio; el mecanismo es stdin-EOF, suficiente por ser hijo
  directo con pipes.
- **studio-local.sh** salta su boot del MCP en 8177 cuando el entorno trae
  `HANDYMAN_MCP_TRANSPORT=stdio`.
- **Nota honesta**: Studio (browser) sigue siendo un cliente APARTE — la UI
  habla HTTP con `mastra dev`, y el MCP embebido vive dentro del proceso
  `mastra dev`, no en el navegador.

### Hub (un comando, estilo gateway, feature 105)

`run-hub` levanta el stack completo de revisión con UN comando — el modelo
gateway: dos hijos del mismo proceso, todo loopback.

```bash
pnpm run-hub -- [--project <nombre|path>] [--mcp-port <n>]
# o con node puro:  node dist-bundle/run-hub.mjs --project hm-studio
```

- **Qué levanta**: (1) el MCP handyman en HTTP (`node <handymanAssetsDir>/
  dist/mcp.js --http --host 127.0.0.1 --port <mcpPort>`, env mínimo
  PATH/HOME/HANDYMAN_ROOT) con health-wait activo (~30s) — si el puerto ya
  era de otro proceso, el hijo muere al bind y el hub falla con error que
  nombra el puerto y sugiere `--mcp-port`; (2) `mastra dev` (Studio +
  agentes) con cwd en el paquete y `-d studio` — igual que `pnpm studio`.
- **Flags**: `--project <nombre|path>` (resolución F101: nombre de registry
  o path; default cwd) y `--mcp-port <n>` (default 8177). NO hay
  `--studio-port`: `mastra dev` 1.20.3 no tiene flag de puerto — elige el
  primero libre en 4111..4131 y el hub lee la URL REAL del stdout del hijo
  (ventana 4111-4131, para no confundirla con la URL del MCP que el boot de
  los agentes también imprime).
- **Env del hijo studio**: passthrough COMPLETO del entorno del operador
  (este hijo sí corre los agentes — necesita las LLM keys) sobre una capa
  dotenv de MENOR precedencia (el `.env` raíz parseado por el hub: keys y
  model vars sin exportarlas), más el wiring (`HANDYMAN_PROJECT_ROOT`
  resuelto, `HANDYMAN_MCP_URL`, `HANDYMAN_ROOT`). DATA/TELEMETRY solo viajan
  si el operador las exportó (los defaults de F101 aplican dentro). **Por
  qué no `mastra dev -e`**: el comando dev re-asigna el archivo entero en
  `process.env` SIN respetar lo ya definido (`DevBundler.loadEnvVars` →
  asignación incondicional, verificado en el dist 1.20.3) — un `.env` con
  `HANDYMAN_PROJECT_ROOT` pisaría el wiring del hub (bug reproducido: el
  Studio arrancó conduciendo `handyman` en vez del proyecto pedido).
- **Banner y parada**: con ambos hijos sanos imprime los puntos de acceso
  (Studio URL real, MCP endpoint, proyecto pineado). Ctrl+C/SIGTERM →
  SIGTERM a ambos y SIGKILL tras ~3s de gracia, exit 0. Si un hijo muere
  inesperadamente, el hub dice CUÁL, mata al otro y sale con su code.
- **Relación con `scripts/studio-local.sh`**: el script raíz sigue siendo el
  orquestador dev del monorepo (scaffold del proyecto experimento, modelo
  por rol por defecto, MCP compartido en 8177 con reuse); el hub es el
  gateway portable — corre el bundle desde cualquier cwd contra cualquier
  proyecto registrado. **Notas honestas**: el browser sigue siendo cliente
  aparte (la UI habla HTTP con `mastra dev`); loopback sin auth, como toda
  la superficie MCP actual; el camino 2 (proceso único, Studio in-process
  sin `mastra dev`) queda como posible spike futuro.
- Smoke en vivo: `bash scripts/smoke_hub.sh` (banner + MCP responde + SIGINT
  sin huérfanos + puerto ocupado, 5 casos).

## Decisiones de diseño (y por qué)

- **Barrel anti-volatilidad** (`src/mastra/index.ts`): único importador de
  `@mastra/*` y `@ai-sdk/*` del paquete. Mastra publica 2–4 minors/semana y ha
  roto superficies nuevas post-1.0 (rename `Harness`→`AgentController` en
  1.47.0); la adaptación toca un solo archivo.
- **El MCP es el anti-corruption layer** (inalterado del ADR Flue): los 25
  tools son comandos de aplicación; el modelo propone y el CLI dispone. Las
  reglas de negocio jamás viven en prompts sin enforcement en código.
- **Tool sets por rol en código** (`src/domain/role-tools.ts`): leader = las
  25; implementer = probes read-only + `feature_log` + `report_write`;
  reviewer = probes + `backlog_review`. Un reviewer NO PUEDE mutar estado:
  las tools no existen para su perfil (test unitario enforced).
- **Aislamiento de subagentes**: `delegation.messageFilter: () => []` — cada
  delegación ve solo su task prompt, nunca el transcript del leader
  (equivalente al `task` de Flue). El reviewer juzga artefactos, no el
  razonamiento del implementer.
- **Memoria de negocio por INYECCIÓN, no por espejo**: `.handyman/memory/*.md`
  sigue siendo la fuente de verdad en disco; se inyecta un snapshot read-only
  en las instrucciones del leader en cada llamada (instrucciones dinámicas).
  No se usa la working memory de Mastra (vive en SU base de datos = segunda
  verdad). La memoria conversacional (threads) sí es de Mastra.
- **Storage compuesto**: LibSQL (memoria/snapshots) + DuckDB (dominio
  observability — LibSQL no soporta métricas) vía `MastraCompositeStore`.
- **Observabilidad**: `Observability` + `MastraStorageExporter` +
  `SensitiveDataFilter` (nunca contenido de mensajes en spans) +
  `requestContextKeys: ['feature', 'project']` para correlación por corrida.
  Métricas automáticas `mastra_model_*` (tokens in/out/cache, duraciones,
  costo estimado por modelo) consultables en DuckDB. **Identidad de harness
  deployment-level** (`src/ports/harness-identity.ts`): todos los spans llevan
  los atributos `handyman.harness.id` (env `HANDYMAN_HARNESS_ID` →
  `project_name` de harness.config.json → basename) y `handyman.harness.root`
  — separados de la metadata por-corrida. Además, al boot el proyecto se
  AUTO-REGISTRA en el registry handyman (`toolbox.js register`, idempotente,
  best-effort; opt-out `HANDYMAN_HARNESS_REGISTER=off`).
- **Telemetría JSONL por feature** (`src/ports/telemetry.ts` →
  `logs/agent-<feature>.jsonl`): pista de EJECUCIÓN sanitizada (nombres de
  tools, usage, finishReason; texto como `{ chars }`). `history.md` sigue
  siendo la pista de NEGOCIO. Misma regla que el sink de Flue.
- **Ledger de tokens** (`src/ports/tokens-ledger.ts`): al cerrar el feature,
  una línea en `<PROJECT>/.handyman/metrics/tokens.jsonl` con
  `source: "mastra"` (diseño §2 de `docs/analisis-tokens-consumo-y-metricas.md`;
  best-effort, nunca bloquea). Solo aplica a la topología supervisor: en la
  topología workflow el `WorkflowResult` no expone `usage` — la agregación
  debe derivarse de `metric_events` en DuckDB (pendiente, fase 4).
- **Workflow durable con verdad única de negocio** (fase 3,
  `src/workflows/feature-cycle.ts`): el snapshot del workflow en mastra.db es
  **estado operativo desechable** (step actual, suspend payloads); la verdad
  de negocio sigue en `feature_list.json`, escrita solo vía MCP. No hay
  reconciliación bidireccional: si discrepan, el disco gana y el run se
  abandona. Los side effects de negocio (add/start/close) son steps
  deterministas que llaman tools MCP directamente; solo implement/review son
  llamadas a agentes. Errores de negocio → outcome tipado (`bail` con el
  output del workflow); infra transitoria → `throw` + retries.
- **Regla de estilo: cero `.map()` en grafos durables** — Mastra 1.53.0 tiene
  un bug de restart: tras un kill, un step cuyo predecesor es un mapping
  recibe `undefined` de input (reproducido en `wf_crash` y con toy workflow;
  hallazgo §7 abajo). Los steps de agente son steps regulares que llaman
  `agent.generate()` en `execute`, no `createStep(agent)` + mappings.

## Reglas duras de operación

- **Un proceso vivo por data dir**: el store DuckDB toma un lock nativo
  exclusivo (single writer) y el error es FATAL para el run (rechaza el
  stream del modelo, no degrada a "sin métricas"). Para corridas paralelas:
  `HANDYMAN_DATA_DIR=/tmp/dir-único` por proceso.
- **El driver cierra el MCPClient** (`close()`): un MCPClient abierto mantiene
  el event loop vivo y el proceso nunca sale.
- `data/` y `logs/` están gitignored; borrarlos resetea el estado del runtime
  (el estado de negocio handyman NO se toca: vive en el `.handyman/` del
  proyecto target). Fuera de los npm scripts del paquete, el default es
  `<HANDYMAN_ROOT>/agent/<harnessId>/{data,logs}` — mismas reglas, otra
  ubicación.

## Hallazgos del spike (fases 0–3)

1. **Endpoint Anthropic custom**: `createAnthropic({ baseURL })` debe incluir
   `/v1` (AI SDK pega solo `/messages`). Verificado con curl contra
   `api.z.ai/api/anthropic/v1/messages` y `api.kimi.com/coding/v1/messages`.
2. **Una delegación NO hereda `maxSteps` del leader**: el subagente cae al
   default de 5 y el implementer quedaba cortado antes de `report_write`
   (el leader narraba "reporte escrito" y el disco decía lo contrario —
   mismo síntoma que el `demo_estable` de Flue). Fix en código:
   `defaultOptions.maxSteps: 15` por rol + `onDelegationStart →
   modifiedMaxSteps: 15`, e instrucciones que prohíben probes exploratorios
   al implementer (su presupuesto es para sus DOS escrituras).
3. **Modelo desconocido en el registry**: Mastra no conoce `glm-5.2` y limita
   el output a 4096 tokens con un warning. Fix: `modelSettings:
   { maxOutputTokens: 16384 }` (GLM quema output en thinking).
4. **DuckDB single-writer**: ver regla dura arriba.
5. **MCP streamable-http contra `mcp.ts` funciona sin ajustes**: 25 tools
   como `handyman_<verb>`; sin loop de reconexión GET observado (el caveat
   documentado de MCPClient no se reproduce con nuestro servidor).
6. **El protocolo se sostiene ante estados rotos**: con el scratch sin
   bootstrap, el leader sondeó, detectó la ausencia del harness y pidió
   bootstrap en vez de alucinar el ciclo — en 2 de 3 corridas. En la tercera
   el leader **cambió de proyecto**: descubrió el monorepo vía
   `harness_list` y ejecutó el protocolo completo ahí (feature 98 +
   reportes en el `.handyman/` real). Se limpió quirúrgicamente y se añadió
   la regla HARD STOP al prompt del leader (nunca cambiar de proyecto; las
   probes fleet_* son observación, no fallback). **~~Deuda estructural~~
   RESUELTA (feature 103):** la mitigación de código pedida aquí (wrapper de
   tools que rechaza `project != PROJECT`) es el pinning cliente de
   `src/ports/mcp-pinning.ts`; el pinning server-side (una sesión MCP por
   proyecto) sigue como deuda del MCP.
7. **`bail()` con el output del workflow → run `success`** (verificado con
   toy probe): el resultado del run es el payload tipado y todos los steps
   quedan `success` — la distinción entre "cerró" y "outcome de negocio" se
   lee en `result.outcome`, no en el status del run.
8. **Bug de restart con mappings (1.53.0)**: kill -9 a mitad de un step cuyo
   predecesor es un `.map()` → al `run.restart()` ese step recibe `undefined`
   de input y el run muere con `WORKFLOW_STEP_INPUT_VALIDATION_FAILED`.
   Reproducido dos veces (corrida real `wf_crash` + toy workflow mínimo) y
   confirmado que SIN mappings el restart es correcto (steps completados se
   restauran del snapshot; solo el interrumpido se re-ejecuta). Workaround
   adoptado: grafos durables sin `.map()`; steps de agente como steps
   regulares con `agent.generate()` dentro de `execute`. Candidato a issue
   upstream.
9. **~~El reviewer no lee el backlog por MCP~~ RESUELTO (2026-07-28,
   mandato operador):** el reviewer tiene ahora filesystem READ-ONLY sobre
   el project root vía Workspace (`src/ports/workspace.ts`) y lee
   `.handyman/backlog/impl_<f>.md` directo de disco — sin tool MCP nuevo y
   SIN meter informes en la DB de Mastra (la verdad de negocio queda en
   disco, git-tracked; `feature.js done` lee el veredicto de disco, así que
   moverlo a LibSQL rompería el gate del verifier). El task del reviewer
   sigue llevando el output del implementer como fallback.
10. **La trayectoria por trace es inútil para agent targets** (1.53.0): la
    extracción de `runEvals` vía trace store deja como top level UN step
    `llm: 'glm-5.2'` (los MCP calls anidan 3 niveles abajo:
    agent_run → model_generation → model_step → mcp_tool_call). El scorer
    prebuilt `trajectory-accuracy` nunca matchea nombres de tools ahí, y en
    la forma plana recibe mensajes crudos y revienta. Scorer propio:
    `extractTrajectory(output)` → subsecuencia (ver
    `src/evals/protocol-trajectory.ts`).
11. **El leader diverge bajo verifier rojo** (no-determinismo real, 3 formas
    en 3 corridas): `feature_close_async` + polling de `task_result` con ids
    inventados; doble delegación + `feature_log` propio + agotamiento de
    steps. Mitigación: instrucciones de disciplina (close solo SYNC, una
    delegación por rol, nunca `task_result`) + caso rojo del eval sin
    `close` en la trayectoria esperada (el rechazo lo cubre
    deterministamente el workflow de fase 3, no el modelo).
12. **`checks.noToolErrors` no ve errores de envelope MCP**: `isError` vuelve
    como tool result con texto, no como tool-error del SDK. Los gates se
    complementan con trayectoria + verdad en disco.
13. **La skill nativa funciona pero su carga es cara**: 376k input tokens en
    la primera corrida (relectura de references) → 129k con instrucciones de
    disciplina; supervisor agregado ≈ 90k; workflow ≈ la mitad. La topología
    workflow es la más barata por feature. **Decisión (2026-07-28): el
    workflow es el camino por defecto del ciclo; la skill mirror queda como
    validación de formato/adopción, no como path de ejecución rutinario.**
14. **`pnpm` no strippea `--`** en ningún driver (`run-feature`,
    `run-workflow`, `run-skill`): todos filtran `--` de argv. Dato lateral:
    el agente RECHAZÓ correr con feature `--` explicando la regla de
    naming — el protocolo se sostiene ante input roto del operador.
15. **Las workspace tools NO aparecen en `agent.listTools()`**: se inyectan
    por run dentro del loop del agente (`createWorkspaceTools` sobre
    `getWorkspace({ requestContext })`). La verificación del wiring es por
    ejecución (sonda live: el implementer llamó `mastra_workspace_write_file`
    y escribió en el project root), no por inspección.
16. **`LocalFilesystem.readOnly` se enforcea en código**
    (`WorkspaceReadOnlyError` al escribir; verificado por sonda para leader y
    reviewer) y el sandbox solo existe para roles escribibles — la regla
    "leader/reviewer no editan código" es construcción, no prompt. Ojo:
    `listFiles` no está en la interfaz `WorkspaceFilesystem` (solo las tools
    del agente la exponen); la API programática es `readFile`/`writeFile`/
    `stat`/…
17. **Un `isError` del MCP vuelve como TEXTO plano del wrapper y se leía como
    éxito** (incidente Studio 2026-07-28): un run con feature con espacios
    (`revision de antiguo harness…`) mostró `feature_add: added` /
    `feature_start: in_progress` sin escribir nada (el servidor rechazó por
    regex y el texto del error pasó por `callHandymanTool` como `ok:true,
    data:{}`); los agentes improvisaron reportes con el nombre sanitizado y
    el close terminó `close_rejected`. Fix doble: `carriedSchema` valida el
    nombre en la SUBMISSION del workflow (mensaje claro en la UI) y
    `callHandymanTool` trata cualquier texto con pinta de error MCP como
    `ok:false`. Tests: `feature-cycle.test.ts` (27/27).

## Modelos por rol (multi-provider)

| Rol | Env var | Default (`pnpm studio`) |
|---|---|---|
| leader | `HANDYMAN_LEADER_MODEL` | `kimi-coding/k3` |
| implementer | `HANDYMAN_IMPLEMENTER_MODEL` | `zai/glm-5.2` |
| reviewer | `HANDYMAN_REVIEWER_MODEL` | `zai/glm-5.2` |

**Principales (decisión del operador 2026-07-28):** `kimi-coding` (Kimi for
Coding, `KIMI_API_KEY`) y `zai` (Z.AI GLM protocolo Anthropic,
`Z_AI_API_KEY`) — factories propias en `src/ports/model-catalog.ts`.

**Locales, configurados a mano:** `agents/mastra-handyman/model-catalog.json`
declara providers extra (editar el JSON, sin tocar código) — por defecto
`ollama` (`127.0.0.1:11434/v1`) y `lmstudio` (`127.0.0.1:1234/v1`), ambos por
**protocolo Anthropic** (`/v1/messages`, el mismo wire ya probado con
zai/kimi → cero dependencias nuevas, sin key). Uso:
`HANDYMAN_IMPLEMENTER_MODEL=ollama/qwen3:32b`. `models: []` = cualquier
modelo que el servidor tenga cargado; una lista restringe. Override de ruta:
`HANDYMAN_MODEL_CATALOG`. La vía custom-gateway de Mastra
(`ModelsDevGateway`) se evaluó y se descartó para locales: su maquinaria de
providers/keys pelea con servidores sin key (ver explore report).

**Router built-in (pass-through):** cualquier otro spec cae como string al
model router de Mastra (159 providers) — `openrouter/*` (con
`OPENROUTER_API_KEY`), `openai/*`, `google/*`… disponible pero SIN
credenciales configuradas a fecha de hoy (decisión: desestimado como
default). Investigación: `.handyman/backlog/explore_modelos_dinamicos_catalogo.md`.

**Capacidades por modelo** (`MODEL_CAPABILITIES`, verificadas contra la API
de OpenRouter): presets de `reasoning`/`maxOutputTokens` para specs
`openrouter/*` (65 536 glm / 32 768 Kimi) — aplican si alguna vez se usa el
router con esos modelos; los providers custom quedan en 16 384 sin
reasoning flag. `roleDefaultOptions(spec)` aplica el preset por rol.

Un token de Kimi for Coding NO es válido en `api.moonshot.ai` (401) —
productos distintos. Y ojo: el `zhipuai*` del registry apunta al endpoint CN
(`open.bigmodel.cn`), no al Z.AI internacional del provider custom `zai`.

Ejemplo mixto validado:

```bash
HANDYMAN_IMPLEMENTER_MODEL=kimi-coding/k3 \
HANDYMAN_REVIEWER_MODEL=kimi-coding/k3 \
HANDYMAN_PROJECT_ROOT=/tmp/hm-mastra-mixed pnpm run-feature -- sup_mixed_kimi
```

## Resultados de validación (2026-07-28)

**Fase 0 (agente plano, spike_mastra_green/red en /tmp/hm-mastra-spike):**

- Verde: ciclo completo en 35s → `done` en disco con `started_at`/`done_at`
  reales, impl + review en backlog, usage capturado (in 42 046 / out 916).
- Roja (verifier exit 1): `feature_close` rechazado, feature queda
  `in_progress`, el agente reporta la denegación textual y para.

**Fase 1 (supervisor + subagentes, 3 corridas + 1 roja):**

| Feature | leader | implementer | reviewer | Estado | impl | review |
|---|---|---|---|---|---|---|
| `sup_loop_1` | GLM-5.2 | GLM-5.2 | GLM-5.2 | `done` | ✓ | ✓ |
| `sup_loop_2` | GLM-5.2 | GLM-5.2 | GLM-5.2 | `done` | ✓ | ✓ |
| `sup_mixed_kimi` | GLM-5.2 | **kimi-coding/k3** | **kimi-coding/k3** | `done` | ✓ | ✓ |
| `sup_red_verifier` (verifier exit 1) | GLM-5.2 | GLM-5.2 | GLM-5.2 | `in_progress` (close rechazado) | ✓ | ✓ |

Las 4 con `validate_harness: OK`; duraciones 75–115s; el ledger se omitió
correctamente en la roja (`[ledger] skipped (feature not done)`).

**Fase 2 (memoria + observabilidad + tokens + telemetría):**

- Thread por feature persistido en LibSQL (`id="sup_mixed_kimi"`,
  `resourceId="project:_tmp_hm-mastra-mixed"`).
- Métricas automáticas en DuckDB por entidad y modelo — la corrida mixta:
  leader glm-5.2 in 45 045 / out 887; implementer k3 in 9 480 / out 789
  (229 reasoning); reviewer k3 in 12 612 / out 668 (237 reasoning).
  Correlación `threadId`/`resourceId`/`runId` verificada en `metric_events`.
- Ledger `tokens.jsonl` con `source:"mastra"`, `scope:"leader"` en las 3
  corridas verdes. **Limitación conocida:** la línea registra solo el uso
  del LEADER (`result.usage`); el total del run (con subagentes) se agrega
  desde `metric_events` por `threadId`/`runId` — en la mixta, ~45k
  registrados vs ~67.6k reales.
- Telemetría `logs/agent-<feature>.jsonl`: secuencia del protocolo
  (`feature_add → feature_start → agent-implementer → agent-reviewer →
  feature_close → stop`) con usage por step, nombres de tools y ningún
  contenido de mensajes. Los pasos INTERNOS del subagente no aparecen en el
  `onStepFinish` del leader (solo la delegación `agent-*`): su detalle vive
  en los spans de DuckDB.

Reporte completo: `.handyman/backlog/impl_mastra_spike_phases_0_2.md`.

**Fase 3 (workflow durable + HITL, 4 corridas en /tmp/hm-mastra-wf-*):**

| Corrida | Escenario | Resultado |
|---|---|---|
| `wf_green` | start → suspend → resume approve | `done` en disco, `validate_harness: OK` |
| `wf_reject` | start → suspend → resume reject | `bail` tipado `changes_requested`; feature queda `in_progress`, close nunca intentado |
| `wf_red` | verifier exit 1; humano **override** al reviewer y aprueba | `close-feature` rechazado por el verifier → `bail` `close_rejected`; `in_progress` (el gate es código, no el reviewer) |
| `wf_crash2` | kill -9 a mitad de `review` → restart → approve | `done`; solo el step interrumpido se re-ejecutó (timestamps 17:32:55→17:33:12 pre-kill restaurados del snapshot; `review` re-corrió 17:33:31→17:33:53) |

- `suspend/resume` cross-proceso verificado: el resume corre en un proceso
  nuevo contra el mismo data dir (0.2s; los steps previos no se re-ejecutan).
- Observabilidad en la topología workflow: 158 spans con jerarquía
  `workflow_run → workflow_step → agent_run → model_generation → mcp_tool_call`
  y `metric_events` de tokens en DuckDB (corrida crash2).
- `wf_crash` (primera corrida de crash) murió en el restart por el bug de
  mappings (hallazgo §8) — quedó como evidencia del bug, no del diseño.
- Reporte completo: `.handyman/backlog/impl_mastra_spike_phase_3.md`.

**Fase 4 (evals en CI + skill nativa + ledger fiel):**

- **Evals con exit code** (`pnpm test:eval`, 2 casos reales): `runEvals` con
  gates `checks.toolOrder` + `checks.noToolErrors` y scorer propio
  `protocol-trajectory-order` (zero-LLM, threshold 1.0). Verde → verdict
  `passed` + `done`; roja (verifier exit 1) → verdict `passed` +
  `in_progress`. `[eval] PASSED`, **EXIT_CODE=0**. Scores persistidos en la
  tabla `mastra_scorers` de LibSQL (scorers registrados en la instancia).
- **Skill handyman nativa espejo** (`pnpm run-skill`): el `handyman/SKILL.md`
  canónico (+ `references/`) cargado como skill agent-level por path — cero
  duplicación — sin role instructions. Ciclo completo: `skill → feature_add →
  feature_start → feature_log → report_write ×2 → backlog_review →
  feature_close` → `done` en 74.8s, `validate_harness: OK`.
- **Ledger por traceId**: la línea `scope:"run"` registra el total real
  (leader + delegaciones comparten traza): in 89 782 / out 2 356 vs
  `result.usage` del leader in 49 614 / out 774 (1.8×). threadId NO sirve:
  las delegaciones corren en threads frescos por aislamiento.
- Reporte completo: `.handyman/backlog/impl_mastra_spike_phase_4.md`.
- **ADR: `docs/adr-mastra-adopcion.md`** — **ratificado por el operador el
  2026-07-28** (adopción + sunset de Flue ejecutado ese día).

## Studio (panel oficial, 2026-07-28)

El aditivo post-ADR "Studio como panel" quedó habilitado con el entry
`studio/index.ts` (re-exporta `buildApp()`) y la dev-dependency `mastra`
pineada (`1.20.2`, peer-compatible con core 1.53.0). **Reemplaza a apps/web**
(eliminada el mismo día junto con `toolbox serve`).

Arranque ordenado (un comando, `scripts/studio-local.sh`):

```bash
pnpm studio     # desde la raíz del repo -> http://localhost:4111
```

El script, en orden: carga `.env` → build de `handyman/dist` si falta →
bootstrap del proyecto de experimento (`HANDYMAN_PROJECT_ROOT`, default
`/tmp/hm-studio`, via `scaffold.sh local` — NUNCA el monorepo por defecto) →
MCP arriba en 8177 (reusa uno vivo; lo mata al salir si lo levantó él) →
`mastra dev` en foreground. Defaults de experimento: **leader
`kimi-coding/k3`** (override: `HANDYMAN_LEADER_MODEL`); implementer/reviewer
siguen en `zai/glm-5.2`.

Da: chat con el leader (sus 27 tools: 25 MCP + `web_search`/`web_fetch`),
inspección de agents/tools, el workflow `feature-cycle` (start/resume desde
la UI) y los traces en DuckDB. Verificado end-to-end: `/api/agents` 200,
chat REST real, scaffold automático del proyecto, y skill experimental
respondiendo `SKILL-OK` con el leader k3. **Nota:** `mastra dev` NO corre
con cwd = package dir — el script fija `HANDYMAN_DATA_DIR`/
`HANDYMAN_TELEMETRY_DIR` package-local (desde el desacople del runtime el
default es `<HANDYMAN_ROOT>/agent/<harnessId>/…`; el flujo dev sigue con
`./data`/`./logs`) y mantiene `HANDYMAN_REPO_ROOT` como override dev.

### Skills experimentales

Todo directorio `agents/mastra-handyman/skills/<nombre>/SKILL.md` se carga
como skill nativa del LEADER en el siguiente arranque (`src/ports/skills.ts`
— scope paquete, resuelto package-relative; `HANDYMAN_SKILL_DIRS` lo
reemplaza) — sin tocar código. La skill mirror (`run-skill`) no las carga:
su contrato es la skill canónica sola. `skills/ejemplo-skill/` es el canario
del mecanismo (pide "prueba de skill" en el chat → `SKILL-OK`) y la
plantilla de copia; bórrala al tener las tuyas.

## Superficie de sistema (2026-07-28, mandato del operador)
Los agentes tienen acceso real al sistema, a la manera documentada de Mastra:

| Capacidad | Vía | Alcance por rol |
|---|---|---|
| Filesystem | `Workspace` + `LocalFilesystem` (`src/ports/workspace.ts`) | implementer/skill: escritura · leader/reviewer: read-only (enforced por `WorkspaceReadOnlyError`) |
| Shell / git | `LocalSandbox.execute_command` (git CLI, tests, verifier) | solo implementer/skill |
| Búsqueda web | `web_search` + `web_fetch` propios (`src/ports/web-tools.ts`, DuckDuckGo Lite + fetch, cero API keys, output capado) | leader + skill mirror |
| GitHub | MCP oficial `api.githubcopilot.com/mcp/` en el mismo `MCPClient` cuando hay `GITHUB_TOKEN`/`GH_TOKEN` | solo leader (los filtros por verb exactos nunca dejan pasar `github_*` a subagentes); alternativa sin token: `gh` CLI autenticado en el sandbox |
| Observabilidad | las workspace/MCP tool calls caen en los spans ya exportados (`MastraStorageExporter`) | todos |

Verificado por sonda live (eliminada tras extraer hallazgos): búsqueda real
devuelve resultados; fetch de página OK; escritura denegada a leader/reviewer
y permitida a implementer/skill; tool call `mastra_workspace_write_file`
ejecutada en una corrida GLM real. `tsc` limpio, `vitest` 23/23.

## Pendiente (post-spike; ADR ratificado 2026-07-28)

- ~~Ratificación del ADR~~ **ratificado**: Flue eliminado con la vista
  `/agent` el mismo día.
- Deuda: pinning de proyecto a nivel MCP — la mitad cliente quedó RESUELTA
  (feature 103, wrapper en `connectHandymanMcp`); queda la mitad server-side
  (una sesión MCP por proyecto); issue upstream restart+`.map()`.
- ~~Lectura de backlog~~ **resuelta** con el filesystem read-only del
  reviewer (ver hallazgo §9).
- Aditivos (capa conversacional, nunca negocio): semantic recall,
  Observational Memory, Studio como panel; web search con backend dedicado
  (`@mastra/tavily`) si se provee `TAVILY_API_KEY` — el par `web_search`/
  `web_fetch` actual cubre investigación sin credenciales.

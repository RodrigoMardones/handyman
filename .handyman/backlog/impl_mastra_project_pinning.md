---
type: Implementation Log
feature: mastra_project_pinning
status: implemented
role: implementer
updated: 2026-07-29
tags: [handyman/role/implementer, handyman/feature/mastra_project_pinning]
---

# Implementation Report: mastra_project_pinning

Pinning de proyecto a nivel CLIENTE MCP en `agents/mastra-handyman`: la regla
HARD STOP ("toda tool call apunta EXACTAMENTE al proyecto configurado") deja
de ser solo prompt — deuda del ADR Mastra tras 2 incidentes de deriva (el
modelo corrió tools contra OTRO harness del registry; hallazgo §6 del README
pedía exactamente "un wrapper de tools que rechace `project != PROJECT`").
Se envuelven las tools `handyman_*` que declaran arg `project`, una sola vez
en el choke point (`connectHandymanMcp`), así leader, subagentes, workflow y
skill mirror reciben el mismo mapa pineado. El pinning server-side (una
sesión MCP por proyecto) queda fuera: deuda del MCP.

## What

- **Puerto nuevo `src/ports/mcp-pinning.ts`.** `pinToolsToProject(tools,
  projectRoot)` devuelve `{ tools, pinned }`: para cada tool cuyo nombre
  empieza por `handyman_` Y cuyo inputSchema declara `project`
  (`acceptsProjectArg`), envuelve `execute` con el guard:
  - **sin `project`** → inyecta `config.projectRoot` (absoluto, inequívoco
    tras F99/F101);
  - **mismo proyecto** → pasa TAL CUAL (el path absoluto, un absoluto que
    resuelve igual vía `resolve()` — slash final—, o el basename del root:
    shorthand por nombre que las templates enseñan; el server resuelve
    nombres él mismo);
  - **proyecto ajeno** → RECHAZA: `console.warn('[pinning] …')` + throw con
    mensaje que nombra pin e intento y cómo reintentar. Rechazo, no rewrite
    silencioso: el modelo aprende del error. El `execute` envuelto es
    `async` para que el rechazo sea siempre una promesa rechazada (el
    execute MCP subyacente es async).
  Input no-record pasa intacto (la validación del server manda). `isSameProject`
  y `acceptsProjectArg` exportados para tests.
- **Detección por inputSchema, no por lista de nombres** — verificada
  empíricamente contra `@mastra/mcp` 1.15.0 con server vivo (2026-07-29):
  `tool.inputSchema` es un `JsonSchemaWrapper` (props propias: `~standard`;
  proto: `getSchema()`, `getAjv()`); `getSchema().properties` tiene
  `project` en las tools pineables y NO en `harness_list`/`fleet_status`/
  `fleet_health` (el set `needsProject: false` del servidor,
  `handyman/src/mcp.ts`) — esas pasan intactas por construcción, igual que
  las no-handyman (`github_*`). Plain JSON schema también soportado (tests).
  Convención de llamada verificada en vivo: `execute(input)` con los args a
  TOP LEVEL (un shape `{ context }` se valida fuera; pin top-level cubre
  ambas).
- **Cableado en `connectHandymanMcp`** (`src/agents/handyman/leader.agent.ts`)
  — el único punto donde existe el toolmap crudo: `app.ts` lo reparte al
  leader, `createRoleAgents` (filtros de role-tools), el workflow
  feature-cycle (sus steps deterministas llaman `tool.execute(args)` vía
  `callHandymanTool`, que ya traduce throw → `{ ok:false, error }` tipado) y
  `run-skill.ts` (skill mirror). Boot log ahora informa:
  `[mcp] connected …: 25 tools, 21 pinned to <root>` (21 = 25 − 4
  `needsProject:false`); si 0 tools quedan pineadas habiendo handyman_*,
  suena `[pinning] WARNING … pinning is INERT (inputSchema shape drift?)`.
- **README** — sección "Pinning de proyecto a nivel cliente MCP (feature
  103)"; hallazgo §6 y línea de "Pendiente" actualizados: deuda estructural
  RESUELTA en su mitad cliente; server-side sigue.

## Files Changed

- `agents/mastra-handyman/src/ports/mcp-pinning.ts` — **nuevo**: guard de
  pinning + detección por inputSchema.
- `agents/mastra-handyman/src/ports/mcp-pinning.test.ts` — **nuevo**: 9
  tests (casos (a)–(d) del brief + shapes de schema + passthroughs).
- `agents/mastra-handyman/src/agents/handyman/leader.agent.ts` — wrapping en
  `connectHandymanMcp` + boot log con contador de pineadas + warn si inerte.
- `agents/mastra-handyman/README.md` — sección pinning; deuda §6 y
  "Pendiente" actualizadas.

## Decisions

- **Un solo wrap en el choke point**, no wraps por consumidor: cualquier
  toolset derivado del mapa (filtros por verb, workflow, mirror) hereda el
  pinning sin tocar esos archivos.
- **Rechazo > rewrite**: un rewrite silencioso de `project` ocultaría la
  deriva y el modelo no aprendería; el error lleva el fix ("Retry with
  project=… or omit").
- **El basename se acepta como "mismo proyecto"** comparando strings en
  cliente (sin reconsultar el registry): es el shorthand que las role
  templates enseñan y el server lo resuelve — rechazarlo rompería el flujo
  legítimo.
- **Warn vía `console.warn` estructurado**: el TelemetrySink (F92) es
  run-scoped por feature y no alcanza el wrap-time del toolmap (se crea en
  el driver tras el boot); el brief lo permitía como fallback.
- **Sin flag de opt-out**: el pinning es la regla de seguridad del runtime;
  el escape es pasar el path absoluto equivalente o dejar el arg vacío.
- **Warn (no throw) si 0 pineadas**: no bloquear el boot por una deriva de
  shape de Mastra; el contador en el boot log + WARNING lo hacen visible.

## Test Output

```text
cd agents/mastra-handyman
pnpm test:unit          # Test Files 9 passed (9) · Tests 86 passed (86)
pnpm exec tsc --noEmit  # exit 0
pnpm build:bundle       # bundle: …/dist-bundle (3 runners…) / status: ok
./init.sh               # VERIFIER: all gates passed (exit 0)
```

## Evidencia en vivo (server real, sin LLM)

Con `node handyman/dist/mcp.js --http --port 19998` y
`HANDYMAN_PROJECT_ROOT=/tmp/hm-studio`, llamando `connectHandymanMcp` y las
tools del mapa directamente:

```text
[mcp] connected to http://127.0.0.1:19998/mcp: 25 tools, 21 pinned to /tmp/hm-studio
— foreign project:
[pinning] handyman_feature_next rejected: this agent is pinned to project
"/tmp/hm-studio" but the call attempted "/Users/…/handyman". Retry with
project="/tmp/hm-studio" or omit the "project" argument.
rejected: [pinning] handyman_feature_next rejected: …
— same project (basename): {"project":"hm-studio","drained":false,"ready":[…]}
— omitted project (injected): {"project":"hm-studio","drained":false,"ready":[…]}
```

Rechazo con ambos nombres (nunca llega al server), basename aceptado,
inyección efectiva — contra el MCP real, no solo fakes.

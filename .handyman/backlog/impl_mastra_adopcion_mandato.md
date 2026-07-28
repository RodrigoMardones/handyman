---
type: Implementation Log
feature: mastra_adopcion_mandato
status: implemented
role: implementer
updated: 2026-07-28
tags: [handyman/role/implementer, handyman/feature/mastra_adopcion_mandato]
---

# Implementation Report: mandato del operador post-ADR (4 decisiones)

Sesión fuera del ciclo de features (como el spike). El operador ratificó el
ADR `docs/adr-mastra-adopcion.md` y dictó 4 decisiones; evidencia = este
reporte. Continuación de `.handyman/progress/handoff-2026-07-28d.md`.

## Decisión 1 — Sunset de Flue EJECUTADO

Eliminación inmediata (sin ventana de deprecación):

- `agents/flue-handyman/` eliminado; vista `/agent` de `apps/web` retirada
  (`app/agent`, `app/api/agent`, `components/AgentLive.tsx`).
- Suites `tests/test_flue_agents.sh` y `tests/test_web_agent.sh` eliminadas
  (con sus líneas en `tests/run_tests.sh`).
- Scripts raíz `agents:*` repuntados a `@handyman/mastra-handyman`
  (`run`/`workflow`/`skill`/`eval`/`test`).
- Entradas `allowBuilds` de `@flue/*` limpiadas en `pnpm-workspace.yaml`;
  `pnpm install` → lockfile −203 paquetes.
- ADR Mastra marcado ratificado; ADR Flue marcado histórico; `AGENTS.md` y
  `.handyman/memory/architecture.md` actualizados a la capa Mastra.
- **Verificación:** `tsc` web limpio, `next build` verde (rutas `/agent`
  fuera del manifiesto), suite completa `run_tests.sh` ALL SUITES PASSED.

## Decisión 2 — Acceso al sistema (investigación + implementación)

**Problema origen:** los agentes solo tenían las 25 tools MCP de dominio;
sin filesystem real, sin web, sin git — cualquier feature con código real
quedaba fuera de alcance.

**Cómo lo resuelve Mastra según su documentación** (verificado contra
`@mastra/core@1.53.0`, versión latest al día):

- **Filesystem + shell:** `Workspace` (`@mastra/core/workspace`, estable
  desde 1.1.0) con `LocalFilesystem` + `LocalSandbox`. Tools inyectadas
  automáticamente por run con prefijo `mastra_workspace_` (read_file,
  write_file, edit_file, list_files, grep, execute_command, …). Patrón
  documentado de workspace por rol.
- **Web search:** no hay paquete paraguas; las rutas oficiales
  (`@mastra/tavily`, provider-native) requieren API keys que este despliegue
  no tiene. Se implementaron `web_search` (DuckDuckGo Lite, sin key) y
  `web_fetch` (fetch + HTML→texto) como `createTool` propios con output
  capado (`src/ports/web-tools.ts`) — investigación usable HOY; Tavily queda
  como upgrade enchufable si se provee `TAVILY_API_KEY`.
- **Git:** CLI vía `execute_command` del sandbox (así lo hace el propio
  `createCodingAgent` de Mastra).
- **GitHub:** la vía documentada es MCP — servidor oficial
  `api.githubcopilot.com/mcp/` añadido al MISMO `MCPClient` cuando existe
  `GITHUB_TOKEN`/`GH_TOKEN` (`connectHandymanMcp`). Solo lo ve el leader:
  los filtros de subagentes matchean keys exactas `handyman_<verb>`.
  Alternativa sin token: `gh` CLI autenticado dentro del sandbox.

**Superficie por rol (las reglas duras son código):**

| Rol | Filesystem | Sandbox | Web | GitHub MCP |
|---|---|---|---|---|
| leader | read-only | — | sí | sí (si token) |
| implementer | escritura | sí (git/tests/verifier) | — | — |
| reviewer | read-only | — | — | — |
| skill mirror | escritura | sí | sí | — |

`src/ports/workspace.ts` (`roleWorkspace`); barrel `src/mastra/index.ts`
extendido (disciplina anti-volatilidad intacta). El `readOnly` se enforcea
con `WorkspaceReadOnlyError`; el sandbox expone solo `PATH` (no fuga las
API keys de `process.env` a comandos del agente); basePath absoluto (el
relativo resuelve contra `process.cwd()`, trampa documentada).

**Verificación:** sonda live (eliminada tras extraer hallazgos, disciplina
del spike): `web_search` devolvió 8 resultados reales; `web_fetch` OK;
escritura DENEGADA a leader/reviewer y permitida a implementer/skill;
corrida GLM real donde el implementer llamó `mastra_workspace_write_file` y
escribió en el project root. `tsc` limpio, `vitest` 23/23.

## Decisión 3 — Deuda estructural (lectura de backlog): RESUELTA sin capa nueva

Hallazgo clave (mapa técnico): la deuda no era "leer backlog por MCP quema
tokens" — era que **el backlog no era legible EN ABSOLUTO** por los agentes
(el MCP solo tiene `report_write` y `backlog_review`; ningún tool ni
resource de lectura). Síntoma real: el reviewer estampó
`changes_requested` por "la feature no existe" al juzgar a ciegas.

Respuesta a las preguntas del operador:

- **¿Es necesaria una capa de lectura por MCP?** NO. El filesystem read-only
  del reviewer (decisión 2) la vuelve innecesaria: lee
  `.handyman/backlog/impl_<f>.md` directo de disco. Cero superficie MCP
  nueva, cero tokens de envelope por lectura (el FS tool entrega el archivo
  directo).
- **¿Informes dentro de la DB de Mastra?** NO — rompería el gate:
  `feature.js done` lee el veredicto de `backlog/review_<f>.md` DESDE DISCO.
  Además viola la regla §3 del ADR (verdad única en disco; LibSQL solo lo
  que muere con el run; el backlog es curado, git-tracked, multi-runtime).
  La fase 3 del spike ya lo clasificó "No reemplazable".
- **¿Parte del contexto existente?** Ya lo es parcialmente (el task del
  reviewer lleva el output del implementer) — queda como fallback; la fuente
  primaria ahora es el archivo leído por el propio reviewer.

## Decisión 4 — Reducir la skill nativa, maximizar herramientas Mastra

Medido en el spike: skill mirror ≈ 129k input tokens (con disciplina;
376k la primera corrida), supervisor ≈ 90k, workflow ≈ la mitad del
supervisor. Decisión documentada (README §13):

- **El workflow durable es el camino por defecto del ciclo de una feature**
  (orden en código, sin leader de routing, HITL nativo, crash-recovery) — es
  la topología más barata y la más determinista.
- **La skill mirror queda como validación de formato y camino de adopción**
  (un agente genérico + `handyman/SKILL.md` ejecuta el protocolo), no como
  path de ejecución rutinario — su coste de carga progresiva de references
  no se justifica por feature.
- **Maximizar lo nativo de Mastra** ya aplicado: Workspace en vez de tools
  MCP de lectura nuevas; observabilidad/storage/evals nativos ya en uso; la
  skill mirror gana workspace + web para ser útil en proyectos reales (el
  aditivo post-ADR "Workspace+filesystem" queda ejecutado).

## Loose ends

- Pinning de proyecto a nivel MCP: sin cambios — sube de prioridad (2
  incidentes de deriva). Es la única vía de contaminación real observada.
- Issue upstream restart+`.map()`: sigue sin filear.
- Gotcha menor descubierto: `score_events` no existe; la tabla real es
  `mastra_scorers` (README corregido).
- `web_search` depende del markup de DuckDuckGo Lite (scraper honesto, sin
  SLA); si se rompe, el fallback es `TAVILY_API_KEY` + `@mastra/tavily`.
- Commit + PR: decisión del usuario.

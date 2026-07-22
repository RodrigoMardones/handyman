## Revisores

- RodrigoMardones

## Cambios

- **Rework de capas — rama como período (features 69–71)**
  - Cierre del período varado SP6: 39 features done archivadas (`feature_list.json` 73 KB → 5.7 KB), history compactado y backlog con retención — 318 reportes movidos a `archive/backlog/`.
  - La rama reemplaza al sprint calendario como unidad: `sprint.js open <rama-slug>` al abrir, `close` en el merge (checkpoint C6 nuevo); `add`/`start` estampan el período abierto; `core/period.ts` comparte `readCurrentSprint`.
  - Preflight gana el bloque `context` (frescura del grafo graphify, advisory puro) y las NOTEs de discovery solo señalan skills locales del repo no declaradas (13 accionables vs ~30 de ruido global).
- **handyman-mcp-server (feature 72)**
  - `handyman/src/mcp.ts`: wrapper MCP stdio delgado sobre los mismos `dist/*.js` de la CLI — cero segunda fuente de verdad. 6 tools (`harness_list`, `preflight`, `feature_next`, `feature_close`, `report_write`, `verify`) + resources `handyman://{project}/current` y `handyman://{project}/docs/{doc}`.
  - El contrato pasa de prosa a código: `feature_close` delega en `feature.js done`, así un verifier rojo rechaza el cierre por precondición de subprocess; no existe flag de forzado.
  - Hub multi-repo: toda tool acepta `project` (nombre del registry, root absoluto o cwd) resuelto contra `$HANDYMAN_ROOT/registry.json`.
  - Registrado en `discovery.mcp` y `.vscode/mcp.json`; SKILL.md con sección "Mechanics: MCP First" y `references/mcp.md` nuevo (inglés); dependencias `@modelcontextprotocol/sdk` + `zod`.
- **Workspace memory layout (feature 73)**
  - El directorio de conocimiento del workspace se renombra `docs/` → `memory/` mediante un resolver único `resolveDocsDir(workspace)` en `toolbox-core` con fallback legacy — los harnesses registrados que siguen en `docs/` funcionan sin migrar (caso T18b).
  - Los handoffs de `docs/current/` se fusionan en `progress/` (links relativos reescritos) y la carpeta desaparece; `index.md` regenerado con el layout nuevo.
  - Superficies estables a propósito: URIs MCP `handyman://.../docs/*` y tokens `docs:` del observer no cambian; solo se movió el layout en disco (`apps/web` necesitó cero cambios).
  - Scaffold y plantillas (AGENTS/CHECKPOINTS/init/gitignore/index/feature-request), SKILL.md y references emiten `memory/`.

## Tarea o asunto asociado

- feat/rework-tools · features 69–73 (`period_close_branch_unit`, `graphify_freshness_gate`, `discovery_declared_paths`, `handyman_mcp_server`, `workspace_memory_layout`)

## Evidencia del cambio

- `./init.sh` exit 0 en el cierre de cada feature (`feature done` gateado por verifier): shellcheck OK, `tsc -b` OK, `validate_harness` OK, `tests/run_tests.sh` con todas las suites verdes.
- Suite nueva `tests/test_mcp.js` 8/8 sobre JSON-RPC real: las 6 tools y los 2 resource templates expuestos; verifier rojo rechaza `feature_close` con el estado intacto, verde cierra y agrega history.
- Suites tocadas por el rename: `test_init` 29/29 (scaffold memory + fallback legacy `docs/`), `test_sprint` 13/13, `test_index` 6/6, `test_docs` 220/220, `test_web_intake_ask` 19/19, `test_web_timeline_search` 18/18.
- `tools_discovery check`: `mcp handyman: ok (configured in vscode)`.
- Dogfooding: los reportes `impl_`/`review_` de las features 72 y 73 se escribieron con la tool `report_write` del propio server.

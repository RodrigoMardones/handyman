## Revisores

- RodrigoMardones

## Cambios

- Completa la migración Python → TypeScript del toolchain: elimina los 11 CLIs de `handyman/scripts/*.py` (y `tests/test_docs.py`) reemplazados por `handyman/src/*.ts` sobre el núcleo compartido `handyman/src/core/` (workspace, featureList, frontmatter, schema, diff, rounding, version — con unit tests vitest), build con `tsc` a `dist/` y Biome como formatter/linter. Las suites bash de `tests/` quedan como oráculo de paridad apuntando a los entrypoints de `dist/` (14 suites, 175 casos), y `test_docs.js` sustituye al runner Python de estructura documental.
- Agrega el observador toolBox en TS: `handyman/src/toolbox.ts` (registro global de harnesses en `$HANDYMAN_ROOT/registry.json` con subcomandos `register/unregister/list/discover/status/health/heartbeat/timeline/moc/serve`) y `handyman/src/toolbox_serve.ts`, panel web local read-only sin build-step (React 18 + htm + MiniSearch como UMD servidos desde `node_modules` vía `/vendor/*`, CSP `default-src 'self'`, GET-only, guard de Host, SSE con debounce sobre `fs.watch`). Nueva suite `tests/test_toolbox_serve.sh` (23 casos) además de `tests/test_toolbox.sh`.
- Ejecuta los cinco planes de UI del observador sobre el panel React (`handyman/assets/toolbox_panel.js`):
  - Plan A (#19): strip de KPIs por harness desde `metrics.collect()` (approval rate, cobertura de reportes, cierres 14d) + sparkline SVG a mano, sección Docs con quick-view de `business/architecture/conventions/verification`, y fechas relativas con absoluta en `title` (capa `fmt.*`).
  - Plan B (#20): toggle de tema light/dark/system con script inline anti-flash, `data-theme` sobre los tokens `--hw-*` y clave versionada `hw-theme:1` (system = borrar la clave).
  - Plan C (#21): markdown renderizado seguro en el visor (marked + DOMPurify con `FORBID_TAGS`/`FORBID_ATTR`, bloqueo de `javascript:`, fallback escapado si falta un vendor) con la CSP como segunda defensa; el grafo de graphify se sirve con `vis-network` vendoreado same-origin (reescritura del script de unpkg para no violar la CSP).
  - Plan D (#22): accesibilidad live — dos live regions estáticas y únicas (polite `role="status"` y assertive `role="alert"` sin `aria-live` explícito para evitar el doble anuncio de VoiceOver/iOS), announcer con cola y debounce que resume ráfagas SSE ("N feature(s) updated in X"), pérdida/recuperación de conexión anunciada como texto + color (nunca solo color), guard global `prefers-reduced-motion` sellado por test y empty states accionables.
  - Plan E (#23): command palette hecho a mano — `<dialog>` nativo (`showModal()` con retorno de foco), acciones derivadas del estado vivo rankeadas con el MiniSearch ya cargado, y un único listener `keydown` a nivel de documento con guard de campos (`⌘K/Ctrl+K`, `/` foco en search, `g`+`f/t/s` navegación, `?` ayuda, flechas/`j/k` selección, Enter ejecuta).
- Agrega los documentos de investigación que sustentan los planes: `docs/analisis-ui-observador-toolbox.md` (evidencia legada + estado del arte 2026 + planes A–F) y `docs/analisis-peticiones-llm-toolbox.md` (SDKs TypeScript para LLM, patrón relay SSE server-side y casos de uso futuros del observador).
- Versiona la skill y el paquete como `2.0.1` (SKILL.md `metadata.version` + `package.json`), compatible con el parser semver del harness.
- Reescribe `.gitignore` para dejar el máximo contexto dentro del repositorio: solo se ignora lo regenerable o específico de máquina (`node_modules`, `handyman/dist`, cachés de Python/tests, `.DS_Store`, `.handyman/.upgrade-backups`, temporales `.graphify_*`, `.vscode`). Entran al repo el estado del harness (`.handyman`: feature_list, progress, backlog, docs y sprints), los role files de `.github/agents/`, las skills de `.agents/skills/`, `CLAUDE.md`, `harness.config.json` y `graphify-out/` completo con su caché de extracción (elimina además la regla muerta `Igraphify-out/*` y las negaciones inefectivas bajo directorio ignorado).
- Regenera el grafo de conocimiento de graphify sobre el corpus completo (120 archivos): 1644 nodos, 2903 aristas y 103 comunidades etiquetadas en `graphify-out/` (graph.json, graph.html con vis-network local, GRAPH_REPORT.md); `node_modules` queda fuera por diseño (exclusión integrada del detector). El reporte detecta un ciclo de imports `core/index.ts ↔ metrics.ts` como candidato a limpieza futura.
- Cierra las features 16–23 del harness con sus reportes de implementación y review en `.handyman/backlog/` (incluye `explore_toolbox_a11y_live.md` con la investigación WCAG 4.1.3 / ariaNotify que justifica el Plan D); la cola queda sin pendientes.

## Tarea o asunto asociado

- feat/toolbox-ui-observer

## Evidencia del cambio

- `bash tests/run_tests.sh`: ALL SUITES PASSED — 14 suites, 175 casos (docs, init 17, update 12, feature 25, backlog 7, index 6, upgrade 10, tools-discovery 16, evals 8, preflight 11, metrics, sprint, toolbox, toolbox-serve 23).
- `./init.sh`: exit 0 (fases tools → files → state → lint Biome → build tsc → tests → validate; advisories de preflight sin bloqueos).
- Verificación runtime adicional del panel: simulación node con DOM stub (debounce del announcer colapsa ráfagas en un anuncio, canal assertive inmediato, `diffSummary` correcto) y ranking del palette con MiniSearch real (prefix/fuzzy, 0 matches muestra fila vacía).

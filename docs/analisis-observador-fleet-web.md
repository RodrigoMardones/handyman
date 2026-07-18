# Análisis: observador web local de la flota handyman

> ¿Cómo construir un observador de proyectos handyman en el navegador, 100% local y en
> TypeScript, que combine el estado en disco de cada harness con la capa de retrieval
> concluida en [analisis-rag-handyman.md](analisis-rag-handyman.md) y el grafo de
> [mapa-entidades-negocio.md](mapa-entidades-negocio.md)?

## 1. Evidencia: lo que ya existe (y lo que se perdió en la migración)

1. **La flota ya existe.** `$HOME/HANDYMAN/` contiene `registry.json` (3 harnesses
   registrados: handyman, cmcet-back, phily-app), `events.jsonl` (eventos de cierre de
   features), `index.md` (MOC de flota para Obsidian) e `index.html` (dashboard estático
   con dark mode).
2. **El diseño original ya resolvió lo importante** (backlog `impl_fleet_monitoring_research`,
   features 61–65 de la era Python): el registry guarda solo `project_root` + fecha; todo lo
   demás se **lee en vivo del disco de cada harness** — fuente única de verdad, sin espejos
   que deriven. El dominio se llama `fleet`.
3. **`scripts/fleet.py` no fue portado a TypeScript.** No hay `fleet.ts` en `handyman/src/`
   ni mención en `docs/estado-migracion-ts.md`. El `index.html` actual es una foto estática
   regenerada a mano, no un observador vivo. Este es el hueco que el observador web cierra.
4. **Piezas TS reutilizables ya migradas**: `core/workspace.ts` (`resolveWorkspace`,
   `VALID_STATUS`), `core/featureList.ts` (`loadFeatureList`), `metrics.ts` (status,
   throughput por fecha, veredictos de review — ya emite todo lo que un panel necesita),
   `sprint.ts`, `index_md.ts`. Toolchain: Node ≥20 / Bun, dependencia única `ajv`.
5. **El grafo ya tiene visualización**: `graphify-out/graph.html` es interactivo y
   autocontenido; `graphify-out/graph.json` es el dato crudo (`{nodes, edges}`).
6. **Conclusión previa de RAG que condiciona el diseño**: el harness no necesita pipeline
   RAG servidor; el corpus es diminuto y cambia constantemente. La capa de retrieval del
   observador puede ser **BM25 en el navegador** (MiniSearch/Orama), reindexable en
   milisegundos — inmune al staleness.

## 2. Evidencia: estado del arte 2026 (investigación en internet)

Patrón convergente en herramientas locales para observar agentes (disler
`claude-code-hooks-multi-agent-observability`, sniffly de Chip Huyen, Vibe Kanban):

```
disco (fuente de verdad) → watcher → servidor local → SSE/WS → navegador → render client-side
```

Comparación por capa (detalle y fuentes al final):

| Capa | Ganador | Alternativas y por qué no |
|---|---|---|
| Servidor | **`Bun.serve`** con HTML imports (fullstack dev server de Bun 1.2/1.3: transpila TS/TSX al vuelo, HMR, cero build) | Hono si crecen las rutas (~5 KB, `streamSSE` incluido); Fastify/Express no aportan en localhost mono-usuario |
| Push al navegador | **SSE** (`EventSource`: reconexión automática, unidireccional — exactamente "archivo cambió → repinta") | WebSocket solo si el navegador debe emitir comandos; polling como fallback |
| File watching | **`fs.watch` de Bun** (`recursive: true`, reescrito para macOS) + debounce 150–300 ms + coalescing en `Set` | chokidar v4 si aparecen eventos fantasma con el editor (`awaitWriteFinish` para escrituras atómicas); @parcel/watcher overkill |
| Frontend | **`index.html` + Preact/TSX** transpilado por el propio Bun.serve | Vanilla o Preact+HTM por CDN (plan B sin transpilación); htmx no encaja (quiere HTML de servidor, aquí el cliente procesa JSON/MD); React+Vite = segundo toolchain innecesario |
| Markdown | **markdown-it** (task lists → checkboxes para backlog) o marked | micromark es para tooling, no para pintar paneles |
| Grafo | **force-graph** (canvas 2D, API `{nodes, links}` casi directa desde `graph.json`) | Iteración 0: `<iframe src=graph.html>`; Cytoscape.js si se quieren consultas de vecindario; sigma.js/WebGL solo a partir de miles de nodos |
| Búsqueda | **MiniSearch** (~7 KB, BM25) indexando en el navegador | **Orama** (<2 KB core) si se quiere híbrido vector+texto en browser más adelante; fuse.js no hace BM25; FlexSearch sobredimensionado |
| Persistencia | **Ninguna nueva** — el disco es la base de datos (patrón Obsidian/sniffly) | disler usa SQLite porque sus eventos de hooks son efímeros; los nuestros ya están persistidos por el harness |

Lecciones de los precedentes:

- **disler** valida "eventos → servidor Bun → push → browser", pero necesita ingesta por
  HTTP POST porque los hooks son procesos efímeros. Handyman es más simple: el estado ya
  está en disco, basta observar archivos.
- **sniffly** valida "leer archivos locales existentes y servir dashboard" sin instrumentar
  nada.
- **Obsidian** es el modelo canónico de "filesystem = base de datos": watcher sobre la
  carpeta, ediciones externas se reflejan solas. El observador replica esto para datos en
  vez de código (mismo esquema que el HMR de Vite/Bun).
- Diseño derivado: servir archivos tal cual (`Bun.file`), invalidar por watcher+mtime,
  tolerar JSON a medio escribir (try/parse con retry corto), y **read-only primero** — los
  roles escriben, el observador mira; una mutación futura (p.ej. bloquear una feature desde
  el browser) sería un POST que escribe el archivo y deja que el watcher propague.

## 3. Arquitectura propuesta

Un proceso, un comando (`bun run handyman/src/fleet_observer.ts`), ~5 dependencias:

```
$HOME/HANDYMAN/registry.json ──┐
.handyman/ de cada harness ────┤→ fs.watch (debounce 200ms, coalescing)
graphify-out/graph.json ───────┘        │
                                        ▼
                    Bun.serve (localhost, HTML imports)
                    ├── /                → index.html + TSX (Preact)
                    ├── /api/fleet       → registry + status vivo por harness
                    │                      (reusa core/featureList + metrics)
                    ├── /api/:proj/...   → feature_list.json, md crudo de
                    │                      backlog/ progress/ CHECKPOINTS.md
                    ├── /api/:proj/graph → graphify-out/graph.json
                    ├── /api/:proj/corpus→ corpus para indexar en el browser
                    └── /events          → SSE {type, project, paths}
                                        │
                                        ▼
                    Navegador (client-side, sin backend de búsqueda)
                    ├── Vista flota: tabla de harnesses (status, drift de
                    │   versión, último cierre, sesión) — hereda index.html
                    ├── Vista proyecto: kanban de features por estado/sprint,
                    │   progreso y checkpoints renderizados con markdown-it
                    ├── Grafo: force-graph sobre graph.json (iter. 0: iframe)
                    └── Búsqueda: MiniSearch (BM25) sobre features + backlog +
                        progress + docs + nodos del grafo; reindexo del doc
                        cambiado al recibir SSE
```

Cómo se conecta con las conclusiones de RAG:

- **Agentes** → siguen con agentic search (grep/read); el observador no les añade índice.
- **Humano en el navegador** → BM25 client-side (MiniSearch) es su capa de retrieval:
  "¿qué features mencionan X?", "¿dónde se decidió Y?" sobre toda la flota.
- **Grafo** → `graph.json` ya da navegación relacional (el "GraphRAG gratis" del mapa de
  entidades) sin construir nada nuevo.
- **Puerta abierta**: Orama en lugar de MiniSearch habilita híbrido vector+texto en el
  navegador si algún día la deduplicación de backlog (caso 4 del análisis RAG) precomputa
  embeddings — mismo índice, cero servidor extra.

## 4. Planes

### Plan A — Portar fleet a TS (fundación, sin web)

`handyman/src/fleet.ts` sobre `core/`: subcomandos `register`, `status`, `moc` (regenera
`index.md`/`index.html` estáticos como hacía fleet.py). Cierra la deuda de migración y da
el módulo de lectura de flota que el servidor reutiliza.

### Plan B — Observador read-only (el MVP del navegador)

`fleet_observer.ts`: Bun.serve + `/api/fleet` + `/api/:proj/*` + SSE + frontend con vista
de flota y vista de proyecto (kanban + markdown). Sin grafo ni búsqueda todavía. Verificable:
levantar, tocar `feature_list.json`, ver el kanban repintarse sin recargar.

### Plan C — Grafo integrado

Iteración 0: iframe de `graphify-out/graph.html` por proyecto. Iteración 1: force-graph
sobre `/api/:proj/graph` con cross-linking (clic en nodo → abre el archivo fuente en la
vista de proyecto).

### Plan D — Búsqueda BM25 client-side

`/api/:proj/corpus` (o corpus de flota completa) + MiniSearch en el navegador, reindexo
incremental por SSE. Es la materialización del "retrieval del observador" del análisis RAG.

### Plan E — Escritura controlada (opcional, posterior)

POST mínimos (p.ej. `feature block/unblock`) que escriben vía los CLIs existentes y dejan
que el watcher propague. Mantiene la invariante: una sola forma de mutar el estado.

Orden recomendado: A → B → (C y D en paralelo) → E solo si se demuestra necesidad.

## 5. Fuentes principales

- Bun fullstack / HTML imports: https://bun.com/docs/bundler/fullstack · https://bun.com/blog/bun-v1.3
- SSE vs WebSocket: https://ably.com/blog/websockets-vs-sse · https://websocket.org/comparisons/sse/ · https://oneuptime.com/blog/post/2026-01-27-sse-vs-websockets/view
- File watching: https://bun.com/docs/guides/read-file/watch · https://github.com/paulmillr/chokidar · https://github.com/11ty/eleventy/issues/3149
- Frameworks servidor: https://encore.dev/articles/nestjs-vs-fastify-vs-hono · https://www.pkgpulse.com/guides/hono-vs-express-vs-fastify-2026
- Markdown: https://www.pkgpulse.com/guides/marked-vs-remark-vs-markdown-it-parsers-2026 · https://macwright.com/2024/01/28/dont-use-marked
- Grafos: https://github.com/vasturiano/force-graph · https://www.pkgpulse.com/guides/cytoscape-vs-vis-network-vs-sigma-graph-visualization-2026
- Búsqueda client-side: https://github.com/lucaong/minisearch · https://github.com/oramasearch/orama · https://docs.orama.com/open-source/usage/search/hybrid-search · https://www.pkgpulse.com/blog/fusejs-vs-flexsearch-vs-orama-client-side-search-2026
- Precedentes: https://github.com/disler/claude-code-hooks-multi-agent-observability · https://github.com/chiphuyen/sniffly · https://github.com/BloopAI/vibe-kanban · https://github.com/hesreallyhim/awesome-claude-code
- Filesystem como fuente de verdad: https://www.sitepoint.com/obsidian-beginner-guide/ · https://photes.io/blog/posts/is-obsidian-a-local-first-app

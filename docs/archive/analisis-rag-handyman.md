# Análisis: RAG en handyman — estado del arte y opciones de uso (2026)

> Investigación en fuentes de internet (julio 2026) sobre cómo ocupar RAG (Retrieval-Augmented
> Generation) dentro de handyman. Complementa [mapa-entidades-negocio.md](../mapa-entidades-negocio.md),
> cuya sección 5 mapea las entidades del harness a fuentes de recuperación.

## 1. Resumen ejecutivo

- A mediados de 2026 RAG ya no es un pipeline fijo "chunk + embed + top-k" sino un menú de
  técnicas: hybrid search (BM25 + vectores + RRF), reranking, contextual retrieval, GraphRAG
  y —sobre todo— **agentic RAG**, donde el modelo decide cuándo y cómo recuperar. Los análisis
  de industria sitúan la causa de fallo de los sistemas RAG en la fase de *retrieval* ~73% de
  las veces, no en la generación.
- Para **agentes que trabajan sobre un repositorio de código/archivos**, la tendencia dominante
  es la contraria a RAG: **agentic search** (grep/glob/read en un bucle Plan–Act–Observe).
  Anthropic eliminó el vector search de Claude Code en 2025 porque la búsqueda agéntica superó
  a todo lo demás: más precisa, sin índice que mantener, sin staleness, sin fuga de datos. El
  costo es más tokens y más latencia por respuesta.
- La guía oficial de Anthropic es escalonada: **si la base de conocimiento cabe en <200K tokens
  (~500 páginas), no hagas RAG** — mete todo en el prompt con *prompt caching* (hasta 90% más
  barato, >2x menos latencia). Si supera ese umbral, usa **contextual retrieval** (embeddings
  contextuales + BM25 contextual, −49% de fallos de retrieval; −67% añadiendo reranking).
- Anthropic **no tiene modelo de embeddings propio**; documenta oficialmente **Voyage AI**
  (familia `voyage-4`, `voyage-context-4` para chunks contextualizados, `voyage-code-3` para
  código, rerankers `rerank-2.5`/`rerank-2.5-lite`).
- **Para handyman, la recomendación central es: no montar un pipeline RAG.** El estado en disco
  (`feature_list.json`, `backlog/`, `progress/`, `CHECKPOINTS.md`) es pequeño, estructurado y
  cambia constantemente — exactamente el escenario donde agentic search gana y donde un índice
  vectorial se queda obsoleto. El único caso con retorno claro para embeddings es la
  **deduplicación de bugs/backlog**, y ahí basta algo local-first minúsculo (`sqlite-vec` o
  incluso BM25 puro con MiniSearch + juez LLM), no infraestructura.

## 2. Enfoques actuales y cuándo conviene cada uno

### 2.1 RAG clásico (chunking + embeddings + vector store)
El patrón 2023-2024: trocear documentos, embeber, buscar top-k por similitud coseno, inyectar
en el prompt. En 2026 se considera la *línea base*, suficiente para lookup factual simple sobre
corpus grandes y estables, pero frágil en producción: los pipelines "naive" fallan en el paso
de retrieval en una fracción alta de consultas.

### 2.2 Hybrid search (BM25 + vectores) + RRF
Combina recuperación léxica (BM25: exactitud en identificadores, códigos de error, nombres
propios) con densa (semántica). La fusión estándar es **Reciprocal Rank Fusion**, que opera
sobre rangos y evita comparar un score BM25 (no acotado) con un coseno ([-1,1]). Mejoras
típicas de ~7% NDCG sobre cualquiera de los dos por separado. Es el default sensato para
cualquier RAG serio.

### 2.3 Reranking
Un cross-encoder (Voyage `rerank-2.5`, Cohere Rerank) reordena los top-50/100 candidatos. En
los benchmarks de Anthropic, sumar reranking a contextual retrieval bajó el fallo top-20 de
5.7% a 1.9%. Añade latencia y costo por consulta; solo cuando la precisión del top-k es el
cuello de botella.

### 2.4 Contextual Retrieval (Anthropic)
Antes de indexar, Claude genera 50–100 tokens de contexto por chunk ("este fragmento pertenece
al informe X, sección Y…") y ese contexto se antepone al chunk tanto en el embedding como en el
índice BM25. Resultados: −35% fallos con embeddings contextuales solos, −49% combinado con BM25
contextual, −67% con reranker. El costo de generar contextos se amortiza con prompt caching.
En 2026 Voyage ofrece esto de fábrica con `voyage-context-4`.

### 2.5 GraphRAG
Construye un grafo de entidades/relaciones (+ resúmenes de comunidades) y recupera navegándolo.
Gana en consultas **multi-hop** y de **resumen global**. El consenso 2026 es
escéptico-pragmático: tiene costo real de construcción y mantenimiento, y solo se justifica si
una fracción medible del tráfico hace preguntas que la similitud no puede responder
estructuralmente.

### 2.6 Agentic RAG
El patrón dominante de 2026: la recuperación deja de ser un paso previo fijo y se convierte en
**herramientas que el agente invoca dentro de su bucle de razonamiento** — decide si buscar,
reformula consultas, valida resultados, itera.

### 2.7 Agentic search (la alternativa "sin índice")
Caso extremo de lo anterior: nada de embeddings; el agente usa grep/glob/read directamente
sobre el filesystem. Es lo que hace Claude Code desde que Anthropic retiró su pipeline de
vector search, con cuatro ventajas: simplicidad (cero infraestructura), privacidad (nada sale
de la máquina), fiabilidad (referencias exactas de símbolos vs. matches aproximados) y frescura
(sin índice que se desincroniza). El tradeoff: consumo de tokens y latencia crecen con el
tamaño del corpus.

### Tabla comparativa

| Enfoque | Infraestructura | Frescura del dato | Fortaleza | Debilidad | Cuándo usarlo |
|---|---|---|---|---|---|
| **Long context + prompt caching** | Ninguna | Perfecta (se envía tal cual) | Cero retrieval que falle; simple | Límite ~200K tokens; costo por request | Corpus < 200K tokens (recomendación oficial Anthropic) |
| **Agentic search (grep/read)** | Ninguna | Perfecta (lee disco en vivo) | Precisión exacta; cero mantenimiento; privado | Más tokens/latencia; escala mal a corpus enormes | Repos de código y estado en disco que cambia |
| **RAG clásico (vector top-k)** | Vector store + ingesta | Requiere re-indexado | Rápido y barato por consulta | Fuzzy matches; índice obsoleto; contexto perdido | Corpus grande, estable, consultas semánticas simples |
| **Hybrid (BM25+vector+RRF)** | Igual + índice léxico | Requiere re-indexado | Cubre léxico y semántico; +~7% relevancia | Más piezas | Default para cualquier RAG en producción |
| **+ Reranking** | Igual + API reranker | — | −67% fallos top-20 (con contextual) | Latencia/costo por consulta | Cuando precisión top-k es el cuello de botella |
| **Contextual retrieval** | Igual + anotación LLM (o `voyage-context-4`) | Re-anotar al re-indexar | −49–67% fallos de retrieval | Costo de ingesta | Corpus > 200K tokens donde el RAG plano falla |
| **GraphRAG** | Grafo + extracción de entidades | Costoso de mantener | Multi-hop, resúmenes globales | Costo alto; nicho de consultas | Solo si el tráfico real hace preguntas relacionales/globales |
| **Agentic RAG** | Cualquiera de las anteriores como tools | Depende del backend | El modelo decide cuándo/cómo buscar | Complejidad de orquestación | Múltiples fuentes y consultas heterogéneas |

## 3. Opciones de stack en TypeScript/Node/Bun (ordenadas por simplicidad)

Para un proyecto local-first, sin infraestructura pesada:

1. **Nada (agentic search / long context)** — cero dependencias. Los agentes (Claude Code /
   Agent SDK) ya traen Grep, Glob, Read; documentos pequeños van completos al prompt con
   `cache_control`. Punto de partida y, para muchos harnesses, punto final.
2. **MiniSearch u Orama** — BM25/full-text puro en TS, in-memory, sin binarios nativos,
   compatible con Bun. Orama soporta además modo híbrido (vector + full-text) en un solo
   paquete. Ideal para generar *candidatos* de deduplicación.
3. **Vectra** — índice vectorial en archivos JSON locales, API estilo Pinecone con filtrado
   por metadatos, TS puro. Para miles de ítems, no millones. Encaja con la filosofía "estado
   en disco".
4. **sqlite-vec** — extensión de SQLite (funciona con `bun:sqlite` y better-sqlite3). Un solo
   archivo `.db` versionable; SQL para vectores + FTS5 para BM25 → hybrid search en un único
   fichero. Probablemente el mejor equilibrio simplicidad/capacidad para este proyecto.
5. **LanceDB** — embebida, in-process, cliente TS oficial, índices en disco para datasets
   mayores que la RAM. El paso siguiente si el volumen crece.
6. **Chroma / Qdrant** — servidores dedicados con clientes JS y servidores MCP oficiales
   (Qdrant MCP expone `qdrant-store`/`qdrant-find`, pensado como memoria de agente). Ya es
   infraestructura: solo si se necesita un servicio compartido.
7. **pgvector** — solo si ya hubiera Postgres (no es el caso). No añadir Postgres para esto.
8. **Frameworks (LlamaIndex.TS vs LangChain.js)** — LlamaIndex.TS domina pipelines RAG;
   LangChain.js gana en orquestación de agentes. Matiz: handyman ya tiene su propio
   orquestador, así que un framework aporta poco; si algún día hay ingesta+retrieval formal,
   LlamaIndex.TS solo como librería de retrieval.
9. **Embeddings**: Voyage AI vía HTTP (`voyage-4-lite` costo/latencia, `voyage-4` balance,
   `voyage-code-3` código, `voyage-context-4` chunks contextualizados, `voyage-4-nano`
   open-weight Apache 2.0 ejecutable localmente para stack 100% offline). Rerankers:
   `rerank-2.5` / `rerank-2.5-lite`.

## 4. RAG con la API de Claude / Anthropic

- **No hay endpoint de embeddings de Anthropic** — la documentación oficial remite a Voyage AI.
  Usar `input_type: "query"` vs `"document"` (importa para la calidad).
- **Regla de decisión oficial**: corpus < 200K tokens → todo al prompt con prompt caching
  (`cache_control: {type: "ephemeral"}`; lecturas de caché a ~0.1x del precio). Corpus mayor →
  contextual retrieval (top-20 chunks al modelo, reranking opcional). Agentes con filesystem →
  agentic search, como el propio Claude Code.
- **Citations (GA)**: bloques `document` con `citations: {enabled: true}` devuelven
  `cited_text` con localización exacta — la manera nativa de hacer RAG con atribución
  verificable.
- **Files API** (beta `files-api-2025-04-14`): subir un archivo una vez (hasta 500 MB) y
  referenciarlo por `file_id` — pseudo-RAG de documentos completos sin re-subir. No es un
  índice ni hace búsqueda.
- **Memory tool (`memory_20250818`) y Memory Stores**: memoria entre sesiones nativa, **basada
  en archivos, no vectorial** — la dirección que Anthropic empuja para memoria de agentes: el
  agente organiza sus notas y las recupera leyéndolas.
- **MCP como capa de retrieval**: conectar un servidor MCP de retrieval (Qdrant, Chroma) da a
  los agentes búsqueda semántica como tool — agentic RAG con cero cambios en el orquestador.

## 5. Recomendaciones específicas para handyman

**Recomendación general: quedarse en los peldaños 1–2 del stack; añadir el 4 (sqlite-vec) solo
si la deduplicación lo justifica con datos.**

1. **Documentación del repo y estado del harness → agentic search, no RAG.** Los agentes *son*
   Claude Code: ya tienen Grep/Glob/Read, y el estado es texto plano pequeño que muta en cada
   feature. Un índice vectorial aquí reproduce los problemas (staleness, mantenimiento, fuzzy
   matches) por los que Anthropic lo eliminó de Claude Code. Lo que sí rinde es **context
   engineering**: mantener `CHECKPOINTS.md` y `progress/` con resúmenes densos y estructura
   predecible (encabezados grep-ables, IDs estables), porque la calidad del agentic search
   depende de que el texto sea buscable con grep.

2. **Memoria de largo plazo entre sesiones → archivos, siguiendo el patrón del memory tool.**
   Un directorio `memories/` (o extender `progress/`) con una nota por lección aprendida,
   resumen de una línea arriba, que el leader consulta al arrancar y actualiza al cerrar cada
   feature. La literatura 2026 de memoria de agentes converge en memoria estructurada + poda,
   no en dumps vectoriales. Riesgo a considerar: *memory poisoning* (OWASP Agentic AI Top 10
   2026) — tratar las memorias como datos, no como instrucciones (coherente con la Golden Rule
   de `references/security.md`).

3. **Historial de features/progreso → hybrid ligero solo si crece.** Mientras
   `feature_list.json` + `progress/` quepan en ~200K tokens, la respuesta correcta es grep +
   leer, o inyectar resúmenes al prompt con caching. Si el histórico crece de verdad, el primer
   paso no es un vector DB: es **MiniSearch/Orama (BM25) como tool del leader**, TS puro,
   índice reconstruible en milisegundos desde el JSON — inmune al staleness.

4. **Deduplicación de bugs/backlog → el único caso con ROI para embeddings.** Duplicados
   parafraseados ("crash al guardar" vs "excepción en persistencia") es donde BM25 falla y la
   similitud semántica brilla. Diseño mínimo local-first:
   - Al crear un ítem de `backlog/`: embedding con `voyage-4-lite` (o `voyage-4-nano` local
     para 100% offline) → guardar en `sqlite-vec` (un `.db` junto al estado) o Vectra.
   - Candidatos = unión de top-k vectorial + top-k BM25 (MiniSearch), fusionados con RRF
     (una función de ~10 líneas).
   - Veredicto final con un **juez LLM barato** (Haiku): "¿es duplicado de alguno de estos 5?"
     — candidatos-baratos + juez-caro es más robusto que un umbral de coseno.
   - A escala pequeña (<500 ítems) se puede saltar los embeddings: BM25 + juez LLM sobre
     top-10 suele bastar. Medir antes de añadir la dependencia.

5. **Lo que no hacer**: GraphRAG para el harness (el grafo de conocimiento son los propios
   archivos + git; ninguna consulta del harness es multi-hop sobre entidades), frameworks RAG
   completos (duplican el orquestador), servidores dedicados (contradicen el diseño
   local-first), y re-embeber documentación viva del repo.

6. **Si algún día se monta retrieval formal** (p. ej. handyman gestionando docs externos
   grandes): contextual retrieval con `voyage-context-4` + BM25 + RRF + `rerank-2.5-lite`,
   almacenado en sqlite-vec o LanceDB, expuesto a los agentes como **tool/servidor MCP** (el
   agente decide cuándo buscar) y con citations de la API para respuestas verificables.

## Fuentes principales

- Anthropic — Contextual Retrieval: https://www.anthropic.com/engineering/contextual-retrieval
- Anthropic — Embeddings (Voyage AI): https://platform.claude.com/docs/en/build-with-claude/embeddings
- Claude Cookbook — Contextual embeddings: https://platform.claude.com/cookbook/capabilities-contextual-embeddings-guide
- Claude Code y el abandono de RAG: https://smartscope.blog/en/ai-development/practices/rag-debate-agentic-search-code-exploration/ · https://www.mindstudio.ai/blog/is-rag-dead-what-ai-agents-use-instead · https://vadim.blog/claude-code-no-indexing/ · https://harrisonsec.com/blog/agent-retrieval-cost-curve-claude-code-grep-vs-rag/
- Agentic RAG 2026: https://www.brightter.com/articles/agentic-rag-five-retrieval-patterns-that-survive-production · https://jobsbyculture.com/blog/agentic-rag-guide-2026 · https://arxiv.org/pdf/2503.10677
- GraphRAG vs Vector RAG: https://neo4j.com/blog/developer/knowledge-graph-vs-vector-rag/ · https://aloknecessary.github.io/blogs/graph-rag-vs-rag/ · https://www.meilisearch.com/blog/graph-rag-vs-vector-rag
- Hybrid search y RRF: https://www.digitalapplied.com/blog/hybrid-search-bm25-vector-reranking-reference-2026 · https://blog.serghei.pl/posts/reciprocal-rank-fusion-explained/ · https://mbrenndoerfer.com/writing/hybrid-search-bm25-dense-retrieval-fusion
- Vector stores locales: https://github.com/asg017/sqlite-vec · https://encore.dev/articles/best-vector-databases · https://community.openai.com/t/vectra-a-fast-and-free-local-vector-database-for-javascript-typescript/187135
- Frameworks TS: https://developers.llamaindex.ai/typescript/framework/ · https://www.kunalganglani.com/blog/langchain-vs-llamaindex-2026
- MCP de retrieval: https://mcpservers.org/servers/qdrant/mcp-server-qdrant · https://mcp.directory/blog/chroma-vs-pinecone-vs-qdrant-vs-weaviate-vs-pgvector-mcp-2026
- Memoria de agentes: https://arxiv.org/pdf/2606.30306 · https://arxiv.org/pdf/2603.13258
- Voyage AI: https://docs.voyageai.com/docs/introduction · https://docs.voyageai.com/docs/reranker

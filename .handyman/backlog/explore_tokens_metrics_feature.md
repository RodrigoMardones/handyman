---
type: Explore Report
topic: tokens_metrics_feature
role: explorer
updated: 2026-07-26
tags: [handyman/role/explorer]
---

# Exploration: tokens_metrics_feature

Pregunta: cómo entregar, por cada feature cerrada, un estimado de tokens de entrada y salida generados, registrado siempre como métrica, y que funcione con cualquier modelo utilizado.

## Estado actual del harness

**No existe hoy ningún conteo de tokens en el repo.** Un grep por `token|usage|prompt_eval|input_tokens|output_tokens` sobre `handyman/src` y `packages/toolbox-core/src` solo encuentra parsing de argumentos CLI y "token budgets" de descriptions de skills en evals. No existe el directorio `.handyman/metrics/`.

Lo que sí existe:

- **`handyman/src/metrics.ts`** — reporte de solo lectura que deriva cuatro grupos de métricas de artefactos ya escritos, "never from new state" (comentario de cabecera, `handyman/src/metrics.ts:5-15`):
  - `status_counts` desde `feature_list.json` (`handyman/src/metrics.ts:91-103`).
  - `throughput`: cierres por fecha parseando los encabezados `## YYYY-MM-DD - Feature N: name` de `progress/history.md` (`handyman/src/metrics.ts:31`, `handyman/src/metrics.ts:106-140`).
  - `review_verdicts`: approval rate desde el frontmatter de `backlog/review_*.md` (`handyman/src/metrics.ts:159-179`).
  - `coverage`: features done con par impl_+review_ en backlog (`handyman/src/metrics.ts:182-191`).
  - Principio rector: el script "observes; it never gates" (`handyman/src/metrics.ts:14-15`). Cualquier métrica de tokens debe respetar esto: se registra siempre, pero nunca bloquea el cierre.

- **`handyman/src/feature.ts` (`cmdDone`, líneas 929-1000)** — al cerrar: corre el verifier, estampa `meta.done_at` vía `stampMeta` (`handyman/src/feature.ts:965`, helper en `handyman/src/feature.ts:166-176`) y appendea una entrada compacta a `progress/history.md` (`handyman/src/feature.ts:980-987`) con las líneas `Branch`, `Tools`, `Evidence` (incluye el veredicto de review) y `Verification`. La forma antigua de 8 campos (Agent, Plan, Changes, Tools, Verification, Review, Closure) se eliminó porque "nothing filled it" (`handyman/src/feature.ts:976-979`). El flag `--tools` (`handyman/src/feature.ts:1416-1446`) es el precedente exacto de dato aportado por el caller en el cierre: el mismo patrón sirve para `--tokens`. Donde colgar tokens: (a) una línea `- **Tokens:**` nueva en la entrada de history.md, (b) el ledger nuevo propuesto abajo, (c) `meta` de feature_list — ojo: el schema cierra `meta` con `additionalProperties: false` y solo permite `started_at`/`done_at` (`handyman/assets/schemas/feature_list.schema.json:87-95`), así que `meta.tokens` exige cambio de schema + ripple en validate_harness y tests.

- **`handyman/src/toolbox_llm.ts`** es un shim que re-exporta `packages/toolbox-core/src/llm.ts`. Los dos adapters **descartan hoy el usage**:
  - `anthropicProvider` (`packages/toolbox-core/src/llm.ts:150-206`): parsea `content_block_delta` (texto) y `message_delta` (solo `stop_reason`, líneas 196-201). Ignora `message_start` (que trae `usage.input_tokens` + cache tokens) y el `usage.output_tokens` acumulativo del propio `message_delta`.
  - `openAiCompatProvider` (`packages/toolbox-core/src/llm.ts:222-289`): no envía `stream_options: {include_usage: true}` (body en líneas 255-262) y su loop descarta cualquier chunk sin `choices[0]` (líneas 273-276), que es justo la forma del chunk final de usage.
  - `DraftResult` (`packages/toolbox-core/src/llm.ts:63-67`) solo tiene `text`, `model`, `stopReason`.

- **Hallazgo clave de arquitectura**: handyman **no hace llamadas LLM durante el trabajo de una feature**. Los tokens se queman en la sesión del CLI anfitrión (Claude Code, Kimi Code, etc.) que ejecuta los roles leader/implementer/reviewer. Los adapters de toolbox-core solo sirven drafts/review notes de apps/web. Capturar usage en los adapters es correcto pero mide una fracción ínfima del gasto real por feature: la fuente primaria tiene que ser la sesión del agente anfitrión.

## Fuentes de conteo por proveedor

| Proveedor | Campo usage real en la API | Fallback de estimación |
|---|---|---|
| Claude (Anthropic Messages) | Streaming: `message_start` trae `usage.input_tokens` (+ `cache_creation_input_tokens`, `cache_read_input_tokens`); `message_delta` trae `usage.output_tokens` **acumulativo** (el último evento da el total). No-streaming: `usage` en la respuesta. Anthropic además ofrece endpoint `count_tokens` para pre-conteo. | chars/4 (±10% en prosa inglesa, peor en código); tokenizador offline aproximado (cl100k_base vía tiktoken/js-tiktoken como proxy). |
| Z.ai GLM Coding Plan (endpoint Anthropic-compatible, `api.z.ai/api/anthropic`) | Mismo contrato SSE que Anthropic (el adapter `anthropicProvider` ya lo consume): `message_start`/`message_delta` con `usage`. | Igual que arriba. |
| Z.ai pay-as-you-go / OpenAI-compatible (`api.z.ai/api/paas/v4`) | No-streaming: `usage: {prompt_tokens, completion_tokens, total_tokens}` en la respuesta. Streaming: hay que pedir `stream_options: {include_usage: true}`; llega un chunk extra antes de `[DONE]` con `choices` vacío y `usage` poblado (si el stream se interrumpe, ese chunk puede no llegar). | chars/4; js-tiktoken como proxy. |
| Ollama (nativo `/api/generate`, `/api/chat`) | Objeto final del stream: `prompt_eval_count` (tokens del prompt) y `eval_count` (tokens de la respuesta), más duraciones. | El adapter actual usa el endpoint OpenAI-compatible `/v1`, donde rigen las reglas OpenAI de la fila anterior (`include_usage`). |
| Ollama vía `/v1/chat/completions` (como lo hace `openAiCompatProvider`) | `usage` OpenAI-shaped; en streaming requiere `include_usage`. | chars/4. |
| **CLI anfitrión del agente** (Claude Code, Kimi, Codex…) | El CLI escribe logs de sesión locales (JSONL) con usage por mensaje; herramientas tipo **ccusage** los agregan por día/sesión/proyecto con filtros `--since/--until` y salida `--json`. Esta es la fuente que cubre el gasto real de una feature. | N/A — es dato real, no estimación. |

## Opciones de diseño

### Opción A — Captura en los adapters LLM (`packages/toolbox-core/src/llm.ts`)

Extender `DraftResult` con `usage?: { inputTokens, outputTokens }`: en `anthropicProvider` leer `usage` de `message_start` (input) y del último `message_delta` (output); en `openAiCompatProvider` enviar `stream_options: {include_usage: true}` y parsear el chunk final. Persistir cada llamada al ledger.

- A favor: dato exacto, cubre los dos protocolos de cable (con eso quedan cubiertos zai, claude y ollama, es decir "cualquier modelo" del registry), cambio pequeño y testeable (ya hay `fetchImpl` inyectable).
- En contra: solo mide los drafts del toolbox (apps/web), **no** la sesión del agente donde se gasta el ~99% de los tokens por feature. No responde la pregunta por sí sola.

### Opción B — Ledger alimentado desde la sesión del agente anfitrión (patrón ccusage)

Nuevo ledger `.handyman/metrics/tokens.jsonl` (append-only, una línea JSON por feature cerrada). Lo escribe `feature.js done` con valores que el leader obtiene del CLI anfitrión: flag `--tokens in=N out=N` (mismo patrón que `--tools`, `handyman/src/feature.ts:1416-1446`), y/o un verbo auxiliar `tokens collect` que intente `npx ccusage --json --since <meta.started_at> --until <meta.done_at>` cuando ccusage esté disponible. La entrada de history.md gana una línea `- **Tokens:** in=N out=N (fuente)`.

- A favor: mide el gasto real por feature; funciona con cualquier modelo (el CLI anfitrión ya registró el usage, da igual cuál sirvió); no necesita API keys ni red; respeta "observa, no bloquea" (si no hay dato, se registra `unknown` y el cierre sigue).
- En contra: parsear logs crudos de cada CLI anfitrión sería N parsers frágiles y fuera del workspace (los logs viven en `$HOME`, p.ej. `~/.claude/projects/...`); delegar en ccusage lo resuelve pero introduce una dependencia opcional externa. El flag manual depende de la disciplina del leader.

### Opción C — Estimación post-hoc sobre artefactos

Derivar tokens de lo que el harness ya escribe (history.md, backlog/impl_+review_, tamaño del diff) con chars/4 o js-tiktoken.

- A favor: cero instrumentación, retroactivo, offline, agnóstico de modelo y de CLI anfitrión.
- En contra: mide el tamaño de los artefactos, no el consumo — se pierde todo el contexto de conversación (la masa dominante de tokens de entrada), cache reads y reintentos; el error en tokens de entrada puede superar 10×. Solo aceptable como fallback marcado `source: "estimate"`.

### Dónde persistir (transversal a las opciones)

- **Línea en history.md**: visible y durable (history es el registro durable del harness); metrics.ts ya parsea encabezados fechados, parsear `- **Tokens:** in=(\d+) out=(\d+)` es trivial. Insuficiente solo: agregaciones ricas piden datos estructurados.
- **Ledger `.handyman/metrics/tokens.jsonl`**: estructurado, append-only, agregable por feature/modelo/fuente; metrics.js lo *lee* igual que lee history.md, sin violar su principio (el estado nuevo lo escribe feature.js en el cierre, no metrics.js). Recomendado como formato canónico.
- **`meta` en feature_list.json**: schema cerrado (`additionalProperties: false`, `handyman/assets/schemas/feature_list.schema.json:87-95`) → exige migración de schema y toca validate_harness/tests; además sprint close archiva features y movería los tokens al archive. No recomendado.

## Propuesta recomendada

Híbrido **B como fuente primaria + A como complemento + C solo como fallback**, con el ledger JSONL como único formato de persistencia. Implementable como feature futura:

1. **Nuevo ledger** `.handyman/metrics/tokens.jsonl`, una línea por registro:
   `{"ts":"ISO","feature_id":N,"feature":"name","source":"cli-flag|ccusage|adapter|estimate|unknown","provider":"...","model":"...","input_tokens":N,"output_tokens":N,"cache_read_tokens":N?,"cache_creation_tokens":N?}`
2. **`handyman/src/feature.ts`**: `done` acepta `--tokens in=N out=N [--tokens-source S]` (parse junto a `--tools`, líneas 1416-1446); `cmdDone` appendea la línea JSONL (creando `.handyman/metrics/` si falta) y añade `- **Tokens:** in=N out=N (fuente)` a la entrada de history.md (~líneas 980-987). Sin flag: intenta `ccusage` vía `npx` con `--since meta.started_at --until now` (best-effort, timeout corto); si tampoco hay dato, registra `source:"unknown"`. El cierre nunca falla por tokens.
3. **`packages/toolbox-core/src/llm.ts`**: `DraftResult.usage` + captura en ambos adapters (`message_start`/`message_delta` en anthropic; `include_usage` + chunk final en openai-compat); el consumidor (apps/web review notes) puede volcar esos drafts al ledger con `source:"adapter"`. Feature separada y pequeña.
4. **`handyman/src/metrics.ts`**: nueva sección `tokens` — totales in/out, promedio por feature, desglose por modelo y por fuente, y lista de features con `source:"estimate"/"unknown"`; texto y `--json` como el resto del reporte.
5. **Fallback C** opcional: verbo `tokens estimate` que rellene huecos históricos con chars/4 sobre impl_+review_+diff, siempre marcado `source:"estimate"` y excluido de promedios "reales".
6. **Sin cambios de schema** en feature_list.json; `meta` queda intacto. Documentar la convención en `references/` (p.ej. models.md, que ya habla de costo por rol).

Tradeoff aceptado: la precisión depende de que el leader pase el flag o de que ccusage esté instalado; a cambio, el harness no acopla su métrica a ningún vendor ni a los archivos internos de un CLI específico, y "funciona con cualquier modelo" se cumple porque quien reporta el usage es la capa que ya lo conoce.

## Fuentes

- https://docs.claude.com/en/api/messages-streaming — contrato SSE de Anthropic: `message_start` con `usage.input_tokens` (+cache), `message_delta` con `usage.output_tokens` acumulativo. Base exacta para la captura en `anthropicProvider`.
- https://platform.openai.com/docs/api-reference/chat/create — forma del objeto `usage` (`prompt_tokens`/`completion_tokens`/`total_tokens`) y semántica de `stream_options.include_usage` (chunk final con `choices` vacío; puede no llegar si el stream se interrumpe). Base para `openAiCompatProvider` y para la fila Z.ai paas/Ollama-v1.
- https://github.com/ollama/ollama/blob/main/docs/api.md — `prompt_eval_count` (tokens de entrada) y `eval_count` (tokens de salida) en el objeto final de `/api/generate` y `/api/chat`, más duraciones.
- https://github.com/ryoppippi/ccusage — patrón del ecosistema: agrega tokens y costo por día/semana/mes/sesión leyendo los JSONL de sesión locales de muchos CLIs de agente (Claude Code, Codex, Kimi, Gemini CLI…), con `--since/--until`, salida `--json`, agrupación por proyecto y precios LiteLLM. Modelo a imitar (o invocar) para la opción B.
- https://github.com/strands-agents/sdk-python/issues/2179 — el conteo nativo del proveedor elimina el 5-15% de error de tiktoken/heurísticas; justifica preferir usage real sobre estimación.
- https://github.com/Jwrede/tokentoll — precedente de estimación: chars/4 por defecto, tiktoken opcional si está instalado.
- https://github.com/QwenLM/qwen-code/issues/1289 — qwen-code reemplazó tiktoken por un estimador grueso para su guardarraíl de sesión (fricción de bundling de tiktoken; precisión innecesaria para guardas). Avala el fallback chars/4 y advierte contra añadir tiktoken como dependencia.

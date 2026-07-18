# Análisis: peticiones a modelos LLM desde el toolBox (Z.ai · Claude · GitHub Copilot)

> ¿Cómo hacer peticiones a modelos desde TypeScript, y cómo usar esa capa para
> que el usuario **formule peticiones hacia handyman directamente desde el
> observador toolBox**? Investigación en internet (julio 2026) + referencia
> oficial vigente de la API de Claude (cargada durante este análisis).
> Complementa [analisis-rag-handyman.md](analisis-rag-handyman.md) (retrieval),
> [analisis-ui-observador-toolbox.md](analisis-ui-observador-toolbox.md) (UI) y
> [analisis-feature-request-md.md](analisis-feature-request-md.md) (el formato
> de petición destilado de la experiencia — la pieza que este plan reutiliza).

## 1. Restricción de arquitectura que ordena todo

La restricción "sin bundler" del observador **solo aplica al navegador**. El
servidor (`toolbox_serve.ts`, Node ≥20/Bun) consume cualquier paquete npm ESM
sin problema. Por tanto:

- **Toda llamada a modelos vive en el servidor.** El navegador nunca ve una
  API key ni una sesión de Copilot; consume un **relay SSE propio**
  (`/api/draft`) — el mismo mecanismo que ya usa para live updates.
- El observador es hoy **GET-only y read-only por contrato** (405 a todo lo
  demás). Cualquier canal de peticiones hacia handyman es un cambio deliberado
  de ese contrato y se diseña como tal (§5): el único artefacto que el
  observador puede llegar a escribir es `feature-request.md`, el documento de
  intake que por diseño es **entrada humana, opcional y no gateada** — las
  mutaciones de estado (`feature_list.json`, progress, backlog) siguen siendo
  exclusivas de los role CLIs.
- El contexto del proyecto importa: `harness.config.json` ya configura
  **GLM-5.2** por rol, y la filosofía es local-first (Ollama como opción
  offline). Eso empuja a una capa multi-proveedor en el servidor con un puerto
  propio mínimo (§3), no a casarse con un vendor.

## 2. Los tres proveedores objetivo en TypeScript (verificado julio 2026)

### 2.1 Z.ai / GLM — SDK `openai` como drop-in (no hay SDK TS oficial)

No existe SDK TypeScript oficial maduro (`THUDM/z-ai-sdk-typescript` sigue
"Not yet released"; los oficiales son Python y Java). La recomendación oficial
del quick-start para Node es el SDK `openai` apuntando al endpoint
OpenAI-compatible:

```ts
import OpenAI from "openai";
const glm = new OpenAI({
  apiKey: process.env.Z_AI_API_KEY,          // Bearer key de la plataforma Z.AI
  baseURL: "https://api.z.ai/api/paas/v4/",
});
const stream = await glm.chat.completions.create({
  model: "glm-5.2",                          // coherente con harness.config.json
  messages,
  stream: true,
  // structured output: solo json_object está documentado oficialmente;
  // el esquema va en el system prompt y se valida con zod.safeParse
  response_format: { type: "json_object" },
});
```

Datos vigentes que difieren de lo que circula:

- **Modelos y precios** (docs.z.ai/guides/overview/pricing): GLM-5.2 es el
  flagship ($1.40/$4.40 MTok, cached $0.26, contexto 1M, output 128K, thinking
  mode). Línea económica: GLM-4.7 ($0.60/$2.20), GLM-4.7-FlashX ($0.07/$0.40)
  y GLM-4.7-Flash **gratis** — ideal para clasificación/dedup barato.
- **Endpoint Anthropic-compatible**: existe (`https://api.z.ai/api/anthropic`)
  pero es el del **GLM Coding Plan** para herramientas de coding (Claude Code
  vía `ANTHROPIC_BASE_URL`; mapeo Sonnet/Opus→GLM-5.2). Para el toolBox lo
  natural es **pay-as-you-go contra `paas/v4`**: no está confirmado
  oficialmente que la key del Coding Plan funcione contra el endpoint OpenAI-
  compatible, y el plan además pondera cuota 2–3× según franja horaria.
- Tool calling y streaming SSE soportados con la forma estándar OpenAI;
  `json_schema` estricto **no** está confirmado en fuente primaria — usar
  `json_object` + `schema.safeParse` como red de seguridad.

### 2.2 Claude — `@anthropic-ai/sdk` (verificado contra la referencia oficial)

```ts
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic(); // ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / perfil `ant auth login`

const stream = client.messages.stream({
  model: "claude-opus-4-8",          // default recomendado ($5/$25 MTok, contexto 1M)
  max_tokens: 16000,
  system: [{ type: "text", text: SYSTEM_ESTABLE,
             cache_control: { type: "ephemeral" } }],   // prefijo estable cacheado
  messages: [{ role: "user", content: pregunta }],
});
stream.on("text", (delta) => relaySse(delta));
const final = await stream.finalMessage();
```

Puntos clave vigentes (difieren de artículos viejos):

- **Modelos/precios**: `claude-opus-4-8` ($5/$25, default), `claude-sonnet-5`
  ($3/$15; intro $2/$10 hasta 2026-08-31), `claude-haiku-4-5` ($1/$5 — el
  barato para clasificación). Contexto 1M.
- **Thinking**: `thinking: { type: "adaptive" }` (el viejo `budget_tokens`
  devuelve 400 en Opus 4.7/4.8); profundidad con
  `output_config: { effort: "low" | "medium" | "high" | "xhigh" | "max" }`.
- **Streaming**: `client.messages.stream(...)` + `stream.on("text", cb)` +
  `await stream.finalMessage()`; obligatorio para `max_tokens` > ~16K.
- **Structured outputs**: `client.messages.parse()` con
  `output_config: { format: zodOutputFormat(Schema) }` (helper en
  `@anthropic-ai/sdk/helpers/zod`) → `response.parsed_output` tipado. El
  parámetro `output_format` está deprecado. Prefills de assistant devuelven 400.
- **Errores/retries**: excepciones tipadas (`Anthropic.RateLimitError`, …,
  base `APIError` con `status`); reintentos automáticos 429/5xx (default
  `maxRetries: 2`); `timeout` en **milisegundos**.
- **Prompt caching**: `cache_control: { type: "ephemeral" }` — prefix match;
  contenido estable primero, volátil al final; verificar con
  `usage.cache_read_input_tokens`. El system prompt del intake (§4) es el caso
  perfecto: plantilla + ejemplos son bytes estables.

### 2.3 GitHub Copilot — SDK oficial `@github/copilot-sdk` (GA junio 2026)

La gran novedad de 2026: **existe SDK oficial** para embeber Copilot en apps
propias ([github/copilot-sdk](https://github.com/github/copilot-sdk), GA
2026-06-02; Node/TS, Python, Go, .NET, Rust, Java). Habla JSON-RPC con la CLI
`copilot` en modo servidor, y **la CLI viene incluida en el paquete npm**
(prerrequisito Node 20+):

```ts
import { CopilotClient } from "@github/copilot-sdk";
const copilot = new CopilotClient();                       // reutiliza la sesión de `copilot login`
const session = await copilot.createSession({ model: "auto" });
const response = await session.sendAndWait({ prompt });    // GA añade tools/MCP, system prompt, hooks
```

- **Auth sin gestionar keys**: el SDK reutiliza el login de la CLI (OAuth
  device flow); alternativas `COPILOT_GITHUB_TOKEN` / `GH_TOKEN`, tokens de
  GitHub App (`gho_`/`ghu_`) o PAT fine-grained (`github_pat_`; los `ghp_`
  clásicos **no** sirven). Requiere suscripción Copilot (incluye Copilot Free)
  o BYOK. Según plan, expone modelos Claude/GPT/Gemini.
- Es el encaje perfecto para el usuario que **ya paga Copilot**: cero keys
  nuevas, el toolBox consume su plan. No verificado: cuánta cuota "premium
  requests" consume cada llamada.
- **Descartados**: los proxies de `api.githubcopilot.com` (copilot-api etc.)
  violan ToS y con SDK oficial ya no se justifican; las **Copilot Extensions
  murieron** (apagado total 2025-11-10, reemplazo oficial: servidores MCP).
- Plan B sin CLI: **GitHub Models** (`https://models.github.ai/inference`,
  OpenAI-compatible con PAT `models:read`) — gratis pero para prototipado:
  50 req/día en modelos "High", 8K in / 4K out por request, y **sin Claude**.

### 2.4 Ollama (se mantiene como opción offline)

`baseURL: "http://localhost:11434/v1/"` con el mismo SDK `openai` (key
ignorada), health check `GET /v1/models`, degradar la feature si no responde.
Sin auth — mantener en 127.0.0.1, coherente con el diseño del observador.

## 3. La capa unificadora: un puerto propio, no el AI SDK

La recomendación anterior (Vercel AI SDK 5 como capa agnóstica) **cambia** con
la entrada de Copilot: el Copilot SDK no es un endpoint OpenAI-compatible sino
una sesión JSON-RPC con la CLI — el AI SDK no lo envuelve. Con tres proveedores
de formas distintas, lo simple y coherente con la arquitectura hexagonal del
repo es un **puerto mínimo en el servidor** con un adapter por proveedor:

```ts
interface LlmProvider {
  id: "zai" | "claude" | "copilot" | "ollama";
  available(): Promise<boolean>;                 // key presente / CLI logueada / ollama vivo
  draft(req: DraftRequest, onDelta: (t: string) => void): Promise<DraftResult>;
}
```

- **zai / ollama** comparten adapter (SDK `openai`, distinto `baseURL`).
- **claude** usa `@anthropic-ai/sdk` directo (features día-1: adaptive
  thinking, caching, `messages.parse`).
- **copilot** envuelve `CopilotClient` (una sesión por draft; `sendAndWait`
  como MVP — verificar API de streaming del SDK antes de prometer deltas).
- `GET /api/providers` expone al panel qué adapters están disponibles y cuál
  es el default (sugerido: el modelo de `harness.config.json` → zai/GLM-5.2 si
  hay key; el usuario elige en la UI).

| Escenario | Elección |
|---|---|
| Multi-proveedor con Copilot en la mesa | **Puerto propio + 3 adapters** (arriba) — el AI SDK no cubre Copilot |
| Solo OpenAI-compatible (GLM + Ollama) | SDK `openai` con `baseURL` intercambiable basta; AI SDK 5 opcional |
| Se adopta Claude como principal | `@anthropic-ai/sdk` directo |
| Salida estructurada | Claude: `messages.parse` + `zodOutputFormat`; GLM/Ollama: `json_object` + `safeParse`; Copilot: instrucción de formato + `safeParse` |

**Keys**: env vars (`.env` fuera de git) — `Z_AI_API_KEY`, `ANTHROPIC_API_KEY`;
Copilot no necesita key (sesión de la CLI). Alternativa macOS: keychain vía
`security add-generic-password -s handyman -a zai -w KEY` leída al arrancar.

## 4. El caso estrella: formular peticiones hacia handyman desde el toolBox

El objetivo no es "chatear con un LLM": es que el usuario escriba una petición
informal en el panel y salga el **documento de intake formal** que el harness
ya sabe consumir. La experiencia destilada en
[analisis-feature-request-md.md](analisis-feature-request-md.md) define el
contrato exacto del output, y es lo que **nutre** al modelo:

```
usuario (texto libre en el panel, harness destino elegido)
   │  POST /api/draft { root, prompt, provider }
   ▼
toolbox_serve.ts ──── construye el contexto ────────────────────────────┐
   │   1. SYSTEM estable (cacheable):                                   │
   │      · assets/feature-request.template.md (Núcleo/Opcional,        │
   │        recomendaciones, gate verde como ÚLTIMA bala de Acceptance) │
   │      · los 2 ejemplos por arquetipo (Investigación/Implementación) │
   │      · contrato: solo name/title/description/acceptance van a      │
   │        feature_list.json vía node dist/feature.js add; el resto    │
   │        es guía para el leader                                      │
   │   2. Contexto del harness destino (volátil, al final):             │
   │      · cola de features (ids/names/status) — para estilo de        │
   │        naming y para detectar solapes                              │
   │      · top-k BM25 del corpus (features+backlog+docs+progress) —    │
   │        MiniSearch ya está en node_modules y corre en Node;         │
   │        buildCorpus() ya existe en toolbox_serve.ts                 │
   │      · skills/agents de discovery (harness.config.json) para el    │
   │        bloque Tools                                                │
   ▼
LLM (adapter elegido) ──SSE deltas──▶ panel: draft renderizado
   │                                  (marked+DOMPurify, editable)
   ▼
salida estructurada { archetype, draft_md, possible_duplicates[] }
```

Reglas que la experiencia impone al prompt (todas salen del análisis del
historial de 24+ features):

1. **Una petición = una feature**; si el texto pide dos cosas, el modelo debe
   proponer la partición, no mezclarlas.
2. **Elegir arquetipo** Investigación vs Implementación y usar el ejemplo
   correspondiente como forma.
3. **Acceptance observable y testable**, con el gate verde
   (`./init.sh` | `bash tests/run_tests.sh`) siempre como última bala.
4. **Borrar las secciones OPCIONALES** que no apliquen — nunca placeholders.
5. **Señalar duplicados**: con los candidatos top-k BM25 en contexto, el modelo
   marca "posible solape con #N" — es el patrón candidatos-baratos + juez-LLM
   del caso 4 del análisis RAG, aplicado al intake.

El draft **siempre pasa por el humano** en el panel (editar/regenerar) antes de
cualquier destino. El LLM redacta; no decide ni siembra estado.

## 5. Cómo llega la petición al harness (dos planes)

### Plan A — MVP sin escritura (el observador sigue 100% read-only)

El panel muestra el draft con botón **"copiar"**: el usuario lo pega en
`$HARNESS_WORKSPACE/feature-request.md` (o directamente en su agente con
`/handyman run-feature`). Cero cambios al modelo de seguridad; solo se añade
el endpoint de draft (`POST /api/draft`, que no toca disco — genera texto).
Es suficiente para validar la calidad del formato generado.

### Plan B — escritura controlada del intake (un único write, acotado)

`POST /api/feature-request { root, content }` escribe **exclusivamente**
`$HARNESS_WORKSPACE/feature-request.md` del root elegido. Guardas:

- `root` debe estar en el **registry** (misma allowlist que `/api/md`); el
  path destino es fijo — no hay parámetro de nombre de archivo.
- Se mantiene el bind 127.0.0.1 + Host-header check; añadir un header custom
  (`X-Toolbox-Intake: 1`) como defensa CSRF barata para el único POST.
- Cap de tamaño (p. ej. 64 KB) y `content` tratado como texto plano.
- **Nunca** toca `feature_list.json`, `progress/` ni `backlog/` — sembrar la
  feature sigue siendo trabajo del leader (`node dist/feature.js add`) cuando
  el humano corre `/handyman run-feature`. El observador escribe el documento
  que el flujo ya define como entrada humana editable, nada más.
- La documentación del toolBox (`references/toolbox.md`) pasa de "read-only"
  a "read-only salvo el documento de intake", explicitando el porqué.

Con Plan B, el ciclo completo queda: panel → draft LLM → editar → escribir
`feature-request.md` → el usuario corre `/handyman run-feature` en su agente →
leader lo convierte en entrada de `feature_list.json` → ciclo normal del
harness. Disparar al agente desde el toolBox (ejecutar el leader) queda
**fuera de scope** — es el plan E del diseño del observador (controlled
writes con session token) y merece su propia investigación.

## 6. Patrón de integración y costes

- **Errores**: fallo del proveedor → `event: error` SSE → live region
  assertive en la UI (plan D del análisis de UI). `available()` de cada
  adapter alimenta el selector para no ofrecer proveedores muertos.
- **Costes**: el intake es puntual y corto — incluso con Claude Opus el draft
  cuesta centavos; con GLM-4.7-FlashX o Haiku, décimas de centavo. Modelo
  barato para dedup/clasificación; el grande solo para redactar el draft.
  **Cachear el system estable** (plantilla + ejemplos) — con Claude vía
  `cache_control`, con GLM aprovecha el precio cached automático.
- **Anti-patrón**: llamadas LLM automáticas por evento SSE. Todo LLM es pull
  (acción del usuario) o batch, con resultado cacheado por hash del estado.

## 7. Casos de uso siguientes (ordenados por valor/esfuerzo)

1. **Petición de feature desde el toolBox** (§4–5) — el caso estrella; Plan A
   primero, Plan B como feature propia.
2. **Resumen de estado de flota/proyecto** (bajo): señales + cierres + backlog
   → resumen de 5 líneas con modelo barato; render marked+DOMPurify; cache
   por hash.
3. **"Ask your fleet"** (medio): el índice MiniSearch ya es el retriever —
   pregunta → top-k BM25 → relay con pregunta + fragmentos → respuesta citando
   fuentes por SSE. RAG mínimo, sin vector DB.
4. **Dedup/clasificación de backlog** (medio): salida estructurada
   `{ id, categoria, duplicado_de?, confianza }` en batch; sugerencia de merge
   en el kanban — nunca auto-merge (humano en el loop).
5. **Narrativa del timeline** (bajo): "¿qué pasó esta semana?" sobre el rango
   visible.

## 8. Fuentes principales

- API de Claude: referencia oficial vigente (platform.claude.com — streaming,
  structured-outputs, prompt caching, pricing) y
  https://github.com/anthropics/anthropic-sdk-typescript
- Z.ai / GLM: https://docs.z.ai/guides/overview/quick-start ·
  https://docs.z.ai/guides/overview/pricing ·
  https://docs.z.ai/guides/llm/glm-5.2 ·
  https://docs.z.ai/guides/capabilities/struct-output ·
  https://docs.z.ai/devpack/overview (Coding Plan / endpoint Anthropic) ·
  https://github.com/THUDM/z-ai-sdk-typescript (TS: no publicado)
- GitHub Copilot SDK: https://github.com/github/copilot-sdk ·
  GA: https://github.blog/changelog/2026-06-02-copilot-sdk-is-now-generally-available/ ·
  https://docs.github.com/copilot/how-tos/copilot-sdk/getting-started ·
  https://docs.github.com/en/copilot/how-tos/copilot-sdk/auth/authenticate
- GitHub Models (plan B): https://docs.github.com/en/github-models/prototyping-with-ai-models
- Sunset de Copilot Extensions (reemplazo: MCP):
  https://github.blog/changelog/2025-09-24-deprecate-github-copilot-extensions-github-apps/
- Ollama: https://docs.ollama.com/api/openai-compatibility
- Experiencia interna: [analisis-feature-request-md.md](analisis-feature-request-md.md)
  (formato Núcleo/Opcional, arquetipos, gate verde) ·
  [analisis-rag-handyman.md](analisis-rag-handyman.md) (BM25 + juez LLM) ·
  [analisis-ui-observador-toolbox.md](analisis-ui-observador-toolbox.md)
  (live regions, planes D/E)

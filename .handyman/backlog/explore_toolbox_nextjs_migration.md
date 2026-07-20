---
type: Explore Report
topic: toolbox_nextjs_migration
role: explorer
updated: 2026-07-18
tags: [handyman/backlog/explore]
---

# Explore: migración del toolBox a Next.js + simplificación del descubrimiento de proveedores

## Pregunta

¿Cómo migrar el toolBox (servidor `node:http` + panel React-UMD sin build, ~7.400
líneas) a un proyecto Next.js más complejo, conservando las interacciones ya
creadas (endpoints, SSE, relays LLM, tests black-box), y cómo ordenar/simplificar
el descubrimiento de proveedores LLM?

Investigación doble: (a) inventario técnico del toolBox actual (agente Explore),
(b) estado del arte Next.js/AI SDK a julio 2026 (agente con web).
Plan derivado: [[../docs/sprints/plan-migracion-toolbox-nextjs]].

## Veredicto

**Sí migrar, pero por strangler pattern, nunca big-bang.** Next.js 16 (LTS
16.2.x) como proceso frontal con `fallback` rewrites hacia `toolbox_serve`
actual; migrar vistas primero, endpoints después, capa LLM al final. La suite
`tests/test_toolbox_serve.sh` (~40 casos black-box que fijan status codes,
shapes JSON y framing SSE) es el **oráculo de paridad**: cada pieza migrada debe
pasarla sin editar aserciones — misma disciplina que `plan-migracion-typescript-bun.md` §6.

Para el descubrimiento de proveedores: el problema real es que `buildProviders()`
es código imperativo con ramas por env var. Dos niveles de solución:
1. **Corto plazo (sin dependencias nuevas):** volver `buildProviders` declarativo —
   una tabla de registro `{id, adapter, baseUrl, envKey, defaultModel, quirks}`
   donde agregar un proveedor = agregar una entrada.
2. **Con la migración:** adoptar **AI SDK 7** (`ai@7.x`) con
   `createProviderRegistry` + `customProvider`: model ids `"provider:model"`,
   `@ai-sdk/anthropic` para Claude, `@ai-sdk/openai-compatible` para Z.AI/Ollama,
   `customProvider`/`MockLanguageModel` reemplaza el provider fake de tests.
   El AI SDK es framework-agnóstico (no requiere Next.js).

## Estado actual (resumen del inventario)

Reporte completo del explorador en la sección "Inventario" de
[[../docs/sprints/plan-migracion-toolbox-nextjs]] (anexo). Lo esencial:

### Módulos
- `toolbox.ts` (1389 l): data layer read-only (registry, snapshots, señales,
  timeline, fleet aggregate) + CLI. **Portable tal cual** (lectura disco + puro).
- `toolbox_serve.ts` (1472 l): servidor `node:http`, guards (Host check 127.0.0.1,
  GET-only salvo 4 POST, CSP `default-src 'self'`), `fs.watch` debounced → SSE
  `/events`, vendor UMD desde `node_modules`, panel inline. **A reescribir** en
  Route Handlers.
- `toolbox_llm.ts` (389 l): puerto `LlmProvider` + 2 adapters por protocolo de
  cable (`anthropicProvider`, `openAiCompatProvider`). Solo usa web standards
  (fetch, AbortSignal, TextDecoder). **Portable sin cambios**.
- `toolbox_draft.ts` / `toolbox_ask.ts` / `toolbox_summary.ts`: dos capas
  (composición de prompt pura + relay callback-based `onDelta/onResult/onError`).
  **Portables**; los relays son HTTP-agnósticos, solo cambia el adaptador
  callbacks→ReadableStream.
- `toolbox_panel.js` (1586 l): React 18 UMD + `htm` sin build, routing por hash
  (6 vistas: fleet, harness, timeline, search, intake, ask), command palette,
  `streamSseOverPost` (fetch + getReader, EventSource no puede POST),
  `renderMd` (marked + DOMPurify endurecido). **Lógica portable, envoltorio a
  reescribir** como componentes JSX reales.

### Contratos a preservar (byte a byte)
- Superficie HTTP: `GET /api/state|corpus|files|providers|md|/graph/*|/vendor/*|/events`
  y `POST /api/draft|summarize|ask|intake` (intake = **única escritura**:
  `feature-request.md`, cap 256 KB, sin spawn).
- Framing SSE: `event: delta|result|error` + `data: {json}`; `/events` emite
  `{"type":"change"}` con `retry: 2000` y keepalive 25 s.
- Interfaz `LlmProvider`: `{id, model, available(), draft(req, onDelta)}` con
  `LlmError` (`unauthorized | insufficient_balance | provider_error`). El seam de
  tests es la firma `draft(req, onDelta) => Promise<{text, model, stopReason}>`.
- Cache de resumen por hash de digest (`calls==1` en el test de cache-hit).
- Modelo de seguridad: bind 127.0.0.1 + Host allowlist + registry como allowlist
  de roots + `/api/md` whitelist (`MD_NAME_RE`) + CSP same-origin.

### Riesgos duros detectados
1. `fs.watch` + `Set<ServerResponse>` asumen **un proceso long-running**: la
   migración exige Next con runtime nodejs y `next start` persistente (nunca
   edge/serverless). `SummaryCache` en RAM tiene la misma restricción.
2. Next no bindea 127.0.0.1 por defecto → replicar el guard vía `HOSTNAME` env +
   check de Host en `proxy.ts` (ex-middleware, renombrado en Next 16).
3. Los rewrites de Next bufferizan SSE en algunos casos → mientras dure el
   strangler, los endpoints SSE aún no migrados se consumen directo del puerto
   del server Node.
4. Next trae telemetría/assets propios → endurecer para conservar "todo
   same-origin" (CSP custom, `NEXT_TELEMETRY_DISABLED`).
5. Cadencia de majors del AI SDK (5→6→7 en ~12 meses) → pin exacto + aislar en
   un módulo propio para que un major toque un solo archivo.

## Estado del arte (julio 2026, verificado en web)

- **Next.js 16.2.10 LTS** (jul-2026). `middleware.ts` → `proxy.ts`. Streaming SSE
  en Route Handlers vía `ReadableStream` con `runtime = "nodejs"` +
  `dynamic = "force-dynamic"`; devolver la Response temprano o Next bufferiza.
  `output: 'standalone'` genera server autocontenido (`node .next/standalone/server.js`)
  ideal para tool local — el CLI puede hacer spawn y abrir el browser como hoy.
- **AI SDK 7** (`ai@7.0.31`, jun/jul-2026): `createProviderRegistry`,
  `streamText().toUIMessageStreamResponse()`, `generateObject` + zod,
  `useChat`/`useCompletion`, tool approval, telemetría first-class, codemod
  `npx @ai-sdk/codemod v7`. El data stream protocol es SSE documentado —
  se puede emitir desde el server Node actual antes de migrar nada.
- **UI 2026:** Tailwind v4 (CSS-first), shadcn/ui (Base UI, componentes de chat
  oficiales desde jun-2026 + typeset para markdown), TanStack Query v5
  (`streamedQuery` experimental; patrón EventSource + `invalidateQueries` para
  `/events`), cmdk (palette), TanStack Table (DataTable), React Flow (grafos),
  assistant-ui si se quiere chat UX completa. MiniSearch sigue válido client-side.
- **Alternativas livianas** (plan B reversible si Next pesa demasiado):
  Vite + React Router 7 + Hono (menor distancia desde el server actual;
  `streamSSE()` incluido), o TanStack Start. Todo el stack recomendado
  (AI SDK, TanStack, shadcn) es framework-agnóstico, así que la decisión
  Next-vs-Vite es reversible si la lógica queda en módulos compartidos.

### Mapeo de vistas actuales → stack nuevo

| Vista actual | Destino |
|---|---|
| FleetView + kanban + sparklines | RSC (lee fs directo) + DataTable + Recharts |
| SearchView (BM25) | Client Component + MiniSearch (sin cambios) |
| IntakeView | react-hook-form + zod + shadcn Form + `useChat`/relay |
| AskView (citas) | componentes de chat shadcn + data parts con sources |
| Command palette | cmdk (componente `Command` de shadcn) |
| Routing por hash | App Router: `/fleet`, `/harness/[name]`, `/timeline`, `/search`, `/intake`, `/ask` |

## Recomendación de secuencia (features propuestas)

1. **Oráculo de paridad parametrizable**: `test_toolbox_serve.sh` acepta
   entrypoint/URL por env para correr contra cualquiera de los dos servers.
2. **Registro declarativo de proveedores**: `buildProviders` como tabla de datos;
   prepara el terreno para el registry del AI SDK sin romper `LlmProvider`.
3. **Scaffold Next.js + strangler**: app Next 16 con fallback rewrite al server
   Node; ninguna funcionalidad migrada aún, solo el esqueleto verificable.
4. **Primera vista migrada (fleet)**: prueba de fuego de SSE + estado + UI nueva.

Fases posteriores (endpoints uno a uno, AI SDK, resto de vistas, standalone)
quedan especificadas en [[../docs/sprints/plan-migracion-toolbox-nextjs]] para
sprints siguientes.

## Fuentes principales

- Next.js: nextjs.org/blog · docs streaming/self-hosting/rewrites · middleware-to-proxy
- SSE: upstash.com/blog/sse-streaming-llm-responses · vercel/next.js#48427
- AI SDK: vercel.com/blog/ai-sdk-7 · ai-sdk.dev provider-registry/custom-provider/stream-protocol · ai-sdk.dev/providers/openai-compatible-providers · docs.z.ai/devpack/tool/others
- UI: ui.shadcn.com (tailwind-v4, chat components 2026-06) · assistant-ui.com · tanstack.com/query streamedQuery
- Monorepo/alternativas: turborepo.dev structuring-a-repository · tanstack.com/start comparison

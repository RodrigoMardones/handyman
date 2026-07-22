---
type: Sprint
topic: plan-migracion-toolbox-nextjs
role: leader
updated: 2026-07-18
tags: [handyman/docs/plan]
---

# Plan: migración del toolBox a Next.js (strangler) + proveedores declarativos

Investigación de origen: [[../../backlog/explore_toolbox_nextjs_migration]].
Disciplina heredada de [[plan-migracion-typescript-bun]]: **oráculo de paridad
black-box** — la suite existente decide si una pieza migrada es equivalente.

## Objetivo

Evolucionar el toolBox (hoy: server `node:http` + panel React-UMD sin build)
hacia una app Next.js 16 "pesada" con mejor UI, conservando **todas** las
interacciones ya construidas (endpoints, framing SSE, relays LLM, única
escritura de intake, modelo de seguridad localhost) y simplificando el
descubrimiento de proveedores LLM para que agregar uno nuevo sea declarativo.

## Principios (no negociables)

1. **Strangler, no big-bang.** Next.js delante con `fallback` rewrites al server
   Node; crear `app/api/x/route.ts` "roba" la ruta sin tocar config. El server
   Node solo se decomisiona cuando no queda ruta sin migrar.
2. **El oráculo manda.** `tests/test_toolbox_serve.sh` (~40 casos: status codes
   exactos, shapes JSON, framing `event: delta|result|error`, cache-hit
   `calls==1`) debe pasar verde contra el server que sirva cada ruta, sin editar
   aserciones. Ninguna feature de migración cierra sin el oráculo verde.
3. **Un proceso long-running.** Runtime nodejs + `next start`/standalone.
   Nunca edge/serverless: `fs.watch`, `Set` de clientes SSE y `SummaryCache`
   viven en RAM de un único proceso.
4. **Same-origin y localhost.** Bind 127.0.0.1 (`HOSTNAME`), Host check en
   `proxy.ts`, CSP `default-src 'self'`, telemetría de Next deshabilitada.
5. **`/api/intake` sigue siendo la única escritura** (feature-request.md,
   cap 256 KB, `spawned_process:false`).
6. **SSE directo mientras dure el strangler.** Los rewrites de Next pueden
   bufferizar SSE: los endpoints SSE aún no migrados se consumen del puerto del
   server Node directamente.

## Layout objetivo (monorepo pnpm)

```
apps/web/            # Next.js 16 App Router (nueva UI)
handyman/            # CLI + server actual (intacto hasta decomisionar serve)
packages/toolbox-core/   # extraído gradualmente: data layer, relays, contratos
packages/toolbox-llm/    # capa proveedores (registro declarativo → AI SDK 7)
```

Turborepo solo si el build empieza a doler; pnpm workspaces basta al inicio.

## Fases

### Fase 0 — Fundaciones (sprint 2026-SP6, features 36–39)

| # | Feature | Qué entrega |
|---|---|---|
| 36 | `toolbox_parity_oracle` | Suite shell parametrizable por URL/entrypoint (`TOOLBOX_SERVE_CMD`/`TOOLBOX_BASE_URL`); corre idéntica contra server Node u otro. |
| 37 | `toolbox_provider_registry` | `buildProviders` declarativo: tabla `{id, adapter, baseUrl, envKey, defaultModel, quirks}`. Agregar proveedor = una entrada. Contrato `LlmProvider` intacto. |
| 38 | `toolbox_next_scaffold` | `apps/web` Next 16 (pnpm workspace) con proxy reverso hacia el server Node desde `proxy.ts` (runtime nodejs, no configurable), guard localhost, CSP, `output: 'standalone'`. Cero vistas migradas; oráculo verde a través del proxy. |
| 39 | `toolbox_next_fleet_view` | Primera vista real en Next: `/fleet` (estado + kanban + señales) consumiendo `/api/state` y `/events` (SSE directo al puerto Node). |

### Arranque dual (feature 38, verificado)

**Hallazgo:** `next.config.js`'s `rewrites().fallback` resuelve su `destination`
una sola vez, al construir el routes manifest (`next build`), no por request —
con `output: 'standalone'` un `TOOLBOX_UPSTREAM` distinto al usado en build
queda silenciosamente ignorado en runtime (confirmado empíricamente: build sin
la env var horneó el default `http://127.0.0.1:8765`; arrancar el standalone
server después con otro valor no tuvo efecto). Por eso el proxy real vive en
`proxy.ts` (`apps/web/proxy.ts`): `fetch()` manual hacia
`process.env.TOOLBOX_UPSTREAM`, leído en cada request porque `proxy.ts` corre
en el runtime Node.js genuino de Next 16 (fijo, no configurable) — ahí sí
`TOOLBOX_UPSTREAM` es configurable en boot sin rebuild. `next.config.ts` solo
declara `output: 'standalone'`; no tiene `rewrites()`.

Comando real, dos procesos (Node upstream primero, Next strangler después):

> **⚠️ SUPERSEDED (2026-07-19, decisión D3).** Este runbook dual-boot describe
> un estado que ya no existe: `toolbox_serve.ts` se borró en la feature 50 y
> `handyman/dist/toolbox_serve.js` **no compila ni existe**, así que el bloque
> de abajo no se puede correr. Se conserva como historia honesta de cómo se
> verificó la paridad (feature 38, "48-case parity"), no como instrucción.
> Hoy el arranque es **un solo proceso**: `node handyman/dist/toolbox.js serve`
> levanta el Next standalone de `apps/web` (ver `docs/architecture.md`).

```bash
# Terminal 1 — server Node (paridad, puerto fijo por defecto)
node handyman/dist/toolbox_serve.js --port 8765

# Terminal 2 — Next.js standalone (next start NO funciona con output:'standalone';
# hay que copiar los assets estaticos al output y arrancar server.js)
cd apps/web
NEXT_TELEMETRY_DISABLED=1 pnpm exec next build
mkdir -p .next/standalone/apps/web/.next/static
cp -r .next/static/* .next/standalone/apps/web/.next/static/
TOOLBOX_UPSTREAM=http://127.0.0.1:8765 PORT=3210 \
  node .next/standalone/apps/web/server.js
```

El oráculo de paridad (feature 36) corre verde contra el puerto de Next en
este modo: `HANDYMAN_ROOT=... OLLAMA_BASE_URL=... TOOLBOX_BASE_URL=http://127.0.0.1:3210
bash tests/test_toolbox_serve.sh` — probado con los 48 casos verdes,
incluyendo SSE (`/events`), que el proxy de `proxy.ts` reenvía sin bufferizar
al usar `ReadableStream` de `fetch()` directamente como body de la `Response`.

### Fase 1 — UI completa en Next (sprint siguiente)

- `/harness/[name]`, `/timeline`, `/search` (MiniSearch client-side sin cambios),
  `/intake`, `/ask` con stack nuevo: Tailwind v4 + shadcn/ui (componentes de
  chat + typeset para markdown), TanStack Query v5 (EventSource +
  `invalidateQueries` para `/events`), cmdk para la command palette.
- El panel UMD (`toolbox_panel.js`) queda congelado (solo bugfixes) hasta la
  paridad visual; luego se elimina junto con `/vendor/*` y `panelHtml`.

### Fase 2 — Endpoints uno a uno (Route Handlers) — EN CURSO (42-45 done)

- **Hecho (2026-07-18, features 42-45; evidencia en backlog/ y
  docs/verification.md):** `packages/toolbox-core` extraido (mover, no
  reescribir; shims dist-estables en handyman); runtime singleton en
  apps/web (instrumentation + globalThis) y NATIVOS: `/api/state`, `/events`
  (SSE sin buffering), `/api/corpus`, `/api/md`, `/api/files`,
  `/api/providers`, `/graph/*`, `/vendor/*` y los relays `POST
  /api/draft|summarize|ask` (framing byte-estable, SummaryCache del runtime,
  `resolveSummaryModel` compartida). Oraculo default 48/48 intacto; dual-run
  42/48 (solo el carve-out de `GET /`).
- **Hallazgo estructural:** los bundlers de Next bundlean paquetes workspace
  symlinkeados (ignoran `serverExternalPackages`); el CLI handyman no es
  bundleable (`import.meta.url` sobre SKILL.md/assets), asi que
  `apps/web/lib/toolboxState.ts` lo carga en runtime como ESM real.
- **Server actions (decision de la unificacion, ver
  backlog/explore_toolbox_next_unification.md):** NO reemplazan a los route
  handlers (RPC opaco de React: romperia el oraculo black-box y EventSource
  no hace POST). Entran donde el patron aplica: la unica escritura
  (`/api/intake`) gana un server action `submitIntake` sobre la MISMA
  funcion core `writeIntake`, con el route handler de paridad al lado
  (feature 46).
- Falta de la fase: `POST /api/intake` (feature 46, con el server action).

### Fase 3 — Capa LLM con AI SDK 7

- `createProviderRegistry` + `@ai-sdk/anthropic` (Claude, Z.AI coding-plan vía
  baseURL Anthropic-compatible) + `@ai-sdk/openai-compatible` (Z.AI paas,
  Ollama) + `customProvider`/`MockLanguageModel` para el fake de tests.
- Primero conservar el framing SSE actual serializando desde el stream del SDK
  (oráculo intacto); después, al migrar el cliente a `useChat`, adoptar el UI
  message stream protocol y actualizar aserciones en la misma feature.
- Pin exacto de versión; el SDK vive solo en `packages/toolbox-llm`.

### Fase 4 — Decomisionar y empaquetar

- Retirar `toolbox_serve.ts` y el fallback rewrite; `node dist/toolbox.js serve`
  pasa a hacer spawn de `.next/standalone/server.js` y abre el browser.
- Actualizar `docs/architecture.md` y cerrar este plan a `docs/sprints/`.

## Descubrimiento de proveedores: antes / después

| | Hoy | Fase 0 (f.37) | Fase 3 (AI SDK) |
|---|---|---|---|
| Agregar proveedor | Rama nueva en `buildProviders` + ampliar union `LlmProviderId` | Una entrada en la tabla de registro | Una entrada en `createProviderRegistry` |
| Selección de modelo | `resolveSummaryModel` ad-hoc | igual, pero leyendo del registro | id `"provider:model"` estándar |
| Fake de tests | mock OpenAI-compat vía `OLLAMA_BASE_URL` | igual (sin cambios) | `customProvider` sin red |
| Quirks (GLM thinking, caps) | hardcoded en adapters | campo `quirks` por entrada | settings pre-configurados del registry |

## Riesgos y mitigaciones

- **SSE bufferizado por rewrites** → consumir SSE del puerto Node hasta Fase 2.
- **Majors frecuentes del AI SDK** (5→6→7 en un año) → pin + aislamiento en un
  paquete; codemods oficiales para subir.
- **Peso de Next para tool local** → decisión reversible: la lógica queda en
  `packages/`, y el plan B (Vite + React Router 7 + Hono) reutiliza AI SDK,
  TanStack y shadcn tal cual.
- **Doble server durante el strangler** → el CLI levanta ambos procesos y el
  usuario solo ve el puerto de Next; documentar en cada feature.

## Criterio de éxito global

`bash tests/run_tests.sh` y `./init.sh` verdes en cada cierre; al final de la
Fase 4, el oráculo completo pasa contra Next standalone y `toolbox_serve.ts`
ya no existe.

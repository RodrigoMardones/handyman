---
type: Research Log
feature: modelos_dinamicos_catalogo
status: researched
role: explorer
updated: 2026-07-28
tags: [handyman/role/explorer, handyman/feature/modelos_dinamicos_catalogo]
---

# Explore: carga dinámica de modelos desde un catálogo centralizado personal

Pregunta del operador: ¿cuántos modelos más puedo usar y cómo cargarlos de
manera dinámica desde un catálogo centralizado propio? Investigado contra el
runtime instalado (`@mastra/core@1.53.0`) y la doc oficial de modelos.

## 1. Lo que Mastra ya trae (sin escribir nada)

**Model router + `PROVIDER_REGISTRY` integrado** (`@mastra/core/llm`):
159 providers, miles de modelos, resueltos por string `'provider/model'`
directo en `new Agent({ model: '...' })` — sin instancias AI SDK manuales.
Verificado en vivo contra el paquete instalado:

| Provider | Env key | Modelos | Nota |
|---|---|---|---|
| `openrouter` | `OPENROUTER_API_KEY` | **341** | UNA key → Anthropic/OpenAI/Google/Meta/DeepSeek… |
| `openai` | `OPENAI_API_KEY` | 47 | |
| `anthropic` | `ANTHROPIC_API_KEY` | 15 | |
| `google` | `GOOGLE_API_KEY` | 41 | Gemini directo |
| `groq` | `GROQ_API_KEY` | 15 | inferencia rápida barata |
| `deepseek` | `DEEPSEEK_API_KEY` | 4 | |
| `mistral` | `MISTRAL_API_KEY` | 30 | |
| `xai` | `XAI_API_KEY` | 10 | |
| `cerebras` | `CEREBRAS_API_KEY` | 3 | |
| `lmstudio` | `LMSTUDIO_API_KEY` | 3 | **local** |
| `ollama-cloud` | `OLLAMA_API_KEY` | 30+ | |
| `kimi-for-coding` | `KIMI_API_KEY` | 4 (`k3`, `k3-256k`, …) | **idéntico al provider custom actual** (misma URL `api.kimi.com/coding/v1`) |
| `zhipuai` / `zhipuai-coding-plan` | `ZHIPU_API_KEY` | 13 / 7 (incl. `glm-5.2`) | ojo: endpoint `open.bigmodel.cn` (CN); el deployment actual usa `api.z.ai` (internacional, protocolo Anthropic) |
| …y ~140 más (`fireworks-ai`, `nvidia`, `nebius`, `poe`, `azure`, `vertex`, `bedrock`…) | | | registry derivado de models.dev, con sync horario |

Doc: <https://mastra.ai/models> · cualquier instancia AI SDK (p.ej. la que
hoy construye `model-catalog.ts`) también vale donde acepta un string.

## 2. Custom gateways (el catálogo centralizado personal, vía oficial)

`MastraModelGateway` / `MastraModelGatewayInterface` (`@mastra/core/llm`):
un gateway propio con `fetchProviders()` (qué providers/modelos expongo),
`buildUrl()`, `getApiKey()` y `resolveLanguageModel()` (típicamente
`createOpenAICompatible(...).chatModel(modelId)`). Se registra en
`new Mastra({ gateways: { personal: new MiGateway() } })` o dinámicamente
con `mastra.addGateway(...)` — **carga dinámica nativa**: el
`GatewayRegistry` re-sincroniza `fetchProviders()` cada hora, así que editar
el catálogo se propaga sin tocar código. Los modelos se referencian
`gatewayId/provider/model` y el router los prefiere sobre los built-in.

Extra relevante: **Studio muestra un model picker con los providers**; con
`AUTO_BLOCK_EXTERNAL_PROVIDERS=true` solo muestra los gateways propios —
exactamente "mi catálogo personal".

Doc: <https://mastra.ai/models/gateways/custom-gateways>

## 3. Opciones para el operador

| Opción | Qué es | Modelos alcanzables | Coste |
|---|---|---|---|
| **A. OpenRouter** | 1 key (`OPENROUTER_API_KEY`) → `model: 'openrouter/anthropic/claude-haiku-4.5'` etc. | 341 (y subiendo) | solo la key; cero código |
| **B. Strings directos del registry** | `HANDYMAN_LEADER_MODEL=google/gemini-3-pro` con su env key por provider | miles, 159 providers | una key por provider que uses |
| **C. Gateway personal** | clase `PersonalGateway` que lee un archivo de catálogo propio (`models.json` con `{provider, baseURL, apiKeyEnv, protocol, models[]}`) y lo expone como `personal/<provider>/<modelo>` | lo que TÚ declares (z.ai internacional, kimi coding, endpoints privados, Ollama local, proxies) | ~100 líneas + el JSON |
| **D. Status quo extendido** | seguir añadiendo factories a mano en `model-catalog.ts` | de a un provider por edit | código por cada alta |

Los providers custom actuales NO se pierden: `zai` (api.z.ai, protocolo
Anthropic) y `kimi-coding` se quedan como entradas del catálogo personal —
el registry built-in `kimi-for-coding` los duplica, pero `zhipuai*` apunta
al endpoint CN, no al internacional que usamos.

## 4. Recomendación

**A + C**: OpenRouter para amplitud inmediata (una key en `.env` y ya puedes
poner `HANDYMAN_LEADER_MODEL=openrouter/<cualquiera>`), y un gateway
`personal` leyendo `agents/mastra-handyman/model-catalog.json` (o
`~/.config/handyman/models.json` si debe vivir fuera del repo) como fuente
única editable a mano — "mi catálogo". `resolveRoleModels()` queda igual
(env por rol); `resolveModel()` se simplifica a: strings con `/` → model
router (built-in + gateways); fallback al factory custom solo para el
protocolo Anthropic de z.ai si no se migra al endpoint OpenAI-compatible.

Diseño del JSON propuesto (discutible antes de implementar):

```json
{
  "providers": [
    { "id": "zai",       "baseURL": "https://api.z.ai/api/anthropic/v1", "apiKeyEnv": "Z_AI_API_KEY",  "protocol": "anthropic",  "models": ["glm-5.2"] },
    { "id": "kimi",      "baseURL": "https://api.kimi.com/coding/v1",    "apiKeyEnv": "KIMI_API_KEY",  "protocol": "anthropic",  "models": ["k3", "k2p7"] },
    { "id": "local",     "baseURL": "http://127.0.0.1:11434/v1",         "apiKeyEnv": null,            "protocol": "openai",     "models": ["qwen3:32b"] }
  ]
}
```

## 5. Riesgos / notas

- El router built-in resuelve strings también en agents standalone (registry
  global), pero el wiring canónico es registrar gateways en la instancia
  `Mastra` (`src/app.ts`) — mismo sitio donde hoy se registran scorers.
- `zhipuai-coding-plan` del registry ≠ nuestro Z.AI Coding Plan
  internacional: no migrar `zai/*` al registry sin verificar endpoint/auth.
- OpenRouter cobra sobre el precio del provider subyacente; para volumen del
  ciclo diario, GLM/Kimi directos siguen siendo más baratos.
- El model picker de Studio respeta `AUTO_BLOCK_EXTERNAL_PROVIDERS=true`
  (útil si el catálogo personal debe ser la única fuente visible).

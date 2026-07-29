// Model catalog (port of the Flue feature-91 module): the single module that
// knows WHICH providers exist, WHICH env var feeds each one, and HOW a
// 'provider/model' spec resolves to an AI SDK model instance for Mastra.
//
// Both configured providers speak the Anthropic wire protocol with a custom
// baseURL, so createAnthropic covers the whole catalog. NOTE on the /v1
// suffix: @ai-sdk/anthropic posts to `${baseURL}/messages`, and both
// providers serve the API at `<root>/v1/messages`, so baseURL must include
// the /v1 (verified 2026-07-28 with curl against both endpoints — without
// it Z.AI 404s with a 200 status and an opaque {"code":500} body).
//  - 'zai'         → Z.AI (https://api.z.ai/api/anthropic/v1), key Z_AI_API_KEY.
//                    Serves GLM-5.2. Z.AI accepts both auth header shapes, so
//                    we send x-api-key (AI SDK default) AND Authorization Bearer.
//  - 'kimi-coding' → Kimi for Coding (https://api.kimi.com/coding/v1), key
//                    KIMI_API_KEY. Models: k2p7, k3. A Kimi for Coding token
//                    is NOT valid on the Moonshot platform endpoints
//                    (api.moonshot.ai 401s it) — different product; register
//                    'moonshotai' with its own key if ever needed.
import { readFileSync, existsSync } from 'node:fs';
import { createAnthropic } from '../mastra';

/** Default model spec for every role: GLM-5.2 served by Z.AI. */
export const DEFAULT_ROLE_MODEL = 'zai/glm-5.2';

/** Per-role model specs, overridable via HANDYMAN_{LEADER,IMPLEMENTER,REVIEWER}_MODEL.
 *  Examples:
 *    HANDYMAN_IMPLEMENTER_MODEL=kimi-coding/k2p7
 *    HANDYMAN_REVIEWER_MODEL=kimi-coding/k3
 *    HANDYMAN_LEADER_MODEL=openrouter/moonshotai/kimi-k3   (via model router) */
export function resolveRoleModels(env: NodeJS.ProcessEnv = process.env) {
  return {
    leader: env.HANDYMAN_LEADER_MODEL ?? DEFAULT_ROLE_MODEL,
    implementer: env.HANDYMAN_IMPLEMENTER_MODEL ?? DEFAULT_ROLE_MODEL,
    reviewer: env.HANDYMAN_REVIEWER_MODEL ?? DEFAULT_ROLE_MODEL,
  } as const;
}

type AnthropicFactory = ReturnType<typeof createAnthropic>;

const PROVIDER_FACTORIES: Record<string, (env: NodeJS.ProcessEnv) => AnthropicFactory> = {
  zai: (env) =>
    createAnthropic({
      name: 'zai',
      baseURL: 'https://api.z.ai/api/anthropic/v1',
      apiKey: env.Z_AI_API_KEY ?? '',
      headers: { Authorization: `Bearer ${env.Z_AI_API_KEY ?? ''}` },
    }),
  'kimi-coding': (env) =>
    createAnthropic({
      name: 'kimi-coding',
      baseURL: 'https://api.kimi.com/coding/v1',
      apiKey: env.KIMI_API_KEY ?? '',
      headers: { Authorization: `Bearer ${env.KIMI_API_KEY ?? ''}` },
    }),
};

// ---------------------------------------------------------------------------
// Personal catalog (hand-configured, 2026-07-28): extra providers declared in
// model-catalog.json (the path is computed by the config port — the
// HANDYMAN_MODEL_CATALOG override lives there). Anthropic-protocol only —
// that wire format is already proven with zai/kimi-coding and covers Ollama,
// LM Studio and most local servers (/v1/messages) with ZERO new dependencies.
// Mastra's custom-gateway route (ModelsDevGateway) was evaluated and
// deferred: its provider/key machinery fights keyless local servers (see
// explore report).
// ---------------------------------------------------------------------------

export interface CatalogProvider {
  id: string;
  name?: string;
  baseURL: string;
  apiKeyEnv: string | null;
  protocol: 'anthropic';
  models?: string[];
}

// Cache keyed by catalog path: the file is static deployment config, read
// once per boot (resolveModel hits it at agent construction).
const catalogCache = new Map<string, Record<string, CatalogProvider>>();

/** Load the personal catalog from an explicit path (missing/invalid file →
 *  empty, never throws). */
export function loadCatalogProviders(path: string): Record<string, CatalogProvider> {
  const cached = catalogCache.get(path);
  if (cached) return cached;
  const providers: Record<string, CatalogProvider> = {};
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf-8')) as {
        providers?: CatalogProvider[];
      };
      for (const p of parsed.providers ?? []) {
        if (p?.id && p.baseURL && p.protocol === 'anthropic') providers[p.id] = p;
      }
    } catch (error) {
      console.warn(`[model-catalog] ignoring unreadable catalog at ${path}:`, error);
    }
  }
  catalogCache.set(path, providers);
  return providers;
}

/** Guard: a provider with a non-empty `models` list only serves those ids. */
export function assertCatalogModel(provider: CatalogProvider, modelId: string): void {
  if (provider.models && provider.models.length > 0 && !provider.models.includes(modelId)) {
    throw new Error(
      `model "${modelId}" not declared for provider "${provider.id}" in the catalog ` +
        `(declared: ${provider.models.join(', ')}) — edit model-catalog.json`,
    );
  }
}

/**
 * Per-model capability defaults: what each spec gets on top of the role
 * default options. Values verified against the OpenRouter model API (ctx,
 * supported params) — they apply only if those router specs are ever used
 * (the operator discarded OpenRouter as a default 2026-07-28: no key).
 */
export const MODEL_CAPABILITIES: Record<
  string,
  { maxOutputTokens: number; reasoning?: 'low' | 'medium' | 'high' }
> = {
  'openrouter/z-ai/glm-5.2': { maxOutputTokens: 65_536, reasoning: 'high' },
  'openrouter/moonshotai/kimi-k3': { maxOutputTokens: 32_768, reasoning: 'high' },
  'openrouter/moonshotai/kimi-k2.7-code': { maxOutputTokens: 32_768, reasoning: 'high' },
};

/** Role defaultOptions for a resolved spec: base budget + its capabilities. */
export function roleDefaultOptions(spec: string) {
  const caps = MODEL_CAPABILITIES[spec];
  return {
    maxSteps: 15,
    modelSettings: {
      maxOutputTokens: caps?.maxOutputTokens ?? 16_384,
      ...(caps?.reasoning ? { reasoning: caps.reasoning } : {}),
    },
  } as const;
}

/**
 * Resolve a 'provider/model' spec. Custom providers (zai, kimi-coding) are
 * built as AI SDK instances here; EVERYTHING ELSE passes through as a
 * string to Mastra's built-in model router (159 providers — openrouter,
 * openai, google, groq…), which is what makes the catalog dynamic: any
 * registry provider works by naming it, no code changes.
 * options.catalogPath: personal catalog file (from the config port) consulted
 * between the factories and the router pass-through; options.env: provider
 * API keys source (tests inject fakes).
 */
export function resolveModel(
  spec: string,
  options: { catalogPath?: string; env?: NodeJS.ProcessEnv } = {},
) {
  const env = options.env ?? process.env;
  const slash = spec.indexOf('/');
  if (slash < 1) throw new Error(`model spec "${spec}" must be 'provider/model'`);
  const provider = spec.slice(0, slash);
  const modelId = spec.slice(slash + 1);
  const factory = PROVIDER_FACTORIES[provider];
  if (factory) return factory(env)(modelId);
  // Personal catalog (local servers, hand-configured in model-catalog.json).
  const catalogProvider = options.catalogPath
    ? loadCatalogProviders(options.catalogPath)[provider]
    : undefined;
  if (catalogProvider) {
    assertCatalogModel(catalogProvider, modelId);
    const apiKey = catalogProvider.apiKeyEnv ? (env[catalogProvider.apiKeyEnv] ?? '') : 'local';
    return createAnthropic({
      name: catalogProvider.id,
      baseURL: catalogProvider.baseURL,
      apiKey,
      headers: { Authorization: `Bearer ${apiKey}` },
    })(modelId);
  }
  // Model-router pass-through (needs the provider's env key, e.g.
  // OPENROUTER_API_KEY for openrouter/*).
  return spec;
}

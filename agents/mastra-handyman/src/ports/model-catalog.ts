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
import { createAnthropic } from '../mastra';

/** Default model spec for every role: GLM-5.2 served by Z.AI. */
export const DEFAULT_ROLE_MODEL = 'zai/glm-5.2';

/** Per-role model specs, overridable via HANDYMAN_{LEADER,IMPLEMENTER,REVIEWER}_MODEL.
 *  Examples:
 *    HANDYMAN_IMPLEMENTER_MODEL=kimi-coding/k2p7
 *    HANDYMAN_REVIEWER_MODEL=kimi-coding/k3 */
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

/** Resolve a 'provider/model' spec to an AI SDK model instance. */
export function resolveModel(spec: string, env: NodeJS.ProcessEnv = process.env) {
  const slash = spec.indexOf('/');
  if (slash < 1) throw new Error(`model spec "${spec}" must be 'provider/model'`);
  const provider = spec.slice(0, slash);
  const modelId = spec.slice(slash + 1);
  const factory = PROVIDER_FACTORIES[provider];
  if (!factory) {
    throw new Error(
      `unknown provider "${provider}" in model spec "${spec}" (known: ${Object.keys(PROVIDER_FACTORIES).join(', ')})`,
    );
  }
  return factory(env)(modelId);
}

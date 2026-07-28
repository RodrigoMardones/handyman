// Model catalog (feature 91): the single module that knows WHICH providers we
// register, WHICH env var feeds each one, and WHAT tuning each model needs.
// app.ts calls registerModelProviders(); the leader agent resolves per-role
// model specs with resolveRoleModels(). Like everything else in this package,
// the provider wiring goes through the src/flue/ anti-volatility barrel.
import { registerProvider } from '../flue';

/** Default model spec for every role: GLM-5.2 served by Z.AI over the
 *  Anthropic wire protocol (the 'anthropic' catalog provider is overridden
 *  below to point at Z.AI). */
export const DEFAULT_ROLE_MODEL = 'anthropic/glm-5.2';

/** Agent-level tuning. GLM burns max_tokens on thinking before emitting
 *  text, so keep thinking low; the provider registration below also raises
 *  maxTokens for glm-5.2. */
export const AGENT_TUNING = { thinkingLevel: 'minimal' } as const;

/** Per-role model specs, overridable via HANDYMAN_{LEADER,IMPLEMENTER,REVIEWER}_MODEL.
 *  Examples:
 *    HANDYMAN_IMPLEMENTER_MODEL=kimi-coding/k2p7   (Kimi for Coding, KIMI_API_KEY)
 *    HANDYMAN_REVIEWER_MODEL=kimi-coding/k3 */
export function resolveRoleModels(env: NodeJS.ProcessEnv = process.env) {
  return {
    leader: env.HANDYMAN_LEADER_MODEL ?? DEFAULT_ROLE_MODEL,
    implementer: env.HANDYMAN_IMPLEMENTER_MODEL ?? DEFAULT_ROLE_MODEL,
    reviewer: env.HANDYMAN_REVIEWER_MODEL ?? DEFAULT_ROLE_MODEL,
  } as const;
}

/** Register the deployment's model providers (called once from app.ts).
 *
 *  - 'anthropic' (override) → Z.AI (https://api.z.ai/api/anthropic). Z.AI
 *    serves GLM-5.2 only over the Anthropic wire protocol; both auth header
 *    shapes are sent (Z.AI accepts Bearer, and pi-ai's anthropic client also
 *    sets x-api-key from apiKey).
 *  - 'kimi-coding' (catalog) → Kimi for Coding (api.kimi.com/coding), fed by
 *    KIMI_API_KEY. A Kimi for Coding token is NOT valid on the Moonshot
 *    platform endpoints (api.moonshot.ai 401s it): if platform Moonshot
 *    models are ever needed, register 'moonshotai' explicitly with its own
 *    key instead of reusing the coding token. */
export function registerModelProviders(env: NodeJS.ProcessEnv = process.env): void {
  registerProvider('anthropic', {
    baseUrl: 'https://api.z.ai/api/anthropic',
    apiKey: env.Z_AI_API_KEY,
    headers: {
      Authorization: `Bearer ${env.Z_AI_API_KEY ?? ''}`,
    },
    models: {
      'glm-5.2': { contextWindow: 131072, maxTokens: 16384 },
    },
  });

  registerProvider('kimi-coding', {
    apiKey: env.KIMI_API_KEY,
  });
}

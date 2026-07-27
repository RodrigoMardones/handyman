import { Hono } from 'hono';
import { flue } from '@flue/runtime/routing';
import { registerProvider } from '@flue/runtime';

// Z.AI serves GLM-5.2 over the Anthropic wire protocol, so we override the
// catalog 'anthropic' provider with the Z.AI endpoint instead of registering
// a provider from scratch. Both auth header shapes are sent; Z.AI accepts
// Bearer and pi-ai's anthropic client also sets x-api-key from apiKey.
registerProvider('anthropic', {
  baseUrl: 'https://api.z.ai/api/anthropic',
  apiKey: process.env.Z_AI_API_KEY,
  headers: {
    Authorization: `Bearer ${process.env.Z_AI_API_KEY ?? ''}`,
  },
  // GLM burns max_tokens on thinking before emitting text; give it room and
  // keep thinking low (the agent sets thinkingLevel too).
  models: {
    'glm-5.2': { contextWindow: 131072, maxTokens: 16384 },
  },
});

const app = new Hono();

// The workspace token turned out to be a Kimi for Coding key (validated
// against api.kimi.com/coding), stored as MOONSHOT_API_KEY. Feed it to the
// catalog kimi-coding provider; KIMI_API_KEY wins when both are set.
registerProvider('kimi-coding', {
  apiKey: process.env.KIMI_API_KEY ?? process.env.MOONSHOT_API_KEY,
});

app.route('/', flue());

export default app;

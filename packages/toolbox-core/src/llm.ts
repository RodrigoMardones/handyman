/**
 * Handyman toolBox LLM layer: provider port + adapters (server-side only).
 *
 * Design: docs/analisis-peticiones-llm-toolbox.md §2-3. One small port
 * (`LlmProvider`) with one adapter per wire protocol, parameterized by
 * baseUrl so a single adapter covers several vendors:
 *
 *   anthropicProvider    Anthropic Messages API + SSE. Covers Claude
 *                        (api.anthropic.com, x-api-key) and the Z.ai GLM
 *                        Coding Plan (api.z.ai/api/anthropic, Bearer) —
 *                        verified empirically 2026-07: the Coding Plan
 *                        serves GLM-5.2 only through this protocol.
 *   openAiCompatProvider chat/completions + SSE. Covers Z.ai pay-as-you-go
 *                        (api.z.ai/api/paas/v4) and Ollama. GLM quirks the
 *                        adapter absorbs: models reason by default (thinking
 *                        must be disabled for short drafts or max_tokens is
 *                        burned on reasoning), max_tokens caps at 131072,
 *                        and error code 1113 means "no balance".
 *
 * "copilot" is a declared future id (official @github/copilot-sdk, JSON-RPC
 * against the bundled CLI) — no adapter yet.
 *
 * PROVIDER_REGISTRY is the declarative table buildProviders() iterates: one
 * entry per provider (env var names, default model, and a resolveVariant()
 * picking adapter + baseUrl + quirks for the environment). Adding a provider
 * means adding one entry — buildProviders never branches on provider id.
 *
 * Keys come from the environment; loadDotEnv() fills process.env from the
 * project root .env without overriding existing vars. Key material is never
 * logged and never leaves the server (the browser talks to the relay only).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * String, not a closed union: PROVIDER_REGISTRY is the source of truth for
 * which ids exist. Keeping this open means adding a provider never requires
 * widening a type here — only adding a table entry (see PROVIDER_REGISTRY).
 */
export type LlmProviderId = string;
export type LlmErrorCode = "unauthorized" | "insufficient_balance" | "provider_error";

export class LlmError extends Error {
  readonly code: LlmErrorCode;
  constructor(code: LlmErrorCode, message: string) {
    super(message);
    this.name = "LlmError";
    this.code = code;
  }
}

export interface DraftRequest {
  prompt: string;
  system?: string;
  maxTokens?: number;
  /** Keep provider-side reasoning on. Default false: drafts are short and
   * GLM models burn max_tokens on thinking before emitting text. */
  reasoning?: boolean;
  /** Per-request model override; falls back to the adapter's configured model. */
  model?: string;
}

export interface DraftResult {
  text: string;
  model: string;
  stopReason: string | null;
}

export interface LlmProvider {
  readonly id: LlmProviderId;
  readonly model: string;
  /** Cheap check: never hits the network except Ollama's health probe. */
  available(): Promise<boolean>;
  draft(req: DraftRequest, onDelta: (text: string) => void): Promise<DraftResult>;
}

export interface ProviderInfo {
  id: LlmProviderId;
  available: boolean;
  model: string | null;
}

type FetchLike = typeof fetch;

const DEFAULT_MAX_TOKENS = 16000;
const OPENAI_MAX_TOKENS_CAP = 131072; // documented range [1, 131072] on api.z.ai paas/v4
const DRAFT_TIMEOUT_MS = 300_000;
const HEALTH_TIMEOUT_MS = 1500;

/** Ids declared in the design but without an adapter yet. */
export const FUTURE_PROVIDER_IDS: LlmProviderId[] = ["copilot"];

// --- shared plumbing ---------------------------------------------------------

/** Map an HTTP failure to a stable LlmError. Never echoes key material: the
 * response body is vendor text, truncated defensively. */
async function raiseHttp(res: Response): Promise<never> {
  const body = (await res.text().catch(() => "")).slice(0, 300);
  let code: LlmErrorCode = "provider_error";
  if (res.status === 401) {
    code = "unauthorized";
  } else if (body.includes('"1113"')) {
    code = "insufficient_balance"; // Z.ai: "Insufficient balance or no resource package"
  }
  throw new LlmError(code, `HTTP ${res.status}: ${body}`);
}

/** Yield the payload of every `data:` line of an SSE body. */
async function* sseData(body: Response["body"]): AsyncGenerator<string> {
  if (!body) {
    return;
  }
  const decoder = new TextDecoder();
  let buf = "";
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    buf += decoder.decode(chunk, { stream: true });
    let idx = buf.indexOf("\n");
    while (idx !== -1) {
      const line = buf.slice(0, idx).trimEnd();
      buf = buf.slice(idx + 1);
      if (line.startsWith("data:")) {
        yield line.slice(5).trim();
      }
      idx = buf.indexOf("\n");
    }
  }
}

function parseJson(payload: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(payload);
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// --- Anthropic Messages adapter (Claude, Z.ai Coding Plan) -------------------

export interface AnthropicAdapterOptions {
  id: LlmProviderId;
  model: string;
  baseUrl: string;
  apiKey: string;
  /** Claude uses x-api-key (default); the Z.ai Anthropic endpoint uses Bearer. */
  auth?: "x-api-key" | "bearer";
  fetchImpl?: FetchLike;
}

export function anthropicProvider(options: AnthropicAdapterOptions): LlmProvider {
  const doFetch = options.fetchImpl ?? fetch;
  const base = options.baseUrl.replace(/\/$/, "");
  return {
    id: options.id,
    model: options.model,
    available: async () => options.apiKey.length > 0,
    async draft(req, onDelta) {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      };
      if ((options.auth ?? "x-api-key") === "bearer") {
        headers.Authorization = `Bearer ${options.apiKey}`;
      } else {
        headers["x-api-key"] = options.apiKey;
      }
      const model = req.model ?? options.model;
      const res = await doFetch(`${base}/v1/messages`, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(DRAFT_TIMEOUT_MS),
        body: JSON.stringify({
          model,
          max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
          stream: true,
          ...(req.system ? { system: req.system } : {}),
          messages: [{ role: "user", content: req.prompt }],
        }),
      });
      if (!res.ok) {
        await raiseHttp(res);
      }
      let text = "";
      let stopReason: string | null = null;
      for await (const payload of sseData(res.body)) {
        const event = parseJson(payload);
        if (!event) {
          continue;
        }
        if (event.type === "content_block_delta") {
          const delta = event.delta as Record<string, unknown> | undefined;
          if (delta?.type === "text_delta" && typeof delta.text === "string") {
            text += delta.text;
            onDelta(delta.text);
          }
        } else if (event.type === "message_delta") {
          const delta = event.delta as Record<string, unknown> | undefined;
          if (typeof delta?.stop_reason === "string") {
            stopReason = delta.stop_reason;
          }
        }
      }
      return { text, model, stopReason };
    },
  };
}

// --- OpenAI-compatible adapter (Z.ai paas/v4, Ollama) ------------------------

export interface OpenAiCompatAdapterOptions {
  id: LlmProviderId;
  model: string;
  baseUrl: string;
  apiKey?: string;
  /** GLM: send thinking disabled unless the request asks for reasoning. */
  thinkingControl?: boolean;
  /** Ollama: availability means the local server answers /models. */
  healthCheck?: boolean;
  fetchImpl?: FetchLike;
}

export function openAiCompatProvider(options: OpenAiCompatAdapterOptions): LlmProvider {
  const doFetch = options.fetchImpl ?? fetch;
  const base = options.baseUrl.replace(/\/$/, "");
  return {
    id: options.id,
    model: options.model,
    async available() {
      if (!options.healthCheck) {
        return (options.apiKey ?? "").length > 0;
      }
      try {
        const res = await doFetch(`${base}/models`, {
          signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    async draft(req, onDelta) {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (options.apiKey) {
        headers.Authorization = `Bearer ${options.apiKey}`;
      }
      const messages = [
        ...(req.system ? [{ role: "system", content: req.system }] : []),
        { role: "user", content: req.prompt },
      ];
      const model = req.model ?? options.model;
      const res = await doFetch(`${base}/chat/completions`, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(DRAFT_TIMEOUT_MS),
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          max_tokens: Math.min(req.maxTokens ?? DEFAULT_MAX_TOKENS, OPENAI_MAX_TOKENS_CAP),
          ...(options.thinkingControl && !req.reasoning ? { thinking: { type: "disabled" } } : {}),
        }),
      });
      if (!res.ok) {
        await raiseHttp(res);
      }
      let text = "";
      let stopReason: string | null = null;
      for await (const payload of sseData(res.body)) {
        if (payload === "[DONE]") {
          continue;
        }
        const event = parseJson(payload);
        const choice = (event?.choices as Array<Record<string, unknown>> | undefined)?.[0];
        if (!choice) {
          continue;
        }
        const delta = choice.delta as Record<string, unknown> | undefined;
        if (typeof delta?.content === "string" && delta.content.length > 0) {
          text += delta.content;
          onDelta(delta.content);
        }
        if (typeof choice.finish_reason === "string") {
          stopReason = choice.finish_reason;
        }
      }
      return { text, model, stopReason };
    },
  };
}

// --- provider registry --------------------------------------------------------

/**
 * The wire-level shape an entry resolves to for a given environment: which
 * adapter instantiates it, where it points, and which adapter quirks apply.
 * `auth`/`thinkingControl`/`healthCheck` are the same per-adapter knobs the
 * adapters above already accept — declared here as data instead of as
 * branches in buildProviders.
 */
export interface ProviderVariant {
  adapter: "anthropic" | "openai-compat";
  baseUrl: string;
  /** anthropic adapter only. Claude: x-api-key (default); Z.ai: bearer. */
  auth?: "x-api-key" | "bearer";
  /** openai-compat adapter only. GLM: disable thinking unless requested. */
  thinkingControl?: boolean;
  /** openai-compat adapter only. Ollama: available() probes /models. */
  healthCheck?: boolean;
}

export interface ProviderRegistryEntry {
  id: LlmProviderId;
  /** Env var holding the API key. Omit for providers that need none up front
   * (Ollama: gated by resolveVariant's health-check quirk instead). When
   * present and unset/empty, the provider is not instantiated. */
  apiKeyEnvKey?: string;
  /** Env var for a per-deployment model override; falls back to defaultModel
   * with the same `??` precedence buildProviders always used (an explicit
   * empty-string override is kept, only `undefined` falls back). */
  modelEnvKey?: string;
  defaultModel: string;
  /** Resolve the wire variant for this environment. Most entries return a
   * constant; zai switches on Z_AI_API_MODE (paas vs the Coding Plan). This
   * is where provider-specific selection logic lives — as data on the
   * entry, never as an id branch inside buildProviders. */
  resolveVariant: (env: Record<string, string | undefined>) => ProviderVariant;
}

/**
 * Declarative provider table. Adding a provider = adding one entry here;
 * buildProviders never branches on `id`. This mirrors the shape
 * `createProviderRegistry` (AI SDK, Fase 3) will eventually replace.
 */
export const PROVIDER_REGISTRY: ProviderRegistryEntry[] = [
  {
    id: "zai",
    apiKeyEnvKey: "Z_AI_API_KEY",
    modelEnvKey: "Z_AI_MODEL",
    defaultModel: "glm-5.2",
    resolveVariant: (env) =>
      env.Z_AI_API_MODE === "paas"
        ? {
            adapter: "openai-compat",
            baseUrl: "https://api.z.ai/api/paas/v4",
            thinkingControl: true,
          }
        : {
            adapter: "anthropic",
            baseUrl: "https://api.z.ai/api/anthropic",
            auth: "bearer",
          },
  },
  {
    id: "claude",
    apiKeyEnvKey: "ANTHROPIC_API_KEY",
    modelEnvKey: "ANTHROPIC_MODEL",
    defaultModel: "claude-opus-4-8",
    resolveVariant: () => ({
      adapter: "anthropic",
      baseUrl: "https://api.anthropic.com",
    }),
  },
  {
    id: "ollama",
    modelEnvKey: "OLLAMA_MODEL",
    defaultModel: "llama3.2",
    resolveVariant: (env) => ({
      adapter: "openai-compat",
      baseUrl: env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/v1",
      healthCheck: true,
    }),
  },
];

// --- factory + info ----------------------------------------------------------

/**
 * Build the provider set from the environment by iterating PROVIDER_REGISTRY.
 * An entry is skipped when it declares apiKeyEnvKey and that env var is
 * missing/empty (Ollama has none, so it is always instantiated and instead
 * availability-probed via its healthCheck quirk).
 */
export function buildProviders(
  env: Record<string, string | undefined>,
  fetchImpl?: FetchLike,
): LlmProvider[] {
  const providers: LlmProvider[] = [];
  for (const entry of PROVIDER_REGISTRY) {
    const apiKey = entry.apiKeyEnvKey ? (env[entry.apiKeyEnvKey] ?? "") : "";
    if (entry.apiKeyEnvKey && !apiKey) {
      continue;
    }
    const model = entry.modelEnvKey ? (env[entry.modelEnvKey] ?? entry.defaultModel) : entry.defaultModel;
    const variant = entry.resolveVariant(env);
    providers.push(
      variant.adapter === "anthropic"
        ? anthropicProvider({
            id: entry.id,
            model,
            baseUrl: variant.baseUrl,
            apiKey,
            auth: variant.auth,
            fetchImpl,
          })
        : openAiCompatProvider({
            id: entry.id,
            model,
            baseUrl: variant.baseUrl,
            apiKey: apiKey || undefined,
            thinkingControl: variant.thinkingControl,
            healthCheck: variant.healthCheck,
            fetchImpl,
          }),
    );
  }
  return providers;
}

/** Availability report for /api/providers. Never carries key material. */
export async function providersInfo(providers: LlmProvider[]): Promise<ProviderInfo[]> {
  const infos: ProviderInfo[] = await Promise.all(
    providers.map(async (p) => ({
      id: p.id,
      available: await p.available().catch(() => false),
      model: p.model,
    })),
  );
  for (const id of FUTURE_PROVIDER_IDS) {
    infos.push({ id, available: false, model: null });
  }
  return infos;
}

/**
 * Fill process.env from `<root>/.env` (KEY=VALUE lines, optional quotes,
 * `#` comments). Existing variables always win; values are never logged.
 * No dotenv dependency: the format needed here is trivial.
 */
export function loadDotEnv(root: string, env: NodeJS.ProcessEnv = process.env): void {
  let raw: string;
  try {
    raw = readFileSync(join(root, ".env"), "utf-8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    if (line.trimStart().startsWith("#")) {
      continue;
    }
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) {
      continue;
    }
    const key = match[1] as string;
    let value = match[2] as string;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (env[key] === undefined) {
      env[key] = value;
    }
  }
}

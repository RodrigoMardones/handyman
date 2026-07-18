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
 * Keys come from the environment; loadDotEnv() fills process.env from the
 * project root .env without overriding existing vars. Key material is never
 * logged and never leaves the server (the browser talks to the relay only).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type LlmProviderId = "zai" | "claude" | "ollama" | "copilot";
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
      const res = await doFetch(`${base}/v1/messages`, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(DRAFT_TIMEOUT_MS),
        body: JSON.stringify({
          model: options.model,
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
      return { text, model: options.model, stopReason };
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
      const res = await doFetch(`${base}/chat/completions`, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(DRAFT_TIMEOUT_MS),
        body: JSON.stringify({
          model: options.model,
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
      return { text, model: options.model, stopReason };
    },
  };
}

// --- factory + info ----------------------------------------------------------

/**
 * Build the provider set from the environment. Nothing is instantiated for a
 * vendor whose key is missing (except Ollama, which is availability-probed).
 * Z_AI_API_MODE=paas switches Z.ai to pay-as-you-go (OpenAI-compatible);
 * the default is the Coding Plan's Anthropic-compatible endpoint.
 */
export function buildProviders(
  env: Record<string, string | undefined>,
  fetchImpl?: FetchLike,
): LlmProvider[] {
  const providers: LlmProvider[] = [];
  const zaiKey = env.Z_AI_API_KEY ?? "";
  if (zaiKey) {
    const model = env.Z_AI_MODEL ?? "glm-5.2";
    providers.push(
      env.Z_AI_API_MODE === "paas"
        ? openAiCompatProvider({
            id: "zai",
            model,
            baseUrl: "https://api.z.ai/api/paas/v4",
            apiKey: zaiKey,
            thinkingControl: true,
            fetchImpl,
          })
        : anthropicProvider({
            id: "zai",
            model,
            baseUrl: "https://api.z.ai/api/anthropic",
            apiKey: zaiKey,
            auth: "bearer",
            fetchImpl,
          }),
    );
  }
  const claudeKey = env.ANTHROPIC_API_KEY ?? "";
  if (claudeKey) {
    providers.push(
      anthropicProvider({
        id: "claude",
        model: env.ANTHROPIC_MODEL ?? "claude-opus-4-8",
        baseUrl: "https://api.anthropic.com",
        apiKey: claudeKey,
        fetchImpl,
      }),
    );
  }
  providers.push(
    openAiCompatProvider({
      id: "ollama",
      model: env.OLLAMA_MODEL ?? "llama3.2",
      baseUrl: env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/v1",
      healthCheck: true,
      fetchImpl,
    }),
  );
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

/**
 * Handyman toolBox LLM layer: provider port + adapters (server-side only).
 *
 * Design: docs/archive/analisis-peticiones-llm-toolbox.md §2-3. One small port
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
export class LlmError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = "LlmError";
        this.code = code;
    }
}
const DEFAULT_MAX_TOKENS = 16000;
const OPENAI_MAX_TOKENS_CAP = 131072; // documented range [1, 131072] on api.z.ai paas/v4
const DRAFT_TIMEOUT_MS = 300_000;
const HEALTH_TIMEOUT_MS = 1500;
/** Ids declared in the design but without an adapter yet. */
export const FUTURE_PROVIDER_IDS = ["copilot"];
// --- shared plumbing ---------------------------------------------------------
/** Map an HTTP failure to a stable LlmError. Never echoes key material: the
 * response body is vendor text, truncated defensively. */
async function raiseHttp(res) {
    const body = (await res.text().catch(() => "")).slice(0, 300);
    let code = "provider_error";
    if (res.status === 401) {
        code = "unauthorized";
    }
    else if (body.includes('"1113"')) {
        code = "insufficient_balance"; // Z.ai: "Insufficient balance or no resource package"
    }
    throw new LlmError(code, `HTTP ${res.status}: ${body}`);
}
/** Yield the payload of every `data:` line of an SSE body. */
async function* sseData(body) {
    if (!body) {
        return;
    }
    const decoder = new TextDecoder();
    let buf = "";
    for await (const chunk of body) {
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
function parseJson(payload) {
    try {
        const value = JSON.parse(payload);
        return value && typeof value === "object" ? value : null;
    }
    catch {
        return null;
    }
}
export function anthropicProvider(options) {
    const doFetch = options.fetchImpl ?? fetch;
    const base = options.baseUrl.replace(/\/$/, "");
    return {
        id: options.id,
        model: options.model,
        available: async () => options.apiKey.length > 0,
        async draft(req, onDelta) {
            const headers = {
                "Content-Type": "application/json",
                "anthropic-version": "2023-06-01",
            };
            if ((options.auth ?? "x-api-key") === "bearer") {
                headers.Authorization = `Bearer ${options.apiKey}`;
            }
            else {
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
            let stopReason = null;
            for await (const payload of sseData(res.body)) {
                const event = parseJson(payload);
                if (!event) {
                    continue;
                }
                if (event.type === "content_block_delta") {
                    const delta = event.delta;
                    if (delta?.type === "text_delta" && typeof delta.text === "string") {
                        text += delta.text;
                        onDelta(delta.text);
                    }
                }
                else if (event.type === "message_delta") {
                    const delta = event.delta;
                    if (typeof delta?.stop_reason === "string") {
                        stopReason = delta.stop_reason;
                    }
                }
            }
            return { text, model, stopReason };
        },
    };
}
export function openAiCompatProvider(options) {
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
            }
            catch {
                return false;
            }
        },
        async draft(req, onDelta) {
            const headers = { "Content-Type": "application/json" };
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
            let stopReason = null;
            for await (const payload of sseData(res.body)) {
                if (payload === "[DONE]") {
                    continue;
                }
                const event = parseJson(payload);
                const choice = event?.choices?.[0];
                if (!choice) {
                    continue;
                }
                const delta = choice.delta;
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
/**
 * Declarative provider table. Adding a provider = adding one entry here;
 * buildProviders never branches on `id`. This mirrors the shape
 * `createProviderRegistry` (AI SDK, Fase 3) will eventually replace.
 */
export const PROVIDER_REGISTRY = [
    {
        id: "zai",
        apiKeyEnvKey: "Z_AI_API_KEY",
        modelEnvKey: "Z_AI_MODEL",
        defaultModel: "glm-5.2",
        resolveVariant: (env) => env.Z_AI_API_MODE === "paas"
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
export function buildProviders(env, fetchImpl) {
    const providers = [];
    for (const entry of PROVIDER_REGISTRY) {
        const apiKey = entry.apiKeyEnvKey ? (env[entry.apiKeyEnvKey] ?? "") : "";
        if (entry.apiKeyEnvKey && !apiKey) {
            continue;
        }
        const model = entry.modelEnvKey ? (env[entry.modelEnvKey] ?? entry.defaultModel) : entry.defaultModel;
        const variant = entry.resolveVariant(env);
        providers.push(variant.adapter === "anthropic"
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
            }));
    }
    return providers;
}
/** Availability report for /api/providers. Never carries key material. */
export async function providersInfo(providers) {
    const infos = await Promise.all(providers.map(async (p) => ({
        id: p.id,
        available: await p.available().catch(() => false),
        model: p.model,
    })));
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
export function loadDotEnv(root, env = process.env) {
    let raw;
    try {
        raw = readFileSync(join(root, ".env"), "utf-8");
    }
    catch {
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
        const key = match[1];
        let value = match[2];
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (env[key] === undefined) {
            env[key] = value;
        }
    }
}
//# sourceMappingURL=llm.js.map
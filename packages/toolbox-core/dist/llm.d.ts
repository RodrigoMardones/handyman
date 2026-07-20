/**
 * String, not a closed union: PROVIDER_REGISTRY is the source of truth for
 * which ids exist. Keeping this open means adding a provider never requires
 * widening a type here — only adding a table entry (see PROVIDER_REGISTRY).
 */
export type LlmProviderId = string;
export type LlmErrorCode = "unauthorized" | "insufficient_balance" | "provider_error";
export declare class LlmError extends Error {
    readonly code: LlmErrorCode;
    constructor(code: LlmErrorCode, message: string);
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
/** Ids declared in the design but without an adapter yet. */
export declare const FUTURE_PROVIDER_IDS: LlmProviderId[];
export interface AnthropicAdapterOptions {
    id: LlmProviderId;
    model: string;
    baseUrl: string;
    apiKey: string;
    /** Claude uses x-api-key (default); the Z.ai Anthropic endpoint uses Bearer. */
    auth?: "x-api-key" | "bearer";
    fetchImpl?: FetchLike;
}
export declare function anthropicProvider(options: AnthropicAdapterOptions): LlmProvider;
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
export declare function openAiCompatProvider(options: OpenAiCompatAdapterOptions): LlmProvider;
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
export declare const PROVIDER_REGISTRY: ProviderRegistryEntry[];
/**
 * Build the provider set from the environment by iterating PROVIDER_REGISTRY.
 * An entry is skipped when it declares apiKeyEnvKey and that env var is
 * missing/empty (Ollama has none, so it is always instantiated and instead
 * availability-probed via its healthCheck quirk).
 */
export declare function buildProviders(env: Record<string, string | undefined>, fetchImpl?: FetchLike): LlmProvider[];
/** Availability report for /api/providers. Never carries key material. */
export declare function providersInfo(providers: LlmProvider[]): Promise<ProviderInfo[]>;
/**
 * Fill process.env from `<root>/.env` (KEY=VALUE lines, optional quotes,
 * `#` comments). Existing variables always win; values are never logged.
 * No dotenv dependency: the format needed here is trivial.
 */
export declare function loadDotEnv(root: string, env?: NodeJS.ProcessEnv): void;
export {};

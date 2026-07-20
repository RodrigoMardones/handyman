import { LlmError } from "./llm.js";
export interface HarnessDigest {
    /** project_name from the snapshot. */
    project: string;
    /** feature status counts (pending/in_progress/done/blocked/...). */
    status_counts: Record<string, number>;
    /** health signal labels (e.g. IDLE, STALE_WIP); [] when healthy. */
    signals: string[];
    /** true when the harness snapshot carries an error (UNREADABLE). */
    error: boolean;
}
export interface TimelineDigestEntry {
    date: string;
    kind: string;
    text: string;
}
export interface SummaryDigest {
    harnesses: HarnessDigest[];
    fleet: {
        harnesses: number;
        unreadable: number;
        status_counts: Record<string, number>;
    };
    timeline: TimelineDigestEntry[];
}
/**
 * Deterministic compact digest of the buildState() document. Only stable,
 * summary-relevant fields survive: per harness the project name, feature
 * status counts, signal labels and the error flag; the fleet aggregate; and
 * the recent timeline entries (capped). Volatile fields (generated_at,
 * registry path, per-day metrics, sessions) are deliberately EXCLUDED so the
 * hash does not move when the fleet state has not.
 */
export declare function buildSummaryDigest(state: Record<string, unknown>): SummaryDigest;
/** sha256 hex of the canonical JSON of the digest (the cache key). */
export declare function summaryHash(digest: SummaryDigest): string;
/**
 * Resolve the summary model. Precedence (first match wins):
 *   1. bodyModel — the caller's explicit choice.
 *   2. env TOOLBOX_SUMMARY_MODEL — operator override.
 *   3. "glm-4.7-flash" when the provider is "zai" AND Z_AI_API_MODE=paas:
 *      glm-4.7-flash is a free/cheap model on Z.ai pay-as-you-go paas/v4
 *      (verified on docs.z.ai pricing, July 2026), but the Z.ai Coding Plan
 *      Anthropic endpoint empirically serves only GLM-5.2 (see the llm.ts
 *      header), so forcing flash there would break.
 *   4. undefined — the provider's own configured model.
 *
 * Moved from toolbox_serve.ts (feature 45) so the Node observer and the Next
 * relays share one precedence. Also used by the ask relay (both are short,
 * low-stakes relays over harness state).
 */
export declare function resolveSummaryModel(bodyModel: string | undefined, providerId: string, env: Record<string, string | undefined>): string | undefined;
/**
 * System prompt for the fleet summary. Anti-hallucination contract: the model
 * may use ONLY the provided fleet-state data, must not invent features,
 * harnesses or numbers, and must answer exactly "no sé" when the data is
 * insufficient to summarize.
 */
export declare function composeSummarySystem(): string;
/** Render the digest as a labeled plain-text block (the user prompt). */
export declare function composeSummaryPrompt(digest: SummaryDigest): string;
/** The draft() seam: same shape as LlmProvider.draft. Injectable for tests. */
export type SummaryDraftFn = (req: {
    prompt: string;
    system?: string;
}, onDelta: (text: string) => void) => Promise<{
    text: string;
    model: string;
    stopReason: string | null;
}>;
export interface SummaryFinalEvent {
    summary_md: string;
    model: string;
}
export interface RelaySummaryOptions {
    system: string;
    prompt: string;
    draft: SummaryDraftFn;
    onDelta: (text: string) => void;
    onResult: (event: SummaryFinalEvent) => void;
    onError: (error: LlmError) => void;
}
/**
 * Run the injected draft() and emit callbacks the HTTP handler turns into
 * SSE events. Never throws on provider failure: an LlmError is delivered via
 * onError (unknown failures are wrapped as provider_error). HTTP-agnostic so
 * unit tests pass a deterministic fake draft().
 */
export declare function relaySummary(options: RelaySummaryOptions): Promise<void>;
export interface SummaryCacheEntry {
    summary_md: string;
    model: string;
    created_at: string;
}
/**
 * Tiny bounded cache keyed by the digest hash. Keeps the most recent
 * `max` entries by insertion order (Map preserves it); the oldest insertion
 * is evicted first. One instance lives per serve process.
 */
export declare class SummaryCache {
    private readonly entries;
    private readonly max;
    constructor(max?: number);
    get(hash: string): SummaryCacheEntry | undefined;
    set(hash: string, entry: SummaryCacheEntry): void;
}

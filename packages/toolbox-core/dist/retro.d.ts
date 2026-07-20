import { LlmError } from "./llm.js";
/** Minimum source features before a claim counts as a pattern. */
export declare const RETRO_MIN_EVIDENCE = 2;
/** How much of each closed backlog doc goes into the prompt. */
export declare const RETRO_EXCERPT_CHARS = 1200;
/** Upper bound on patterns returned, matching the 3-5 the analysis asks for. */
export declare const RETRO_MAX_PATTERNS = 5;
export type RetroKind = "patron" | "antipatron";
export interface RetroPattern {
    titulo: string;
    tipo: RetroKind;
    /** Feature names that back the claim; length >= RETRO_MIN_EVIDENCE. */
    features: string[];
    detalle: string;
}
export interface RetroResult {
    patterns: RetroPattern[];
    /** Patterns the model proposed but that lacked evidence. Reported so a thin
     *  answer never looks like a clean history. */
    discarded: number;
    model: string;
}
export interface RetroCorpus {
    history: string;
    /** Backlog docs belonging to features already closed. */
    docs: Array<{
        id: string;
        feature: string;
        excerpt: string;
    }>;
    /** Names of the features considered closed. */
    closed: string[];
}
/** progress/history.md plus the backlog of every `done` feature. */
export declare function readRetroCorpus(workspace: string): RetroCorpus;
export declare function composeRetroSystem(): string;
export declare function composeRetroPrompt(corpus: RetroCorpus): string;
/**
 * Tolerant JSON extraction plus the evidence bar. Returns the surviving
 * patterns and how many were dropped for lack of support.
 */
export declare function parseRetroPatterns(raw: string): {
    patterns: RetroPattern[];
    discarded: number;
};
export type RetroDraftFn = (req: {
    prompt: string;
    system?: string;
}, onDelta: (text: string) => void) => Promise<{
    text: string;
    model: string;
    stopReason: string | null;
}>;
export interface RelayRetroOptions {
    system: string;
    prompt: string;
    draft: RetroDraftFn;
    onDelta: (text: string) => void;
    onResult: (event: RetroResult) => void;
    onError: (error: LlmError) => void;
}
/** Same shape as the other relays: HTTP-agnostic, never throws. */
export declare function relayRetro(options: RelayRetroOptions): Promise<void>;

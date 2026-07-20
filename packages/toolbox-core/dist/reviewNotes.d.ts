import { LlmError } from "./llm.js";
/** Diff budget for the prompt. Big enough for a normal feature, small enough
 *  that a stray lockfile churn cannot blow the context window. */
export declare const REVIEW_DIFF_MAX_CHARS = 60000;
export interface ReviewNotesResult {
    checklist_md: string;
    model: string;
    /** True when the diff was truncated, so the UI can say so. */
    diff_truncated: boolean;
}
/** backlog/impl_<feature>.md, or null when the implementer left no report. */
export declare function readImplReport(workspace: string, feature: string): string | null;
/**
 * `git diff HEAD` inside the registered root: staged + unstaged, i.e. what an
 * in-progress feature actually looks like.
 *
 * execFile (never a shell) with the root as cwd, so nothing here can be
 * turned into command injection by a crafted body - `root` is already
 * registry-validated by the caller, and no field of the request reaches argv.
 * A non-repo, a git failure or a missing binary all degrade to an empty diff:
 * the impl report alone still makes a usable checklist.
 */
export declare function readFeatureDiff(root: string, maxChars?: number): {
    diff: string;
    truncated: boolean;
};
export declare function composeReviewNotesSystem(): string;
export declare function composeReviewNotesPrompt(feature: string, implReport: string | null, diff: string, truncated: boolean): string;
/** The model-facing half of a review-notes run, with nothing HTTP or CLI in it. */
export interface ReviewNotesRequest {
    system: string;
    prompt: string;
    diffTruncated: boolean;
}
/**
 * Resolve workspace -> read impl report -> read diff -> compose system+prompt.
 *
 * Extracted when the SECOND consumer appeared (feature 53's CLI subcommand),
 * not the seventh: `POST /api/review-notes` and `toolbox.js review-notes` now
 * share this verbatim, so the two can never drift into asking the model
 * different questions about the same feature. What stays outside is only the
 * framing each one owns - SSE events for the route, stdout for the CLI - plus
 * provider selection, which the two resolve from genuinely different places
 * (a request body vs. argv).
 */
export declare function composeReviewNotesRequest(root: string, feature: string): ReviewNotesRequest;
export type ReviewNotesDraftFn = (req: {
    prompt: string;
    system?: string;
}, onDelta: (text: string) => void) => Promise<{
    text: string;
    model: string;
    stopReason: string | null;
}>;
export interface RelayReviewNotesOptions {
    system: string;
    prompt: string;
    draft: ReviewNotesDraftFn;
    diffTruncated: boolean;
    onDelta: (text: string) => void;
    onResult: (event: ReviewNotesResult) => void;
    onError: (error: LlmError) => void;
}
/** Same shape as relaySummary/relayTriage: HTTP-agnostic, never throws. */
export declare function relayReviewNotes(options: RelayReviewNotesOptions): Promise<void>;

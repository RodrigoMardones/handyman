/**
 * Handyman toolBox fleet Q&A ("ask"): answer a user question about one
 * registered harness grounded on that harness's own corpus, with mandatory
 * citations (server-side only, never writes disk, never cached — each
 * question is fresh).
 *
 * Uses the same two-layer split as the summary helper so tests run with a
 * fake provider and no network:
 *   - retrieveTopK + composeAskSystem + composeAskPrompt are the retrieval +
 *     prompt-construction layer: MiniSearch (BM25, already a dependency, same
 *     dynamic-import pattern as toolbox_draft.ts's detectDuplicates) picks
 *     the top-k corpus fragments for the question; the prompts bind every
 *     claim to a `[fuente: <ref>]` citation over exactly those fragments.
 *   - relayAsk accepts an injected draft() function (the provider's method)
 *     and emits deltas/result/error callbacks the HTTP handler turns into
 *     SSE. The final event echoes the fragments so the client can link and
 *     validate the citations against the refs it was actually given.
 *
 * Anti-hallucination contract: the model may answer ONLY from the provided
 * fragments, every claim must carry a `[fuente: <ref>]` citation whose ref
 * is one of the provided fragment refs verbatim, and the exact answer
 * "no sé" is required when the fragments are insufficient.
 */
import { LlmError } from "./llm.js";
/** Corpus doc shape retrieveTopK consumes — a structural subset of the
 * server's CorpusDoc (buildCorpus output), so the fleet corpus is reused
 * as-is. `ref` is the /api/md-compatible reference the citations carry. */
export interface AskDoc {
    id: string;
    ref: string;
    kind: string;
    title: string;
    text: string;
}
/** One retrieved fragment: the full doc identity plus its BM25 score and the
 * excerpt (capped doc text) that goes into the prompt. */
export interface AskFragment {
    id: string;
    ref: string;
    kind: string;
    title: string;
    score: number;
    excerpt: string;
}
/**
 * top-k BM25 fragments for a question over the given corpus docs. MiniSearch
 * runs in Node (dynamic import, same fields/searchOptions as the intake
 * dedup); returns [] when the corpus or the question is empty.
 */
export declare function retrieveTopK(question: string, docs: AskDoc[], k?: number): Promise<AskFragment[]>;
/**
 * System prompt for the grounded Q&A. Anti-hallucination contract: fragments
 * are the only source of truth, every claim carries a verbatim
 * `[fuente: <ref>]` citation bound to a provided fragment, and the exact
 * answer "no sé" is required when the fragments cannot support an answer.
 */
export declare function composeAskSystem(): string;
/** Labeled fragment block + the user question (the user prompt). Each
 * fragment header repeats the exact citation form so the model can only copy
 * refs it was given. */
export declare function composeAskPrompt(question: string, fragments: AskFragment[]): string;
/** The draft() seam: same shape as LlmProvider.draft. Injectable for tests. */
export type AskDraftFn = (req: {
    prompt: string;
    system?: string;
}, onDelta: (text: string) => void) => Promise<{
    text: string;
    model: string;
    stopReason: string | null;
}>;
export interface AskFinalEvent {
    answer_md: string;
    model: string;
    /** The fragments the prompt was built from, echoed so the client can link
     * each citation to its real document and validate refs. */
    fragments: AskFragment[];
}
export interface RelayAskOptions {
    system: string;
    prompt: string;
    draft: AskDraftFn;
    fragments: AskFragment[];
    onDelta: (text: string) => void;
    onResult: (event: AskFinalEvent) => void;
    onError: (error: LlmError) => void;
}
/**
 * Run the injected draft() and emit callbacks the HTTP handler turns into
 * SSE events. Never throws on provider failure: an LlmError is delivered via
 * onError (unknown failures are wrapped as provider_error). HTTP-agnostic so
 * unit tests pass a deterministic fake draft().
 */
export declare function relayAsk(options: RelayAskOptions): Promise<void>;

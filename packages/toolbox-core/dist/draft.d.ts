import { LlmError } from "./llm.js";
export type DraftArchetype = "research" | "implementation" | "unknown";
/** A duplicate candidate surfaced by BM25 over the harness corpus. */
export interface DuplicateCandidate {
    name: string;
    kind: string;
    score: number;
}
/** A workspace file the user tagged into the prompt as context. The server
 * resolves and reads these (registry allowlist + path-traversal guard); the
 * draft layer only formats them. `text` is already capped by the caller. */
export interface TaggedFile {
    /** Workspace-relative path as the user sees it (e.g. src/cli.ts). */
    path: string;
    /** Truncated file content appended to the volatile context. */
    text: string;
}
/** Stable, cacheable intake system: the template + archetypes + contract. */
export interface DraftSystem {
    /** Full text of assets/feature-request.template.md (template + 2 examples). */
    template: string;
}
/** Volatile per-harness context block appended to the prompt (last). */
export interface DraftContext {
    project: string;
    root: string;
    /** Feature queue (id/name/status/title/depends_on) for naming + overlap. */
    features: Array<{
        id: number | null;
        name: string;
        title: string;
        status: string;
        depends_on: number[];
    }>;
    /** top-k BM25 duplicate candidates for the prompt. */
    possible_duplicates: DuplicateCandidate[];
    /** discovery skills (harness.config.json). */
    skills: string[];
    /** discovery agents (harness.config.json). */
    agents: string[];
    /** workspace files the user tagged as context (read+validated upstream). */
    files: TaggedFile[];
    user_prompt: string;
}
export interface DraftFinalEvent {
    archetype: DraftArchetype;
    draft_md: string;
    possible_duplicates: DuplicateCandidate[];
}
/** The draft() seam: same shape as LlmProvider.draft. Injectable for tests. */
export type DraftFn = (req: {
    prompt: string;
    system?: string;
}, onDelta: (text: string) => void) => Promise<{
    text: string;
    model: string;
    stopReason: string | null;
}>;
export interface RelayDraftOptions {
    system: string;
    userPrompt: string;
    draft: DraftFn;
    possibleDuplicates: DuplicateCandidate[];
    onDelta: (text: string) => void;
    onResult: (event: DraftFinalEvent) => void;
    onError: (error: LlmError) => void;
}
/**
 * Read the intake template (stable across calls). Memoized per assets dir so
 * the prompt-caching prefix the vendor sees is byte-stable within a process.
 * Throws if the template is missing — it is a bundled asset, not optional.
 */
export declare function buildDraftSystem(assetsDir: string): DraftSystem;
/**
 * Compose the STABLE system message the LLM sees first. It instructs the model
 * to produce the intake contract verbatim: one request = one feature, choose an
 * archetype, observable/testable acceptance with the green gate as the LAST
 * bullet, delete inapplicable optional sections, flag overlaps. The template
 * text (CORE/OPTIONAL + the two worked examples) is embedded so the model has
 * the exact shape and naming the harness already consumes.
 */
export declare function composeSystem(system: DraftSystem): string;
/** Read feature_list.json of a harness workspace into a minimal queue. */
export declare function readFeatureQueue(workspace: string): DraftContext["features"];
interface CorpusDoc {
    id: string;
    name: string;
    kind: string;
    title: string;
    text: string;
}
/**
 * top-k BM25 duplicate candidates for a prompt against one harness corpus.
 * MiniSearch runs in Node (already a dependency); returns [] when the corpus
 * or query is empty. These are cheap candidates the LLM judges — never an
 * auto-merge.
 */
export declare function detectDuplicates(query: string, corpus: CorpusDoc[], k?: number): Promise<DuplicateCandidate[]>;
/**
 * Build the volatile harness context (appended LAST, per prompt-caching). Reads
 * the target harness's feature queue, BM25 duplicate candidates for the prompt,
 * and discovery skills/agents. project_name falls back to root basename.
 */
export declare function buildDraftContext(root: string, prompt: string, k?: number, files?: TaggedFile[]): Promise<DraftContext>;
/**
 * Compose the volatile USER message (sent last): the harness context block
 * plus the user's free prompt. Listed candidates prime the model to flag
 * overlaps; they are not an instruction to merge.
 */
export declare function composeUserPrompt(ctx: DraftContext): string;
/**
 * Parse the archetype marker the model is asked to write as its first comment.
 * Falls back to "unknown" rather than guessing.
 */
export declare function parseArchetype(draftMd: string): DraftArchetype;
/**
 * Run the injected draft() (the provider's method) and emit callbacks the HTTP
 * handler turns into SSE events. Never throws on provider failure: a LlmError
 * is delivered via onError. The final event carries the parsed archetype, the
 * full draft markdown, and the duplicate candidates built from the context.
 *
 * This is deliberately HTTP-agnostic so unit tests pass a deterministic fake
 * draft() instead of hitting a real provider.
 */
export declare function relayDraft(options: RelayDraftOptions): Promise<void>;
export {};

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

const DEFAULT_TOP_K = 6;
/** Per-fragment excerpt cap for the prompt (chars). Keeps k fragments well
 * inside a small-model context while preserving enough text to answer from. */
const EXCERPT_CAP = 1200;

// --- retrieval ---------------------------------------------------------------

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

interface MiniSearchLike {
  addAll(docs: unknown[]): void;
  search(query: string): Array<{ id: string; score: number }>;
}

/**
 * top-k BM25 fragments for a question over the given corpus docs. MiniSearch
 * runs in Node (dynamic import, same fields/searchOptions as the intake
 * dedup); returns [] when the corpus or the question is empty.
 */
export async function retrieveTopK(
  question: string,
  docs: AskDoc[],
  k = DEFAULT_TOP_K,
): Promise<AskFragment[]> {
  const trimmed = question.trim();
  if (docs.length === 0 || trimmed.length === 0) {
    return [];
  }
  const mod = await import("minisearch");
  const MiniSearch = (mod as { default?: { new (opts: unknown): MiniSearchLike } }).default;
  if (!MiniSearch) {
    return [];
  }
  const index = new MiniSearch({
    fields: ["title", "text"],
    storeFields: [],
    searchOptions: { prefix: true, fuzzy: 0.2 },
  });
  index.addAll(docs.map((d) => ({ id: d.id, title: d.title, text: d.text })));
  const results = index.search(trimmed);
  const byId = new Map(docs.map((d) => [d.id, d]));
  const fragments: AskFragment[] = [];
  for (const result of results.slice(0, k)) {
    const doc = byId.get(result.id);
    if (!doc) {
      continue;
    }
    fragments.push({
      id: doc.id,
      ref: doc.ref,
      kind: doc.kind,
      title: doc.title,
      score: result.score,
      excerpt: doc.text.slice(0, EXCERPT_CAP),
    });
  }
  return fragments;
}

// --- prompts -----------------------------------------------------------------

/**
 * System prompt for the grounded Q&A. Anti-hallucination contract: fragments
 * are the only source of truth, every claim carries a verbatim
 * `[fuente: <ref>]` citation bound to a provided fragment, and the exact
 * answer "no sé" is required when the fragments cannot support an answer.
 */
export function composeAskSystem(): string {
  return [
    "You answer a question about a Handyman agent harness.",
    "You are given a set of FRAGMENTS extracted from the harness's own",
    "documents (features, progress, backlog, docs). Those fragments are your",
    "ONLY source of truth.",
    "",
    "Rules:",
    "1. Answer ONLY from the provided fragments. NEVER use outside knowledge",
    "   and NEVER invent features, files, dates, or numbers.",
    "2. EVERY claim in your answer must carry a citation of the exact form",
    "   [fuente: <ref>], where <ref> is the ref of one of the provided",
    "   fragments, copied VERBATIM. Never invent, merge, or alter a ref.",
    "3. If the fragments are insufficient to answer the question, reply",
    '   exactly "no sé" and nothing else.',
    "4. Keep the answer concise markdown (a few lines), no preamble, no",
    "   headings.",
  ].join("\n");
}

/** Labeled fragment block + the user question (the user prompt). Each
 * fragment header repeats the exact citation form so the model can only copy
 * refs it was given. */
export function composeAskPrompt(question: string, fragments: AskFragment[]): string {
  const lines: string[] = [];
  lines.push("---- fragments (only source of truth) ----");
  if (fragments.length === 0) {
    lines.push("(no fragments retrieved)");
  }
  for (const fragment of fragments) {
    lines.push(`[fuente: ${fragment.ref}] (${fragment.kind}: ${fragment.title})`);
    lines.push(fragment.excerpt);
    lines.push("");
  }
  lines.push("---- end fragments ----");
  lines.push("");
  lines.push("---- user question ----");
  lines.push(question.trim());
  return lines.join("\n");
}

// --- relay -------------------------------------------------------------------

/** The draft() seam: same shape as LlmProvider.draft. Injectable for tests. */
export type AskDraftFn = (
  req: { prompt: string; system?: string },
  onDelta: (text: string) => void,
) => Promise<{ text: string; model: string; stopReason: string | null }>;

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
export async function relayAsk(options: RelayAskOptions): Promise<void> {
  const { system, prompt, draft, fragments, onDelta, onResult, onError } = options;
  try {
    const result = await draft({ prompt, system }, onDelta);
    onResult({ answer_md: result.text, model: result.model, fragments });
  } catch (error) {
    if (error instanceof LlmError) {
      onError(error);
      return;
    }
    onError(new LlmError("provider_error", error instanceof Error ? error.message : String(error)));
  }
}

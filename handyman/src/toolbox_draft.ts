/**
 * Handyman toolBox draft relay: turn an informal request into the harness
 * intake document (server-side only, never writes disk).
 *
 * Design: docs/analisis-peticiones-llm-toolbox.md §4. The user writes a free
 * prompt in the panel; the server builds a prompt that distils the harness
 * experience (the contract in assets/feature-request.template.md) plus the
 * volatile context of the target harness (feature queue, likely-duplicate
 * candidates via BM25, discovery skills/agents), calls the chosen LlmProvider,
 * and relays the deltas. The draft always goes through the human (edit/copy)
 * before any destination — this module generates text only.
 *
 * Two layers, deliberately split so tests run with a fake provider and no
 * network:
 *   - buildDraftSystem + buildDraftContext + composeUserPrompt are pure
 *     prompt construction (stable system from the bundled template + volatile
 *     harness context). The stable block is first (prompt-caching friendly);
 *     the volatile block is last.
 *   - relayDraft accepts an injected draft() function (the provider's method)
 *     and emits deltas/result/error callbacks the HTTP handler turns into SSE.
 *
 * Dedup uses MiniSearch in Node (already a dependency) over the harness corpus
 * — the cheap-candidates + LLM-judge pattern from the RAG analysis applied to
 * intake. The model is told the candidates and asked to flag overlaps; it does
 * not auto-merge anything.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveWorkspace } from "./core/index.js";
import { LlmError } from "./toolbox_llm.js";

/** Bundled skill assets dir (../assets from both src/ and dist/). */
const ASSETS_DIR = fileURLToPath(new URL("../assets", import.meta.url));
const FEATURE_REQUEST_TEMPLATE = "feature-request.template.md";
const CORPUS_TEXT_CAP = 4000;
const DEFAULT_DUPLICATE_K = 5;

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
export type DraftFn = (
  req: { prompt: string; system?: string },
  onDelta: (text: string) => void,
) => Promise<{ text: string; model: string; stopReason: string | null }>;

export interface RelayDraftOptions {
  system: string;
  userPrompt: string;
  draft: DraftFn;
  possibleDuplicates: DuplicateCandidate[];
  onDelta: (text: string) => void;
  onResult: (event: DraftFinalEvent) => void;
  onError: (error: LlmError) => void;
}

const systemCache = new Map<string, DraftSystem>();

/**
 * Read the intake template (stable across calls). Memoized per assets dir so
 * the prompt-caching prefix the vendor sees is byte-stable within a process.
 * Throws if the template is missing — it is a bundled asset, not optional.
 */
export function buildDraftSystem(assetsDir: string = ASSETS_DIR): DraftSystem {
  const cached = systemCache.get(assetsDir);
  if (cached) {
    return cached;
  }
  const template = readFileSync(join(assetsDir, FEATURE_REQUEST_TEMPLATE), "utf-8");
  const system: DraftSystem = { template };
  systemCache.set(assetsDir, system);
  return system;
}

// --- prompt assembly ---------------------------------------------------------

/**
 * Compose the STABLE system message the LLM sees first. It instructs the model
 * to produce the intake contract verbatim: one request = one feature, choose an
 * archetype, observable/testable acceptance with the green gate as the LAST
 * bullet, delete inapplicable optional sections, flag overlaps. The template
 * text (CORE/OPTIONAL + the two worked examples) is embedded so the model has
 * the exact shape and naming the harness already consumes.
 */
export function composeSystem(system: DraftSystem): string {
  return [
    "You draft a Handyman feature request (intake document).",
    "Follow the contract below EXACTLY. Output ONLY the filled feature-request",
    "markdown (a `## Feature`, `## Context`, `## Scope`, `## Acceptance`,",
    "`## Verification`, and `## Tools` section), nothing else — no preamble.",
    "",
    "Rules distilled from the harness experience:",
    "1. One request = ONE feature. If the ask is two things, pick the clearest",
    "   one and note the split in Context; never merge two features.",
    "2. Pick an archetype and write it as the FIRST line of the draft inside a",
    "   comment: `[Research]` leaves a plan in docs/; `[Implementation]` changes",
    "   code + tests. Use the matching worked example below as the mould.",
    "3. Acceptance criteria are OBSERVABLE and TESTABLE, one bullet each,",
    "   covering the happy path and at least one failure case.",
    "4. The green gate (`./init.sh` or `bash tests/run_tests.sh`) is ALWAYS the",
    "   LAST acceptance bullet — never omit it, never bury it.",
    "5. Delete OPTIONAL sections that do not apply. Never leave placeholders",
    "   like `<...>`; every line you keep must be filled with real content.",
    "6. ONLY name, title, description and acceptance become the feature_list.json",
    "   entry (via `node dist/feature.js add`); the rest is guidance for the",
    "   leader/human.",
    "7. If the volatile context lists likely-duplicate candidates, flag any real",
    "   overlap in Context as `possible overlap with #N <name>` — do not invent.",
    "",
    "---- BEGIN intake contract (template + two worked examples) ----",
    system.template,
    "---- END intake contract ----",
  ].join("\n");
}

/** Read feature_list.json of a harness workspace into a minimal queue. */
export function readFeatureQueue(
  workspace: string,
): DraftContext["features"] {
  let raw: string;
  try {
    raw = readFileSync(join(workspace, "feature_list.json"), "utf-8");
  } catch {
    return [];
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  const features =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>).features
      : [];
  if (!Array.isArray(features)) {
    return [];
  }
  return features
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object" && !Array.isArray(f))
    .map((f) => ({
      id: typeof f.id === "number" ? f.id : null,
      name: String(f.name ?? ""),
      title: String(f.title ?? f.name ?? ""),
      status: String(f.status ?? "pending"),
      depends_on: Array.isArray(f.depends_on) ? f.depends_on.filter(Number.isInteger) : [],
    }));
}

interface CorpusDoc {
  id: string;
  name: string;
  kind: string;
  title: string;
  text: string;
}

/** Build a flat BM25 corpus over one harness (features + progress + backlog + docs). */
function harnessCorpus(project: string, root: string, workspace: string): CorpusDoc[] {
  const docs: CorpusDoc[] = [];
  for (const feature of readFeatureQueue(workspace)) {
    docs.push({
      id: `feature:${feature.name}`,
      name: feature.name,
      kind: "feature",
      title: `#${feature.id ?? "?"} ${feature.name}`,
      text: `${feature.name} ${feature.title} ${feature.status}`,
    });
  }
  for (const [key, p] of [
    ["current", join(workspace, "progress", "current.md")],
    ["history", join(workspace, "progress", "history.md")],
    ["checkpoints", join(root, "CHECKPOINTS.md")],
  ] as Array<[string, string]>) {
    const text = readText(p);
    if (text !== null) {
      docs.push({ id: key, name: key, kind: "progress", title: `${key}.md`, text });
    }
  }
  for (const kind of ["backlog", "docs"] as const) {
    const dir = join(workspace, kind);
    let names: string[] = [];
    try {
      names = readdirSync(dir);
    } catch {
      names = [];
    }
    for (const name of names.filter((n) => n.endsWith(".md")).sort()) {
      const text = readText(join(dir, name));
      if (text !== null) {
        docs.push({ id: `${kind}:${name}`, name: name.replace(/\.md$/, ""), kind, title: name, text });
      }
    }
  }
  return docs;
}

function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf-8").slice(0, CORPUS_TEXT_CAP);
  } catch {
    return null;
  }
}

/**
 * top-k BM25 duplicate candidates for a prompt against one harness corpus.
 * MiniSearch runs in Node (already a dependency); returns [] when the corpus
 * or query is empty. These are cheap candidates the LLM judges — never an
 * auto-merge.
 */
export async function detectDuplicates(
  query: string,
  corpus: CorpusDoc[],
  k = DEFAULT_DUPLICATE_K,
): Promise<DuplicateCandidate[]> {
  const trimmed = query.trim();
  if (corpus.length === 0 || trimmed.length === 0) {
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
  index.addAll(
    corpus.map((d) => ({ id: d.id, title: d.title, text: d.text })),
  );
  const results = index.search(trimmed) as Array<{ id: string; score: number }>;
  const byId = new Map(corpus.map((d) => [d.id, d]));
  return results
    .slice(0, k)
    .map((r) => {
      const doc = byId.get(r.id);
      return doc
        ? { name: doc.name, kind: doc.kind, score: r.score }
        : { name: r.id, kind: "unknown", score: r.score };
    });
}

interface MiniSearchLike {
  addAll(docs: unknown[]): void;
  search(query: string): Array<{ id: string; score: number }>;
}

/** discovery skills/agents for a harness, read from harness.config.json. */
function readDiscovery(root: string): { skills: string[]; agents: string[] } {
  let raw: string;
  try {
    raw = readFileSync(join(root, "harness.config.json"), "utf-8");
  } catch {
    return { skills: [], agents: [] };
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { skills: [], agents: [] };
  }
  const config =
    data && typeof data === "object" && !Array.isArray(data)
      ? ((data as Record<string, unknown>).config as Record<string, unknown> | undefined)
      : undefined;
  const discovery =
    config && typeof config === "object"
      ? (config.discovery as Record<string, unknown> | undefined)
      : undefined;
  const skills = discovery && Array.isArray(discovery.skills) ? discovery.skills.map(String) : [];
  const agents = discovery && Array.isArray(discovery.agents) ? discovery.agents.map(String) : [];
  return { skills, agents };
}

/**
 * Build the volatile harness context (appended LAST, per prompt-caching). Reads
 * the target harness's feature queue, BM25 duplicate candidates for the prompt,
 * and discovery skills/agents. project_name falls back to root basename.
 */
export async function buildDraftContext(
  root: string,
  prompt: string,
  k = DEFAULT_DUPLICATE_K,
  files: TaggedFile[] = [],
): Promise<DraftContext> {
  const workspace = resolveWorkspace(root);
  const project = readProjectName(root, workspace);
  const corpus = harnessCorpus(project, root, workspace);
  const possibleDuplicates = await detectDuplicates(prompt, corpus, k);
  const { skills, agents } = readDiscovery(root);
  return {
    project,
    root,
    features: readFeatureQueue(workspace),
    possible_duplicates: possibleDuplicates,
    skills,
    agents,
    files,
    user_prompt: prompt,
  };
}

function readProjectName(root: string, workspace: string): string {
  try {
    const raw = readFileSync(join(root, "harness.config.json"), "utf-8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (typeof data.project_name === "string" && data.project_name.length > 0) {
      return data.project_name;
    }
  } catch {
    // fall back to basename
  }
  return root.split("/").pop() || root;
}

/**
 * Compose the volatile USER message (sent last): the harness context block
 * plus the user's free prompt. Listed candidates prime the model to flag
 * overlaps; they are not an instruction to merge.
 */
export function composeUserPrompt(ctx: DraftContext): string {
  const lines: string[] = [];
  lines.push(`Target harness: ${ctx.project} (${ctx.root})`);
  lines.push("");
  lines.push("Feature queue (id | name | status | depends_on):");
  if (ctx.features.length === 0) {
    lines.push("  (no features yet)");
  } else {
    for (const f of ctx.features) {
      const dep = f.depends_on.length > 0 ? f.depends_on.join(",") : "-";
      lines.push(`  #${f.id ?? "?"} ${f.name} [${f.status}] (depends: ${dep}) — ${f.title}`);
    }
  }
  lines.push("");
  lines.push("Likely-duplicate candidates (BM25, judge only — flag real overlaps):");
  if (ctx.possible_duplicates.length === 0) {
    lines.push("  (none surfaced)");
  } else {
    for (const c of ctx.possible_duplicates) {
      lines.push(`  ${c.kind}: ${c.name} (score ${c.score.toFixed(2)})`);
    }
  }
  lines.push("");
  lines.push("Discovery skills:", ctx.skills.length > 0 ? `  ${ctx.skills.join(", ")}` : "  (none)");
  lines.push("Discovery agents:", ctx.agents.length > 0 ? `  ${ctx.agents.join(", ")}` : "  (none)");
  lines.push("");
  lines.push("Tagged files (user-selected workspace context, use as background):", ctx.files.length > 0 ? "" : "  (none)");
  for (const f of ctx.files) {
    lines.push(`  -- ${f.path} --`);
    lines.push(f.text);
  }
  lines.push("");
  lines.push("---- user request (free text) ----");
  lines.push(ctx.user_prompt.trim());
  return lines.join("\n");
}

/**
 * Parse the archetype marker the model is asked to write as its first comment.
 * Falls back to "unknown" rather than guessing.
 */
export function parseArchetype(draftMd: string): DraftArchetype {
  const head = draftMd.slice(0, 400);
  if (/\[research\]/i.test(head)) {
    return "research";
  }
  if (/\[implementation\]/i.test(head)) {
    return "implementation";
  }
  return "unknown";
}

/**
 * Run the injected draft() (the provider's method) and emit callbacks the HTTP
 * handler turns into SSE events. Never throws on provider failure: a LlmError
 * is delivered via onError. The final event carries the parsed archetype, the
 * full draft markdown, and the duplicate candidates built from the context.
 *
 * This is deliberately HTTP-agnostic so unit tests pass a deterministic fake
 * draft() instead of hitting a real provider.
 */
export async function relayDraft(options: RelayDraftOptions): Promise<void> {
  const { system, userPrompt, draft, possibleDuplicates, onDelta, onResult, onError } = options;
  let draftMd: string;
  try {
    const result = await draft({ prompt: userPrompt, system }, onDelta);
    draftMd = result.text;
  } catch (error) {
    if (error instanceof LlmError) {
      onError(error);
      return;
    }
    // Wrap unknown failures as a generic provider error.
    onError(
      new LlmError(
        "provider_error",
        error instanceof Error ? error.message : String(error),
      ),
    );
    return;
  }
  onResult({
    archetype: parseArchetype(draftMd),
    draft_md: draftMd,
    possible_duplicates: possibleDuplicates,
  });
}

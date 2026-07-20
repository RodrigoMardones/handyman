export declare const DEBOUNCE_MS = 250;
export declare const TAG_MAX_IN_DRAFT = 12;
export declare const INTAKE_MAX_BYTES: number;
export declare const CSP_HEADER: string;
export declare function isFile(path: string): boolean;
export declare function readText(path: string): string | null;
/** True when `root` is a registered harness project root. */
export declare function isRegisteredRoot(hroot: string, root: string): boolean;
/** Absolute path of `rel` under `parent` iff it is contained (no traversal). */
export declare function containedPath(parent: string, rel: string): string | null;
/** Resolve a tagged file relative path inside a registered root (project root
 * first, then its resolved workspace). Returns the absolute path or null when
 * the root is unregistered, the path escapes, or the file is missing/not a
 * tagged-text file. */
export declare function resolveTagFile(hroot: string, root: string, rel: string): string | null;
/** List taggable workspace files (project root only, relative paths). Walks
 * the tree once, skipping junk dirs, capping depth and count. */
export declare function listTagFiles(root: string): Array<{
    path: string;
    size: number;
}>;
/** Read + validate the tagged files selected for a draft. Resolves each rel
 * inside the registered root, caps text, dedupes, and bounds the count. */
export declare function readTagFiles(hroot: string, root: string, rels: string[]): Array<{
    path: string;
    text: string;
}>;
export interface QueueFeature {
    id: number | null;
    name: string;
    title: string;
    status: string;
    sprint: string | null;
    blocked_reason: string | null;
    depends_on: number[];
}
/** Feature queue for the kanban; [] when the list is missing or corrupt. */
export declare function readFeatures(workspace: string): QueueFeature[];
/** The token vocabulary of /api/md, published so presentation code renders
 *  buttons for tokens resolveMd() actually accepts. These two lists having
 *  drifted (filenames rendered where tokens were expected) is what 404'd the
 *  harness view's current/history/checkpoints/workspace tabs. */
export declare const MD_TOKENS: readonly string[];
/** Resolve a whitelisted markdown request inside a REGISTERED root, or null. */
export declare function resolveMd(hroot: string, root: string, file: string): string | null;
export interface CorpusDoc {
    id: string;
    project: string;
    kind: string;
    title: string;
    text: string;
    ref: string;
}
export declare function buildCorpus(hroot: string): CorpusDoc[];

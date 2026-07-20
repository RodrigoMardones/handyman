/**
 * Handyman toolBox observer data layer: registry-allowlisted reads, consumed by
 * apps/web (the single process since feature 50 decommissioned the Node
 * observer) and by the handyman CLI.
 *
 * Moved verbatim from handyman/src/toolbox_serve.ts (feature 42): the guards,
 * caps and builders here carry the observer's security model — the registry
 * is the read allowlist, markdown names are whitelisted patterns, tagged
 * files resolve only inside a registered root, and path traversal is blocked
 * by containment on the normalized absolute path. buildState itself stays in
 * handyman (it needs the snapshot/metrics machinery of the CLI package).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { loadRegistry } from "./registry.js";
import { resolveWorkspace } from "./workspace.js";

const MD_NAME_RE = /^[\w.-]+\.md$/;
export const DEBOUNCE_MS = 250;
const CORPUS_TEXT_CAP = 4000;

// --- file-tag allowlist (intake enhancements) --------------------------------
// The intake lets the user tag workspace files into the prompt and submit the
// reviewed draft to the harness. Tagging reuses the registry as the read
// allowlist (like /api/md): a file resolves only inside a REGISTERED root or
// its resolved workspace. Path traversal is blocked by containment on the
// normalized absolute path; binaries/node_modules are excluded by extension
// and a skip-dir set; counts and per-file text are capped so a prompt stays
// bounded. Relative paths are returned relative to the project root so the
// round trip (list -> select -> resolve) is unambiguous.
const TAG_EXT_RE = /\.(md|markdown|txt|ts|tsx|js|jsx|mjs|cjs|sh|bash|py|json|yml|yaml|toml|sql|html|css)$/i;
const TAG_SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".cache", "coverage", ".next",
  ".venv", "env", "__pycache__", ".DS_Store", "graphify-out", ".handyman",
]);
const TAG_MAX_FILES = 800;
const TAG_MAX_DEPTH = 8;
const TAG_FILE_TEXT_CAP = 6000;
export const TAG_MAX_IN_DRAFT = 12;
export const INTAKE_MAX_BYTES = 256 * 1024;

// Defense in depth (Plan C): agent-produced markdown is untrusted even though
// it is local — DOMPurify sanitizes it client-side, and this CSP is the uniform
// server-side second defense on EVERY response. The panel genuinely needs
// inline scripts (anti-flash + initial state + the inlined panel asset) and
// inline styles (the token CSS), plus same-origin vendor/fetch/SSE and a
// data: SVG favicon, so script/style carry 'unsafe-inline' deliberately.
export const CSP_HEADER =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; " +
  "style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'";

/** CSP for the HTML documents (the pages), as opposed to CSP_HEADER which the
 *  JSON/SSE responses carry (lib/respond.ts). CSP constrains what a DOCUMENT
 *  may load, so the pages are the surface that actually needs it - serving it
 *  only on the APIs, where it is near-inert, is not protection. Identical to
 *  CSP_HEADER except that the marketing landing (app/page.tsx) embeds
 *  placeholder images from picsum.photos: editorial content, never script.
 *  Dropping those images would let this collapse back into CSP_HEADER.
 *  Applied in apps/web/next.config.ts headers(); pinned by
 *  tests/test_toolbox_serve.sh. */
export const HTML_CSP_HEADER = CSP_HEADER.replace(
  "img-src 'self' data:",
  "img-src 'self' data: https://picsum.photos",
);

export function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

/** True when `root` is a registered harness project root. */
export function isRegisteredRoot(hroot: string, root: string): boolean {
  const [registry] = loadRegistry(hroot);
  return registry.harnesses.some((e) => e.project_root === root);
}

/** Absolute path of `rel` under `parent` iff it is contained (no traversal). */
export function containedPath(parent: string, rel: string): string | null {
  const parentAbs = resolve(parent);
  const childAbs = resolve(parentAbs, rel);
  const prefix = parentAbs.endsWith(sep) ? parentAbs : parentAbs + sep;
  return childAbs === parentAbs || childAbs.startsWith(prefix) ? childAbs : null;
}

/** Resolve a tagged file relative path inside a registered root (project root
 * first, then its resolved workspace). Returns the absolute path or null when
 * the root is unregistered, the path escapes, or the file is missing/not a
 * tagged-text file. */
export function resolveTagFile(hroot: string, root: string, rel: string): string | null {
  if (!isRegisteredRoot(hroot, root) || rel.length === 0 || rel.includes("\0")) {
    return null;
  }
  const cleaned = rel.replace(/^\.?\//, "");
  if (!TAG_EXT_RE.test(cleaned)) {
    return null;
  }
  const direct = containedPath(root, cleaned);
  if (direct !== null && isFile(direct)) {
    return direct;
  }
  // Also allow files inside the resolved workspace (e.g. .handyman/docs/*.md).
  let workspace: string;
  try {
    workspace = resolveWorkspace(root);
  } catch {
    return null;
  }
  const wsBase = containedPath(workspace, cleaned);
  if (wsBase !== null && isFile(wsBase)) {
    return wsBase;
  }
  return null;
}

/** List taggable workspace files (project root only, relative paths). Walks
 * the tree once, skipping junk dirs, capping depth and count. */
export function listTagFiles(root: string): Array<{ path: string; size: number }> {
  const out: Array<{ path: string; size: number }> = [];
  const stack: Array<{ dir: string; rel: string; depth: number }> = [
    { dir: root, rel: "", depth: 0 },
  ];
  while (stack.length > 0 && out.length < TAG_MAX_FILES) {
    const frame = stack.pop();
    if (frame === undefined) {
      break;
    }
    let names: string[];
    try {
      names = readdirSync(frame.dir);
    } catch {
      continue;
    }
    for (const name of names.sort()) {
      if (out.length >= TAG_MAX_FILES) {
        break;
      }
      if (TAG_SKIP_DIRS.has(name) || name.startsWith(".")) {
        continue;
      }
      const abs = join(frame.dir, name);
      const rel = frame.rel ? `${frame.rel}/${name}` : name;
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory() && frame.depth < TAG_MAX_DEPTH) {
        stack.push({ dir: abs, rel, depth: frame.depth + 1 });
      } else if (st.isFile() && TAG_EXT_RE.test(name)) {
        out.push({ path: rel, size: st.size });
      }
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** Read + validate the tagged files selected for a draft. Resolves each rel
 * inside the registered root, caps text, dedupes, and bounds the count. */
export function readTagFiles(
  hroot: string,
  root: string,
  rels: string[],
): Array<{ path: string; text: string }> {
  const seen = new Set<string>();
  const out: Array<{ path: string; text: string }> = [];
  for (const rel of rels.slice(0, TAG_MAX_IN_DRAFT)) {
    const abs = resolveTagFile(hroot, root, rel);
    if (abs === null || seen.has(abs)) {
      continue;
    }
    seen.add(abs);
    const text = readText(abs);
    if (text === null) {
      continue;
    }
    out.push({ path: rel.replace(/^\.?\//, ""), text: text.slice(0, TAG_FILE_TEXT_CAP) });
  }
  return out;
}

// --- feature queue -------------------------------------------------------------

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
export function readFeatures(workspace: string): QueueFeature[] {
  const raw = readText(join(workspace, "feature_list.json"));
  if (raw === null) {
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
      sprint: f.sprint ? String(f.sprint) : null,
      blocked_reason: f.blocked_reason ? String(f.blocked_reason) : null,
      depends_on: Array.isArray(f.depends_on) ? f.depends_on.filter(Number.isInteger) : [],
    }));
}

// --- markdown allowlist ------------------------------------------------------

/** The single-word `file` tokens /api/md accepts, mapped to the artifact each
 *  one names. `backlog:<name>` / `docs:<name>` are handled separately below
 *  because they carry a caller-supplied filename. */
const MD_TOKEN_PATHS: Record<string, (workspace: string, root: string) => string> = {
  current: (workspace) => join(workspace, "progress", "current.md"),
  history: (workspace) => join(workspace, "progress", "history.md"),
  index: (workspace) => join(workspace, "index.md"),
  checkpoints: (_workspace, root) => join(root, "CHECKPOINTS.md"),
};

/** The token vocabulary of /api/md, published so presentation code renders
 *  buttons for tokens resolveMd() actually accepts. These two lists having
 *  drifted (filenames rendered where tokens were expected) is what 404'd the
 *  harness view's current/history/checkpoints/workspace tabs. */
export const MD_TOKENS: readonly string[] = Object.keys(MD_TOKEN_PATHS);

/** Resolve a whitelisted markdown request inside a REGISTERED root, or null. */
export function resolveMd(hroot: string, root: string, file: string): string | null {
  const [registry] = loadRegistry(hroot);
  if (!registry.harnesses.some((e) => e.project_root === root)) {
    return null;
  }
  const workspace = resolveWorkspace(root);
  const token = MD_TOKEN_PATHS[file];
  if (token) {
    return token(workspace, root);
  }
  const [kind, name] = file.split(":", 2);
  if ((kind === "backlog" || kind === "docs") && name && MD_NAME_RE.test(name)) {
    return join(workspace, kind, name);
  }
  return null;
}

// --- search corpus -----------------------------------------------------------

export interface CorpusDoc {
  id: string;
  project: string;
  kind: string;
  title: string;
  text: string;
  ref: string;
}

function mdDocs(
  project: string,
  root: string,
  workspace: string,
  kind: "backlog" | "docs",
): CorpusDoc[] {
  const dir = join(workspace, kind);
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const docs: CorpusDoc[] = [];
  for (const name of names.filter((n) => n.endsWith(".md")).sort()) {
    const text = readText(join(dir, name));
    if (text === null) {
      continue;
    }
    docs.push({
      id: `${root}::${kind}:${name}`,
      project,
      kind,
      title: name,
      text: text.slice(0, CORPUS_TEXT_CAP),
      ref: `${kind}:${name}`,
    });
  }
  return docs;
}

export function buildCorpus(hroot: string): CorpusDoc[] {
  const [registry] = loadRegistry(hroot);
  const docs: CorpusDoc[] = [];
  for (const entry of registry.harnesses) {
    const root = entry.project_root;
    let workspace: string;
    try {
      workspace = resolveWorkspace(root);
    } catch {
      continue;
    }
    let project = root;
    try {
      const raw = readText(join(root, "harness.config.json"));
      if (raw) {
        project = String((JSON.parse(raw) as Record<string, unknown>).project_name ?? root);
      }
    } catch {
      // keep root as label
    }
    for (const feature of readFeatures(workspace)) {
      docs.push({
        id: `${root}::feature:${feature.name}`,
        project,
        kind: "feature",
        title: `#${feature.id ?? "?"} ${feature.name}`,
        text: `${feature.title} ${feature.status} ${feature.sprint ?? ""} ${
          feature.blocked_reason ?? ""
        }`,
        ref: `feature:${feature.name}`,
      });
    }
    for (const [key, path] of [
      ["current", join(workspace, "progress", "current.md")],
      ["history", join(workspace, "progress", "history.md")],
      ["checkpoints", join(root, "CHECKPOINTS.md")],
    ] as Array<[string, string]>) {
      const text = readText(path);
      if (text !== null) {
        docs.push({
          id: `${root}::${key}`,
          project,
          kind: "progress",
          title: `${key}.md`,
          text: text.slice(0, CORPUS_TEXT_CAP),
          ref: key,
        });
      }
    }
    docs.push(...mdDocs(project, root, workspace, "backlog"));
    docs.push(...mdDocs(project, root, workspace, "docs"));
  }
  return docs;
}

#!/usr/bin/env node
import type { FSWatcher } from "node:fs";
/**
 * Handyman toolBox observer: local read-only web panel over the registry.
 *
 * TypeScript revival of the legacy workstation panel, reduced to its
 * observation core (writes stay with the role CLIs — the observer only
 * mirrors disk). One process, one port, zero build:
 *
 *   disk (source of truth) -> fs.watch (debounced) -> SSE -> browser
 *
 * Endpoints (GET only, 405 otherwise — the sole exception is POST /api/draft,
 * a text-only relay that never writes disk):
 *   /                       self-contained panel (hash views: fleet /
 *                           harness / timeline / search)
 *   /api/state              snapshots + health signals + feature queues +
 *                           fleet aggregate + timeline (last 20)
 *   /api/md?root=&file=     whitelisted raw markdown from a REGISTERED root
 *   /api/corpus             search corpus (features + backlog + progress +
 *                           docs) for the client-side BM25 index
 *   /api/providers          LLM provider availability (id/available/model;
 *                           keys never leave the server — see toolbox_llm.ts)
 *   /api/files?root=        taggable workspace files (relative paths) inside a
 *                           REGISTERED root; the picker for the intake tags
 *   /graph/NAME/graph.html  the harness's graphify export (iframe target)
 *   /graph/NAME/graph.json  raw graph data
 *   /vendor/minisearch.js   MiniSearch UMD served from node_modules
 *   /vendor/marked.js       marked UMD (safe markdown render, Plan C)
 *   /vendor/dompurify.js    DOMPurify UMD (sanitize agent markdown)
 *   /vendor/vis-network.js  vis-network UMD (graphify graph renderer;
 *                           the served graph.html script src is rewritten
 *                           from unpkg.com to this same-origin path so the
 *                           strict CSP does not block it)
 *   /events                 SSE change feed (debounced fs.watch)
 *   POST /api/draft          intake-draft relay: builds the feature-request
 *                           prompt (stable template + volatile harness
 *                           context, plus any tagged workspace files) and
 *                           streams the chosen LLM provider's draft over SSE.
 *                           Never writes disk — see handleDraftRequest.
 *   POST /api/intake         submit the reviewed draft to the target harness
 *                           by persisting it as feature-request.md (the
 *                           harness's intake artifact). The ONLY route that
 *                           writes disk, and only one allowlisted file inside
 *                           a registered workspace; never spawns a process —
 *                           see handleIntakeRequest.
 *
 * Security model (localhost observer):
 *   - 127.0.0.1 hard bind — no flag exists to widen it.
 *   - Host-header check (DNS-rebinding guard).
 *   - The registry is the read allowlist: /api/md and /graph resolve only
 *     inside registered roots; file names are whitelisted patterns.
 *   - Read-only: POST /api/draft streams an intake draft as text and writes no
 *     disk; POST /api/intake is the sole write — it persists the reviewed draft
 *     to one allowlisted file (feature-request.md) inside a registered
 *     workspace. Both are the only non-GET routes.
 *   - Cache-Control: no-store everywhere; markdown is rendered with
 *     textContent only (harness text never becomes markup).
 *
 * Usage:
 *   node dist/toolbox_serve.js [--port N] [--handyman-root PATH]
 *   (also reachable as `node dist/toolbox.js serve ...`)
 */
import { readdirSync, readFileSync, statSync, watch, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, join, resolve, sep } from "node:path";
import { resolveWorkspace } from "./core/index.js";
import {
  FAVICON_LINK,
  fleetAggregate,
  HTML_STYLE,
  handymanRoot,
  harnessSignals,
  loadRegistry,
  registryPath,
  type Snapshot,
  snapshots,
  toolboxTimeline,
} from "./toolbox.js";
import { buildProviders, loadDotEnv, providersInfo, type LlmProvider } from "./toolbox_llm.js";
import {
  buildDraftContext,
  buildDraftSystem,
  composeSystem,
  composeUserPrompt,
  relayDraft,
} from "./toolbox_draft.js";
import { currentSkillVersion } from "./upgrade_harness.js";

const MD_NAME_RE = /^[\w.-]+\.md$/;
const DEBOUNCE_MS = 250;
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
const TAG_MAX_IN_DRAFT = 12;
const INTAKE_MAX_BYTES = 256 * 1024;

/** True when `root` is a registered harness project root. */
function isRegisteredRoot(hroot: string, root: string): boolean {
  const [registry] = loadRegistry(hroot);
  return registry.harnesses.some((e) => e.project_root === root);
}

/** Absolute path of `rel` under `parent` iff it is contained (no traversal). */
function containedPath(parent: string, rel: string): string | null {
  const parentAbs = resolve(parent);
  const childAbs = resolve(parentAbs, rel);
  const prefix = parentAbs.endsWith(sep) ? parentAbs : parentAbs + sep;
  return childAbs === parentAbs || childAbs.startsWith(prefix) ? childAbs : null;
}

/** Resolve a tagged file relative path inside a registered root (project root
 * first, then its resolved workspace). Returns the absolute path or null when
 * the root is unregistered, the path escapes, or the file is missing/not a
 * tagged-text file. */
function resolveTagFile(hroot: string, root: string, rel: string): string | null {
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
function listTagFiles(root: string): Array<{ path: string; size: number }> {
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
function readTagFiles(
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

// Defense in depth (Plan C): agent-produced markdown is untrusted even though
// it is local — DOMPurify sanitizes it client-side, and this CSP is the uniform
// server-side second defense on EVERY response. The panel genuinely needs
// inline scripts (anti-flash + initial state + the inlined panel asset) and
// inline styles (the token CSS), plus same-origin vendor/fetch/SSE and a
// data: SVG favicon, so script/style carry 'unsafe-inline' deliberately.
const CSP_HEADER =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; " +
  "style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'";

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

// --- state document ----------------------------------------------------------

interface QueueFeature {
  id: number | null;
  name: string;
  title: string;
  status: string;
  sprint: string | null;
  blocked_reason: string | null;
  depends_on: number[];
}

/** Feature queue for the kanban; [] when the list is missing or corrupt. */
function readFeatures(workspace: string): QueueFeature[] {
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

/**
 * Per-harness metrics block for the panel (Plan A). The snapshot already
 * carries metrics.collect() output (harnessSnapshot spreads it), so this only
 * regroups it; null when the harness was unreadable and collect() never ran.
 */
function snapshotMetrics(snap: Snapshot): Record<string, unknown> | null {
  const { throughput, review_verdicts, coverage } = snap;
  if (!throughput || !review_verdicts || !coverage) {
    return null;
  }
  return { throughput, review_verdicts, coverage };
}

function buildState(hroot: string): Record<string, unknown> {
  const [snaps, _registry, loadError] = snapshots(hroot);
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const harnesses = snaps.map((snap) => ({
    ...snap,
    signals: harnessSignals(snap, today, 7, 14),
    metrics: snapshotMetrics(snap),
    features: snap.error ? [] : readFeatures(String(snap.workspace ?? "")),
    has_graph: !snap.error && isFile(join(snap.project_root, "graphify-out", "graph.html")),
  }));
  return {
    registry: registryPath(hroot),
    registry_error: loadError,
    skill_version: currentSkillVersion() || null,
    generated_at: new Date().toISOString(),
    harnesses,
    fleet: fleetAggregate(snaps),
    timeline: toolboxTimeline(hroot, snaps).slice(0, 20),
  };
}

// --- markdown allowlist ------------------------------------------------------

/** Resolve a whitelisted markdown request inside a REGISTERED root, or null. */
function resolveMd(hroot: string, root: string, file: string): string | null {
  const [registry] = loadRegistry(hroot);
  if (!registry.harnesses.some((e) => e.project_root === root)) {
    return null;
  }
  const workspace = resolveWorkspace(root);
  if (file === "current") {
    return join(workspace, "progress", "current.md");
  }
  if (file === "history") {
    return join(workspace, "progress", "history.md");
  }
  if (file === "index") {
    return join(workspace, "index.md");
  }
  if (file === "checkpoints") {
    return join(root, "CHECKPOINTS.md");
  }
  const [kind, name] = file.split(":", 2);
  if ((kind === "backlog" || kind === "docs") && name && MD_NAME_RE.test(name)) {
    return join(workspace, kind, name);
  }
  return null;
}

// --- search corpus -----------------------------------------------------------

interface CorpusDoc {
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

function buildCorpus(hroot: string): CorpusDoc[] {
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

// --- http plumbing -----------------------------------------------------------

function hostAllowed(req: IncomingMessage): boolean {
  const host = String(req.headers.host ?? "");
  const bare = host.replace(/:\d+$/, "");
  return bare === "127.0.0.1" || bare === "localhost" || bare === "[::1]";
}

function send(
  res: ServerResponse,
  status: number,
  body: string,
  type = "application/json; charset=utf-8",
): void {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": CSP_HEADER,
  });
  res.end(body);
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  send(res, status, JSON.stringify(data));
}

// --- draft relay (POST /api/draft) -------------------------------------------

/** Stable intake system built once (the template is a bundled asset). */
const draftSystem = buildDraftSystem();

interface DraftHandlerDeps {
  hroot: string;
  providers: LlmProvider[];
}

/** Read and JSON-parse a JSON object request body capped at `maxBytes`.
 * Returns null on oversized, malformed, or non-object payloads. */
function readJsonObject(
  req: IncomingMessage,
  maxBytes = 256 * 1024,
): Promise<Record<string, unknown> | null> {
  return new Promise((done) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        // oversized body: stop reading, reject downstream
        req.destroy();
        done(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      let data: unknown;
      try {
        data = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
      } catch {
        done(null);
        return;
      }
      if (data && typeof data === "object" && !Array.isArray(data)) {
        done(data as Record<string, unknown>);
        return;
      }
      done(null);
    });
    req.on("error", () => done(null));
  });
}

/**
 * POST /api/draft {root, prompt, provider, files?}: build the intake prompt
 * (stable system + volatile harness context, optionally including the tagged
 * workspace files), call the chosen provider, and relay the draft over SSE.
 * Provider failures arrive as `event: error` with a mapped code; nothing is
 * written to disk. Validated against the registry (root) and the built
 * providers (id) so a 400 never reaches the LLM.
 */
async function handleDraftRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: DraftHandlerDeps,
): Promise<void> {
  const body = await readJsonObject(req);
  if (body === null) {
    sendJson(res, 400, { ok: false, error: "invalid body: expects {root, prompt, provider}" });
    return;
  }
  const root = typeof body.root === "string" ? body.root : "";
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const providerId = typeof body.provider === "string" ? body.provider : "";
  if (!root || !prompt || !providerId) {
    sendJson(res, 400, { ok: false, error: "invalid body: expects {root, prompt, provider}" });
    return;
  }
  if (!isRegisteredRoot(deps.hroot, root)) {
    sendJson(res, 400, { ok: false, error: "root not registered" });
    return;
  }
  const provider = deps.providers.find((p) => p.id === providerId);
  if (!provider) {
    sendJson(res, 400, { ok: false, error: "unknown provider" });
    return;
  }
  // Optional tagged files: resolve+read each inside the registered root.
  const fileRels = Array.isArray(body.files)
    ? body.files.filter((f): f is string => typeof f === "string")
    : [];
  const taggedFiles = readTagFiles(deps.hroot, root, fileRels);

  // Build the volatile harness context (features + BM25 dedup + discovery +
  // any tagged files the user selected as background context).
  const context = await buildDraftContext(root, prompt, 5, taggedFiles);
  const system = composeSystem(draftSystem);
  const userPrompt = composeUserPrompt(context);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": CSP_HEADER,
  });
  const sse = (event: string, data: unknown): void => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  await relayDraft({
    system,
    userPrompt,
    draft: (r, onDelta) => provider.draft({ prompt: r.prompt, system: r.system }, onDelta),
    possibleDuplicates: context.possible_duplicates,
    onDelta: (text) => sse("delta", { text }),
    onResult: (event) => {
      sse("result", event);
      res.end();
    },
    onError: (error) => {
      sse("error", { code: error.code, message: error.message });
      res.end();
    },
  });
}

/**
 * POST /api/intake {root, draft_md, files?}: submit the reviewed intake to the
 * target harness by persisting it as the harness's feature-request.md (the
 * intake document the leader consumes on the next run). This is the SECOND
 * deliberate non-GET route (after POST /api/draft) and the ONLY one that
 * writes disk: a controlled write of one allowlisted file inside a registered
 * harness workspace. It never spawns a handyman process — the next leader
 * session picks up the persisted intake. Invalid/empty payloads are rejected
 * with a 4xx before any write. `files` are recorded as a reference footer so
 * the tagged context travels with the submitted document.
 */
async function handleIntakeRequest(
  req: IncomingMessage,
  res: ServerResponse,
  hroot: string,
): Promise<void> {
  const body = await readJsonObject(req, INTAKE_MAX_BYTES);
  if (body === null) {
    sendJson(res, 400, { ok: false, error: "invalid body: expects {root, draft_md}" });
    return;
  }
  const root = typeof body.root === "string" ? body.root : "";
  const draftMd = typeof body.draft_md === "string" ? body.draft_md : "";
  if (!root) {
    sendJson(res, 400, { ok: false, error: "root is required" });
    return;
  }
  if (!draftMd.trim()) {
    sendJson(res, 422, { ok: false, error: "draft_md must not be empty" });
    return;
  }
  if (!isRegisteredRoot(hroot, root)) {
    sendJson(res, 400, { ok: false, error: "root not registered" });
    return;
  }
  let workspace: string;
  try {
    workspace = resolveWorkspace(root);
  } catch {
    sendJson(res, 400, { ok: false, error: "could not resolve harness workspace" });
    return;
  }
  // Record the tagged files as a reference footer so the submitted intake
  // carries its selected context without embedding potentially large bodies.
  const fileRels = Array.isArray(body.files)
    ? body.files.filter((f): f is string => typeof f === "string").slice(0, TAG_MAX_IN_DRAFT)
    : [];
  const footer =
    fileRels.length > 0
      ? `\n\n<!-- intake context files: ${fileRels.join(", ")} -->\n`
      : "";
  const dest = join(workspace, "feature-request.md");
  try {
    writeFileSync(dest, `${draftMd.trim()}${footer}\n`, "utf-8");
  } catch {
    sendJson(res, 500, { ok: false, error: "could not write feature-request.md" });
    return;
  }
  sendJson(res, 200, {
    ok: true,
    path: dest,
    files: fileRels.length,
    spawned_process: false,
  });
}

// --- server ------------------------------------------------------------------

export interface ServeOptions {
  port: number;
  handymanRoot: string | null;
}

export function parseServeArgs(argv: string[]): ServeOptions {
  const options: ServeOptions = { port: 8765, handymanRoot: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === "--port") {
      options.port = Number.parseInt(argv[i + 1] ?? "", 10) || 0;
      i++;
    } else if (arg.startsWith("--port=")) {
      options.port = Number.parseInt(arg.slice(7), 10) || 0;
    } else if (arg === "--handyman-root") {
      options.handymanRoot = argv[i + 1] ?? null;
      i++;
    } else if (arg.startsWith("--handyman-root=")) {
      options.handymanRoot = arg.slice(16);
    }
  }
  return options;
}

export function serveMain(argv: string[]): void {
  const options = parseServeArgs(argv);
  const hroot = handymanRoot(options.handymanRoot);
  // LLM layer: keys from the launch directory's .env (existing env wins),
  // providers built once. The browser only ever sees availability flags.
  loadDotEnv(process.cwd());
  const providers = buildProviders(process.env);

  // SSE clients + debounced watchers. Watchers re-arm when the registered
  // root set changes so newly registered harnesses become live without a
  // restart. A watcher that cannot start (missing dir) is skipped silently —
  // the harness still degrades to UNREADABLE in /api/state.
  const clients = new Set<ServerResponse>();
  let watchers: FSWatcher[] = [];
  let watchedRoots = "";
  let debounce: ReturnType<typeof setTimeout> | null = null;

  function broadcast(): void {
    const payload = `data: {"type":"change"}\n\n`;
    for (const client of clients) {
      client.write(payload);
    }
    armWatchers(); // re-arm if the registry itself changed
  }

  function onFsEvent(): void {
    if (debounce) {
      clearTimeout(debounce);
    }
    debounce = setTimeout(() => {
      debounce = null;
      broadcast();
    }, DEBOUNCE_MS);
  }

  function armWatchers(): void {
    const [registry] = loadRegistry(hroot);
    const roots = registry.harnesses.map((e) => e.project_root);
    const key = roots.join("\n");
    if (key === watchedRoots && watchers.length > 0) {
      return;
    }
    for (const watcher of watchers) {
      watcher.close();
    }
    watchers = [];
    watchedRoots = key;
    const targets = [hroot, ...roots.map((root) => resolveWorkspace(root))];
    for (const target of targets) {
      try {
        const watcher = watch(target, { recursive: true }, onFsEvent);
        watcher.on("error", () => watcher.close());
        watchers.push(watcher);
      } catch {
        // missing directory: /api/state reports it as UNREADABLE
      }
    }
  }

  const require = createRequire(import.meta.url);
  // Browser libs served from node_modules (UMD builds): the panel is real
  // React without a bundler — htm supplies JSX-like templates at runtime.
  // marked + DOMPurify render agent markdown as sanitized HTML (Plan C):
  // the text never becomes markup without passing through DOMPurify first.
  // UMD subpaths are not in the packages' export maps, so resolution goes
  // through each package.json (when exported) and otherwise falls back to
  // the resolved entry path (packageRoot handles hidden package.json).
  const vendorFiles: Record<string, [string, string]> = {
    "react.js": ["react", "umd/react.production.min.js"],
    "react-dom.js": ["react-dom", "umd/react-dom.production.min.js"],
    "htm.js": ["htm", "dist/htm.umd.js"],
    "minisearch.js": ["minisearch", "dist/umd/index.js"],
    "marked.js": ["marked", "marked.min.js"],
    "dompurify.js": ["dompurify", "dist/purify.min.js"],
    // graphify's graph.html loads vis-network from unpkg.com by default,
    // which the strict CSP blocks. Serving the standalone UMD locally and
    // rewriting the script src on the fly (see the /graph handler) keeps the
    // graph self-contained and CSP-safe, matching the Plan C vendor pattern.
    "vis-network.js": ["vis-network", "standalone/umd/vis-network.min.js"],
  };
  function packageRoot(pkg: string): string | null {
    try {
      return dirname(require.resolve(`${pkg}/package.json`));
    } catch {
      // Some export maps (htm, minisearch) hide package.json: derive the
      // root from the resolved entry path instead.
      try {
        const entry = require.resolve(pkg);
        const marker = `${sep}node_modules${sep}${pkg}${sep}`;
        const idx = entry.lastIndexOf(marker);
        return idx === -1 ? null : entry.slice(0, idx + marker.length - 1);
      } catch {
        return null;
      }
    }
  }
  function vendorText(name: string): string | null {
    const spec = vendorFiles[name];
    if (!spec) {
      return null;
    }
    const root = packageRoot(spec[0]);
    return root === null ? null : readText(join(root, spec[1]));
  }

  const server = createServer((req, res) => {
    if (!hostAllowed(req)) {
      sendJson(res, 403, { ok: false, error: "forbidden host" });
      return;
    }
    // The observer is GET-only by contract (405 otherwise). Two deliberate
    // exceptions write no uncontrolled state: POST /api/draft streams an intake
    // draft as text (docs/analisis-peticiones-llm-toolbox.md §4-5, Plan A), and
    // POST /api/intake persists the reviewed draft to the target harness's
    // feature-request.md — the harness's own intake artifact (one allowlisted
    // file inside a registered workspace; never spawns a process). Both are
    // handled before the GET-only guard so no other mutating route exists.
    const routePath = (req.url ?? "/").split("?")[0];
    if (req.method === "POST" && routePath === "/api/draft") {
      handleDraftRequest(req, res, { hroot, providers });
      return;
    }
    if (req.method === "POST" && routePath === "/api/intake") {
      handleIntakeRequest(req, res, hroot);
      return;
    }
    if (req.method !== "GET") {
      sendJson(res, 405, { ok: false, error: "read-only observer: GET only" });
      return;
    }
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const path = url.pathname;

    if (path === "/") {
      send(res, 200, panelHtml(hroot), "text/html; charset=utf-8");
      return;
    }
    if (path === "/api/state") {
      sendJson(res, 200, buildState(hroot));
      return;
    }
    if (path === "/api/corpus") {
      sendJson(res, 200, { documents: buildCorpus(hroot) });
      return;
    }
    if (path === "/api/files") {
      const root = url.searchParams.get("root") ?? "";
      if (!root || !isRegisteredRoot(hroot, root)) {
        sendJson(res, 400, { ok: false, error: "root not registered" });
        return;
      }
      sendJson(res, 200, { root, files: listTagFiles(root) });
      return;
    }
    if (path === "/api/providers") {
      providersInfo(providers).then(
        (infos) => sendJson(res, 200, { providers: infos }),
        () => sendJson(res, 500, { ok: false, error: "provider check failed" }),
      );
      return;
    }
    if (path === "/api/md") {
      const root = url.searchParams.get("root") ?? "";
      const file = url.searchParams.get("file") ?? "";
      const resolved = resolveMd(hroot, root, file);
      if (resolved === null) {
        sendJson(res, 400, { ok: false, error: "root not registered or file not whitelisted" });
        return;
      }
      const text = readText(resolved);
      if (text === null) {
        sendJson(res, 404, { ok: false, error: "file not found" });
        return;
      }
      send(res, 200, text, "text/markdown; charset=utf-8");
      return;
    }
    const graphMatch = /^\/graph\/([^/]+)\/graph\.(html|json)$/.exec(path);
    if (graphMatch) {
      const wanted = decodeURIComponent(graphMatch[1] as string);
      const [registry] = loadRegistry(hroot);
      const entry = registry.harnesses.find((e) => {
        const raw = readText(join(e.project_root, "harness.config.json"));
        let name = e.project_root.split("/").pop() ?? e.project_root;
        if (raw) {
          try {
            name = String((JSON.parse(raw) as Record<string, unknown>).project_name ?? name);
          } catch {
            // keep basename
          }
        }
        return name === wanted;
      });
      if (!entry) {
        sendJson(res, 404, { ok: false, error: "unknown harness" });
        return;
      }
      const file = join(entry.project_root, "graphify-out", `graph.${graphMatch[2]}`);
      let text = readText(file);
      if (text === null) {
        sendJson(res, 404, { ok: false, error: "no graphify export for this harness" });
        return;
      }
      if (graphMatch[2] === "html") {
        // graphify emits <script src="https://unpkg.com/vis-network@X/..."
        // ... integrity=... crossorigin=...>. The strict CSP (default-src
        // 'self') blocks unpkg, so the graph renders blank with "vis is not
        // defined". Rewrite the whole tag to the same-origin vendor path and
        // drop integrity/crossorigin (they no longer apply locally). Keep the
        // on-disk graph.html untouched: this only transforms what is served.
        text = text.replace(
          /<script\s+src="https:\/\/unpkg\.com\/vis-network@[^"]*"[^>]*><\/script>/,
          '<script src="/vendor/vis-network.js"></script>',
        );
      }
      const type =
        graphMatch[2] === "html" ? "text/html; charset=utf-8" : "application/json; charset=utf-8";
      send(res, 200, text, type);
      return;
    }
    const vendorMatch = /^\/vendor\/([\w.-]+)$/.exec(path);
    if (vendorMatch) {
      const text = vendorText(vendorMatch[1] as string);
      if (text === null) {
        sendJson(res, 404, { ok: false, error: "vendor lib not installed" });
        return;
      }
      send(res, 200, text, "application/javascript; charset=utf-8");
      return;
    }
    if (path === "/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
      });
      res.write("retry: 2000\n\n");
      clients.add(res);
      const keepalive = setInterval(() => res.write(": keepalive\n\n"), 25000);
      req.on("close", () => {
        clearInterval(keepalive);
        clients.delete(res);
      });
      return;
    }
    sendJson(res, 404, { ok: false, error: "not found" });
  });

  armWatchers();
  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      process.stderr.write(
        `ERROR: port ${options.port} is already in use (another observer? try --port 0)\n`,
      );
    } else {
      process.stderr.write(`ERROR: ${error.message}\n`);
    }
    process.exit(1);
  });
  server.listen(options.port, "127.0.0.1", () => {
    const address = server.address();
    const port = address && typeof address === "object" ? address.port : options.port;
    process.stdout.write(`toolBox observer: http://127.0.0.1:${port}/\n`);
    process.stdout.write(`registry: ${registryPath(hroot)} (read-only; Ctrl+C stops)\n`);
  });
}

// --- panel -------------------------------------------------------------------

// Self-contained observer page. All dynamic content lands via textContent —
// harness-file text never becomes markup. The only external fetches go to
// this same origin (/api/*, /vendor/*, /events).
const PANEL_CSS = `
  nav { display: flex; gap: var(--hw-space-3); align-items: baseline;
        border-bottom: 1px solid var(--hw-border);
        padding-bottom: var(--hw-space-2); flex-wrap: wrap; }
  nav .wordmark { color: var(--hw-accent); font-weight: 700;
                  font-size: var(--hw-text-xl); }
  nav a { text-decoration: none; font-size: var(--hw-text-s); }
  nav .statusline { margin-left: auto; color: var(--hw-muted);
                    font-size: var(--hw-text-xs); }
  nav .statusline.is-live { color: var(--hw-ok); }
  nav .statusline.is-down { color: var(--hw-danger); }
  nav .palette-hint {
    font: inherit; font-size: var(--hw-text-xs); cursor: pointer;
    border: 1px solid var(--hw-border-strong);
    border-radius: var(--hw-radius-s); background: var(--hw-surface);
    color: var(--hw-muted); padding: var(--hw-space-1) var(--hw-space-2); }
  dialog.palette { width: 34rem; max-width: 90vw; padding: var(--hw-space-2); }
  dialog.palette input {
    width: 100%; box-sizing: border-box; font: inherit;
    font-size: var(--hw-text-s); padding: var(--hw-space-2);
    border: 1px solid var(--hw-border-strong);
    border-radius: var(--hw-radius-s);
    background: var(--hw-surface); color: var(--hw-fg); }
  dialog.palette ul { list-style: none; margin: var(--hw-space-2) 0 0;
    padding: 0; max-height: 20rem; overflow: auto; }
  dialog.palette li { padding: var(--hw-space-1) var(--hw-space-2);
    border-radius: var(--hw-radius-s); cursor: pointer;
    font-size: var(--hw-text-s); }
  dialog.palette li[aria-selected="true"] {
    background: color-mix(in srgb, var(--hw-accent) 18%, var(--hw-bg));
    color: var(--hw-accent); }
  dialog.help { max-width: 28rem; }
  .help-table td { padding: var(--hw-space-1) var(--hw-space-2);
    font-size: var(--hw-text-s); border: 0; }
  kbd { background: var(--hw-surface); border: 1px solid var(--hw-border-strong);
    border-radius: var(--hw-radius-s); padding: 0 0.35em;
    font-size: var(--hw-text-xs); }
  nav .theme-toggle { display: flex; gap: var(--hw-space-1); }
  nav .theme-toggle button {
    font: inherit; font-size: var(--hw-text-xs); cursor: pointer;
    border: 1px solid var(--hw-border-strong);
    border-radius: var(--hw-radius-s); background: var(--hw-surface);
    color: var(--hw-fg); padding: var(--hw-space-1) var(--hw-space-2); }
  nav .theme-toggle button[aria-pressed="true"] {
    border-color: var(--hw-accent); color: var(--hw-accent); font-weight: 700; }
  h2 { font-size: var(--hw-text-l); margin: var(--hw-space-3) 0 var(--hw-space-2); }
  .cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
           gap: var(--hw-space-2); align-items: start; }
  .col h3 { font-size: var(--hw-text-xs); text-transform: uppercase;
            letter-spacing: 0.06em; color: var(--hw-muted);
            margin: var(--hw-space-2) 0 var(--hw-space-1); }
  .card { background: var(--hw-surface); border: 1px solid var(--hw-border);
          border-radius: var(--hw-radius-m); padding: var(--hw-space-2);
          margin-bottom: var(--hw-space-2); font-size: var(--hw-text-s); }
  .card .fid { color: var(--hw-muted); font-size: var(--hw-text-xs); }
  .card .reason { color: var(--hw-danger); font-size: var(--hw-text-xs);
                  margin-top: var(--hw-space-1); }
  .meta-list { list-style: none; padding: 0; margin: var(--hw-space-2) 0; }
  .meta-list li { margin-bottom: var(--hw-space-1); font-size: var(--hw-text-s); }
  .linkrow { display: flex; gap: var(--hw-space-2); flex-wrap: wrap;
             margin: var(--hw-space-2) 0; }
  .linkrow button, .search-row input {
    font: inherit; font-size: var(--hw-text-s);
    border: 1px solid var(--hw-border-strong);
    border-radius: var(--hw-radius-s); background: var(--hw-surface);
    color: var(--hw-fg); padding: var(--hw-space-1) var(--hw-space-2); }
  .linkrow button { cursor: pointer; }
  dialog { background: var(--hw-bg); color: var(--hw-fg);
           border: 1px solid var(--hw-border-strong);
           border-radius: var(--hw-radius-m); max-width: 60rem; width: 90vw; }
  dialog::backdrop { background: var(--hw-backdrop); }
  dialog pre { white-space: pre-wrap; font-size: var(--hw-text-s);
               max-height: 70vh; overflow: auto; }
  iframe.graph { width: 100%; height: 34rem; border: 1px solid var(--hw-border);
                 border-radius: var(--hw-radius-m); background: var(--hw-surface); }
  .search-row { display: flex; gap: var(--hw-space-2); margin: var(--hw-space-3) 0; }
  .search-row input { flex: 1; }
  .result { border-bottom: 1px solid var(--hw-border);
            padding: var(--hw-space-2) 0; font-size: var(--hw-text-s); }
  .result .where { color: var(--hw-muted); font-size: var(--hw-text-xs); }
  .empty { color: var(--hw-muted); font-style: italic; font-size: var(--hw-text-s); }
  .kpis { display: flex; gap: var(--hw-space-2); flex-wrap: wrap;
          margin: var(--hw-space-2) 0; }
  .kpi { background: var(--hw-surface); border: 1px solid var(--hw-border);
         border-radius: var(--hw-radius-m);
         padding: var(--hw-space-2) var(--hw-space-3); }
  .kpi .kpi-value { font-size: var(--hw-text-l); font-weight: 700;
                    font-variant-numeric: tabular-nums; }
  .kpi .kpi-label { color: var(--hw-muted); font-size: var(--hw-text-xs);
                    text-transform: uppercase; letter-spacing: 0.06em; }
  .sparkline { display: block; color: var(--hw-accent);
               margin-bottom: var(--hw-space-1); }
  .tl-date { color: var(--hw-muted); font-size: var(--hw-text-xs);
             font-variant-numeric: tabular-nums; margin-right: var(--hw-space-2); }
  .md-body { font-size: var(--hw-text-s); line-height: 1.5;
             max-height: 70vh; overflow: auto; }
  .md-body h1, .md-body h2, .md-body h3 { color: var(--hw-fg);
             margin: var(--hw-space-2) 0 var(--hw-space-1); }
  .md-body h1 { font-size: var(--hw-text-xl); }
  .md-body h2 { font-size: var(--hw-text-l); }
  .md-body p { margin: var(--hw-space-1) 0; }
  .md-body ul, .md-body ol { margin: var(--hw-space-1) 0;
             padding-left: var(--hw-space-3); }
  .md-body code { background: var(--hw-surface); border: 1px solid var(--hw-border);
             border-radius: var(--hw-radius-s); padding: 0 .25em; }
  .md-body pre { background: var(--hw-surface); border: 1px solid var(--hw-border);
             border-radius: var(--hw-radius-s); padding: var(--hw-space-2);
             overflow: auto; }
  .md-body pre code { border: 0; padding: 0; background: transparent; }
  .md-body blockquote { border-left: 3px solid var(--hw-border-strong);
             margin: var(--hw-space-1) 0; padding-left: var(--hw-space-2);
             color: var(--hw-muted); }
  .md-body table { border-collapse: collapse; }
  .md-body th, .md-body td { border: 1px solid var(--hw-border);
             padding: var(--hw-space-1); }
  .md-body a { color: var(--hw-accent); }
  /* Intake view (Plan A): a compact form + an editable draft alongside a
     sanitized preview. Reuses .md-body, .linkrow, .where, .error tokens. */
  .muted { color: var(--hw-muted); font-size: var(--hw-text-s);
           max-width: 48rem; }
  .intake-form { display: grid; gap: var(--hw-space-2);
                 max-width: 48rem; margin-top: var(--hw-space-2); }
  .field { display: grid; gap: var(--hw-space-1); font-size: var(--hw-text-s); }
  .field > span { color: var(--hw-muted); text-transform: uppercase;
                  letter-spacing: 0.06em; font-size: var(--hw-text-xs); }
  .field select, .field textarea {
    font: inherit; font-size: var(--hw-text-s);
    border: 1px solid var(--hw-border-strong);
    border-radius: var(--hw-radius-s); background: var(--hw-surface);
    color: var(--hw-fg); padding: var(--hw-space-1) var(--hw-space-2);
    box-sizing: border-box; }
  .field textarea { resize: vertical; }
  .intake-prompt textarea { min-height: 5rem; }
  .intake-draft { margin-top: var(--hw-space-3); max-width: 60rem; }
  .intake-edit { width: 100%; box-sizing: border-box; font: inherit;
    font-size: var(--hw-text-s); border: 1px solid var(--hw-border-strong);
    border-radius: var(--hw-radius-s); background: var(--hw-surface);
    color: var(--hw-fg); padding: var(--hw-space-2); resize: vertical;
    font-family: var(--hw-mono, ui-monospace, monospace); }
  .intake-draft details { margin-top: var(--hw-space-2); }
  .intake-draft summary { cursor: pointer; color: var(--hw-muted);
    font-size: var(--hw-text-xs); }
  /* File-tag picker + direct submit (intake enhancements). Multi-select
     chips over a searchable list; the ok/error notices mirror the a11y
     live regions (role=status / role=alert). */
  .intake-form .ok, .intake-draft ~ .ok { color: var(--hw-ok); }
  .tag-picker { display: grid; gap: var(--hw-space-1); }
  .tag-chips { display: flex; flex-wrap: wrap; gap: var(--hw-space-1); }
  .tag-chip { display: inline-flex; align-items: center; gap: var(--hw-space-1);
    background: color-mix(in srgb, var(--hw-accent) 14%, var(--hw-surface));
    color: var(--hw-accent); border-radius: var(--hw-radius-s);
    padding: 0 var(--hw-space-1); font-size: var(--hw-text-xs); }
  .tag-x { background: none; border: 0; color: inherit; cursor: pointer;
    font: inherit; padding: 0; line-height: 1; }
  .tag-search { position: relative; }
  .tag-search input { width: 100%; box-sizing: border-box; font: inherit;
    font-size: var(--hw-text-s); padding: var(--hw-space-1) var(--hw-space-2);
    border: 1px solid var(--hw-border-strong);
    border-radius: var(--hw-radius-s);
    background: var(--hw-surface); color: var(--hw-fg); }
  .tag-list { list-style: none; margin: var(--hw-space-1) 0 0; padding: 0;
    max-height: 14rem; overflow: auto; border: 1px solid var(--hw-border);
    border-radius: var(--hw-radius-s); background: var(--hw-surface); }
  .tag-list li { border-bottom: 1px solid var(--hw-border); }
  .tag-list li:last-child { border-bottom: 0; }
  .tag-list label { display: flex; align-items: center; gap: var(--hw-space-2);
    padding: var(--hw-space-1) var(--hw-space-2);
    font-size: var(--hw-text-s); cursor: pointer; }
  .tag-path { font-family: var(--hw-mono, ui-monospace, monospace);
    word-break: break-all; }
  .tag-size { margin-left: auto; color: var(--hw-muted);
    font-size: var(--hw-text-xs); white-space: nowrap; }
  .tag-empty { padding: var(--hw-space-1) var(--hw-space-2); margin: 0; }
  .tag-done { justify-self: start; font: inherit; font-size: var(--hw-text-xs);
    cursor: pointer; border: 1px solid var(--hw-border-strong);
    border-radius: var(--hw-radius-s); background: var(--hw-surface);
    color: var(--hw-fg); padding: var(--hw-space-1) var(--hw-space-2); }
  @media (max-width: 60rem) { .cards { grid-template-columns: 1fr 1fr; } }
`;

// The React panel lives beside the other shipped assets and is served as-is;
// dist/toolbox_serve.js resolves it relative to itself (SKILL.md pattern).
const PANEL_JS_PATH = new URL("../assets/toolbox_panel.js", import.meta.url);

function panelHtml(hroot: string): string {
  let panelJs: string;
  try {
    panelJs = readFileSync(PANEL_JS_PATH, "utf-8");
  } catch {
    panelJs = 'document.body.textContent = "panel asset missing: assets/toolbox_panel.js";';
  }
  // First paint carries the live state inline (no loading flash; SSE + fetch
  // only refresh it). "<" is escaped so harness text can never close the
  // script tag (the JSON stays data, not markup).
  const initialState = JSON.stringify(buildState(hroot)).replaceAll("<", "\\u003c");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Handyman ToolBox Observer</title>
${FAVICON_LINK}
<script>/* anti-flash: apply the stored explicit theme before first paint.
 * Synchronous on purpose (legacy §6.4 contract): "light"/"dark" in the
 * versioned key hw-theme:1 becomes data-theme on <html>; any other value
 * (or no key) means system mode, where the media-query tokens rule. The
 * try/catch keeps storage errors (disabled/denied) from breaking the page. */
try {
  var hwTheme = localStorage.getItem("hw-theme:1");
  if (hwTheme === "light" || hwTheme === "dark") {
    document.documentElement.dataset.theme = hwTheme;
  }
} catch (e) {}
</script>
<style>${HTML_STYLE}${PANEL_CSS}</style>
</head>
<body>
<!-- Plan D: the ONLY two live regions, static HTML on purpose — present and
     empty from the first byte, outside the React tree so re-renders never
     recreate them (recreated regions are unreliable across screen readers).
     The alert region carries role="alert" alone: stacking the explicit
     assertive attribute on it double-announces on VoiceOver/iOS. -->
<div id="live-polite" class="visually-hidden" role="status" aria-live="polite"></div>
<div id="live-assertive" class="visually-hidden" role="alert"></div>
<div id="root"></div>
<script>window.__TOOLBOX_INITIAL_STATE__ = ${initialState};</script>
<script src="/vendor/react.js"></script>
<script src="/vendor/react-dom.js"></script>
<script src="/vendor/htm.js"></script>
<script src="/vendor/minisearch.js"></script>
<script src="/vendor/marked.js"></script>
<script src="/vendor/dompurify.js"></script>
<script>${panelJs}</script>
</body>
</html>
`;
}

// Run when executed directly (mirrors the sibling CLIs).
if (import.meta.url === `file://${process.argv[1]}`) {
  serveMain(process.argv.slice(2));
}

import { join, dirname, basename, isAbsolute, resolve } from 'node:path';
import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { MASTRA_THREAD_ID_KEY } from '@mastra/core/request-context';
import { MastraCompositeStore } from '@mastra/core/storage';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { createScorer } from '@mastra/core/evals';
import { SkillSearchProcessor } from '@mastra/core/processors';
import { checks } from '@mastra/evals/checks';
import { extractTrajectory } from '@mastra/evals/scorers/utils';
import { MCPClient } from '@mastra/mcp';
import { Workspace, LocalSkillSource, LocalSandbox, LocalFilesystem } from '@mastra/core/workspace';
import { createTool } from '@mastra/core/tools';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { DuckDBStore } from '@mastra/duckdb';
import { PinoLogger } from '@mastra/loggers';
import { Observability, SensitiveDataFilter, MastraStorageExporter } from '@mastra/observability';
import { createAnthropic } from '@ai-sdk/anthropic';
import { existsSync, readFileSync, mkdirSync, readdirSync } from 'node:fs';
import { z } from 'zod';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

"use strict";

"use strict";
const DEFAULT_ROLE_MODEL = "zai/glm-5.2";
function resolveRoleModels(env = process.env) {
  return {
    leader: env.HANDYMAN_LEADER_MODEL ?? DEFAULT_ROLE_MODEL,
    implementer: env.HANDYMAN_IMPLEMENTER_MODEL ?? DEFAULT_ROLE_MODEL,
    reviewer: env.HANDYMAN_REVIEWER_MODEL ?? DEFAULT_ROLE_MODEL
  };
}
const PROVIDER_FACTORIES = {
  zai: (env) => createAnthropic({
    name: "zai",
    baseURL: "https://api.z.ai/api/anthropic/v1",
    apiKey: env.Z_AI_API_KEY ?? "",
    headers: { Authorization: `Bearer ${env.Z_AI_API_KEY ?? ""}` }
  }),
  "kimi-coding": (env) => createAnthropic({
    name: "kimi-coding",
    baseURL: "https://api.kimi.com/coding/v1",
    apiKey: env.KIMI_API_KEY ?? "",
    headers: { Authorization: `Bearer ${env.KIMI_API_KEY ?? ""}` }
  })
};
const catalogCache = /* @__PURE__ */ new Map();
function loadCatalogProviders(path) {
  const cached = catalogCache.get(path);
  if (cached) return cached;
  const providers = {};
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf-8"));
      for (const p of parsed.providers ?? []) {
        if (p?.id && p.baseURL && p.protocol === "anthropic") providers[p.id] = p;
      }
    } catch (error) {
      console.warn(`[model-catalog] ignoring unreadable catalog at ${path}:`, error);
    }
  }
  catalogCache.set(path, providers);
  return providers;
}
function assertCatalogModel(provider, modelId) {
  if (provider.models && provider.models.length > 0 && !provider.models.includes(modelId)) {
    throw new Error(
      `model "${modelId}" not declared for provider "${provider.id}" in the catalog (declared: ${provider.models.join(", ")}) \u2014 edit model-catalog.json`
    );
  }
}
const MODEL_CAPABILITIES = {
  "openrouter/z-ai/glm-5.2": { maxOutputTokens: 65536, reasoning: "high" },
  "openrouter/moonshotai/kimi-k3": { maxOutputTokens: 32768, reasoning: "high" },
  "openrouter/moonshotai/kimi-k2.7-code": { maxOutputTokens: 32768, reasoning: "high" }
};
function roleDefaultOptions(spec) {
  const caps = MODEL_CAPABILITIES[spec];
  return {
    maxSteps: 15,
    modelSettings: {
      maxOutputTokens: caps?.maxOutputTokens ?? 16384,
      ...caps?.reasoning ? { reasoning: caps.reasoning } : {}
    }
  };
}
function resolveModel(spec, options = {}) {
  const env = options.env ?? process.env;
  const slash = spec.indexOf("/");
  if (slash < 1) throw new Error(`model spec "${spec}" must be 'provider/model'`);
  const provider = spec.slice(0, slash);
  const modelId = spec.slice(slash + 1);
  const factory = PROVIDER_FACTORIES[provider];
  if (factory) return factory(env)(modelId);
  const catalogProvider = options.catalogPath ? loadCatalogProviders(options.catalogPath)[provider] : void 0;
  if (catalogProvider) {
    assertCatalogModel(catalogProvider, modelId);
    const apiKey = catalogProvider.apiKeyEnv ? env[catalogProvider.apiKeyEnv] ?? "" : "local";
    return createAnthropic({
      name: catalogProvider.id,
      baseURL: catalogProvider.baseURL,
      apiKey,
      headers: { Authorization: `Bearer ${apiKey}` }
    })(modelId);
  }
  return spec;
}

"use strict";
function createConversationMemory(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const storage = new LibSQLStore({
    id: "handyman-mastra-memory",
    url: `file:${join(dataDir, "mastra.db")}`
  });
  const memory = new Memory({
    storage,
    options: {
      // Bounded recent history per thread; business context arrives via
      // instruction injection (below), not via unbounded transcripts.
      lastMessages: 40
    }
  });
  return { storage, memory };
}
function featureThread(feature, project) {
  return { thread: feature, resource: projectResourceId(project) };
}
function projectResourceId(project) {
  return `project:${project.replace(/[^A-Za-z0-9._-]/g, "_")}`;
}
const BUSINESS_MEMORY_FILES = ["business.md", "architecture.md", "conventions.md", "verification.md"];
function businessMemorySnapshot(project) {
  const dir = join(project, ".handyman", "memory");
  const sections = [];
  for (const file of BUSINESS_MEMORY_FILES) {
    const path = join(dir, file);
    if (!existsSync(path)) continue;
    const body = readFileSync(path, "utf-8").trim();
    if (body.length > 0) sections.push(`### ${file}
${body}`);
  }
  if (sections.length === 0) return "";
  return `

## Business memory (read-only snapshot from .handyman/memory/)
${sections.join("\n\n")}`;
}

"use strict";
const FETCH_TIMEOUT_MS = 15e3;
const MAX_PAGE_CHARS = 6e3;
const MAX_RESULTS = 8;
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) handyman-research/1.0";
function decodeEntities(text) {
  return text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, " ");
}
function htmlToText(html) {
  return decodeEntities(
    html.replace(/<(script|style|noscript|svg|head)[^>]*>.*?<\/\1>/gis, " ").replace(/<!--.*?-->/gs, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n")
  ).trim();
}
const webSearchTool = createTool({
  id: "web_search",
  description: "Search the internet (DuckDuckGo Lite, no API key). Returns up to 8 results as title + URL. Use for research questions; then read promising pages with web_fetch.",
  inputSchema: z.object({
    query: z.string().min(1).describe("Search query, plain text.")
  }),
  outputSchema: z.object({
    results: z.array(z.object({ title: z.string(), url: z.string() }))
  }),
  execute: async ({ query }) => {
    const response = await fetch(
      `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`,
      {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
      }
    );
    if (!response.ok) throw new Error(`web_search HTTP ${response.status}`);
    const html = await response.text();
    const results = [];
    const row = /<a[^>]+href="\/\/duckduckgo\.com\/l\/\?uddg=([^"&]+)[^"]*"[^>]*class='result-link'[^>]*>([\s\S]*?)<\/a>/g;
    let match;
    while ((match = row.exec(html)) !== null && results.length < MAX_RESULTS) {
      results.push({
        url: decodeURIComponent(match[1]),
        title: decodeEntities(match[2].replace(/<[^>]+>/g, "")).trim()
      });
    }
    return { results };
  }
});
const webFetchTool = createTool({
  id: "web_fetch",
  description: "Fetch a web page and return its text content (HTML stripped, capped at 6000 chars). Use to read documentation, issues, and articles found via web_search.",
  inputSchema: z.object({
    url: z.string().url().describe("Absolute http(s) URL to fetch.")
  }),
  outputSchema: z.object({ url: z.string(), text: z.string(), truncated: z.boolean() }),
  execute: async ({ url }) => {
    const target = new URL(url);
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      throw new Error(`web_fetch: unsupported protocol ${target.protocol}`);
    }
    const response = await fetch(target, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,text/plain,application/json,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (!response.ok) throw new Error(`web_fetch HTTP ${response.status}`);
    const body = await response.text();
    const text = htmlToText(body);
    return {
      url: response.url,
      text: text.slice(0, MAX_PAGE_CHARS),
      truncated: text.length > MAX_PAGE_CHARS
    };
  }
});
function webTools() {
  return { web_search: webSearchTool, web_fetch: webFetchTool };
}

"use strict";
const PACKAGE_ROOT$1 = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
function skillSearchDirs(scopes = {}) {
  const env = scopes.env ?? process.env;
  const override = env.HANDYMAN_SKILL_DIRS?.trim();
  if (override) return override.split(":").filter(Boolean);
  const dirs = [join(PACKAGE_ROOT$1, "skills")];
  if (scopes.projectRoot) {
    dirs.push(join(scopes.projectRoot, ".agents", "skills"));
    dirs.push(join(scopes.projectRoot, ".github", "skills"));
  }
  dirs.push(join(homedir(), ".agents", "skills"));
  return dirs;
}
function listSkillDirs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory() && existsSync(join(dir, entry.name, "SKILL.md"))).map((entry) => join(dir, entry.name));
}
function experimentalSkillDirs(env = process.env) {
  const [first] = skillSearchDirs({ env });
  return first ? listSkillDirs(first) : [];
}
function skillRegistry(searchDirs) {
  const registry = {};
  for (const dir of searchDirs) {
    for (const skillDir of listSkillDirs(dir)) {
      registry[basename(skillDir)] ??= skillDir;
    }
  }
  return registry;
}

"use strict";
function schemaProperties(inputSchema) {
  if (!inputSchema || typeof inputSchema !== "object") return void 0;
  const schema = inputSchema;
  const json = typeof schema.getSchema === "function" ? schema.getSchema() : inputSchema;
  const props = json?.properties;
  return props && typeof props === "object" ? props : void 0;
}
function acceptsProjectArg(tool) {
  const props = schemaProperties(tool?.inputSchema);
  return props !== void 0 && "project" in props;
}
function isSameProject(attempted, projectRoot) {
  if (typeof attempted !== "string" || attempted.trim() === "") return false;
  if (attempted === projectRoot || attempted === basename(projectRoot)) return true;
  return isAbsolute(attempted) && resolve(attempted) === resolve(projectRoot);
}
function pinToolsToProject(tools, projectRoot, opts = {}) {
  const prefix = opts.prefix ?? "handyman_";
  const warn = opts.warn ?? ((message) => console.warn(message));
  const pinned = [];
  const wrapped = { ...tools };
  for (const [name, tool] of Object.entries(tools)) {
    if (!name.startsWith(prefix) || !acceptsProjectArg(tool)) continue;
    const pinnable = tool;
    if (typeof pinnable.execute !== "function") continue;
    const execute = pinnable.execute.bind(tool);
    pinned.push(name);
    wrapped[name] = {
      ...tool,
      // async so a pinning rejection surfaces as a PROMISE rejection (the
      // underlying MCP execute is async; a sync throw would break consumers
      // that only handle rejections).
      execute: async (input, ...rest) => {
        if (!input || typeof input !== "object" || Array.isArray(input)) {
          return execute(input, ...rest);
        }
        const args = { ...input };
        const attempted = args.project;
        if (attempted === void 0 || attempted === null || attempted === "") {
          args.project = projectRoot;
        } else if (!isSameProject(attempted, projectRoot)) {
          const message = `[pinning] ${name} rejected: this agent is pinned to project "${projectRoot}" but the call attempted "${String(attempted)}". Retry with project="${projectRoot}" or omit the "project" argument.`;
          warn(message);
          throw new Error(message);
        }
        return execute(args, ...rest);
      }
    };
  }
  return { tools: wrapped, pinned };
}

"use strict";
const WRITABLE_ROLES = /* @__PURE__ */ new Set(["implementer", "skill"]);
function roleWorkspace(role, projectRoot, opts = {}) {
  const writable = WRITABLE_ROLES.has(role);
  return new Workspace({
    filesystem: new LocalFilesystem({ basePath: projectRoot, readOnly: !writable }),
    // Only writable roles get a shell: git/test/verifier execution is an
    // implementation concern; leader and reviewer probe through the MCP.
    ...writable ? { sandbox: new LocalSandbox({ workingDirectory: projectRoot }) } : {},
    // Skill scopes live OUTSIDE the contained project filesystem (user scope,
    // monorepo scopes): the default source (the workspace's own contained
    // filesystem) would deny them — read them through an uncontained
    // LocalSkillSource. BM25 local search feeds the SkillSearchProcessor.
    ...opts.skillDirs ? { skills: [...opts.skillDirs], skillSource: new LocalSkillSource(), bm25: true } : {}
  });
}

"use strict";
const MCP_PREFIX = "handyman_";
const READ_ONLY_PROBES = [
  "feature_next",
  "fleet_health",
  "fleet_status",
  "fleet_timeline",
  "harness_list",
  "metrics",
  "preflight",
  "sprint_status",
  "task_result",
  "upgrade_check",
  "verify"
];
const IMPLEMENTER_EXTRA = ["feature_log", "report_write"];
const REVIEWER_EXTRA = ["backlog_review"];
function implementerVerbs() {
  return [...READ_ONLY_PROBES, ...IMPLEMENTER_EXTRA];
}
function reviewerVerbs() {
  return [...READ_ONLY_PROBES, ...REVIEWER_EXTRA];
}
function toolsForVerbs(tools, verbs) {
  const allowed = new Set(verbs.map((v) => `${MCP_PREFIX}${v}`));
  return Object.fromEntries(Object.entries(tools).filter(([name]) => allowed.has(name)));
}
function activeToolKeys(role, declared) {
  const mandatory = role === "implementer" ? IMPLEMENTER_EXTRA : REVIEWER_EXTRA;
  const roleVerbs = new Set(role === "implementer" ? implementerVerbs() : reviewerVerbs());
  const verbs = /* @__PURE__ */ new Set([...mandatory, ...declared.filter((v) => roleVerbs.has(v))]);
  return [...verbs].map((v) => `${MCP_PREFIX}${v}`);
}

"use strict";
function roleBody(role, handymanAssetsDir) {
  const raw = readFileSync(
    join(handymanAssetsDir, "assets", `role-${role}.template.md`),
    "utf-8"
  );
  return raw.replace(/^---\n[\s\S]*?\n---\n/, "").trim();
}
function implementerInstructions(config) {
  return `
${roleBody("implementer", config.handymanAssetsDir)}

## Concrete protocol (this deployment)
You operate through your handyman_ tools on project "${config.projectRoot}" \u2014 PLUS a
workspace scoped to that same project root: file tools (read/write/edit/
list/grep) and a shell (execute_command: git, tests, the verifier). Use the
workspace when the feature involves real code changes; the MCP tools remain
the ONLY way to mutate harness state.
Your step budget is LIMITED \u2014 spend it on the work and your two required
writes, not on exploration (the leader already validated the harness; do NOT
run preflight/metrics/verify MCP probes).
For the feature named in the task, in this order:
1. handyman_feature_log with a one-line note (what you did for the feature).
2. handyman_report_write (kind "impl", feature = the name, content = what
   you did and why it meets the acceptance criteria). This write is your
   deliverable: a task without the report written is a FAILED task.
3. Reply with the report path and nothing else.
Write the report ONLY through handyman_report_write \u2014 the MCP tool stamps
the house frontmatter and enforces the never-overwrite policy. Never claim
the report exists unless the tool call succeeded.`;
}
function reviewerInstructions(config) {
  return `
${roleBody("reviewer", config.handymanAssetsDir)}

## Concrete protocol (this deployment)
You operate through your handyman_ tools on project "${config.projectRoot}"
(read-only probes plus backlog_review) \u2014 you have NO state-mutation verbs,
by design. You ALSO have a READ-ONLY filesystem on that project root: use it
to read the implementation report at .handyman/backlog/impl_<feature>.md and
the code the feature touched \u2014 judge artifacts you have READ, never the task
text alone (a verdict on an unread report is a hallucinated verdict; a 2026-07-28
run stamped "feature does not exist" for exactly that reason).
Your step budget is LIMITED: read the report, probe at most once or twice, go
straight to the verdict.
For the feature named in the task: assess the implementation against the
acceptance criteria. Then stamp your verdict with
handyman_backlog_review (status "approved" or "changes_requested") \u2014 the
verdict is your deliverable; a review without the stamp is a FAILED review.
Reply with the verdict and one line of justification. Never claim you
stamped unless the tool call succeeded.`;
}
function createRoleAgents(config, tools, opts = {}) {
  const implementerWorkspace = roleWorkspace("implementer", config.projectRoot, {
    skillDirs: opts.skillDirs
  });
  const implementer = new Agent({
    id: "implementer",
    name: "Implementer",
    description: "Implements exactly one feature: logs each step via feature_log and writes the impl report via report_write. Delegate the implementation step of a feature to it.",
    instructions: () => implementerInstructions(config),
    model: resolveModel(config.models.implementer, { catalogPath: config.modelCatalogPath }),
    tools: toolsForVerbs(tools, implementerVerbs()),
    workspace: implementerWorkspace,
    ...opts.skillDirs ? {
      inputProcessors: [
        new SkillSearchProcessor({
          workspace: implementerWorkspace,
          search: { topK: 5 }
        })
      ]
    } : {},
    defaultOptions: roleDefaultOptions(config.models.implementer)
  });
  const reviewer = new Agent({
    id: "reviewer",
    name: "Reviewer",
    description: "Reviews one implemented feature against its acceptance criteria and stamps the verdict via backlog_review. Delegate the review step to it after implementation.",
    instructions: () => reviewerInstructions(config),
    model: resolveModel(config.models.reviewer, { catalogPath: config.modelCatalogPath }),
    tools: toolsForVerbs(tools, reviewerVerbs()),
    workspace: roleWorkspace("reviewer", config.projectRoot),
    defaultOptions: roleDefaultOptions(config.models.reviewer)
  });
  return { implementer, reviewer };
}

"use strict";
function leaderInstructions(config) {
  const project = config.projectRoot;
  return `
${roleBody("leader", config.handymanAssetsDir)}

## Concrete protocol (this deployment)

You drive the handyman harness ONLY through your MCP tools (prefixed
handyman_). The project root for every call is "${project}" (pass it as
the "project" argument). The user message names the feature to work on.

Execute this sequence, in order, waiting for each result:
1. handyman_feature_add with the given name, a short title, a one-line
   description and one acceptance criterion. If the feature already exists
   the tool errors \u2014 note it and continue.
2. handyman_feature_start with the same name and no_preflight true.
3. Delegate to the implementer subagent: tell it the feature name and that
   it must log each step with handyman_feature_log and finish by writing
   its implementation report with handyman_report_write (kind "impl",
   feature = the name, content = summary of what was done).
4. Delegate to the reviewer subagent: tell it the feature name and that it
   must stamp its verdict with handyman_backlog_review (status "approved"
   or "changes_requested").
5. Only if the reviewer approved: handyman_feature_close with the name.
   If the close is refused (red verifier), report the refusal verbatim and
   stop. If the reviewer requested changes, report them and stop.
   ALWAYS the SYNC handyman_feature_close \u2014 NEVER handyman_feature_close_async
   or handyman_task_result (the async pair is for slow verifiers driven by a
   human operator, not for this loop).

HARD STOP rule: every tool call above targets EXACTLY the project
    "${project}". If that project's harness is missing or broken (feature_add
errors because the workspace does not exist), STOP and report the bootstrap
need \u2014 NEVER switch to another registered harness (harness_list/fleet_*
are read-only probes for observation, never a fallback target). A 2026-07-28
run with a broken scratch project drifted into the monorepo's feature list;
that is contamination, not initiative.

Finish with one short line per step: tool/delegation and outcome, plus the
final feature status. Do not call tools outside this protocol yourself
(steps 3-4 are delegations, not direct work). Discipline rules learned from
live runs: each delegation happens EXACTLY ONCE (one implementer, one
reviewer \u2014 never re-delegate); you NEVER call feature_log, report_write or
backlog_review yourself (those belong to the subagents); and you NEVER probe
task_result (it serves the human-driven async close, not this loop).

Auxiliary capabilities (NOT part of the cycle protocol): a READ-ONLY
filesystem on the project root for grounding your routing decisions, and the
web_search/web_fetch pair for internet research when the operator asks for
investigation work. If a github_ tool is present (GITHUB_TOKEN configured)
it is yours alone \u2014 never delegate it.${businessMemorySnapshot(project)}`;
}
async function connectHandymanMcp(config) {
  const mcp = new MCPClient({
    id: "handyman",
    servers: {
      handyman: { url: new URL(config.mcpUrl) },
      ...config.githubToken ? {
        github: {
          url: new URL("https://api.githubcopilot.com/mcp/"),
          requestInit: {
            headers: { Authorization: `Bearer ${config.githubToken}` }
          }
        }
      } : {}
    }
  });
  const rawTools = await mcp.listTools();
  const count = Object.keys(rawTools).length;
  if (count === 0)
    throw new Error(
      `MCP at ${config.mcpUrl} exposed 0 tools \u2014 is the handyman MCP server running? Start one with 'handyman mcp --http' (installed bin) or 'node handyman/dist/mcp.js --http' from a checkout, or point HANDYMAN_MCP_URL at a live server.`
    );
  const { tools, pinned } = pinToolsToProject(rawTools, config.projectRoot);
  if (pinned.length === 0 && Object.keys(rawTools).some((name) => name.startsWith("handyman_")))
    console.warn(
      "[pinning] WARNING: no handyman tool accepted a project arg \u2014 pinning is INERT (inputSchema shape drift?)"
    );
  console.log(
    `[mcp] connected to ${config.mcpUrl}: ${count} tools, ${pinned.length} pinned to ${config.projectRoot}${config.githubToken ? " (github MCP on)" : ""}`
  );
  return { tools, mcp };
}
async function createHandymanLeader(config, tools, options = {}) {
  const { implementer, reviewer } = options.subagents ?? createRoleAgents(config, tools);
  const skills = experimentalSkillDirs();
  return new Agent({
    id: "handyman-leader",
    name: "Handyman Leader",
    description: "Handyman leader: orchestrates implementer/reviewer subagents over the handyman MCP server.",
    instructions: () => leaderInstructions(config),
    model: resolveModel(config.models.leader, { catalogPath: config.modelCatalogPath }),
    tools: { ...tools, ...webTools() },
    agents: { implementer, reviewer },
    workspace: roleWorkspace("leader", config.projectRoot),
    ...skills.length > 0 ? { skills } : {},
    defaultOptions: roleDefaultOptions(config.models.leader),
    ...options.memory ? { memory: options.memory } : {}
  });
}

"use strict";

"use strict";
function handymanRoot(env = process.env) {
  const raw = env.HANDYMAN_ROOT;
  if (raw) return resolve(raw.replace(/^~(?=$|\/)/, homedir()));
  return join(homedir(), "HANDYMAN");
}
function handymanPackageDir() {
  try {
    return dirname(createRequire(import.meta.url).resolve("handyman-harness/package.json"));
  } catch {
    return void 0;
  }
}
function resolveHandymanAssetsDir(env = process.env, packageDir = void 0) {
  if (env.HANDYMAN_ASSETS_DIR) return env.HANDYMAN_ASSETS_DIR;
  const pkg = packageDir === void 0 ? handymanPackageDir() : packageDir;
  if (pkg) return pkg;
  if (env.HANDYMAN_REPO_ROOT) return join(env.HANDYMAN_REPO_ROOT, "handyman");
  throw new Error(
    "cannot locate the handyman assets (role templates, SKILL.md): set HANDYMAN_ASSETS_DIR, install the handyman-harness package, or point HANDYMAN_REPO_ROOT at a monorepo checkout."
  );
}
function readRegistryRoots(root) {
  try {
    const raw = readFileSync(join(root, "registry.json"), "utf-8");
    const parsed = JSON.parse(raw);
    return (parsed.harnesses ?? []).map((entry) => entry.project_root).filter((root2) => typeof root2 === "string");
  } catch {
    return [];
  }
}
function resolveProjectRoot(value, root) {
  if (!value) return void 0;
  if (isAbsolute(value)) return value;
  const roots = readRegistryRoots(root);
  const matches = roots.filter((candidate) => basename(candidate) === value);
  if (matches.length === 0) {
    const names = roots.map((candidate) => basename(candidate)).join(", ");
    throw new Error(
      `project '${value}' is not registered in ${join(root, "registry.json")}. Registered harnesses: ${names || "(none)"}. Pass a registered name, an absolute project root, or register it with 'handyman toolbox register <root>'.`
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `project name '${value}' is ambiguous: ${matches.length} registered harnesses share it: ${matches.join(", ")}. Pass the absolute project root instead of the name.`
    );
  }
  return matches[0];
}
function whichBin(name, env) {
  for (const dir of (env.PATH ?? "").split(":")) {
    if (!dir) continue;
    const candidate = join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  return void 0;
}
function resolveToolboxCommand(env = process.env, packageDir = void 0) {
  const override = env.HANDYMAN_TOOLBOX_CMD?.trim();
  if (override) {
    const [file, ...args] = override.split(/\s+/);
    return { file, args, source: "HANDYMAN_TOOLBOX_CMD" };
  }
  const bin = whichBin("handyman", env);
  if (bin) return { file: bin, args: ["toolbox", "register"], source: "handyman bin on PATH" };
  const pkg = packageDir === void 0 ? handymanPackageDir() : packageDir;
  if (pkg) {
    return {
      file: "node",
      args: [join(pkg, "dist", "cli.js"), "toolbox", "register"],
      source: "handyman-harness package"
    };
  }
  if (env.HANDYMAN_REPO_ROOT) {
    return {
      file: "node",
      args: [join(env.HANDYMAN_REPO_ROOT, "handyman", "dist", "toolbox.js"), "register"],
      source: "HANDYMAN_REPO_ROOT dev checkout"
    };
  }
  return void 0;
}

"use strict";
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
function harnessConfigName(projectRoot) {
  try {
    const raw = readFileSync(join(projectRoot, "harness.config.json"), "utf-8");
    const name = JSON.parse(raw).project_name;
    return typeof name === "string" && name.trim() !== "" ? name : void 0;
  } catch {
    return void 0;
  }
}
function loadConfig(env = process.env) {
  const root = handymanRoot(env);
  const projectRoot = resolveProjectRoot(env.HANDYMAN_PROJECT_ROOT, root) ?? process.cwd();
  const harnessId = env.HANDYMAN_HARNESS_ID ?? harnessConfigName(projectRoot) ?? basename(projectRoot);
  return {
    repoRoot: env.HANDYMAN_REPO_ROOT,
    handymanAssetsDir: resolveHandymanAssetsDir(env),
    handymanRoot: root,
    projectRoot,
    mcpUrl: env.HANDYMAN_MCP_URL ?? "http://127.0.0.1:8177/mcp",
    dataDir: env.HANDYMAN_DATA_DIR ?? join(root, "agent", harnessId, "data"),
    telemetryDir: env.HANDYMAN_TELEMETRY_DIR ?? join(root, "agent", harnessId, "logs"),
    modelCatalogPath: env.HANDYMAN_MODEL_CATALOG ?? join(PACKAGE_ROOT, "model-catalog.json"),
    githubToken: env.GITHUB_TOKEN ?? env.GH_TOKEN,
    harnessId,
    models: resolveRoleModels(env)
  };
}

"use strict";
function createHarnessIdentityProcessor(config) {
  return {
    name: "harness-identity",
    process(span) {
      if (!span) return void 0;
      span.attributes = {
        ...span.attributes,
        "handyman.harness.id": config.harnessId,
        "handyman.harness.root": config.projectRoot
      };
      return span;
    },
    async shutdown() {
    }
  };
}
function ensureHarnessRegistered(config, opts = {}) {
  const env = opts.env ?? process.env;
  if (env.HANDYMAN_HARNESS_REGISTER === "off") return;
  const exec = opts.exec ?? execFileSync;
  const command = resolveToolboxCommand(env, opts.packageDir);
  if (!command) {
    console.warn(
      `[harness] auto-register skipped for ${config.projectRoot}: no toolbox command found (set HANDYMAN_TOOLBOX_CMD, put the \`handyman\` bin on PATH, or install handyman-harness)`
    );
    return;
  }
  try {
    exec(command.file, [...command.args, config.projectRoot], { stdio: "pipe" });
  } catch (error) {
    const message = error instanceof Error ? error.message.split("\n")[0] ?? "" : String(error);
    console.warn(
      `[harness] auto-register skipped for ${config.projectRoot} (${command.source}): ${message}`
    );
  }
}

"use strict";
async function callHandymanTool(tools, verb, args) {
  const tool = tools[`handyman_${verb}`];
  if (!tool || typeof tool.execute !== "function") {
    return { ok: false, data: {}, error: `MCP tool handyman_${verb} is not available` };
  }
  let raw;
  try {
    raw = await tool.execute(args);
  } catch (error) {
    return { ok: false, data: {}, error: error instanceof Error ? error.message : String(error) };
  }
  const looksLikeMcpError = (text2) => /MCP error|Input validation|invalid arguments|"isError":\s*true|status:\s*error/i.test(text2);
  if (typeof raw === "string") {
    if (looksLikeMcpError(raw)) return { ok: false, data: {}, error: raw.slice(0, 500) };
    return { ok: true, data: { output: raw } };
  }
  const envelope = raw ?? {};
  const text = (envelope.content ?? []).filter((c) => c?.type === "text").map((c) => c.text ?? "").join("\n");
  if (envelope.isError) return { ok: false, data: {}, error: text || "MCP tool returned isError" };
  if (envelope.structuredContent && typeof envelope.structuredContent === "object") {
    return { ok: true, data: envelope.structuredContent };
  }
  if (!envelope.content && typeof raw === "object" && raw !== null && Object.keys(raw).length > 0) {
    return { ok: true, data: raw };
  }
  if (text && looksLikeMcpError(text)) {
    return { ok: false, data: {}, error: text.slice(0, 500) };
  }
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: true, data: text ? { output: text } : {} };
  }
}
function failureDetail(data) {
  const out = data.output ?? data.error ?? data.hint;
  const text = typeof out === "string" ? out : JSON.stringify(data);
  const lines = text.trim().split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const explanatory = lines.find((l) => /error|fail|refus|denied/i.test(l) && !/^status\s*:/i.test(l));
  return (explanatory ?? lines[0] ?? "").slice(0, 300);
}
function cliFailed(data) {
  return typeof data.exit === "number" && data.exit !== 0;
}
function buildCarriedSchema(ctx) {
  const skillItem = ctx.availableSkills.length ? z.enum(ctx.availableSkills) : z.string().min(1);
  const verbItem = ctx.availableVerbs.length ? z.enum(ctx.availableVerbs) : z.string().min(1);
  return z.object({
    feature: z.string().regex(/^[A-Za-z0-9_-]+$/, "feature name must be [A-Za-z0-9_-]+ (use hyphens, no spaces)").describe("Feature name ([A-Za-z0-9_-]+, no spaces)"),
    project: z.string().min(1).describe(`Must be exactly the configured project root (HARD STOP): ${ctx.project}`),
    title: z.string().min(1).optional().describe("Short title for feature_add"),
    description: z.string().min(1).optional().describe("One-paragraph description for feature_add"),
    acceptance: z.array(z.string().min(1)).min(1, "declare at least one acceptance criterion").describe("Real acceptance criteria (min 1) \u2014 they land in feature_list.json"),
    skills: z.array(skillItem).default([]).describe(
      ctx.availableSkills.length ? `Skill suggestions for the feature (available: ${ctx.availableSkills.join(", ")})` : "Skill suggestions (no local skills found in any scope)"
    ),
    mcps: z.array(verbItem).default([]).describe(
      ctx.availableVerbs.length ? `Extra MCP verbs to activate (available: ${ctx.availableVerbs.join(", ")})` : "Extra MCP verbs (none connected within the role sets)"
    ),
    detail: z.string().optional()
  }).superRefine((decl, issueCtx) => {
    if (decl.project !== ctx.project) {
      issueCtx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["project"],
        message: `declared project must be exactly "${ctx.project}" (HARD STOP: a run never drifts to another project)`
      });
    }
  });
}
const cycleOutputSchema = z.object({
  feature: z.string(),
  outcome: z.enum(["done", "changes_requested", "close_rejected", "add_failed", "start_failed"]),
  detail: z.string().optional()
});
function declarationBrief(inputData) {
  const criteria = inputData.acceptance.map((c, i) => `${i + 1}. ${c}`).join("\n");
  const skills = inputData.skills.length > 0 ? `
Suggested skills for this feature: ${inputData.skills.join(", ")} \u2014 load them FIRST with load_skill, and discover more on demand with search_skills if the task calls for it.` : `
No skills were suggested \u2014 if the task would benefit, discover relevant ones on demand with search_skills, then load_skill.`;
  const mcps = inputData.mcps.length > 0 ? `
MCP verbs declared for this run (your active tool set is exactly your protocol writes plus these): ${inputData.mcps.join(", ")}` : "";
  return `Project: ${inputData.project}
Acceptance criteria (declared at submission \u2014 every one must be met and evidenced):
${criteria}${skills}${mcps}`;
}
function createFeatureCycleWorkflow(opts) {
  const { tools, agents, project, availableSkills = {} } = opts;
  const roleVerbSet = /* @__PURE__ */ new Set([...implementerVerbs(), ...reviewerVerbs()]);
  const availableVerbs = Object.keys(tools).filter((key) => key.startsWith(MCP_PREFIX)).map((key) => key.slice(MCP_PREFIX.length)).filter((verb) => roleVerbSet.has(verb)).sort();
  const carriedSchema = buildCarriedSchema({
    project,
    availableSkills: Object.keys(availableSkills),
    availableVerbs
  });
  const addFeature = createStep({
    id: "add-feature",
    description: "feature_add via MCP with the DECLARED title/description/criteria; already-exists is noted, not fatal",
    inputSchema: carriedSchema,
    outputSchema: carriedSchema,
    execute: async ({ inputData, bail }) => {
      const res = await callHandymanTool(tools, "feature_add", {
        project,
        name: inputData.feature,
        title: inputData.title ?? inputData.feature,
        description: inputData.description ?? `Workflow-driven cycle for ${inputData.feature}`,
        acceptance: inputData.acceptance
      });
      if (res.ok && !cliFailed(res.data)) {
        return { ...inputData, detail: "feature_add: added" };
      }
      const detail = res.error ?? failureDetail(res.data);
      if (/already exists/i.test(detail)) {
        return { ...inputData, detail: `feature_add: noted (${detail})` };
      }
      return bail({ feature: inputData.feature, outcome: "add_failed", detail });
    }
  });
  const startFeature = createStep({
    id: "start-feature",
    description: "feature_start via MCP (no_preflight, same as the leader protocol)",
    inputSchema: carriedSchema,
    outputSchema: carriedSchema,
    execute: async ({ inputData, bail }) => {
      const res = await callHandymanTool(tools, "feature_start", {
        project,
        name: inputData.feature,
        no_preflight: true
      });
      if (res.ok && !cliFailed(res.data)) {
        return { ...inputData, detail: "feature_start: in_progress" };
      }
      return bail({
        feature: inputData.feature,
        outcome: "start_failed",
        detail: res.error ?? failureDetail(res.data)
      });
    }
  });
  const implement = createStep({
    id: "implement",
    description: "implementer agent: feature_log + report_write through its declared tool set",
    inputSchema: carriedSchema,
    outputSchema: carriedSchema,
    retries: 1,
    execute: async ({ inputData, requestContext, runId }) => {
      requestContext.set(MASTRA_THREAD_ID_KEY, `impl-${runId}`);
      const result = await agents.implementer.generate(
        `Implement the feature "${inputData.feature}" now.
${declarationBrief(inputData)}
Your two required writes: handyman_feature_log, then handyman_report_write with kind "impl" for feature "${inputData.feature}" \u2014 the report must show how EACH acceptance criterion is met. If the report already exists (a previous attempt completed it), reply with its path \u2014 never claim a write that did not succeed. Reply with the report path.`,
        {
          requestContext,
          ...inputData.mcps.length > 0 ? { activeTools: activeToolKeys("implementer", inputData.mcps) } : {}
        }
      );
      return { ...inputData, detail: `implementer: ${result.text}` };
    }
  });
  const review = createStep({
    id: "review",
    description: "reviewer agent: verdict against the DECLARED criteria, stamped via backlog_review",
    inputSchema: carriedSchema,
    outputSchema: carriedSchema,
    retries: 1,
    execute: async ({ inputData, requestContext }) => {
      const result = await agents.reviewer.generate(
        `Review the feature "${inputData.feature}" against its DECLARED acceptance criteria and stamp your verdict with handyman_backlog_review ("approved" or "changes_requested").
${declarationBrief(inputData)}
The implementer reported: ${inputData.detail ?? "(no implementer output)"}. Reply with the verdict and one line of justification.`,
        {
          requestContext,
          ...inputData.mcps.length > 0 ? { activeTools: activeToolKeys("reviewer", inputData.mcps) } : {}
        }
      );
      return { ...inputData, detail: `reviewer: ${result.text}` };
    }
  });
  const humanReview = createStep({
    id: "human-review",
    description: "HITL gate: suspends with the reviewer verdict until a human approves/rejects from the CLI",
    inputSchema: carriedSchema,
    outputSchema: carriedSchema,
    suspendSchema: z.object({
      feature: z.string(),
      review: z.string(),
      acceptance: z.array(z.string())
    }),
    resumeSchema: z.object({
      approved: z.boolean(),
      feedback: z.string().optional()
    }),
    execute: async ({ inputData, resumeData, suspend, bail }) => {
      if (!resumeData) {
        return await suspend({
          feature: inputData.feature,
          review: inputData.detail ?? "(no review text)",
          acceptance: inputData.acceptance
        });
      }
      if (!resumeData.approved) {
        return bail({
          feature: inputData.feature,
          outcome: "changes_requested",
          detail: resumeData.feedback ?? "rejected by human reviewer"
        });
      }
      return { ...inputData, detail: resumeData.feedback ?? "approved by human" };
    }
  });
  const closeFeature = createStep({
    id: "close-feature",
    description: "feature_close via MCP (verifier-gated); a refusal is a typed outcome, not a retry",
    inputSchema: carriedSchema,
    outputSchema: cycleOutputSchema,
    execute: async ({ inputData, bail }) => {
      const res = await callHandymanTool(tools, "feature_close", { project, name: inputData.feature });
      if (res.ok && res.data.closed === true) {
        return { feature: inputData.feature, outcome: "done", detail: inputData.detail };
      }
      return bail({
        feature: inputData.feature,
        outcome: "close_rejected",
        detail: res.ok ? failureDetail(res.data) : res.error
      });
    }
  });
  return createWorkflow({
    id: "feature-cycle",
    description: "Handyman feature cycle over MCP: add \u2192 start \u2192 implement (agent) \u2192 review (agent) \u2192 human gate (suspend/resume) \u2192 close (verifier-gated)",
    inputSchema: carriedSchema,
    outputSchema: cycleOutputSchema,
    // Transient infra only: business outcomes are values/bail and never reach the retrier.
    retryConfig: { attempts: 2, delay: 1e3 }
  }).then(addFeature).then(startFeature).then(implement).then(review).then(humanReview).then(closeFeature).commit();
}

"use strict";
function createProtocolTrajectoryScorer(expectedOrder) {
  return createScorer({
    id: "protocol-trajectory-order",
    name: "Protocol Trajectory Order",
    description: `Scores 1 if the protocol tool calls appear in order: ${expectedOrder.join(" \u2192 ")}`
  }).preprocess(async ({ run }) => {
    const trajectory = extractTrajectory(run.output);
    return {
      actualStepNames: trajectory.steps.map((s) => s.name),
      expectedOrder
    };
  }).generateScore(({ results }) => {
    const { actualStepNames, expectedOrder: expected } = results.preprocessStepResult;
    let lastIndex = -1;
    for (const name of expected) {
      const found = actualStepNames.indexOf(name, lastIndex + 1);
      if (found === -1) return 0;
      lastIndex = found;
    }
    return 1;
  });
}

"use strict";
async function buildApp() {
  const config = loadConfig();
  ensureHarnessRegistered(config);
  const { tools, mcp } = await connectHandymanMcp(config);
  const { memory, storage: memoryStorage } = createConversationMemory(config.dataDir);
  const skillDirs = skillSearchDirs({ projectRoot: config.projectRoot });
  const skillsRegistry = skillRegistry(skillDirs);
  const subagents = createRoleAgents(config, tools, {
    skillDirs
  });
  const leader = await createHandymanLeader(config, tools, { memory, subagents });
  const featureCycle = createFeatureCycleWorkflow({
    tools,
    agents: subagents,
    project: config.projectRoot,
    availableSkills: skillsRegistry
  });
  const observabilityStore = await new DuckDBStore({
    id: "handyman-mastra-observability",
    path: join(config.dataDir, "observability.duckdb")
  }).getStore("observability");
  const storage = new MastraCompositeStore({
    id: "handyman-mastra-storage",
    default: memoryStorage,
    domains: { observability: observabilityStore }
  });
  const mastra = new Mastra({
    agents: { leader, implementer: subagents.implementer, reviewer: subagents.reviewer },
    workflows: { "feature-cycle": featureCycle },
    // Scorer registry (phase 4): runEvals persists scores per case and looks
    // scorers up by id — unregistered ids warn on save. Instances here share
    // ids with the ones the eval runner creates inline; the eval's own
    // instances produce the scores, these make them persistable (mastra_scorers).
    scorers: {
      "check-tool-order": checks.toolOrder([
        "handyman_feature_add",
        "handyman_feature_start",
        "agent-implementer",
        "agent-reviewer",
        "handyman_feature_close"
      ]),
      "check-no-tool-errors": checks.noToolErrors(),
      "protocol-trajectory-order": createProtocolTrajectoryScorer([
        "handyman_feature_add",
        "handyman_feature_start",
        "agent-implementer",
        "agent-reviewer",
        "handyman_feature_close"
      ])
    },
    storage,
    observability: new Observability({
      configs: {
        default: {
          serviceName: "handyman-mastra",
          exporters: [new MastraStorageExporter()],
          // Privacy rule (same as the Flue sink): never persist message
          // content in spans — SensitiveDataFilter redacts it at export.
          spanOutputProcessors: [
            // Deployment-level harness identity on EVERY span (attributes —
            // the per-run channel stays requestContextKeys).
            createHarnessIdentityProcessor(config),
            new SensitiveDataFilter()
          ],
          requestContextKeys: ["feature", "project"]
        }
      }
    }),
    logger: new PinoLogger({ name: "mastra-handyman", level: "warn" })
  });
  return {
    mastra,
    /** Full MCP tool map (handyman_* verbs) — for probe agents built outside
     *  the registered topologies (skill mirror). Avoids a second MCPClient. */
    tools,
    /** Observability store domain (live DuckDB connection) — for metric
     *  aggregation ports (usage-aggregate). Do NOT open a second connection
     *  to the same file (single-writer lock). */
    observabilityStore,
    /** Release the MCP connection so the process can exit (an open
     *  MCPClient otherwise keeps the event loop alive forever). */
    close: () => mcp.disconnect()
  };
}

"use strict";
const {
  mastra
} = await buildApp();

export { mastra };

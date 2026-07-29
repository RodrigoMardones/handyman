// Config port: the SINGLE module that maps deployment env vars to a typed
// config object. Everything else in the package receives it by parameter
// (dependency injection) — no module-level process.env reads scattered
// across agent/port files. Provider API keys (Z_AI_API_KEY, KIMI_API_KEY)
// stay with the model-catalog port, which owns that concern.
//
// Variable convention (documented in README and the run-*.ts headers):
//   HANDYMAN_REPO_ROOT     monorepo root (role templates, skill dirs, model
//                          catalog); default = <cwd>/../.. (tsx runs from the
//                          package dir)
//   HANDYMAN_PROJECT_ROOT  project the agents drive: the MCP "project" arg,
//                          workspace basePath and .handyman lookups. It is a
//                          PATH, not a name — default = repoRoot (the monorepo
//                          drives itself); point it at a scratch root for spikes.
//   HANDYMAN_MCP_URL       handyman MCP endpoint (node handyman/dist/mcp.js --http)
//   HANDYMAN_DATA_DIR      Mastra state dir (LibSQL memory/workflows + DuckDB
//                          observability); default = <cwd>/data. ONE live
//                          process per dir: the DuckDB store takes an
//                          exclusive single-writer lock and the error is
//                          FATAL to the run — parallel runs MUST point at
//                          separate dirs.
//   HANDYMAN_TELEMETRY_DIR per-feature telemetry JSONL dir; default = <cwd>/logs
//   HANDYMAN_MODEL_CATALOG personal provider catalog path; default =
//                          <repoRoot>/agents/mastra-handyman/model-catalog.json
//   GITHUB_TOKEN / GH_TOKEN  enables GitHub's hosted MCP server for the
//                          leader (absent = handyman MCP only)
//   HANDYMAN_{LEADER,IMPLEMENTER,REVIEWER}_MODEL  per-role 'provider/model'
//                          specs (defaults in the model-catalog port)
import { join } from 'node:path';
import { resolveRoleModels } from './model-catalog';

export interface AppConfig {
  /** Monorepo root: handyman/assets role templates and the skill dirs live under it. */
  repoRoot: string;
  /** Project the agents drive (absolute path): MCP project arg, workspace
   *  basePath, .handyman/memory + backlog reads. */
  projectRoot: string;
  /** Handyman MCP endpoint URL. */
  mcpUrl: string;
  /** Mastra state dir (memory/workflows DB + observability). Single writer:
   *  one live process per dir. */
  dataDir: string;
  /** Per-feature telemetry JSONL output dir. */
  telemetryDir: string;
  /** Personal model catalog path (extra Anthropic-protocol providers). */
  modelCatalogPath: string;
  /** Token for GitHub's hosted MCP server (leader only); undefined = off. */
  githubToken: string | undefined;
  /** Per-role 'provider/model' specs. */
  models: ReturnType<typeof resolveRoleModels>;
}

/** Read the deployment config from env. Pure — pass a fake env in tests. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const repoRoot = env.HANDYMAN_REPO_ROOT ?? join(process.cwd(), '..', '..');
  return {
    repoRoot,
    projectRoot: env.HANDYMAN_PROJECT_ROOT ?? repoRoot,
    mcpUrl: env.HANDYMAN_MCP_URL ?? 'http://127.0.0.1:8177/mcp',
    dataDir: env.HANDYMAN_DATA_DIR ?? join(process.cwd(), 'data'),
    telemetryDir: env.HANDYMAN_TELEMETRY_DIR ?? join(process.cwd(), 'logs'),
    modelCatalogPath:
      env.HANDYMAN_MODEL_CATALOG ??
      join(repoRoot, 'agents', 'mastra-handyman', 'model-catalog.json'),
    githubToken: env.GITHUB_TOKEN ?? env.GH_TOKEN,
    models: resolveRoleModels(env),
  };
}

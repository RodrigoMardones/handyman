// App composition root (phase 2): connects the MCP, builds the agents with
// conversation memory, and registers everything in the central Mastra
// instance with composite storage (LibSQL for memory/workflows + DuckDB for
// the observability domain — LibSQL does not support metrics) and the
// Observability layer. The agent file must not know about any of this.
import { join } from 'node:path';
import {
  checks,
  DuckDBStore,
  Mastra,
  MastraCompositeStore,
  MastraStorageExporter,
  Observability,
  PinoLogger,
  SensitiveDataFilter,
} from './mastra';
import {
  connectHandymanMcp,
  createHandymanLeader,
  createRoleAgents,
} from './agents/handyman';
import { createConversationMemory } from './ports/memory';
import { loadConfig } from './ports/config';
import { createFeatureCycleWorkflow } from './workflows/feature-cycle';
import { createProtocolTrajectoryScorer } from './evals/protocol-trajectory';

export async function buildApp() {
  const config = loadConfig();
  const { tools, mcp } = await connectHandymanMcp(config);
  const { memory, storage: memoryStorage } = createConversationMemory(config.dataDir);
  // One definition of the role agents, two orchestration topologies: nested
  // in the leader (supervisor, run-feature.ts) and top-level for the
  // feature-cycle workflow (run-workflow.ts), where the workflow — not an
  // LLM — routes the cycle.
  const subagents = createRoleAgents(config, tools);
  const leader = await createHandymanLeader(config, tools, { memory, subagents });
  const featureCycle = createFeatureCycleWorkflow({
    tools,
    agents: subagents,
    project: config.projectRoot,
  });

  const observabilityStore = await new DuckDBStore({
    id: 'handyman-mastra-observability',
    path: join(config.dataDir, 'observability.duckdb'),
  }).getStore('observability');

  const storage = new MastraCompositeStore({
    id: 'handyman-mastra-storage',
    default: memoryStorage,
    domains: { observability: observabilityStore },
  });

  const mastra = new Mastra({
    agents: { leader, implementer: subagents.implementer, reviewer: subagents.reviewer },
    workflows: { 'feature-cycle': featureCycle },
    // Scorer registry (phase 4): runEvals persists scores per case and looks
    // scorers up by id — unregistered ids warn on save. Instances here share
    // ids with the ones the eval runner creates inline; the eval's own
    // instances produce the scores, these make them persistable (mastra_scorers).
    scorers: {
      'check-tool-order': checks.toolOrder([
        'handyman_feature_add',
        'handyman_feature_start',
        'agent-implementer',
        'agent-reviewer',
        'handyman_feature_close',
      ]),
      'check-no-tool-errors': checks.noToolErrors(),
      'protocol-trajectory-order': createProtocolTrajectoryScorer([
        'handyman_feature_add',
        'handyman_feature_start',
        'agent-implementer',
        'agent-reviewer',
        'handyman_feature_close',
      ]),
    },
    storage,
    observability: new Observability({
      configs: {
        default: {
          serviceName: 'handyman-mastra',
          exporters: [new MastraStorageExporter()],
          // Privacy rule (same as the Flue sink): never persist message
          // content in spans — SensitiveDataFilter redacts it at export.
          spanOutputProcessors: [new SensitiveDataFilter()],
          requestContextKeys: ['feature'],
        },
      },
    }),
    logger: new PinoLogger({ name: 'mastra-handyman', level: 'warn' }),
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
    close: () => mcp.disconnect(),
  };
}

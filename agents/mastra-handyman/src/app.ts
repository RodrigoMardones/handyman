// App composition root (phase 2): connects the MCP, builds the agents with
// conversation memory, and registers everything in the central Mastra
// instance with composite storage (LibSQL for memory/workflows + DuckDB for
// the observability domain — LibSQL does not support metrics) and the
// Observability layer. The agent file must not know about any of this.
import { join } from 'node:path';
import {
  DuckDBStore,
  Mastra,
  MastraCompositeStore,
  MastraStorageExporter,
  Observability,
  PinoLogger,
  SensitiveDataFilter,
} from './mastra';
import { connectHandymanMcp, createHandymanLeader } from './agents/handyman-leader';
import { createConversationMemory, DATA_DIR } from './ports/memory';

export async function buildApp() {
  const { tools, mcp } = await connectHandymanMcp();
  const { memory, storage: memoryStorage } = createConversationMemory();
  const leader = await createHandymanLeader(tools, { memory });

  const observabilityStore = await new DuckDBStore({
    id: 'handyman-mastra-observability',
    path: join(DATA_DIR, 'observability.duckdb'),
  }).getStore('observability');

  const storage = new MastraCompositeStore({
    id: 'handyman-mastra-storage',
    default: memoryStorage,
    domains: { observability: observabilityStore },
  });

  const mastra = new Mastra({
    agents: { leader },
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
    /** Release the MCP connection so the process can exit (an open
     *  MCPClient otherwise keeps the event loop alive forever). */
    close: () => mcp.disconnect(),
  };
}

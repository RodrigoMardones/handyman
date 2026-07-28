// Anti-volatility barrel (convention inherited from the Flue ADR): the ONLY
// module in this package allowed to import from @mastra/* and @ai-sdk/*.
// Mastra ships 2-4 minors a week and has broken new surfaces post-1.0
// (e.g. the 1.47.0 Harness→AgentController rename, with /harness/* routes
// removed outright). When the surface moves, the adaptation touches THIS
// file and nothing else. Every other module imports from '../mastra' (or
// '../../src/mastra').
export { Mastra } from '@mastra/core';
export { Agent } from '@mastra/core/agent';
export { RequestContext } from '@mastra/core/request-context';
export { MastraCompositeStore } from '@mastra/core/storage';
export { createStep, createWorkflow } from '@mastra/core/workflows';
export { MCPClient } from '@mastra/mcp';
export { Memory } from '@mastra/memory';
export { LibSQLStore } from '@mastra/libsql';
export { DuckDBStore } from '@mastra/duckdb';
export { PinoLogger } from '@mastra/loggers';
export {
  Observability,
  MastraStorageExporter,
  SensitiveDataFilter,
} from '@mastra/observability';
export { createAnthropic } from '@ai-sdk/anthropic';

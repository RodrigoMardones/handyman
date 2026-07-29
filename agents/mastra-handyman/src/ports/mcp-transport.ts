// MCP transport composition (feature 104, mastra_embedded_mcp_stdio): builds
// the MCPClient server definition for the handyman server from the injected
// config.
//   http  → { url } — connect to a server the operator already runs (the
//           pre-104 topology, unchanged default).
//   stdio → spawn the MCP as a CHILD of this process (`node
//           <handymanAssetsDir>/dist/mcp.js` — stdio is the toolchain's
//           default transport, --http is opt-in): ONE command runs client +
//           server, no shared HTTP MCP to boot. Env passthrough is
//           deliberate and minimal: HANDYMAN_ROOT (the child's registry
//           reads), PATH (the server shells out to git), HOME.
// Lifecycle: MCPClient.disconnect() closes the stdio transport and kills the
// child — the runners already call close() in their finally path; on an
// abnormal exit (SIGINT/crash) the child sees stdin EOF and exits on its own
// (verified by scripts/smoke_stdio.sh: no orphan dist/mcp.js survives).
// The server-definition union is described STRUCTURALLY here (not imported
// from @mastra/mcp) so the port stays free of @mastra imports — the
// anti-volatility barrel owns those; the shapes mirror
// MastraMCPServerDefinition (verified against @mastra/mcp 1.15.0 types).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AppConfig } from './config';

export type HandymanServerDefinition =
  | { url: URL }
  | { command: string; args: string[]; env: Record<string, string> };

/** Absolute path of the MCP server entry inside the handyman package. */
export function handymanMcpEntry(config: AppConfig): string {
  return join(config.handymanAssetsDir, 'dist', 'mcp.js');
}

/** Human-readable connection target for logs/errors (url or child entry). */
export function handymanMcpTarget(config: AppConfig): string {
  return config.mcpTransport === 'stdio' ? handymanMcpEntry(config) : config.mcpUrl;
}

/** Server definition for the handyman server, per HANDYMAN_MCP_TRANSPORT.
 *  `env` is injectable for tests (the passthrough source). Throws an
 *  actionable error when stdio is asked for but the MCP entry was never
 *  built. */
export function handymanServerDefinition(
  config: AppConfig,
  env: NodeJS.ProcessEnv = process.env,
): HandymanServerDefinition {
  if (config.mcpTransport === 'http') return { url: new URL(config.mcpUrl) };
  const entry = handymanMcpEntry(config);
  if (!existsSync(entry)) {
    throw new Error(
      `cannot spawn the embedded MCP: ${entry} does not exist — build the handyman toolchain ` +
        `(npm run build in handyman/) or use HANDYMAN_MCP_TRANSPORT=http with a running server.`,
    );
  }
  return {
    command: process.execPath,
    args: [entry],
    env: {
      PATH: env.PATH ?? '',
      HOME: env.HOME ?? '',
      HANDYMAN_ROOT: config.handymanRoot,
    },
  };
}

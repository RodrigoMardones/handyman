// NativeTools factory (feature 98): the full handyman tool surface as native
// Flue tools — the 25 MCP verbs plus handyman_resume (the resume MCP resource
// as a tool), with NO prefix and no `project` argument: the agent instance is
// scoped to one project root, closed over here. This replaces the handyman MCP
// server as the tool source; the verb contract (CLI args, confirm gates,
// refusal payloads) is identical, so the role protocols carry over unchanged.
import type { ToolDefinition } from '../flue';
import { createGatedTools } from './gated';
import { createProbeTools } from './probes';
import { createStateTools } from './state';

/** All 26 native handyman tools for one project root (absolute path). */
export function createNativeTools(deps: { projectRoot: string }): ToolDefinition[] {
  const { projectRoot } = deps;
  return [...createProbeTools(projectRoot), ...createStateTools(projectRoot), ...createGatedTools(projectRoot)];
}

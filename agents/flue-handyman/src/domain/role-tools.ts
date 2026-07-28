// Per-role MCP tool sets (feature 97). Roles are prompts, but the TOOL SET is
// code: the leader owns the cycle verbs; the implementer can only log and
// write its report; the reviewer is read-only plus its verdict. Rationale:
// the 2026-07-28 demo_estable run showed a reviewer probing with
// feature_block/feature_unblock during review — now those tools simply do
// not exist for that profile.
//
// The verb lists and the filter live here (pure domain module) so the unit
// tests can pin the REAL prefixed naming (`mcp__handyman__<verb>`): the first
// version of this filter lived in the agent file and built
// `mcp__handyman____<verb>` (double underscore), silently producing EMPTY
// tool sets — structural greps stayed green while subagents had no MCP tools
// at all (found in the demo_grounding_2 run).
import type { ToolDefinition } from '../flue';

/** Tool name prefix applied by connectMcpServer('handyman', ...). */
export const MCP_PREFIX = 'mcp__handyman__';

/** Read-only probes shared by all subagent profiles. */
export const READ_ONLY_PROBES = [
  'feature_next',
  'fleet_health',
  'fleet_status',
  'fleet_timeline',
  'harness_list',
  'metrics',
  'preflight',
  'sprint_status',
  'task_result',
  'upgrade_check',
  'verify',
] as const;

/** Implementer: probes + its two protocol writes (log steps, write report). */
export const IMPLEMENTER_EXTRA = ['feature_log', 'report_write'] as const;

/** Reviewer: probes + its verdict stamp. NOTHING that mutates feature state. */
export const REVIEWER_EXTRA = ['backlog_review'] as const;

/** Verb list for the implementer profile. */
export function implementerVerbs(): readonly string[] {
  return [...READ_ONLY_PROBES, ...IMPLEMENTER_EXTRA];
}

/** Verb list for the reviewer profile. */
export function reviewerVerbs(): readonly string[] {
  return [...READ_ONLY_PROBES, ...REVIEWER_EXTRA];
}

/** Filter an MCP tool list down to the named verbs (prefix included). */
export function toolsForVerbs(tools: ToolDefinition[], verbs: readonly string[]): ToolDefinition[] {
  const allowed = new Set(verbs.map((v) => `${MCP_PREFIX}${v}`));
  return tools.filter((t) => allowed.has(t.name));
}

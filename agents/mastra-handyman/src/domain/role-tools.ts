// Per-role MCP tool sets (ported from the Flue integration, feature 97).
// Roles are prompts, but the TOOL SET is code: the leader owns the cycle
// verbs; the implementer can only log and write its report; the reviewer is
// read-only plus its verdict. Rationale: the 2026-07-28 demo_estable run
// (Flue) showed a reviewer probing with feature_block/feature_unblock during
// review — now those tools simply do not exist for that profile.
//
// Mastra's MCPClient.listTools() returns a Record keyed `<server>_<tool>`,
// so with server id 'handyman' the verb `feature_add` surfaces as
// `handyman_feature_add`. Exact-match filtering (Set membership) keeps the
// underscore-heavy verb names unambiguous.

/** Key prefix applied by MCPClient for the 'handyman' server. */
export const MCP_PREFIX = 'handyman_';

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

/** Filter an MCPClient tool map down to the named verbs (prefix included). */
export function toolsForVerbs<T>(
  tools: Record<string, T>,
  verbs: readonly string[],
): Record<string, T> {
  const allowed = new Set(verbs.map((v) => `${MCP_PREFIX}${v}`));
  return Object.fromEntries(Object.entries(tools).filter(([name]) => allowed.has(name)));
}

/** Tool keys ACTIVE for one declared run of a role: the role's
 *  protocol-mandatory verbs (its writes) plus any declared extras that
 *  belong to its set. A declaration can only NARROW within the role set —
 *  never widen past it (foreign verbs are dropped here; the workflow schema
 *  already rejects them at submission). */
export function activeToolKeys(
  role: 'implementer' | 'reviewer',
  declared: readonly string[],
): string[] {
  const mandatory = role === 'implementer' ? IMPLEMENTER_EXTRA : REVIEWER_EXTRA;
  const roleVerbs = new Set(role === 'implementer' ? implementerVerbs() : reviewerVerbs());
  const verbs = new Set<string>([...mandatory, ...declared.filter((v) => roleVerbs.has(v))]);
  return [...verbs].map((v) => `${MCP_PREFIX}${v}`);
}

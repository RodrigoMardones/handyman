// Unit tests for the per-role MCP tool sets. The fake tool names mirror the
// REAL prefixed naming produced by connectMcpServer (verified against the
// runtime: `mcp__<server>__<tool>`) — the regression these tests pin is an
// empty-set filter caused by a double-underscore bug that source greps could
// not see.
import { describe, expect, it } from 'vitest';
import {
  IMPLEMENTER_EXTRA,
  MCP_PREFIX,
  READ_ONLY_PROBES,
  REVIEWER_EXTRA,
  implementerVerbs,
  reviewerVerbs,
  toolsForVerbs,
} from './role-tools';
import type { ToolDefinition } from '../flue';

// All 25 contract verbs (mirror of tests/test_mcp.js tools/list).
const CONTRACT_VERBS = [
  'backlog_review', 'feature_acceptance', 'feature_add', 'feature_block',
  'feature_close', 'feature_close_async', 'feature_log', 'feature_next',
  'feature_next_step', 'feature_start', 'feature_unblock', 'fleet_health',
  'fleet_status', 'fleet_timeline', 'handoff_claim', 'handoff_submit',
  'harness_list', 'metrics', 'preflight', 'report_write', 'sprint_close',
  'sprint_status', 'task_result', 'upgrade_check', 'verify',
];

const fakeTools = CONTRACT_VERBS.map((name) => ({
  name: `${MCP_PREFIX}${name}`,
})) as unknown as ToolDefinition[];

const STATE_VERBS = [
  'feature_add', 'feature_start', 'feature_close', 'feature_close_async',
  'feature_block', 'feature_unblock', 'feature_acceptance', 'feature_log',
  'feature_next_step', 'sprint_close', 'report_write', 'handoff_submit',
  'handoff_claim',
];

describe('role tool sets', () => {
  it('resolves the real prefixed MCP names (no empty-set regression)', () => {
    expect(toolsForVerbs(fakeTools, ['backlog_review'])).toHaveLength(1);
    expect(toolsForVerbs(fakeTools, reviewerVerbs())).toHaveLength(
      READ_ONLY_PROBES.length + REVIEWER_EXTRA.length,
    );
    expect(toolsForVerbs(fakeTools, implementerVerbs())).toHaveLength(
      READ_ONLY_PROBES.length + IMPLEMENTER_EXTRA.length,
    );
  });

  it('reviewer set is read-only plus its verdict', () => {
    const names = toolsForVerbs(fakeTools, reviewerVerbs()).map((t) => t.name);
    for (const v of STATE_VERBS) {
      expect(names).not.toContain(`${MCP_PREFIX}${v}`);
    }
    expect(names).toContain(`${MCP_PREFIX}backlog_review`);
    expect(names).toContain(`${MCP_PREFIX}verify`);
  });

  it('implementer set adds exactly feature_log + report_write to the probes', () => {
    const names = toolsForVerbs(fakeTools, implementerVerbs()).map((t) => t.name);
    expect(names).toContain(`${MCP_PREFIX}feature_log`);
    expect(names).toContain(`${MCP_PREFIX}report_write`);
    for (const v of STATE_VERBS.filter((s) => s !== 'feature_log' && s !== 'report_write')) {
      expect(names).not.toContain(`${MCP_PREFIX}${v}`);
    }
  });

  it('every whitelisted verb exists in the 25-tool contract', () => {
    for (const v of [...READ_ONLY_PROBES, ...IMPLEMENTER_EXTRA, ...REVIEWER_EXTRA]) {
      expect(CONTRACT_VERBS).toContain(v);
    }
  });
});

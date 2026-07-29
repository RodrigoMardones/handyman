// Unit tests for the per-role tool filter. Ported from the Flue package
// (TFA14 lineage): these pin the REAL MCPClient key naming (`handyman_<verb>`)
// because the first Flue version of this filter built a double-underscore
// prefix that silently produced EMPTY tool sets while structural greps
// stayed green.
import { describe, expect, it } from 'vitest';
import {
  activeToolKeys,
  implementerVerbs,
  MCP_PREFIX,
  READ_ONLY_PROBES,
  reviewerVerbs,
  toolsForVerbs,
} from './role-tools';

/** Fake tool map shaped like MCPClient.listTools() output. */
function fakeTools(verbs: string[]): Record<string, { name: string }> {
  return Object.fromEntries(verbs.map((v) => [`${MCP_PREFIX}${v}`, { name: `${MCP_PREFIX}${v}` }]));
}

const ALL_VERBS = [
  ...READ_ONLY_PROBES,
  'feature_add',
  'feature_start',
  'feature_log',
  'feature_next_step',
  'feature_block',
  'feature_unblock',
  'feature_acceptance',
  'feature_close',
  'feature_close_async',
  'backlog_review',
  'report_write',
  'sprint_close',
  'handoff_submit',
  'handoff_claim',
];

describe('toolsForVerbs', () => {
  it('implementer gets probes + feature_log + report_write and nothing else', () => {
    const filtered = toolsForVerbs(fakeTools(ALL_VERBS), implementerVerbs());
    const names = Object.keys(filtered).sort();
    expect(names).toContain(`${MCP_PREFIX}feature_log`);
    expect(names).toContain(`${MCP_PREFIX}report_write`);
    expect(names).toContain(`${MCP_PREFIX}feature_next`);
    expect(names).toHaveLength(implementerVerbs().length);
    // State-mutation verbs must NOT exist for the implementer:
    for (const forbidden of ['feature_add', 'feature_start', 'feature_close', 'feature_block', 'backlog_review']) {
      expect(names).not.toContain(`${MCP_PREFIX}${forbidden}`);
    }
  });

  it('reviewer gets probes + backlog_review and NO feature-state mutation', () => {
    const filtered = toolsForVerbs(fakeTools(ALL_VERBS), reviewerVerbs());
    const names = Object.keys(filtered).sort();
    expect(names).toContain(`${MCP_PREFIX}backlog_review`);
    expect(names).toHaveLength(reviewerVerbs().length);
    for (const forbidden of ['feature_add', 'feature_start', 'feature_log', 'feature_close', 'feature_block', 'feature_unblock', 'report_write', 'sprint_close']) {
      expect(names).not.toContain(`${MCP_PREFIX}${forbidden}`);
    }
  });

  it('returns an empty map when the server exposes none of the verbs', () => {
    expect(Object.keys(toolsForVerbs(fakeTools(['nope']), reviewerVerbs()))).toHaveLength(0);
  });
});

describe('activeToolKeys', () => {
  it('implementer: protocol writes + declared probes within its set', () => {
    const keys = activeToolKeys('implementer', ['verify', 'metrics']);
    expect(keys).toContain(`${MCP_PREFIX}feature_log`);
    expect(keys).toContain(`${MCP_PREFIX}report_write`);
    expect(keys).toContain(`${MCP_PREFIX}verify`);
    expect(keys).toContain(`${MCP_PREFIX}metrics`);
    expect(keys).not.toContain(`${MCP_PREFIX}backlog_review`);
  });

  it('reviewer: verdict + declared probes, never implementer writes', () => {
    const keys = activeToolKeys('reviewer', ['verify', 'feature_log']);
    expect(keys).toContain(`${MCP_PREFIX}backlog_review`);
    expect(keys).toContain(`${MCP_PREFIX}verify`);
    // feature_log is outside the reviewer set — dropped even if declared:
    expect(keys).not.toContain(`${MCP_PREFIX}feature_log`);
  });

  it('empty declaration narrows to the protocol writes only', () => {
    expect(activeToolKeys('implementer', []).sort()).toEqual(
      [`${MCP_PREFIX}feature_log`, `${MCP_PREFIX}report_write`].sort(),
    );
  });
});

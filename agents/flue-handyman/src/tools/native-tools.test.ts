// Unit + cheap integration tests for the native handyman tools (feature 98).
// Integration cases run against the REAL repo root and are restricted to
// read-only calls: feature_next/metrics/harness_list observations and the
// confirm-gate DRY-RUN paths (sprint_close without confirm spawns only
// `sprint.js close --dry-run`; feature_acceptance with force and no confirm
// spawns nothing at all). No mutating verb is exercised here.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createNativeTools } from './index';
import type { ToolDefinition } from '../flue';

// All 26 native tool names: the 25 MCP contract verbs + handyman_resume.
const EXPECTED_TOOLS = [
  'backlog_review', 'feature_acceptance', 'feature_add', 'feature_block',
  'feature_close', 'feature_close_async', 'feature_log', 'feature_next',
  'feature_next_step', 'feature_start', 'feature_unblock', 'fleet_health',
  'fleet_status', 'fleet_timeline', 'handoff_claim', 'handoff_submit',
  'handyman_resume', 'harness_list', 'metrics', 'preflight', 'report_write',
  'sprint_close', 'sprint_status', 'task_result', 'upgrade_check', 'verify',
];

// The real harness root (mirrors src/agents/handyman-leader.ts anchoring):
// vitest runs with cwd = this package's dir, so repo root = cwd/../..
const PROJECT_ROOT = process.env.HANDYMAN_PROJECT_ROOT ?? join(process.cwd(), '..', '..');

const tools = createNativeTools({ projectRoot: PROJECT_ROOT });

function tool(name: string): ToolDefinition {
  const found = tools.find((t) => t.name === name);
  if (!found) {
    throw new Error(`tool '${name}' not registered`);
  }
  return found;
}

/** Call a tool's run with a loose input (the concrete input type lives in the schema). */
function call(name: string, input: Record<string, unknown> = {}) {
  return (tool(name) as any).run({ input }) as Promise<Record<string, unknown>>;
}

describe('createNativeTools', () => {
  it('returns definitions for all 26 expected names', () => {
    const names = tools.map((t) => t.name);
    expect(names).toHaveLength(EXPECTED_TOOLS.length);
    for (const expected of EXPECTED_TOOLS) {
      expect(names).toContain(expected);
    }
  });

  it('every definition has name, description, and a run function', () => {
    for (const t of tools) {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(typeof t.run).toBe('function');
    }
  });
});

describe('confirm gates (real repo root, side-effect free)', () => {
  it('sprint_close without confirm runs only the dry-run and asks for confirmation', async () => {
    const result = await call('sprint_close');
    expect(result.requiresConfirmation).toBe(true);
    expect(result.closed).toBe(false);
    expect(typeof result.preview).toBe('string');
    expect(result.message).toContain('confirm: true');
  }, 30_000);

  it('feature_acceptance with force and no confirm refuses WITHOUT spawning', async () => {
    const result = await call('feature_acceptance', {
      name: 'any_done_feature',
      acceptance: ['criterion'],
      force: true,
    });
    expect(result.requiresConfirmation).toBe(true);
    expect(result.forced).toBe(false);
    expect(result.message).toContain('confirm: true');
    // No subprocess ran: there is no exit/output payload.
    expect(result.exit).toBeUndefined();
    expect(result.output).toBeUndefined();
  });
});

describe('read-only integration (real repo root)', () => {
  it('feature_next returns the drained/ready shape', async () => {
    const result = await call('feature_next');
    expect(result.ok).toBe(true);
    expect(typeof result.drained).toBe('boolean');
    expect(Array.isArray(result.ready)).toBe(true);
  }, 30_000);

  it('metrics returns the derived snapshot', async () => {
    const result = await call('metrics');
    expect(result.ok).toBe(true);
    expect(result.status_counts).toBeDefined();
  }, 30_000);

  it('harness_list returns an object with the harnesses array', async () => {
    const result = await call('harness_list');
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.harnesses)).toBe(true);
  });
});

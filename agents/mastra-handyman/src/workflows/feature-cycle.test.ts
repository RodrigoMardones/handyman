// Unit tests for the phase-3 workflow module: the MCP envelope normalization
// (the piece with real variance — Mastra's wrapper shape is not contractual)
// and the workflow graph shape. No MCP server, no model calls.
import { describe, expect, it } from 'vitest';
import { createRoleAgents } from '../agents/handyman';
import type { AppConfig } from '../ports/config';
import {
  callHandymanTool,
  carriedSchema,
  createFeatureCycleWorkflow,
  cliFailed,
  failureDetail,
} from './feature-cycle';

function fakeTool(result: unknown) {
  return { execute: async () => result };
}

describe('callHandymanTool', () => {
  it('reports an unavailable tool without throwing', async () => {
    const res = await callHandymanTool({}, 'feature_add', {});
    expect(res.ok).toBe(false);
    expect(res.error).toContain('handyman_feature_add');
  });

  it('normalizes an execute() throw into ok:false', async () => {
    const tools = {
      handyman_feature_add: {
        execute: async () => {
          throw new Error('connection refused');
        },
      },
    };
    const res = await callHandymanTool(tools, 'feature_add', {});
    expect(res).toMatchObject({ ok: false, error: 'connection refused' });
  });

  it('normalizes an isError envelope into ok:false with the text', async () => {
    const tools = {
      handyman_feature_add: fakeTool({
        isError: true,
        content: [{ type: 'text', text: 'Error: workspace missing' }],
      }),
    };
    const res = await callHandymanTool(tools, 'feature_add', {});
    expect(res).toMatchObject({ ok: false, error: 'Error: workspace missing' });
  });

  it('prefers structuredContent when present', async () => {
    const tools = {
      handyman_feature_close: fakeTool({
        content: [{ type: 'text', text: '{"closed":false}' }],
        structuredContent: { closed: false, exit: 1, output: 'verifier failed' },
      }),
    };
    const res = await callHandymanTool(tools, 'feature_close', {});
    expect(res.ok).toBe(true);
    expect(res.data).toMatchObject({ closed: false, exit: 1 });
  });

  it('falls back to parsing the text content as JSON', async () => {
    const tools = { handyman_feature_add: fakeTool({ content: [{ type: 'text', text: '{"exit":0}' }] }) };
    const res = await callHandymanTool(tools, 'feature_add', {});
    expect(res.data).toEqual({ exit: 0 });
  });

  it('accepts an already-unwrapped payload object', async () => {
    const tools = { handyman_feature_add: fakeTool({ exit: 0, output: 'added' }) };
    const res = await callHandymanTool(tools, 'feature_add', {});
    expect(res.data).toEqual({ exit: 0, output: 'added' });
  });

  it('treats an MCP error TEXT result as failure, not success (2026-07-28 incident)', async () => {
    // Mastra's MCPClient hands server-side isError rejections back as plain
    // text (gotcha 12): without the guard, a server-rejected feature_add
    // read as ok:true with empty data and the step reported "added".
    const tools = {
      handyman_feature_add: fakeTool(
        'MCP error -32602: Input validation error: feature name must be [A-Za-z0-9_-]+',
      ),
    };
    const res = await callHandymanTool(tools, 'feature_add', {});
    expect(res.ok).toBe(false);
    expect(res.error).toContain('feature name must be');
  });

  it('detects an MCP error inside text content with the isError flag stripped', async () => {
    const tools = {
      handyman_feature_add: fakeTool({
        content: [{ type: 'text', text: 'MCP error -32602: Input validation error: bad name' }],
      }),
    };
    const res = await callHandymanTool(tools, 'feature_add', {});
    expect(res.ok).toBe(false);
  });

  it('keeps plain-text non-error results as ok output', async () => {
    const tools = { handyman_feature_log: fakeTool('logged') };
    const res = await callHandymanTool(tools, 'feature_log', {});
    expect(res).toMatchObject({ ok: true, data: { output: 'logged' } });
  });
});

describe('cliFailed / failureDetail', () => {
  it('cliFailed only triggers on a non-zero exit number', () => {
    expect(cliFailed({ exit: 1 })).toBe(true);
    expect(cliFailed({ exit: 0 })).toBe(false);
    expect(cliFailed({})).toBe(false);
  });

  it('failureDetail returns the first line of the output', () => {
    expect(failureDetail({ output: "feature 'x' already exists\nmore" })).toBe("feature 'x' already exists");
    expect(failureDetail({})).toBe('{}');
  });

  it('failureDetail prefers the explanatory line over a terse status line', () => {
    // feature.js done prints `status: error` (stdout) and the reason (stderr),
    // concatenated in stream order — the reason is what a human needs.
    expect(failureDetail({ output: 'status: error\nerror: verifier failed (exit 1)' })).toBe(
      'error: verifier failed (exit 1)',
    );
  });
});

describe('createFeatureCycleWorkflow', () => {
  it('builds the committed six-step cycle graph', () => {
    // Empty tool map: agent construction is offline (no model call happens
    // here; instructions are functions, so role templates are not read at
    // build time either).
    const config: AppConfig = {
      repoRoot: '/tmp',
      projectRoot: '/tmp',
      mcpUrl: 'http://127.0.0.1:8177/mcp',
      dataDir: '/tmp',
      telemetryDir: '/tmp',
      modelCatalogPath: '/nonexistent/model-catalog.json',
      githubToken: undefined,
      models: { leader: 'zai/glm-5.2', implementer: 'zai/glm-5.2', reviewer: 'zai/glm-5.2' },
    };
    const agents = createRoleAgents(config, {});
    const workflow = createFeatureCycleWorkflow({ tools: {}, agents, project: '/tmp/x' });
    expect(workflow.committed).toBe(true);
    expect(Object.keys(workflow.steps)).toEqual([
      'add-feature',
      'start-feature',
      'implement',
      'review',
      'human-review',
      'close-feature',
    ]);
  });

  it('rejects an invalid feature name at submission (harness naming rule)', () => {
    expect(carriedSchema.safeParse({ feature: 'revision-antiguo-harness' }).success).toBe(true);
    const bad = carriedSchema.safeParse({ feature: 'revision de antiguo harness con esto' });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(bad.error.issues[0]?.message).toContain('[A-Za-z0-9_-]+');
    }
  });
});

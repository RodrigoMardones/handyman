// Unit tests for the MCP project-pinning port (feature 103): inject on
// missing project, pass on equivalent project, REJECT on foreign project
// (the underlying tool is never invoked), and passthrough for tools that
// are not project-scoped handyman tools. Fake tools mirror the MCPClient
// output (JsonSchemaWrapper: inputSchema.getSchema().properties) — verified
// against a live server 2026-07-29.
import { describe, expect, it, vi } from 'vitest';
import { acceptsProjectArg, isSameProject, pinToolsToProject } from './mcp-pinning';

const ROOT = '/pinned/root';

/** MCPClient-shaped tool: JsonSchemaWrapper inputSchema + variadic spy execute. */
function fakeTool(schemaProps: string[], wrapper = true) {
  const jsonSchema = {
    type: 'object',
    properties: Object.fromEntries(schemaProps.map((p) => [p, {}])),
  };
  return {
    inputSchema: wrapper ? { getSchema: () => jsonSchema } : jsonSchema,
    execute: vi.fn(async (...args: unknown[]) => ({ ok: true, received: args })),
  };
}
type FakeTool = ReturnType<typeof fakeTool>;

function fakeToolSet(wrapper = true) {
  return {
    handyman_feature_add: fakeTool(['project', 'name', 'title'], wrapper),
    handyman_feature_next: fakeTool(['project'], wrapper),
    handyman_harness_list: fakeTool([], wrapper), // needsProject:false server-side
    github_get_me: fakeTool([], wrapper),
  };
}

/** Reach a pinned map entry as a callable fake tool. */
function asTool(tools: Record<string, unknown>, name: string): FakeTool {
  return tools[name] as unknown as FakeTool;
}

describe('acceptsProjectArg', () => {
  it('detects project across the wrapper and plain JSON schema shapes', () => {
    expect(acceptsProjectArg(fakeTool(['project']))).toBe(true);
    expect(acceptsProjectArg(fakeTool(['project'], false))).toBe(true);
    expect(acceptsProjectArg(fakeTool([]))).toBe(false);
    expect(acceptsProjectArg({})).toBe(false);
    expect(acceptsProjectArg(undefined)).toBe(false);
  });
});

describe('isSameProject', () => {
  it('accepts the pinned root, a resolved-equal absolute path, and the basename', () => {
    expect(isSameProject('/pinned/root', ROOT)).toBe(true);
    expect(isSameProject('/pinned/root/', ROOT)).toBe(true);
    expect(isSameProject('root', ROOT)).toBe(true);
  });

  it('rejects foreign, relative, empty, and non-string projects', () => {
    expect(isSameProject('/pinned/other', ROOT)).toBe(false);
    expect(isSameProject('other', ROOT)).toBe(false);
    expect(isSameProject('./root', ROOT)).toBe(false);
    expect(isSameProject('', ROOT)).toBe(false);
    expect(isSameProject(42, ROOT)).toBe(false);
    expect(isSameProject(undefined, ROOT)).toBe(false);
  });
});

describe('pinToolsToProject', () => {
  it('(a) injects the pinned root when the call has no project', async () => {
    const set = fakeToolSet();
    const { tools, pinned } = pinToolsToProject(set, ROOT);
    await asTool(tools, 'handyman_feature_next').execute({});
    expect(set['handyman_feature_next'].execute).toHaveBeenCalledWith({ project: ROOT });
    expect(pinned).toContain('handyman_feature_next');
  });

  it('(b) passes a project equal to the pin (path, resolved-equal, basename)', async () => {
    const set = fakeToolSet();
    const { tools } = pinToolsToProject(set, ROOT);
    const tool = asTool(tools, 'handyman_feature_next');
    for (const project of [ROOT, `${ROOT}/`, 'root']) {
      await tool.execute({ project });
    }
    expect(set['handyman_feature_next'].execute).toHaveBeenCalledTimes(3);
    // The arg passes through AS TYPED — the server resolves names itself.
    expect(set['handyman_feature_next'].execute).toHaveBeenLastCalledWith({ project: 'root' });
  });

  it('(c) REJECTS a foreign project naming both, and never reaches the server', async () => {
    const set = fakeToolSet();
    const warn = vi.fn();
    const { tools } = pinToolsToProject(set, ROOT, { warn });
    const call = asTool(tools, 'handyman_feature_next').execute({ project: '/foreign/harness' });
    await expect(call).rejects.toThrowError(
      /pinned to project "\/pinned\/root".*attempted "\/foreign\/harness"/,
    );
    expect(set['handyman_feature_next'].execute).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toContain('[pinning]');
  });

  it('(d) leaves non-handyman tools and project-less handyman tools untouched', async () => {
    const set = fakeToolSet();
    const { tools, pinned } = pinToolsToProject(set, ROOT);
    expect(pinned.sort()).toEqual(['handyman_feature_add', 'handyman_feature_next']);
    // Same object identity: not wrapped at all.
    expect(tools['github_get_me']).toBe(set['github_get_me']);
    expect(tools['handyman_harness_list']).toBe(set['handyman_harness_list']);
    await asTool(tools, 'github_get_me').execute({});
    await asTool(tools, 'handyman_harness_list').execute({});
    expect(set['github_get_me'].execute).toHaveBeenCalledWith({});
    expect(set['handyman_harness_list'].execute).toHaveBeenCalledWith({});
  });

  it('passes non-record input through untouched (server validation owns it)', async () => {
    const set = fakeToolSet();
    const { tools } = pinToolsToProject(set, ROOT);
    await asTool(tools, 'handyman_feature_next').execute('weird');
    expect(set['handyman_feature_next'].execute).toHaveBeenCalledWith('weird');
  });

  it('preserves extra args and extra execute parameters', async () => {
    const set = fakeToolSet();
    const { tools } = pinToolsToProject(set, ROOT);
    await asTool(tools, 'handyman_feature_add').execute({ name: 'f', title: 't' }, { toolCallId: '1' });
    expect(set['handyman_feature_add'].execute).toHaveBeenCalledWith(
      { name: 'f', title: 't', project: ROOT },
      { toolCallId: '1' },
    );
  });
});

// Unit tests for the MCP transport port (feature 104): the http definition
// passes the configured URL through untouched, and the stdio definition
// composes the child spawn — process.execPath + <handymanAssetsDir>/
// dist/mcp.js + the minimal env passthrough — with an actionable error when
// the MCP entry was never built. Env bag injected; fixtures are tmp dirs.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { handymanMcpTarget, handymanServerDefinition } from './mcp-transport';
import type { AppConfig } from './config';

function fakeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    repoRoot: undefined,
    handymanAssetsDir: '/pkg',
    handymanRoot: '/hroot',
    projectRoot: '/proj',
    mcpUrl: 'http://127.0.0.1:8177/mcp',
    mcpTransport: 'http',
    dataDir: '/d',
    telemetryDir: '/t',
    modelCatalogPath: '/none',
    githubToken: undefined,
    harnessId: 'proj-id',
    models: { leader: 'z', implementer: 'z', reviewer: 'z' },
    ...overrides,
  };
}

/** Fixture: a fake handyman package dir with dist/mcp.js built. */
function fakePackage(): string {
  const dir = mkdtempSync(join(tmpdir(), 'hm-mcp-pkg-'));
  mkdirSync(join(dir, 'dist'), { recursive: true });
  writeFileSync(join(dir, 'dist', 'mcp.js'), '// mcp\n');
  return dir;
}

describe('handymanServerDefinition http', () => {
  it('passes the configured URL through (pre-104 topology)', () => {
    expect(handymanServerDefinition(fakeConfig())).toEqual({
      url: new URL('http://127.0.0.1:8177/mcp'),
    });
    expect(handymanMcpTarget(fakeConfig())).toBe('http://127.0.0.1:8177/mcp');
  });
});

describe('handymanServerDefinition stdio', () => {
  it('composes the child spawn: execPath + package dist/mcp.js + env passthrough', () => {
    const pkg = fakePackage();
    const config = fakeConfig({ mcpTransport: 'stdio', handymanAssetsDir: pkg, handymanRoot: '/hroot' });
    const definition = handymanServerDefinition(config, { PATH: '/bin', HOME: '/home/u' });
    expect(definition).toEqual({
      command: process.execPath,
      args: [join(pkg, 'dist', 'mcp.js')],
      env: { PATH: '/bin', HOME: '/home/u', HANDYMAN_ROOT: '/hroot' },
    });
    expect(handymanMcpTarget(config)).toBe(join(pkg, 'dist', 'mcp.js'));
  });

  it('tolerates missing PATH/HOME in the env bag as empty strings', () => {
    const pkg = fakePackage();
    const definition = handymanServerDefinition(
      fakeConfig({ mcpTransport: 'stdio', handymanAssetsDir: pkg }),
      {},
    );
    expect(definition).toMatchObject({ env: { PATH: '', HOME: '' } });
  });

  it('fails actionably when dist/mcp.js was never built', () => {
    const pkg = mkdtempSync(join(tmpdir(), 'hm-mcp-pkg-'));
    expect(() =>
      handymanServerDefinition(fakeConfig({ mcpTransport: 'stdio', handymanAssetsDir: pkg })),
    ).toThrowError(/cannot spawn the embedded MCP: .*dist\/mcp\.js does not exist.*HANDYMAN_MCP_TRANSPORT=http/s);
  });
});

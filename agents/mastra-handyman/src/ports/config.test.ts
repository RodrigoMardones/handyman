// Unit tests for the config port: env mapping, the harnessId derivation
// chain (env override → harness.config.json project_name → basename), the
// decoupled defaults (feature mastra_runtime_decoupling: no <cwd>/../..
// anchor — data/logs under HANDYMAN_ROOT, package-relative model catalog)
// and project resolution by registry name.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';
import { resolveHandymanAssetsDir } from './harness-install';

// Assets/env isolation: HANDYMAN_ASSETS_DIR pinned so resolution never
// depends on the machine; HANDYMAN_ROOT pinned per-test where relevant.
const BASE_ENV = { HANDYMAN_ASSETS_DIR: '/assets' } as NodeJS.ProcessEnv;

/** Registry fixture: <tmp>/registry.json with the given project roots. */
function registryFixture(roots: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'hm-registry-'));
  writeFileSync(
    join(root, 'registry.json'),
    JSON.stringify({ version: 1, harnesses: roots.map((project_root) => ({ project_root })) }),
  );
  return root;
}

describe('loadConfig harnessId', () => {
  it('env HANDYMAN_HARNESS_ID wins over everything', () => {
    const config = loadConfig({ ...BASE_ENV, HANDYMAN_HARNESS_ID: 'explicit' });
    expect(config.harnessId).toBe('explicit');
  });

  it('falls back to harness.config.json project_name', () => {
    const root = mkdtempSync(join(tmpdir(), 'hm-cfg-'));
    writeFileSync(join(root, 'harness.config.json'), JSON.stringify({ project_name: 'studio-test' }));
    const config = loadConfig({ ...BASE_ENV, HANDYMAN_PROJECT_ROOT: root });
    expect(config.harnessId).toBe('studio-test');
  });

  it('falls back to the project dir basename when no project_name exists', () => {
    const config = loadConfig({ ...BASE_ENV, HANDYMAN_PROJECT_ROOT: '/tmp/alguna-cosa' });
    expect(config.harnessId).toBe('alguna-cosa');
  });

  it('ignores a blank project_name and uses the basename', () => {
    const root = mkdtempSync(join(tmpdir(), 'hm-cfg-'));
    writeFileSync(join(root, 'harness.config.json'), JSON.stringify({ project_name: '  ' }));
    const config = loadConfig({ ...BASE_ENV, HANDYMAN_PROJECT_ROOT: root });
    expect(config.harnessId).toBe(basename(root));
  });
});

describe('loadConfig projectRoot', () => {
  it('passes an absolute HANDYMAN_PROJECT_ROOT through untouched', () => {
    const config = loadConfig({ ...BASE_ENV, HANDYMAN_PROJECT_ROOT: '/tmp/un-registrado' });
    expect(config.projectRoot).toBe('/tmp/un-registrado');
  });

  it('resolves a registry NAME to its project_root', () => {
    const handymanRoot = registryFixture(['/registered/alpha', '/registered/beta']);
    const config = loadConfig({
      ...BASE_ENV,
      HANDYMAN_ROOT: handymanRoot,
      HANDYMAN_PROJECT_ROOT: 'alpha',
    });
    expect(config.projectRoot).toBe('/registered/alpha');
    expect(config.harnessId).toBe('alpha');
  });

  it('fails with an actionable error on an unknown name', () => {
    const handymanRoot = registryFixture(['/registered/alpha']);
    expect(() =>
      loadConfig({ ...BASE_ENV, HANDYMAN_ROOT: handymanRoot, HANDYMAN_PROJECT_ROOT: 'ghost' }),
    ).toThrowError(/project 'ghost' is not registered.*alpha.*handyman toolbox register/s);
  });

  it('fails on an ambiguous name listing every candidate', () => {
    const handymanRoot = registryFixture(['/a/dup', '/b/dup']);
    expect(() =>
      loadConfig({ ...BASE_ENV, HANDYMAN_ROOT: handymanRoot, HANDYMAN_PROJECT_ROOT: 'dup' }),
    ).toThrowError(/'dup' is ambiguous.*\/a\/dup.*\/b\/dup/s);
  });

  it('treats a missing registry as empty (the error names the path)', () => {
    const handymanRoot = mkdtempSync(join(tmpdir(), 'hm-registry-'));
    expect(() =>
      loadConfig({ ...BASE_ENV, HANDYMAN_ROOT: handymanRoot, HANDYMAN_PROJECT_ROOT: 'ghost' }),
    ).toThrowError(new RegExp(`not registered in ${join(handymanRoot, 'registry.json')}`));
  });

  it('defaults to the cwd when HANDYMAN_PROJECT_ROOT is unset', () => {
    const config = loadConfig({ ...BASE_ENV });
    expect(config.projectRoot).toBe(process.cwd());
  });
});

describe('loadConfig decoupled defaults', () => {
  it('dataDir/telemetryDir default under HANDYMAN_ROOT/agent/<harnessId>, never cwd', () => {
    const handymanRoot = mkdtempSync(join(tmpdir(), 'hm-root-'));
    const config = loadConfig({
      ...BASE_ENV,
      HANDYMAN_ROOT: handymanRoot,
      HANDYMAN_HARNESS_ID: 'proj',
      HANDYMAN_PROJECT_ROOT: '/tmp/proj',
    });
    expect(config.dataDir).toBe(join(handymanRoot, 'agent', 'proj', 'data'));
    expect(config.telemetryDir).toBe(join(handymanRoot, 'agent', 'proj', 'logs'));
    expect(config.dataDir.startsWith(process.cwd())).toBe(false);
    expect(config.telemetryDir.startsWith(process.cwd())).toBe(false);
  });

  it('HANDYMAN_DATA_DIR / HANDYMAN_TELEMETRY_DIR override the defaults', () => {
    const config = loadConfig({
      ...BASE_ENV,
      HANDYMAN_DATA_DIR: '/d',
      HANDYMAN_TELEMETRY_DIR: '/t',
    });
    expect(config.dataDir).toBe('/d');
    expect(config.telemetryDir).toBe('/t');
  });

  it('repoRoot has no default (dev override only)', () => {
    expect(loadConfig({ ...BASE_ENV }).repoRoot).toBeUndefined();
    expect(loadConfig({ ...BASE_ENV, HANDYMAN_REPO_ROOT: '/repo' }).repoRoot).toBe('/repo');
  });

  it('model catalog defaults package-relative; env wins', () => {
    const config = loadConfig({ ...BASE_ENV });
    expect(config.modelCatalogPath).toMatch(/agents\/mastra-handyman\/model-catalog\.json$/);
    expect(loadConfig({ ...BASE_ENV, HANDYMAN_MODEL_CATALOG: '/cat.json' }).modelCatalogPath).toBe(
      '/cat.json',
    );
  });
});

describe('loadConfig mcpTransport', () => {
  it('defaults to http and keeps the MCP url', () => {
    const config = loadConfig({ ...BASE_ENV });
    expect(config.mcpTransport).toBe('http');
    expect(config.mcpUrl).toBe('http://127.0.0.1:8177/mcp');
  });

  it('accepts stdio explicitly', () => {
    expect(loadConfig({ ...BASE_ENV, HANDYMAN_MCP_TRANSPORT: 'stdio' }).mcpTransport).toBe('stdio');
  });

  it('rejects an invalid value with an actionable error', () => {
    expect(() => loadConfig({ ...BASE_ENV, HANDYMAN_MCP_TRANSPORT: 'udp' })).toThrowError(
      /invalid HANDYMAN_MCP_TRANSPORT 'udp': expected 'http' or 'stdio'/,
    );
  });
});

describe('resolveHandymanAssetsDir precedence', () => {
  it('HANDYMAN_ASSETS_DIR wins over the package and the dev fallback', () => {
    expect(
      resolveHandymanAssetsDir(
        { HANDYMAN_ASSETS_DIR: '/env-assets', HANDYMAN_REPO_ROOT: '/repo' },
        '/pkg',
      ),
    ).toBe('/env-assets');
  });

  it('the installed handyman-harness package wins over the dev fallback', () => {
    expect(resolveHandymanAssetsDir({ HANDYMAN_REPO_ROOT: '/repo' }, '/pkg')).toBe('/pkg');
  });

  it('falls back to <HANDYMAN_REPO_ROOT>/handyman without an installed package', () => {
    expect(resolveHandymanAssetsDir({ HANDYMAN_REPO_ROOT: '/repo' }, null)).toBe(
      '/repo/handyman',
    );
  });

  it('throws an actionable error when nothing resolves', () => {
    expect(() => resolveHandymanAssetsDir({}, null)).toThrowError(
      /HANDYMAN_ASSETS_DIR.*handyman-harness.*HANDYMAN_REPO_ROOT/s,
    );
  });

  it('auto-detection resolves the workspace-linked handyman package', () => {
    // No injection: the real require.resolve path — the workspace dependency
    // links handyman-harness → the monorepo handyman/ dir.
    expect(resolveHandymanAssetsDir({})).toMatch(/handyman$/);
  });
});

// Unit tests for the harness-identity port: span stamping and the boot-time
// registration decision — the toolbox command resolves by precedence
// (HANDYMAN_TOOLBOX_CMD > handyman bin on PATH > handyman-harness package >
// HANDYMAN_REPO_ROOT dev fallback) with the exec spawner and the package dir
// injected, so no real CLI runs here.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createHarnessIdentityProcessor, ensureHarnessRegistered } from './harness-identity';
import type { AppConfig } from './config';

const config: AppConfig = {
  repoRoot: undefined,
  handymanAssetsDir: '/assets',
  handymanRoot: '/hroot',
  projectRoot: '/proj',
  mcpUrl: 'http://x',
  dataDir: '/d',
  telemetryDir: '/t',
  modelCatalogPath: '/none',
  githubToken: undefined,
  harnessId: 'proj-id',
  models: { leader: 'z', implementer: 'z', reviewer: 'z' },
};

/** Spy exec: records (file, args) tuples. */
function spyExec(seen: unknown[][]) {
  return ((...args: unknown[]) => {
    seen.push(args);
  }) as never;
}

describe('createHarnessIdentityProcessor', () => {
  it('stamps the harness attributes on every span, preserving the rest', () => {
    const processor = createHarnessIdentityProcessor(config);
    const span = { attributes: { foo: 1 }, name: 'agent run' };
    const out = processor.process(span) as typeof span;
    expect(out.attributes).toEqual({
      foo: 1,
      'handyman.harness.id': 'proj-id',
      'handyman.harness.root': '/proj',
    });
    expect(out.name).toBe('agent run');
    expect(processor.process(undefined)).toBeUndefined();
  });
});

describe('ensureHarnessRegistered', () => {
  it('does nothing when HANDYMAN_HARNESS_REGISTER=off', () => {
    let calls = 0;
    ensureHarnessRegistered(config, {
      env: { HANDYMAN_HARNESS_REGISTER: 'off' },
      exec: (() => {
        calls++;
      }) as never,
    });
    expect(calls).toBe(0);
  });

  it('HANDYMAN_TOOLBOX_CMD wins: the prefix is split and the root appended', () => {
    const seen: unknown[][] = [];
    ensureHarnessRegistered(config, {
      env: { HANDYMAN_TOOLBOX_CMD: '/x/toolbox --json register' },
      exec: spyExec(seen),
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.[0]).toBe('/x/toolbox');
    expect(seen[0]?.[1]).toEqual(['--json', 'register', '/proj']);
  });

  it('uses the `handyman` bin on PATH over the package CLI', () => {
    const binDir = mkdtempSync(join(tmpdir(), 'hm-bin-'));
    writeFileSync(join(binDir, 'handyman'), '#!/bin/sh\n');
    const seen: unknown[][] = [];
    ensureHarnessRegistered(config, {
      env: { PATH: binDir },
      packageDir: '/pkg',
      exec: spyExec(seen),
    });
    expect(seen[0]?.[0]).toBe(join(binDir, 'handyman'));
    expect(seen[0]?.[1]).toEqual(['toolbox', 'register', '/proj']);
  });

  it('falls back to the handyman-harness package CLI (dist/cli.js)', () => {
    const seen: unknown[][] = [];
    ensureHarnessRegistered(config, {
      env: { PATH: '' },
      packageDir: '/pkg',
      exec: spyExec(seen),
    });
    expect(seen[0]?.[0]).toBe('node');
    expect(seen[0]?.[1]).toEqual(['/pkg/dist/cli.js', 'toolbox', 'register', '/proj']);
  });

  it('falls back to the HANDYMAN_REPO_ROOT dev checkout last', () => {
    const seen: unknown[][] = [];
    ensureHarnessRegistered(config, {
      env: { PATH: '', HANDYMAN_REPO_ROOT: '/repo' },
      packageDir: null,
      exec: spyExec(seen),
    });
    expect(seen[0]?.[0]).toBe('node');
    expect(seen[0]?.[1]).toEqual(['/repo/handyman/dist/toolbox.js', 'register', '/proj']);
  });

  it('skips with a warning (never throws) when no command resolves', () => {
    let calls = 0;
    expect(() =>
      ensureHarnessRegistered(config, {
        env: { PATH: '' },
        packageDir: null,
        exec: (() => {
          calls++;
        }) as never,
      }),
    ).not.toThrow();
    expect(calls).toBe(0);
  });

  it('never throws — a registration failure only warns', () => {
    expect(() =>
      ensureHarnessRegistered(config, {
        env: { HANDYMAN_TOOLBOX_CMD: '/x/toolbox register' },
        exec: (() => {
          throw new Error('boom');
        }) as never,
      }),
    ).not.toThrow();
  });
});

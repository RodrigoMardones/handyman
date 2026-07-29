// Unit tests for the hub orchestration port (feature 105): spawn plans,
// health-wait semantics, the access banner and the shutdown contract — with
// spawn/fetch/sleep/log/onSignal all injected (no real children here).
import { PassThrough } from 'node:stream';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  extractLocalUrl,
  mastraCliEntry,
  mcpSpawnPlan,
  parseEnvFile,
  runHub,
  studioSpawnPlan,
  waitForHttp,
  type HubChild,
  type HubOptions,
  type SpawnPlan,
} from './hub';

const OPTS: HubOptions = {
  projectRoot: '/proj',
  handymanRoot: '/hroot',
  handymanMcpEntry: '/pkg/dist/mcp.js',
  packageDir: '/agent-pkg',
  mcpPort: 18899,
  env: { PATH: '/bin', HOME: '/home/u', Z_AI_API_KEY: 'secret', HANDYMAN_DATA_DIR: '/op/data' },
};

/** Fake child: PassThrough streams + recorded signals + manual exit. */
function fakeChild(name: string) {
  const exitListeners: Array<(code: number | null, signal: string | null) => void> = [];
  const signals: string[] = [];
  return {
    name,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    signals,
    kill: (signal: string) => {
      signals.push(signal);
      return true;
    },
    once: (_event: 'exit', listener: (code: number | null, signal: string | null) => void) => {
      exitListeners.push(listener);
    },
    fireExit(code: number | null, signal: string | null = null) {
      for (const listener of [...exitListeners]) listener(code, signal);
    },
  };
}
type FakeChild = ReturnType<typeof fakeChild>;

interface FakeWorld {
  children: Record<string, FakeChild>;
  logs: string[];
  signalHandlers: Map<string, () => void>;
  spawn: (plan: SpawnPlan, name: string) => HubChild;
}

/** runHub deps wiring fakes; `onSpawn` lets a case script child behavior. */
function fakeWorld(onSpawn?: (child: FakeChild, plan: SpawnPlan) => void) {
  const world: FakeWorld = {
    children: {},
    logs: [],
    signalHandlers: new Map(),
    spawn: (plan, name) => {
      const child = fakeChild(name);
      world.children[name] = child;
      onSpawn?.(child, plan);
      return child;
    },
  };
  const deps = {
    spawn: world.spawn,
    fetchFn: vi.fn(async () => new Response('{}')),
    log: (line: string) => world.logs.push(line),
    onSignal: (signal: NodeJS.Signals, handler: () => void) => {
      world.signalHandlers.set(signal, handler);
    },
    mcpSettleMs: 5,
    killGraceMs: 5,
    studioTimeoutMs: 2_000,
  };
  return { world, deps };
}

async function waitFor(predicate: () => boolean, ms = 2_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('spawn plans', () => {
  it('mcpSpawnPlan spawns dist/mcp.js --http on loopback with minimal env', () => {
    expect(mcpSpawnPlan(OPTS)).toEqual({
      command: process.execPath,
      args: ['/pkg/dist/mcp.js', '--http', '--host', '127.0.0.1', '--port', '18899'],
      env: { PATH: '/bin', HOME: '/home/u', HANDYMAN_ROOT: '/hroot' },
    });
  });

  it('studioSpawnPlan passes the operator env through and wires the overrides', () => {
    const plan = studioSpawnPlan(OPTS);
    expect(plan.command).toBe(process.execPath);
    expect(plan.args).toEqual([mastraCliEntry(), 'dev', '-d', 'studio']);
    expect(plan.cwd).toBe('/agent-pkg');
    // Passthrough: the studio child RUNS the agents (keys + operator dirs).
    expect(plan.env.Z_AI_API_KEY).toBe('secret');
    expect(plan.env.HANDYMAN_DATA_DIR).toBe('/op/data');
    // Wiring overrides.
    expect(plan.env.HANDYMAN_PROJECT_ROOT).toBe('/proj');
    expect(plan.env.HANDYMAN_MCP_URL).toBe('http://127.0.0.1:18899/mcp');
    expect(plan.env.HANDYMAN_ROOT).toBe('/hroot');
  });

  it('dotenv vars flow with the LOWEST precedence (env > file, wiring > both)', () => {
    const plan = studioSpawnPlan({
      ...OPTS,
      dotenvVars: {
        KIMI_API_KEY: 'from-file',
        Z_AI_API_KEY: 'file-loses',
        HANDYMAN_PROJECT_ROOT: 'file-loses-too',
      },
    });
    expect(plan.env.KIMI_API_KEY).toBe('from-file'); // present only in the file
    expect(plan.env.Z_AI_API_KEY).toBe('secret'); // operator env beats the file
    expect(plan.env.HANDYMAN_PROJECT_ROOT).toBe('/proj'); // the wiring beats both
  });

  it('parseEnvFile parses KEY=VALUE with export, quotes and comments', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hm-env-'));
    const file = join(dir, '.env');
    writeFileSync(
      file,
      '# comment\n\nPLAIN=1\nexport EXPORTED=two\nQUOTED="a b"\nSINGLE=\'c\'\nBROKEN LINE\n',
    );
    expect(parseEnvFile(file)).toEqual({
      PLAIN: '1',
      EXPORTED: 'two',
      QUOTED: 'a b',
      SINGLE: 'c',
    });
    expect(parseEnvFile(join(dir, 'missing.env'))).toEqual({});
  });
});

describe('extractLocalUrl', () => {
  it('finds the loopback URL in the mastra ready line and port variants', () => {
    expect(extractLocalUrl('Mastra Studio running { url: http://localhost:4111 }')).toBe(
      'http://localhost:4111',
    );
    expect(extractLocalUrl('INFO  server at http://127.0.0.1:4113/')).toBe('http://127.0.0.1:4113/');
    expect(extractLocalUrl('no url here')).toBeUndefined();
  });

  it('ignores localhost URLs OUTSIDE the mastra window (the agents print the MCP URL)', () => {
    expect(extractLocalUrl('[mcp] connected to http://127.0.0.1:18899/mcp: 25 tools')).toBeUndefined();
    expect(extractLocalUrl('MCP at http://127.0.0.1:8177/mcp exposed 0 tools')).toBeUndefined();
  });
});

describe('waitForHttp', () => {
  it('resolves once the endpoint answers (after failures)', async () => {
    let calls = 0;
    const fetchFn = vi.fn(async () => {
      calls++;
      if (calls < 3) throw new Error('ECONNREFUSED');
      return new Response('{}');
    });
    await expect(
      waitForHttp('http://x/mcp', 'the MCP child', { fetchFn: fetchFn as never, intervalMs: 1 }),
    ).resolves.toBeUndefined();
    expect(calls).toBe(3);
  });

  it('times out with an actionable error', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    await expect(
      waitForHttp('http://x/mcp', 'the MCP child', {
        fetchFn: fetchFn as never,
        timeoutMs: 30,
        intervalMs: 5,
      }),
    ).rejects.toThrowError(/timed out after 30ms waiting for the MCP child at http:\/\/x\/mcp/);
  });

  it('fails fast when the watched child died (port owned by another process)', async () => {
    const fetchFn = vi.fn(async () => new Response('{}'));
    await expect(
      waitForHttp('http://x/mcp', 'the MCP child', {
        fetchFn: fetchFn as never,
        isAlive: () => false,
      }),
    ).rejects.toThrowError(/died before answering/);
  });
});

describe('runHub', () => {
  it('boots both children, prints the banner, and stops cleanly on SIGINT', async () => {
    const { world, deps } = fakeWorld((child) => {
      if (child.name === 'studio') {
        // The agents' boot log prints the MCP URL inside the studio output —
        // the URL detector must skip it and take the mastra window (4111+).
        setTimeout(() => child.stdout.write('[mcp] connected to http://127.0.0.1:18899/mcp: 25 tools\n'), 2);
        setTimeout(() => child.stdout.write('Mastra Studio running { url: http://localhost:4111 }\n'), 5);
      }
    });
    const done = runHub(OPTS, deps);
    await waitFor(() => world.logs.some((l) => l.includes('review stack up')));
    expect(world.logs).toContain('[hub]   Studio:  http://localhost:4111');
    expect(world.logs).toContain('[hub]   MCP:     http://127.0.0.1:18899/mcp (embedded child of this hub)');
    expect(world.logs).toContain('[hub]   project: /proj (pinned at the agents\' MCP client)');
    world.signalHandlers.get('SIGINT')?.();
    await expect(done).resolves.toBe(0);
    expect(world.children['mcp']?.signals).toEqual(['SIGTERM', 'SIGKILL']);
    expect(world.children['studio']?.signals).toEqual(['SIGTERM', 'SIGKILL']);
  });

  it('fails actionably when the MCP child dies on an owned port', async () => {
    const { world, deps } = fakeWorld((child) => {
      if (child.name === 'mcp') setTimeout(() => child.fireExit(1), 1);
    });
    const code = await runHub(OPTS, deps);
    expect(code).toBe(1);
    expect(world.logs.some((l) => l.includes('port 18899') && l.includes('--mcp-port'))).toBe(true);
    // The studio child is never spawned.
    expect(world.children['studio']).toBeUndefined();
  });

  it('reports an unexpected studio death, kills the MCP child, exits with its code', async () => {
    const { world, deps } = fakeWorld((child) => {
      if (child.name === 'studio') {
        setTimeout(() => child.stdout.write('ready http://localhost:4111\n'), 5);
      }
    });
    const done = runHub(OPTS, deps);
    await waitFor(() => world.logs.some((l) => l.includes('review stack up')));
    world.children['studio']?.fireExit(7);
    await expect(done).resolves.toBe(7);
    expect(world.logs.some((l) => l.includes('studio child exited unexpectedly (code 7'))).toBe(true);
    expect(world.children['mcp']?.signals[0]).toBe('SIGTERM');
  });
});

// Harness identity for monitoring (deployment level): every span this app
// exports carries the harness it drives as ATTRIBUTES — deliberately NOT via
// requestContextKeys, which is the per-RUN channel (feature/project/skills/
// mcps change per run; the harness does not). Three clean layers:
//   serviceName          → the app (handyman-mastra)
//   handyman.harness.*   → the driven project (this processor)
//   request metadata     → the run (feature, project, skills, mcps)
//
// The Observability config has no resourceAttributes field (1.16.x), so a
// SpanOutputProcessor is the deployment-level identity channel: it stamps
// every span before export and composes with the SensitiveDataFilter (which
// redacts message CONTENT, never attributes — identity survives).
import { execFileSync } from 'node:child_process';
import { resolveToolboxCommand } from './harness-install';
import type { AppConfig } from './config';

/** Structural subset of a span (avoids leaking @mastra types into the port). */
interface SpanLike {
  attributes?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Span output processor stamping the harness identity on every span. */
export function createHarnessIdentityProcessor(config: AppConfig) {
  return {
    name: 'harness-identity',
    process(span?: SpanLike) {
      if (!span) return undefined;
      span.attributes = {
        ...span.attributes,
        'handyman.harness.id': config.harnessId,
        'handyman.harness.root': config.projectRoot,
      };
      return span;
    },
    async shutdown() {},
  };
}

/** Effective harness registration at boot: the project this app drives joins
 *  the machine-global handyman registry (registry.json), so harness_list /
 *  fleet_* see it. Idempotent — the toolbox CLI validates isHarnessRoot and
 *  dedupes by root ("already registered" is a success). The toolbox command
 *  itself resolves by precedence (HANDYMAN_TOOLBOX_CMD > `handyman` bin on
 *  PATH > handyman-harness package CLI > HANDYMAN_REPO_ROOT dev fallback —
 *  see ports/harness-install.ts), so boot works from any cwd. Best-effort: a
 *  failure never blocks boot. Opt-out: HANDYMAN_HARNESS_REGISTER=off. */
export function ensureHarnessRegistered(
  config: AppConfig,
  opts: {
    exec?: typeof execFileSync;
    env?: NodeJS.ProcessEnv;
    /** Test hook: force the handyman-harness package dir (null = absent). */
    packageDir?: string | null;
  } = {},
): void {
  const env = opts.env ?? process.env;
  if (env.HANDYMAN_HARNESS_REGISTER === 'off') return;
  const exec = opts.exec ?? execFileSync;
  const command = resolveToolboxCommand(env, opts.packageDir);
  if (!command) {
    console.warn(
      `[harness] auto-register skipped for ${config.projectRoot}: no toolbox command found ` +
        '(set HANDYMAN_TOOLBOX_CMD, put the `handyman` bin on PATH, or install handyman-harness)',
    );
    return;
  }
  try {
    exec(command.file, [...command.args, config.projectRoot], { stdio: 'pipe' });
  } catch (error) {
    const message = error instanceof Error ? (error.message.split('\n')[0] ?? '') : String(error);
    console.warn(
      `[harness] auto-register skipped for ${config.projectRoot} (${command.source}): ${message}`,
    );
  }
}

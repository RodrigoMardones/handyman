// Feature-cycle driver (in-process topology A from the spike): boots the
// Mastra app and runs ONE feature through the handyman MCP loop, then prints
// the agent text and token usage, writes the per-feature telemetry JSONL and
// — when the feature closes — appends to the handyman tokens ledger.
// Requires the handyman MCP server on :8177 and the provider keys exported
// (set -a && . ../../.env && set +a).
//
//   pnpm run-feature <feature-name>
//
// Env: HANDYMAN_PROJECT_ROOT (target project: absolute path or registry
//      name; default = cwd), HANDYMAN_MCP_URL,
//      HANDYMAN_{LEADER,IMPLEMENTER,REVIEWER}_MODEL,
//      HANDYMAN_TELEMETRY_DIR (default <HANDYMAN_ROOT>/agent/<harnessId>/logs;
//      the npm script pins ./logs so the dev flow is unchanged).
import { buildApp } from './src/app';
import { RequestContext } from './src/mastra';
import { loadConfig } from './src/ports/config';
import { featureThread } from './src/ports/memory';
import { createFeatureTelemetry } from './src/ports/telemetry';
import { appendTokensLedger } from './src/ports/tokens-ledger';
import { aggregateRunUsage } from './src/ports/usage-aggregate';

const feature = process.argv.slice(2).filter((a) => a !== '--')[0] ?? 'spike_mastra_integration';
const config = loadConfig();
const leaderModel = config.models.leader;

const { mastra, observabilityStore, close } = await buildApp();
const leader = mastra.getAgentById('handyman-leader');

const telemetry = createFeatureTelemetry({
  dir: config.telemetryDir,
  feature,
  modelSpec: leaderModel,
});

// Correlates traces/metrics with the feature (requestContextKeys: ['feature']
// in the Observability config).
const requestContext = new RequestContext();
requestContext.set('feature', feature);

console.log(`[run] feature="${feature}" project="${config.projectRoot}" model="${leaderModel}"`);
const startedAt = Date.now();

try {
  const result = await leader.generate(`Run the feature loop for feature "${feature}".`, {
    maxSteps: 30,
    // One conversation thread per feature, one resource per project (the
    // pattern that replaces Flue's one-agent-instance-per-feature).
    memory: featureThread(feature, config.projectRoot),
    requestContext,
    // Subagent isolation (phase 1): each delegation starts from a FRESH
    // thread and sees only its task prompt — never the leader's transcript.
    // The reviewer judges artifacts (reports on disk, probe results), not
    // the implementer's reasoning. onDelegationStart pins the delegation
    // step budget in CODE (the default of 5 truncated the implementer
    // mid-loop; see ROLE_DEFAULT_OPTIONS in the agent file).
    delegation: {
      messageFilter: () => [],
      onDelegationStart: () => ({ proceed: true, modifiedMaxSteps: 15 }),
    },
    onStepFinish: (step) => telemetry.onStepFinish(step as never),
  });

  console.log('=== agent result ===');
  console.log(result.text);
  console.log('=== usage ===');
  console.log(JSON.stringify(result.usage ?? null));
  console.log(`[run] finished in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);

  telemetry.settle('completed', result.usage, { traceId: result.traceId });

  // Tokens ledger (phase 4): the line records the RUN TOTAL aggregated from
  // metric_events by traceId (leader + delegations share one trace) — the
  // phase-2 line recorded result.usage (leader only). Falls back to the
  // leader usage if the aggregate query fails (best-effort either way; one
  // line per CLOSED feature, never blocks).
  const runUsage = await aggregateRunUsage(observabilityStore, result.traceId ?? '');
  const usageForLedger =
    runUsage.inputTokens !== undefined ? runUsage : (result.usage ?? {});
  const entry = appendTokensLedger(config.projectRoot, feature, leaderModel, usageForLedger, 'run');
  console.log(
    entry
      ? `[ledger] tokens.jsonl += in=${entry.input_tokens} out=${entry.output_tokens} (${entry.model}, scope=${entry.scope})`
      : `[ledger] skipped (feature not done)`,
  );
} catch (error) {
  telemetry.settle('failed', null, {
    error: { type: (error as Error)?.name ?? 'unknown', message: String((error as Error)?.message ?? error) },
  });
  throw error;
} finally {
  await close();
}

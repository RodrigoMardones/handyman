// Live evals for the leader supervisor (phase 4): the CI gate of the spike —
// runEvals with deterministic gates (checks.toolOrder over the protocol
// sequence, checks.noToolErrors) + the protocol trajectory scorer (zero-LLM)
// with threshold 1.0, verdict 'passed' enforced per case. Drives the REAL
// loop (model calls + MCP writes) against the scratch project named by
// HANDYMAN_PROJECT_ROOT, so run it with the MCP server up:
//
//   node handyman/dist/mcp.js --http --port 8177
//   set -a && . ../../.env && set +a
//   HANDYMAN_PROJECT_ROOT=/tmp/hm-mastra-eval pnpm test:eval
//
// Exit code: 0 iff every case's verdict is 'passed' AND the disk ground
// truth matches (done / in_progress) — "ground truth on disk, not in the
// model's prose" (same rule as the Flue eval suite, and its case order:
// green first, red second — a feature left in_progress blocks the next
// feature_start).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildApp } from './src/app';
import { createProtocolTrajectoryScorer } from './src/evals/protocol-trajectory';
import { checks, runEvals } from './src/mastra';
import { loadConfig } from './src/ports/config';
import { projectResourceId } from './src/ports/memory';

const config = loadConfig();

/** Full protocol sequence for a green run (delegations are tool calls).
 *  Read from the agent's output messages — the clean tool-name space shared
 *  by checks.toolOrder and the protocol trajectory scorer. */
const PROTOCOL_GREEN = [
  'handyman_feature_add',
  'handyman_feature_start',
  'agent-implementer',
  'agent-reviewer',
  'handyman_feature_close',
];
/** Red-verifier run: the reviewer may reject (no close attempted) — the
 *  required prefix is add→start→implementer→reviewer; the verifier gate's
 *  refusal semantics are covered deterministically by the workflow topology
 *  (phase 3, close-feature step), not by model behavior. */
const PROTOCOL_RED = PROTOCOL_GREEN.slice(0, 4);

function featureStatus(name: string): string | undefined {
  const fl = JSON.parse(readFileSync(join(config.projectRoot, '.handyman', 'feature_list.json'), 'utf-8'));
  return fl.features.find((f: { name: string }) => f.name === name)?.status;
}

interface EvalCase {
  feature: string;
  expectedStatus: string;
  expectedTools: string[];
}

async function runCase(mastra: Awaited<ReturnType<typeof buildApp>>['mastra'], c: EvalCase) {
  const leader = mastra.getAgentById('handyman-leader');
  const result = await runEvals({
    target: leader,
    data: [{ input: `Run the feature loop for feature "${c.feature}".` }],
    gates: [checks.toolOrder(c.expectedTools), checks.noToolErrors()],
    scorers: [{ scorer: createProtocolTrajectoryScorer(c.expectedTools), threshold: 1.0 }],
    targetOptions: {
      maxSteps: 30,
      memory: { thread: `eval-${c.feature}`, resource: projectResourceId(config.projectRoot) },
      delegation: {
        messageFilter: () => [],
        onDelegationStart: () => ({ proceed: true, modifiedMaxSteps: 15 }),
      },
    },
  });
  const status = featureStatus(c.feature);
  const diskOk = status === c.expectedStatus;
  const passed = result.verdict === 'passed' && diskOk;
  console.log(
    `[eval] ${c.feature}: ${passed ? 'PASS' : 'FAIL'} verdict=${result.verdict} disk=${status} (expected ${c.expectedStatus})`,
  );
  for (const gate of result.gateResults ?? []) {
    console.log(`       gate ${gate.id}: score=${gate.score} ${gate.passed ? 'PASS' : 'FAIL'}`);
  }
  for (const th of result.thresholdResults ?? []) {
    console.log(`       threshold ${th.id}: score=${th.averageScore} (min ${th.threshold}) ${th.passed ? 'PASS' : 'FAIL'}`);
  }
  return passed;
}

const { mastra, close } = await buildApp();
let failures = 0;
try {
  // Case 1 — green verifier: full protocol, feature closes.
  const green: EvalCase = {
    feature: `eval_green_${Date.now().toString(36)}`,
    expectedStatus: 'done',
    expectedTools: PROTOCOL_GREEN,
  };
  if (!(await runCase(mastra, green))) failures++;

  // Case 2 — red verifier: the feature must NOT close (a refusal is data,
  // not a tool error — the gates must still pass; the disk shows the truth).
  const initSh = join(config.projectRoot, 'init.sh');
  const original = readFileSync(initSh, 'utf-8');
  const red: EvalCase = {
    feature: `eval_red_${Date.now().toString(36)}`,
    expectedStatus: 'in_progress',
    expectedTools: PROTOCOL_RED,
  };
  writeFileSync(initSh, original.replace(/^exit 0$/m, 'exit 1'));
  try {
    if (!(await runCase(mastra, red))) failures++;
  } finally {
    writeFileSync(initSh, original);
    // Leave the scratch reusable: close the feature deterministically (CLI,
    // not the agent) now the verifier is green again.
    if (featureStatus(red.feature) === 'in_progress') {
      execFileSync('node', ['handyman/dist/feature.js', '--root', config.projectRoot, 'done', red.feature], {
        cwd: config.repoRoot,
        stdio: 'pipe',
      });
    }
  }
} finally {
  await close();
}

if (failures > 0) {
  console.error(`[eval] FAILED: ${failures} case(s) below the gate`);
  process.exit(1);
}
console.log('[eval] PASSED: all cases above the gate');

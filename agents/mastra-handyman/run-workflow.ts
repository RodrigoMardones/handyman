// Feature-cycle WORKFLOW driver (phase 3, strategy 2 of the spike): runs the
// handyman cycle as a durable Mastra workflow — no leader LLM routing. Same
// in-process topology and requirements as run-feature.ts (MCP on :8177,
// provider keys via ../../.env).
//
//   pnpm run-workflow -- start   <feature> [declaracion.json]  new run wf-<feature>; ends done or SUSPENDED at human-review
//   pnpm run-workflow -- resume  <feature> approve|reject [feedback...]   human verdict on the suspended run
//   pnpm run-workflow -- restart <feature>                     crash recovery: retake wf-<feature> from the last snapshot
//   pnpm run-workflow -- status  <feature>                     dump the persisted run state
//
// declaracion.json anchors the run (validated at submission — an invalid
// declaration fails BEFORE anything runs):
//   {
//     "project": "/abs/path",          // optional; defaults to the configured
//                                      // project root and MUST equal it
//     "title": "…", "description": "…", // optional, flow to feature_add
//     "acceptance": ["crit 1", "…"],    // REQUIRED, min 1 — real criteria
//     "skills": ["nombre-skill"],       // optional; validated against the registry
//     "mcps": ["verify", "metrics"]     // optional; extra verbs within the role sets
//   }
//
// The run id is deterministic (wf-<feature>) so the human/operator does not
// have to carry a UUID between processes — one live run per feature per data
// dir. Env: same as run-feature.ts (HANDYMAN_PROJECT_ROOT, HANDYMAN_DATA_DIR,
// HANDYMAN_MCP_URL, HANDYMAN_{IMPLEMENTER,REVIEWER}_MODEL).
import { readFileSync } from 'node:fs';
import { buildApp } from './src/app';
import { RequestContext } from './src/mastra';
import { loadConfig } from './src/ports/config';
import { projectResourceId } from './src/ports/memory';

const config = loadConfig();
const argv = process.argv.slice(2).filter((a) => a !== '--');
const [command, feature, ...rest] = argv;
const USAGE =
  'usage: pnpm run-workflow -- start <feature> [declaracion.json] | resume <feature> approve|reject [feedback...] | restart|status <feature>';
if (!command || !feature) {
  console.error(USAGE);
  process.exit(2);
}

const runId = `wf-${feature}`;
const { mastra, close } = await buildApp();
const workflow = mastra.getWorkflow('feature-cycle');

const requestContext = new RequestContext();
requestContext.set('feature', feature);

function printResult(result: Record<string, unknown>) {
  console.log(`=== workflow result: ${result.status} (runId=${runId}) ===`);
  const steps = (result.steps ?? {}) as Record<string, Record<string, unknown>>;
  for (const [id, step] of Object.entries(steps)) {
    const bits = [`step ${id}: ${step.status}`];
    if (step.error) bits.push(`error=${String(step.error).slice(0, 200)}`);
    if (step.suspendPayload) bits.push(`suspendPayload=${JSON.stringify(step.suspendPayload).slice(0, 300)}`);
    console.log(`  ${bits.join('  ')}`);
  }
  if (result.status === 'suspended') {
    console.log('[wf] SUSPENDED at human-review. Verdict from the CLI:');
    console.log(`     pnpm run-workflow -- resume ${feature} approve [feedback]`);
    console.log(`     pnpm run-workflow -- resume ${feature} reject [feedback]`);
  } else if (result.status === 'success' || result.status === 'bailed') {
    console.log('=== outcome ===');
    console.log(JSON.stringify((result.result ?? result) as unknown, null, 2));
  } else if (result.status === 'failed') {
    console.log(`error: ${String((result.error as Error)?.message ?? result.error)}`);
  }
}

try {
  console.log(`[wf] ${command} feature="${feature}" runId="${runId}" project="${config.projectRoot}"`);
  const startedAt = Date.now();
  switch (command) {
    case 'start': {
      const decl = rest[0]
        ? (JSON.parse(readFileSync(rest[0], 'utf-8')) as Record<string, unknown>)
        : {};
      const inputData = {
        ...decl,
        feature,
        project: (decl.project as string | undefined) ?? config.projectRoot,
      };
      // The declaration also travels in requestContext: observability metadata
      // (feature/project) + the implementer's dynamic skill resolver (skills).
      requestContext.set('project', inputData.project);
      requestContext.set('skills', decl.skills ?? []);
      requestContext.set('mcps', decl.mcps ?? []);
      const run = await workflow.createRun({ runId, resourceId: projectResourceId(config.projectRoot) });
      try {
        const result = await run.start({ inputData: inputData as never, requestContext });
        printResult(result as unknown as Record<string, unknown>);
      } catch (error) {
        // Declaration rejected at the door (zod): print the issues cleanly —
        // no run was burned.
        const issues = (
          error as { issues?: Array<{ path: Array<string | number>; message: string }> }
        )?.issues;
        if (!Array.isArray(issues)) throw error;
        console.error('[wf] invalid declaration:');
        for (const issue of issues) console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
        process.exit(2);
      }
      break;
    }
    case 'resume': {
      const verdict = rest[0];
      if (verdict !== 'approve' && verdict !== 'reject') {
        console.error(USAGE);
        process.exit(2);
      }
      const resumeData = {
        approved: verdict === 'approve',
        feedback: rest.slice(1).join(' ') || undefined,
      };
      const run = await workflow.createRun({ runId, resourceId: projectResourceId(config.projectRoot) });
      const result = await run.resume({ step: 'human-review', resumeData, requestContext });
      printResult(result as unknown as Record<string, unknown>);
      break;
    }
    case 'restart': {
      const run = await workflow.createRun({ runId, resourceId: projectResourceId(config.projectRoot) });
      const result = await run.restart({ requestContext });
      printResult(result as unknown as Record<string, unknown>);
      break;
    }
    case 'status': {
      const state = await workflow.getWorkflowRunById(runId);
      console.log(JSON.stringify(state, null, 2));
      break;
    }
    default:
      console.error(USAGE);
      process.exit(2);
  }
  console.log(`[wf] finished in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
} finally {
  await close();
}

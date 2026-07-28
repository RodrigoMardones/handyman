// Live evals for the handyman-leader agent. They drive the REAL loop (model
// calls + MCP writes) against the scratch handyman project named by
// HANDYMAN_PROJECT_ROOT, so run them with flue dev and the MCP server up:
//
//   node handyman/dist/mcp.js --http --port 8177
//   HANDYMAN_PROJECT_ROOT=/tmp/hm-flue-spike pnpm agents:dev
//   cd agents/flue-handyman && pnpm evals
//
// Case order matters: the red-verifier case must run after the green one
// (a feature left in_progress would make the next feature_start refuse).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';
import { describeEval, toolCalls } from 'vitest-evals';
import { createHandymanAgentHarness } from './harness';

const PROJECT = process.env.HANDYMAN_PROJECT_ROOT ?? '/tmp/hm-flue-spike';
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

function featureStatus(name: string): string | undefined {
  const fl = JSON.parse(readFileSync(join(PROJECT, '.handyman', 'feature_list.json'), 'utf-8'));
  return fl.features.find((f: { name: string }) => f.name === name)?.status;
}

describeEval('handyman-leader', { harness: createHandymanAgentHarness() }, (it) => {
  it('closes a toy feature end-to-end with the full MCP sequence', async ({ run }) => {
    const feature = `eval_green_${Date.now().toString(36)}`;
    const result = await run(feature);

    const names = toolCalls(result).map((c) => c.name);
    expect(names).toContain('mcp__handyman__feature_add');
    expect(names).toContain('mcp__handyman__feature_start');
    expect(names).toContain('mcp__handyman__feature_close');
    expect(names.indexOf('mcp__handyman__feature_add')).toBeLessThan(
      names.indexOf('mcp__handyman__feature_start'),
    );
    expect(names.lastIndexOf('mcp__handyman__feature_start')).toBeLessThan(
      names.lastIndexOf('mcp__handyman__feature_close'),
    );

    // Ground truth is on disk, not in the model's prose.
    expect(featureStatus(feature)).toBe('done');
    expect(result.output).toMatch(/done/i);
  });

  it('refuses to close when the verifier is red', async ({ run }) => {
    const initSh = join(PROJECT, 'init.sh');
    const original = readFileSync(initSh, 'utf-8');
    const feature = `eval_red_${Date.now().toString(36)}`;
    writeFileSync(initSh, original.replace(/^exit 0$/m, 'exit 1'));
    try {
      const result = await run(feature);

      // The verifier gate in feature.js refuses the close; the feature stays
      // in_progress and the leader reports the refusal instead of forcing it.
      expect(featureStatus(feature)).toBe('in_progress');
      expect(result.output).toMatch(/verifier|refus|in_progress/i);
    } finally {
      writeFileSync(initSh, original);
      // Leave the scratch workspace clean: close the feature now the verifier
      // is green again (deterministic CLI, not the agent).
      if (featureStatus(feature) === 'in_progress') {
        execFileSync(
          'node',
          ['handyman/dist/feature.js', '--root', PROJECT, 'done', feature],
          { cwd: REPO_ROOT, stdio: 'pipe' },
        );
      }
    }
  });
});

// Skill-mirror driver (phase 4): runs ONE feature through the skill-mirror
// agent (native handyman skill, no role instructions) and prints the tool
// call sequence — the evidence that the native skill loaded and fired the
// protocol. Same requirements as run-feature.ts (MCP on :8177, keys via
// ../../.env, scratch project in HANDYMAN_PROJECT_ROOT).
//
//   HANDYMAN_PROJECT_ROOT=/tmp/hm-mastra-skill pnpm run-skill -- <feature>
import { buildApp } from './src/app';
import { PROJECT } from './src/agents/handyman-leader';
import { createHandymanSkillAgent } from './src/agents/handyman-skill';
import { RequestContext } from './src/mastra';
import { featureThread } from './src/ports/memory';

const feature = process.argv.slice(2).filter((a) => a !== '--')[0] ?? 'skill_mirror_probe';

// The skill agent is a probe, not a registered topology: build it over the
// app's MCP tool map (no second MCPClient).
const { tools, close } = await buildApp();
const agent = createHandymanSkillAgent(tools, PROJECT);

const requestContext = new RequestContext();
requestContext.set('feature', feature);

console.log(`[skill] feature="${feature}" project="${PROJECT}"`);
const startedAt = Date.now();
try {
  const skills = await agent.listSkills();
  console.log(`[skill] native skills loaded: ${skills.map((s) => s.name).join(', ') || '(none!)'}`);

  const result = await agent.generate(`Run the feature loop for feature "${feature}".`, {
    maxSteps: 20,
    memory: featureThread(feature, PROJECT),
    requestContext,
  });

  console.log('=== agent result ===');
  console.log(result.text);
  console.log('=== tool call sequence ===');
  for (const step of result.steps ?? []) {
    for (const call of step.toolCalls ?? []) {
      // ToolCallChunk: { type: 'tool-call', payload: { toolName, ... } }
      console.log(`  ${(call as { payload?: { toolName?: string } }).payload?.toolName}`);
    }
  }
  console.log('=== usage ===');
  console.log(JSON.stringify(result.usage ?? null));
  console.log(`[skill] finished in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
} finally {
  await close();
}

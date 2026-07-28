// Protocol trajectory scorer (phase 4): deterministic subsequence check over
// the agent's ACTUAL tool calls. Why custom and not the prebuilt
// trajectory-accuracy scorer: runEvals' trajectory-config path feeds scorers
// a TRACE-derived trajectory whose top level for agent targets is a single
// `llm: 'glm-5.2'` model_generation step (MCP calls nest three levels down:
// agent_run → model_generation → model_step → mcp_tool_call — verified
// against the 1.53.0 span layout), so protocol tool names can never match.
// This scorer extracts the trajectory from the agent's OUTPUT MESSAGES
// (clean tool names, the same source checks.toolOrder reads) using the
// framework's own extractTrajectory.
import { createScorer, extractTrajectory } from '../mastra';

/** Scores 1 iff every expected tool name appears in order (relaxed
 *  subsequence: extra calls between expected ones are allowed, missing or
 *  out-of-order expected ones score 0). */
export function createProtocolTrajectoryScorer(expectedOrder: string[]) {
  return createScorer({
    id: 'protocol-trajectory-order',
    name: 'Protocol Trajectory Order',
    description: `Scores 1 if the protocol tool calls appear in order: ${expectedOrder.join(' → ')}`,
  })
    .preprocess(async ({ run }) => {
      const trajectory = extractTrajectory(run.output as never);
      return {
        actualStepNames: trajectory.steps.map((s) => s.name),
        expectedOrder,
      };
    })
    .generateScore(({ results }) => {
      const { actualStepNames, expectedOrder: expected } = results.preprocessStepResult as {
        actualStepNames: string[];
        expectedOrder: string[];
      };
      let lastIndex = -1;
      for (const name of expected) {
        const found = actualStepNames.indexOf(name, lastIndex + 1);
        if (found === -1) return 0;
        lastIndex = found;
      }
      return 1;
    });
}

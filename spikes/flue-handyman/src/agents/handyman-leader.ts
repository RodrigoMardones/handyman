import { defineAgent, connectMcpServer } from '@flue/runtime';

// Absolute path of the scratch handyman project this spike drives.
const PROJECT = '/tmp/hm-flue-spike';

const instructions = `
You are the handyman leader agent. You drive the handyman harness through its
MCP tools (prefixed mcp__handyman__). The project root for every call is
"${PROJECT}" (pass it as the "project" argument). The user message names the
feature to work on.

Execute this exact sequence, in order, waiting for each result:
1. mcp__handyman__feature_add with the given name, title "Spike Flue integration",
   description "Toy feature driven end-to-end by a Flue agent over MCP.",
   acceptance ["feature closes with a green verifier"].
2. mcp__handyman__feature_start with the same name and no_preflight true.
3. mcp__handyman__feature_log with line "closed by a Flue agent over MCP".
4. mcp__handyman__feature_close with the same name (no verifier override).

If any step fails (especially a refused close), STOP the sequence and report
the failure verbatim. Otherwise reply with one short line per step: the tool
name and whether it succeeded, plus the final feature status. Do not call any
tool not listed here.`;

export const description = 'Handyman leader driven through the handyman MCP server (spike).';

export const route = (c: any, next: any) => next();

export default defineAgent(async () => {
  const handyman = await connectMcpServer('handyman', {
    url: 'http://127.0.0.1:8177/mcp',
  });
  return {
    model: 'anthropic/glm-5.2',
    tools: handyman.tools,
    instructions,
    thinkingLevel: 'minimal',
  };
});

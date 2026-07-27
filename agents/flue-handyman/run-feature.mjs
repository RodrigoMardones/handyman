// Feature-loop driver: sends one prompt to the handyman-leader agent and waits
// for the terminal result. Uses send+wait (202 admission + durable wait)
// instead of a blocking prompt: the HTTP connection only OBSERVES the work, so
// long delegation loops don't kill the client with a headers timeout.
// Requires `flue dev` (default :3583) and the handyman MCP server (:8177).
// Usage: node run-feature.mjs <feature-name>   (FLUE_BASE_URL to override)
import { createFlueClient } from '@flue/sdk';

const client = createFlueClient({
  baseUrl: process.env.FLUE_BASE_URL ?? 'http://localhost:3583',
});

// One agent instance per feature: the instance id IS the feature name.
const feature = process.argv[2] ?? 'spike_flue_integration';

const admission = await client.agents.send('handyman-leader', feature, {
  message: `Run the spike feature loop for feature "${feature}".`,
});
console.log(`admitted: submission ${admission.submissionId}`);

const result = await client.agents.wait(admission);
// wait() resolves AgentPromptResponse ({ text, usage, model }) — flat, unlike
// prompt()'s { result: {...} } envelope.
console.log('=== agent result ===');
console.log(result?.text ?? JSON.stringify(result));
console.log('=== usage ===');
console.log(JSON.stringify(result?.usage ?? null));

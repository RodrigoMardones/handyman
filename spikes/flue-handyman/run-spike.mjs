// Spike driver: prompts the handyman-leader agent once and prints the result.
// Requires `flue dev` running on :3583 and the handyman MCP server on :8177.
import { createFlueClient } from '@flue/sdk';

const client = createFlueClient({ baseUrl: 'http://localhost:3583' });

// One agent instance per feature: the instance id IS the feature name.
const feature = process.argv[2] ?? 'spike_flue_integration';

const res = await client.agents.prompt('handyman-leader', feature, {
  message: `Run the spike feature loop for feature "${feature}".`,
});

console.log('=== agent result ===');
console.log(res.result.text);
console.log('=== usage ===');
console.log(JSON.stringify(res.result.usage));

// Feature-loop driver: sends one prompt to the handyman-leader agent and waits
// for the terminal result. Uses send+wait (202 admission + durable wait)
// instead of a blocking prompt: the HTTP connection only OBSERVES the work, so
// long delegation loops don't kill the client with a headers timeout.
// Requires `flue dev` (default :3583) and the handyman MCP server (:8177).
// Usage: node run-feature.mjs <feature-name>   (FLUE_BASE_URL to override)
//
// Documented exception to the src/flue/ anti-volatility barrel: this is a
// standalone .mjs driver with no build step, so it imports @flue/sdk directly
// (a one-line change when the 1.0 SDK rework lands).
import { createFlueClient } from '@flue/sdk';
// Reconnect policy shares its source of truth with the TS taxonomy
// (src/domain/errors.ts wraps this same module): on a transient client-side
// failure, re-attach to the SAME admission — the backend keeps working
// (Durable Streams) and re-dispatching would duplicate the cycle.
import { isTransientClientError } from './src/domain/client-error-classes.mjs';

const client = createFlueClient({
  baseUrl: process.env.FLUE_BASE_URL ?? 'http://localhost:3583',
});

// One agent instance per feature: the instance id IS the feature name.
const feature = process.argv[2] ?? 'spike_flue_integration';

const admission = await client.agents.send('handyman-leader', feature, {
  message: `Run the spike feature loop for feature "${feature}".`,
});
console.log(`admitted: submission ${admission.submissionId}`);

const MAX_RECONNECTS = 5;
let result;
for (let attempt = 0; ; attempt += 1) {
  try {
    result = await client.agents.wait(admission);
    break;
  } catch (err) {
    if (!isTransientClientError(err) || attempt >= MAX_RECONNECTS) throw err;
    const delayMs = Math.min(1000 * 2 ** (attempt + 1), 15_000);
    const name = err?.name ?? 'unknown';
    console.warn(
      `wait failed (${name}); re-attaching to the same submission in ${delayMs}ms ` +
        `(${attempt + 1}/${MAX_RECONNECTS}) — no re-dispatch`,
    );
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

// wait() resolves AgentPromptResponse ({ text, usage, model }) — flat, unlike
// prompt()'s { result: {...} } envelope.
console.log('=== agent result ===');
console.log(result?.text ?? JSON.stringify(result));
console.log('=== usage ===');
console.log(JSON.stringify(result?.usage ?? null));

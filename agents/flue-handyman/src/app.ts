import { Hono } from 'hono';
import { flue } from './flue';
import { registerModelProviders } from './ports/model-catalog';
import { installTelemetrySink } from './ports/telemetry-sink';

// Provider registration (Z.AI GLM override + kimi-coding) lives in the model
// catalog: one module knows endpoints, env keys and per-model tuning.
registerModelProviders();

// Telemetry: one observe() subscriber per process. Writes logs/agent-*.jsonl
// (sanitized, no message content) and outcome-oriented console lines.
installTelemetrySink();

const app = new Hono();

app.route('/', flue());

export default app;

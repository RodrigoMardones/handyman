// Studio entry (operator request 2026-07-28): exposes the composed app to
// `mastra dev` so the official Studio panel can chat with the agents,
// inspect tools/workflows and browse traces. Dev-tool only — the drivers
// (run-feature / run-workflow / run-skill / run-evals) import src/app.ts
// directly. Requires the handyman MCP up (default http://127.0.0.1:8177/mcp)
// and the provider keys in env.
import { buildApp } from '../src/app';

const { mastra } = await buildApp();

export { mastra };

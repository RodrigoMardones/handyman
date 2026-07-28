// Anti-volatility layer (feature 90): the ONLY module in this package allowed
// to import @flue/*. Everything the app uses from the Flue runtime/SDK is
// re-exported from here; the rest of the package imports from './flue' (or
// '../flue', '../../flue'), never from @flue/* directly. When Flue 1.0 lands
// its breaking rework (Vite plugin, 'use agent', collapsed SDK), the
// adaptation diff touches this file only.
//
// Documented exception: run-feature.mjs is a standalone .mjs driver with no
// build step, so it imports @flue/sdk directly (a one-line change on upgrade).
//
// Design against stable concepts only (agents, profiles, tools, sessions,
// dispatch, observe, registerProvider). No workflows: they die in 1.0.
export {
  defineAgent,
  defineAgentProfile,
  connectMcpServer,
  registerProvider,
  observe,
  dispatch,
} from '@flue/runtime';
export type {
  AgentProfile,
  FlueEvent,
  FlueEventSubscriber,
  McpServerConnection,
  ToolDefinition,
} from '@flue/runtime';
export { flue } from '@flue/runtime/routing';
export { sqlite } from '@flue/runtime/node';
export { createFlueClient } from '@flue/sdk';
export type { FlueConversationMessage } from '@flue/sdk';

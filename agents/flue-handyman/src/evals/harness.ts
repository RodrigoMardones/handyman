// flue-blueprint: tooling/vitest-evals@1 — adapted: agents.send + agents.wait
// instead of agents.prompt (a blocking prompt dies with a headers timeout on
// long delegation loops; the backend continues regardless).
import { createFlueClient, type FlueConversationMessage } from '../../flue';
import { createHarness } from 'vitest-evals';

export interface HandymanAgentHarnessOptions {
  agentName?: string;
  baseUrl?: string;
  token?: string;
  headers?: Record<string, string>;
}

type TranscriptEvent =
  | { type: 'message'; role: 'user' | 'assistant'; content: unknown }
  | { type: 'tool_call'; id: string; name: string; arguments: unknown }
  | { type: 'tool_result'; toolCallId: string; name: string; content: unknown };

function collectEvents(messages: FlueConversationMessage[]): TranscriptEvent[] {
  const events: TranscriptEvent[] = [];
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === 'text') {
        events.push({ type: 'message', role: message.role, content: part.text });
      } else if (part.type === 'dynamic-tool') {
        events.push({
          type: 'tool_call',
          id: part.toolCallId,
          name: part.toolName,
          arguments: part.input,
        });
        if (part.state === 'output-available') {
          events.push({
            type: 'tool_result',
            toolCallId: part.toolCallId,
            name: part.toolName,
            content: part.output,
          });
        } else if (part.state === 'output-error') {
          events.push({
            type: 'tool_result',
            toolCallId: part.toolCallId,
            name: part.toolName,
            content: { error: part.errorText },
          });
        }
      }
    }
  }
  return events;
}

/**
 * Harness over the deployed agent's public HTTP boundary (@flue/sdk). The
 * `run` input IS the feature name: one fresh agent instance per run, so eval
 * cases never share conversation state.
 */
export function createHandymanAgentHarness(options: HandymanAgentHarnessOptions = {}) {
  const agentName = options.agentName ?? 'handyman-leader';
  const client = createFlueClient({
    baseUrl: options.baseUrl ?? process.env.FLUE_BASE_URL ?? 'http://127.0.0.1:3583',
    token: options.token,
    headers: options.headers,
  });

  return createHarness<string, string>({
    name: `flue-${agentName}-agent`,
    run: async ({ input: feature, signal }) => {
      const admission = await client.agents.send(agentName, feature, {
        message: `Run the spike feature loop for feature "${feature}".`,
        signal,
      });
      const result = await client.agents.wait(admission);
      const history = await client.agents.history(agentName, feature, { signal });

      return {
        output: result.text,
        events: collectEvents(history.messages),
        usage: {
          inputTokens: result.usage?.input,
          outputTokens: result.usage?.output,
          totalTokens: result.usage?.totalTokens,
        },
      };
    },
  });
}

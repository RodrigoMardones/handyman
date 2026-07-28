// Unit tests for the usage-aggregate port: store interactions are stubbed —
// what matters is the metric-name wiring, the traceId filter (leader +
// delegations share one trace; threadId does NOT work — delegations run on
// fresh threads), and the best-effort contract (failures degrade to
// undefined, never throw).
import { describe, expect, it } from 'vitest';
import { aggregateRunUsage, type MetricStore } from './usage-aggregate';

function stubStore(values: Record<string, number | null>): MetricStore & {
  calls: Array<{ name: string[]; aggregation: 'sum'; filters?: { traceId?: string } }>;
} {
  const calls: Array<{ name: string[]; aggregation: 'sum'; filters?: { traceId?: string } }> = [];
  return {
    calls,
    async getMetricAggregate(args) {
      calls.push(args);
      const key = args.name[0];
      return { value: key in values ? values[key] : null };
    },
  };
}

describe('aggregateRunUsage', () => {
  it('sums the three token metrics filtered by traceId', async () => {
    const store = stubStore({
      mastra_model_total_input_tokens: 73000,
      mastra_model_total_output_tokens: 2344,
      mastra_model_input_cache_read_tokens: 16384,
    });
    const usage = await aggregateRunUsage(store, 'trace-abc');
    expect(usage).toEqual({
      inputTokens: 73000,
      outputTokens: 2344,
      cachedInputTokens: 16384,
    });
    expect(store.calls).toHaveLength(3);
    for (const call of store.calls) {
      expect(call.filters).toEqual({ traceId: 'trace-abc' });
      expect(call.aggregation ?? 'sum').toBe('sum');
    }
  });

  it('degrades to undefined fields when the store has no rows', async () => {
    const usage = await aggregateRunUsage(stubStore({}), 'nobody');
    expect(usage.inputTokens).toBeUndefined();
    expect(usage.outputTokens).toBeUndefined();
  });

  it('degrades to empty without a store', async () => {
    const usage = await aggregateRunUsage(undefined, 'x');
    expect(usage.inputTokens).toBeUndefined();
  });

  it('never throws on store failures (best-effort contract)', async () => {
    const store: MetricStore = {
      async getMetricAggregate() {
        throw new Error('duckdb exploded');
      },
    };
    const usage = await aggregateRunUsage(store, 'x');
    expect(usage.inputTokens).toBeUndefined();
  });
});

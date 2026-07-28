// Usage aggregation port (phase 4): the run-total token usage of a feature,
// aggregated from the observability store's metric_events by TRACE id — the
// correlation that actually captures leader + subagents. (threadId does NOT
// work: delegations run on FRESH thread ids by design — messageFilter
// isolation — so a thread filter only sees the leader, e.g. 47 913 of a
// ~73k real run. Verified 2026-07-28 against the span tree: subagent
// generations hang off the leader's delegation tool_call — same traceId.)
// The store is the app's own observability domain (same live DuckDB
// connection — a second connection would trip the single-writer lock). All
// calls are best-effort: a query failure returns nulls, never throws.
import type { TokenUsageLike } from './tokens-ledger';

/** Minimal shape of the observability store domain this port needs. */
export interface MetricStore {
  getMetricAggregate(args: {
    name: string[];
    aggregation: 'sum';
    filters?: { traceId?: string };
  }): Promise<{ value: number | null }>;
}

export interface RunUsage extends TokenUsageLike {
  /** estimatedCost is provided by the store when the model is priced. */
  estimatedCost?: number | null;
  costUnit?: string | null;
}

async function sumMetric(
  store: MetricStore,
  name: string,
  traceId: string,
): Promise<number | null> {
  try {
    const res = await store.getMetricAggregate({
      name: [name],
      aggregation: 'sum',
      filters: { traceId },
    });
    return res.value ?? null;
  } catch {
    return null;
  }
}

/** Total token usage of one run trace (leader + delegations).
 *  A missing store (observability domain unavailable) degrades to empty. */
export async function aggregateRunUsage(
  store: MetricStore | undefined,
  traceId: string,
): Promise<RunUsage> {
  if (!store) return {};
  const [input, output, cached] = await Promise.all([
    sumMetric(store, 'mastra_model_total_input_tokens', traceId),
    sumMetric(store, 'mastra_model_total_output_tokens', traceId),
    sumMetric(store, 'mastra_model_input_cache_read_tokens', traceId),
  ]);
  return {
    inputTokens: input ?? undefined,
    outputTokens: output ?? undefined,
    cachedInputTokens: cached ?? undefined,
  };
}

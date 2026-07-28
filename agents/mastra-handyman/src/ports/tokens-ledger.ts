// Tokens ledger bridge (phase 2): writes the canonical handyman token ledger
// (.handyman/metrics/tokens.jsonl, design §2 of docs/analisis-tokens-consumo-y-metricas.md)
// from a finished Mastra run. The ledger is append-only JSONL, one line per
// CLOSED feature; the harness aggregates it later (metrics.js). Writing is
// best-effort and NEVER blocks the run ("observa, no bloquea").
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface TokenUsageLike {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
}

export interface TokensLedgerEntry {
  ts: string;
  feature_id: number | null;
  feature: string;
  source: 'mastra';
  /** 'leader' = usage of the leader agent ONLY (result.usage). Subagent
   *  usage is NOT in this line; the run total lives in the observability
   *  store (metric_events aggregated by threadId/runId). */
  scope: 'leader';
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
}

/** Look up the feature's numeric id and status in feature_list.json. */
export function featureState(
  project: string,
  feature: string,
): { id: number | null; status: string | null } {
  const listPath = join(project, '.handyman', 'feature_list.json');
  if (!existsSync(listPath)) return { id: null, status: null };
  try {
    const data = JSON.parse(readFileSync(listPath, 'utf-8'));
    const found = (data.features ?? []).find(
      (f: { name?: string }) => f.name === feature,
    );
    return { id: found?.id ?? null, status: found?.status ?? null };
  } catch {
    return { id: null, status: null };
  }
}

/** Append one ledger line for a CLOSED feature. Returns the entry written,
 *  or null when the feature is not done (ledger records closures only). */
export function appendTokensLedger(
  project: string,
  feature: string,
  modelSpec: string,
  usage: TokenUsageLike,
): TokensLedgerEntry | null {
  const { id, status } = featureState(project, feature);
  if (status !== 'done') return null;

  const slash = modelSpec.indexOf('/');
  const entry: TokensLedgerEntry = {
    ts: new Date().toISOString(),
    feature_id: id,
    feature,
    source: 'mastra',
    scope: 'leader',
    provider: slash > 0 ? modelSpec.slice(0, slash) : 'unknown',
    model: slash > 0 ? modelSpec.slice(slash + 1) : modelSpec,
    input_tokens: usage.inputTokens ?? 0,
    output_tokens: usage.outputTokens ?? 0,
    ...(usage.cachedInputTokens !== undefined
      ? { cache_read_input_tokens: usage.cachedInputTokens }
      : {}),
  };

  const dir = join(project, '.handyman', 'metrics');
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, 'tokens.jsonl'), JSON.stringify(entry) + '\n');
  return entry;
}

interface SubmitNewFeatureInput {
  root: string;
  name: string;
  title: string | null;
  acceptance: string[];
  description: string | null;
  runnerEnabled: boolean;
  runAgent: boolean;
}

type FeatureResult =
  | { ok: true; id?: number }
  | { ok: false; error: string };

type RunResult = { ok: true } | { ok: false; error: string };

export interface SubmitNewFeatureResult {
  feature: FeatureResult;
  run?: RunResult;
}

export async function submitNewFeature(
  input: SubmitNewFeatureInput,
  fetcher: typeof fetch = fetch,
): Promise<SubmitNewFeatureResult> {
  const featureResponse = await fetcher("/api/feature", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      root: input.root,
      name: input.name,
      title: input.title,
      acceptance: input.acceptance,
      description: input.description,
    }),
  });
  const featurePayload = (await featureResponse.json()) as {
    ok?: boolean;
    id?: number;
    error?: string;
  };
  if (!featureResponse.ok || !featurePayload.ok) {
    return {
      feature: {
        ok: false,
        error: featurePayload.error ?? `HTTP ${featureResponse.status}`,
      },
    };
  }

  const feature: FeatureResult = { ok: true, id: featurePayload.id };
  if (!input.runnerEnabled || !input.runAgent) {
    return { feature };
  }

  try {
    const runResponse = await fetcher("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ root: input.root, feature: input.name }),
    });
    const runPayload = (await runResponse.json()) as { ok?: boolean; error?: string };
    return {
      feature,
      run:
        runResponse.ok && runPayload.ok
          ? { ok: true }
          : { ok: false, error: runPayload.error ?? `HTTP ${runResponse.status}` },
    };
  } catch (error) {
    return {
      feature,
      run: {
        ok: false,
        error: error instanceof Error ? error.message : "run request failed",
      },
    };
  }
}
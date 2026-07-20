/**
 * POST /api/summarize (feature 45): the fleet-summary relay, served
 * natively. Same contract as the Node observer's handleSummarizeRequest:
 * digest the /api/state document, hash it, replay a cached summary on an
 * unchanged fleet (single `event: result` with cached:true, provider never
 * called - the SummaryCache lives in the runtime singleton), or stream the
 * provider's deltas and cache the result. Never writes disk.
 */
import {
  buildSummaryDigest,
  composeSummaryPrompt,
  composeSummarySystem,
  relaySummary,
  resolveSummaryModel,
  summaryHash,
} from "@handyman/toolbox-core";
import { readJsonObject, relayResponse } from "../../../lib/relay";
import { sendJson } from "../../../lib/respond";
import { getRuntime } from "../../../lib/runtime";
import { getBuildState } from "../../../lib/toolboxState";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const runtime = getRuntime();
  const body = await readJsonObject(request);
  if (body === null) {
    return sendJson(400, { ok: false, error: "invalid body: expects {provider?, model?}" });
  }
  const providerId =
    typeof body.provider === "string" && body.provider.length > 0 ? body.provider : "zai";
  const provider = runtime.providers.find((p) => p.id === providerId);
  if (!provider) {
    return sendJson(400, { ok: false, error: "unknown provider" });
  }
  const bodyModel =
    typeof body.model === "string" && body.model.length > 0 ? body.model : undefined;
  const model = resolveSummaryModel(bodyModel, providerId, process.env);

  const buildState = await getBuildState();
  const digest = buildSummaryDigest(buildState(runtime.hroot));
  const hash = summaryHash(digest);

  const cached = runtime.summaryCache.get(hash);
  if (cached) {
    // Unchanged fleet: replay the cached summary, provider never called.
    return relayResponse((sse, end) => {
      sse("result", { summary_md: cached.summary_md, model: cached.model, cached: true, hash });
      end();
    });
  }

  return relayResponse(async (sse, end) => {
    await relaySummary({
      system: composeSummarySystem(),
      prompt: composeSummaryPrompt(digest),
      draft: (r, onDelta) => provider.draft({ prompt: r.prompt, system: r.system, model }, onDelta),
      onDelta: (text) => sse("delta", { text }),
      onResult: (event) => {
        runtime.summaryCache.set(hash, {
          summary_md: event.summary_md,
          model: event.model,
          created_at: new Date().toISOString(),
        });
        sse("result", { summary_md: event.summary_md, model: event.model, cached: false, hash });
        end();
      },
      onError: (error) => {
        sse("error", { code: error.code, message: error.message });
        end();
      },
    });
  });
}

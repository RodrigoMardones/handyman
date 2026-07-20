/**
 * POST /api/retro (feature 35): recurring patterns and anti-patterns mined
 * from progress/history.md plus the backlog of already-closed features.
 *
 * Suggestions only - this never writes docs/conventions.md. A human promotes
 * what is worth promoting. Patterns backed by fewer than RETRO_MIN_EVIDENCE
 * features are dropped server-side and counted in `discarded`, so a thin
 * answer never reads as a clean history.
 */
import {
  composeRetroPrompt,
  composeRetroSystem,
  readRetroCorpus,
  relayRetro,
  resolveWorkspace,
} from "@handyman/toolbox-core";
import { relayResponse } from "../../../lib/relay";
import { resolveRelayTarget } from "../../../lib/relayTarget";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const target = await resolveRelayTarget(request, "{root, provider?, model?}");
  if (target instanceof Response) {
    return target; // every 400 fires before any LLM call
  }
  const { root, provider, model } = target;

  const corpus = readRetroCorpus(resolveWorkspace(root));

  return relayResponse(async (sse, end) => {
    await relayRetro({
      system: composeRetroSystem(),
      prompt: composeRetroPrompt(corpus),
      draft: (r, onDelta) => provider.draft({ prompt: r.prompt, system: r.system, model }, onDelta),
      onDelta: (text) => sse("delta", { text }),
      onResult: (event) => {
        sse("result", event);
        end();
      },
      onError: (error) => {
        sse("error", { code: error.code, message: error.message });
        end();
      },
    });
  });
}

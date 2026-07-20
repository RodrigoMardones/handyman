/**
 * POST /api/acceptance (feature 33): draft observable acceptance bullets from
 * the working diff (source='diff') or from a raw spec/issue (source='spec').
 *
 * Read-only: it generates text the human pastes into feature-request.md
 * through the existing intake flow. The diff reader is the one feature 34
 * already introduced (execFile, no shell, cwd = the registry-validated root).
 */
import {
  ACCEPTANCE_SPEC_MAX_CHARS,
  composeAcceptancePrompt,
  composeAcceptanceSystem,
  readFeatureDiff,
  relayAcceptance,
} from "@handyman/toolbox-core";
import { relayResponse } from "../../../lib/relay";
import { resolveRelayTarget } from "../../../lib/relayTarget";
import { sendJson } from "../../../lib/respond";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const target = await resolveRelayTarget(request, "{root, source, provider?, model?}");
  if (target instanceof Response) {
    return target; // every 400 fires before any LLM call
  }
  const { root, provider, model, body } = target;

  const source = body.source === "diff" || body.source === "spec" ? body.source : null;
  if (source === null) {
    return sendJson(400, { ok: false, error: "source must be 'diff' or 'spec'" });
  }

  let content: string;
  let truncated = false;
  if (source === "diff") {
    const read = readFeatureDiff(root);
    content = read.diff;
    truncated = read.truncated;
  } else {
    const spec = typeof body.spec === "string" ? body.spec.trim() : "";
    if (!spec) {
      return sendJson(400, { ok: false, error: "spec is required when source is 'spec'" });
    }
    // The relay body is already capped at 256 KB; this keeps the PROMPT sane
    // and, like the diff path, tells the model what it did not see.
    truncated = spec.length > ACCEPTANCE_SPEC_MAX_CHARS;
    content = truncated ? spec.slice(0, ACCEPTANCE_SPEC_MAX_CHARS) : spec;
  }

  return relayResponse(async (sse, end) => {
    await relayAcceptance({
      system: composeAcceptanceSystem(),
      prompt: composeAcceptancePrompt(source, content, truncated),
      draft: (r, onDelta) => provider.draft({ prompt: r.prompt, system: r.system, model }, onDelta),
      source,
      truncated,
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

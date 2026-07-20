/**
 * POST /api/review-notes (feature 34): a review checklist to seed the
 * reviewer, built from backlog/impl_<feature>.md plus the working diff.
 *
 * Never writes disk (relay-only, like /api/draft): the reviewer copies what is
 * useful into backlog/review_<feature>.md through the normal flow and signs
 * APPROVED / CHANGES_REQUESTED on real evidence - the verifier and the diff -
 * not on this summary. The output is a checklist of questions, never a patch
 * and never a verdict.
 */
import { composeReviewNotesRequest, relayReviewNotes } from "@handyman/toolbox-core";
import { relayResponse } from "../../../lib/relay";
import { resolveRelayTarget } from "../../../lib/relayTarget";
import { sendJson } from "../../../lib/respond";

export const dynamic = "force-dynamic";

/** Feature names are harness identifiers; keep them to the shape feature.js
 *  itself accepts so nothing can walk out of backlog/ via the filename. */
const FEATURE_NAME = /^[A-Za-z0-9_-]+$/;

export async function POST(request: Request): Promise<Response> {
  const target = await resolveRelayTarget(request, "{root, feature, provider?, model?}");
  if (target instanceof Response) {
    return target; // every 400 fires before any LLM call
  }
  const { root, provider, model, body } = target;

  const feature = typeof body.feature === "string" ? body.feature.trim() : "";
  if (!feature) {
    return sendJson(400, { ok: false, error: "feature is required" });
  }
  if (!FEATURE_NAME.test(feature)) {
    return sendJson(400, { ok: false, error: "invalid feature name" });
  }

  // Same composition the CLI subcommand runs (feature 53): the two can never
  // ask the model a different question about the same feature.
  const composed = composeReviewNotesRequest(root, feature);

  return relayResponse(async (sse, end) => {
    await relayReviewNotes({
      system: composed.system,
      prompt: composed.prompt,
      draft: (r, onDelta) => provider.draft({ prompt: r.prompt, system: r.system, model }, onDelta),
      diffTruncated: composed.diffTruncated,
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

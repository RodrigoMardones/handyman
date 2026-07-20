/**
 * POST /api/triage (feature 32): backlog triage + evidence debt.
 *
 * Reads backlog/*.md of a registered harness, asks the cheap classification
 * model to categorise them and flag overlaps, and returns that alongside the
 * SERVER-COMPUTED evidence debt (features done with no review_<name>.md - the
 * hole validate_harness does not cover). Never writes disk, never auto-merges:
 * the report is a suggestion a human acts on with mv/git.
 */
import {
  composeTriagePrompt,
  composeTriageSystem,
  computeEvidenceDebt,
  listBacklogDocs,
  relayTriage,
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

  const workspace = resolveWorkspace(root);
  const docs = listBacklogDocs(workspace);
  const evidenceDebt = computeEvidenceDebt(workspace);

  return relayResponse(async (sse, end) => {
    await relayTriage({
      system: composeTriageSystem(),
      prompt: composeTriagePrompt(docs),
      draft: (r, onDelta) => provider.draft({ prompt: r.prompt, system: r.system, model }, onDelta),
      evidenceDebt,
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

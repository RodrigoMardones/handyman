/**
 * POST /api/ask (feature 45): the grounded fleet Q&A relay, served
 * natively. Same contract as the Node observer's handleAskRequest: validate
 * {root, question, provider?, model?} (every 400 before any LLM call),
 * retrieve the BM25 top-k fragments of the harness corpus (buildCorpus
 * filtered by root - citations map 1:1 onto GET /api/md refs), and stream
 * the provider's cited answer. Never writes disk, never cached.
 */
import {
  buildCorpus,
  composeAskPrompt,
  composeAskSystem,
  isRegisteredRoot,
  relayAsk,
  resolveSummaryModel,
  retrieveTopK,
} from "@handyman/toolbox-core";
import { readJsonObject, relayResponse } from "../../../lib/relay";
import { sendJson } from "../../../lib/respond";
import { getRuntime } from "../../../lib/runtime";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const runtime = getRuntime();
  const body = await readJsonObject(request);
  if (body === null) {
    return sendJson(400, { ok: false, error: "invalid body: expects {root, question, provider?}" });
  }
  const root = typeof body.root === "string" ? body.root : "";
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!root) {
    return sendJson(400, { ok: false, error: "root is required" });
  }
  if (!question) {
    return sendJson(400, { ok: false, error: "question is required" });
  }
  if (!isRegisteredRoot(runtime.hroot, root)) {
    return sendJson(400, { ok: false, error: "root not registered" });
  }
  const providerId =
    typeof body.provider === "string" && body.provider.length > 0 ? body.provider : "zai";
  const provider = runtime.providers.find((p) => p.id === providerId);
  if (!provider) {
    return sendJson(400, { ok: false, error: "unknown provider" });
  }
  const bodyModel =
    typeof body.model === "string" && body.model.length > 0 ? body.model : undefined;
  // Same cheap-model resolution as the fleet summary (both are short,
  // low-stakes relays over harness state).
  const model = resolveSummaryModel(bodyModel, providerId, process.env);

  // Reuse the fleet corpus, filtered to the requested root: /api/ask cites
  // exactly the refs /api/corpus exposes, so every viewable citation maps
  // 1:1 onto GET /api/md?root=&file=<ref>.
  const corpus = buildCorpus(runtime.hroot).filter((d) => d.id.startsWith(`${root}::`));
  const fragments = await retrieveTopK(question, corpus);

  return relayResponse(async (sse, end) => {
    await relayAsk({
      system: composeAskSystem(),
      prompt: composeAskPrompt(question, fragments),
      draft: (r, onDelta) => provider.draft({ prompt: r.prompt, system: r.system, model }, onDelta),
      fragments,
      onDelta: (text) => sse("delta", { text }),
      onResult: (event) => {
        sse("result", {
          answer_md: event.answer_md,
          model: event.model,
          // Excerpts stay server-side: the client only needs the refs to
          // link and validate the citations.
          fragments: event.fragments.map(({ ref, kind, title, score }) => ({
            ref,
            kind,
            title,
            score,
          })),
        });
        end();
      },
      onError: (error) => {
        sse("error", { code: error.code, message: error.message });
        end();
      },
    });
  });
}

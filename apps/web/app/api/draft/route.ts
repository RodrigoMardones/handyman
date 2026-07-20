/**
 * POST /api/draft (feature 45): the intake-draft relay, served natively.
 * Same contract as the Node observer's handleDraftRequest: validate
 * {root, prompt, provider, files?} (every 400 fires before any LLM call),
 * build the stable system + volatile harness context (tagged files
 * included), call the chosen provider from the runtime singleton, and
 * stream `event: delta|result|error` frames. Never writes disk.
 */
import {
  buildDraftContext,
  buildDraftSystem,
  composeSystem,
  composeUserPrompt,
  isRegisteredRoot,
  readTagFiles,
  relayDraft,
} from "@handyman/toolbox-core";
import { readJsonObject, relayResponse } from "../../../lib/relay";
import { sendJson } from "../../../lib/respond";
import { getRuntime } from "../../../lib/runtime";
import { getHandymanAssetsDir } from "../../../lib/toolboxState";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const runtime = getRuntime();
  const body = await readJsonObject(request);
  if (body === null) {
    return sendJson(400, { ok: false, error: "invalid body: expects {root, prompt, provider}" });
  }
  const root = typeof body.root === "string" ? body.root : "";
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const providerId = typeof body.provider === "string" ? body.provider : "";
  if (!root || !prompt || !providerId) {
    return sendJson(400, { ok: false, error: "invalid body: expects {root, prompt, provider}" });
  }
  if (!isRegisteredRoot(runtime.hroot, root)) {
    return sendJson(400, { ok: false, error: "root not registered" });
  }
  const provider = runtime.providers.find((p) => p.id === providerId);
  if (!provider) {
    return sendJson(400, { ok: false, error: "unknown provider" });
  }
  // Optional tagged files: resolve+read each inside the registered root.
  const fileRels = Array.isArray(body.files)
    ? body.files.filter((f): f is string => typeof f === "string")
    : [];
  const taggedFiles = readTagFiles(runtime.hroot, root, fileRels);

  const context = await buildDraftContext(root, prompt, 5, taggedFiles);
  const system = composeSystem(buildDraftSystem(getHandymanAssetsDir()));
  const userPrompt = composeUserPrompt(context);

  return relayResponse(async (sse, end) => {
    await relayDraft({
      system,
      userPrompt,
      draft: (r, onDelta) => provider.draft({ prompt: r.prompt, system: r.system }, onDelta),
      possibleDuplicates: context.possible_duplicates,
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

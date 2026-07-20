/**
 * The shared validation prelude for the harness-analysis relays (features
 * 32-35: /api/triage, /api/acceptance, /api/review-notes, /api/retro).
 *
 * Decision D-B (see .handyman/docs/architecture.md): the three ORIGINAL relays
 * (/api/draft, /api/summarize, /api/ask) deliberately do NOT use this. They
 * disagree on every axis this helper fixes - summarize has no root at all,
 * draft requires an explicit provider and resolves no model - and their 400
 * bodies are byte-for-byte contract pinned by tests/test_web_relays.sh (TWL2)
 * and the black-box oracle. Refactoring them buys nothing and risks parity.
 *
 * The four new ones DO share one shape: POST {root, provider?, model?} ->
 * resolve a registered root (the registry is the allowlist for every workspace
 * read) -> resolve a provider -> resolve the cheap classification model. This
 * centralises exactly that, and nothing else: the prompt, the context and the
 * result shape stay in each route.
 *
 * Returns a Response on rejection so callers do `if (t instanceof Response)
 * return t;` - every 400 fires before any LLM call.
 */
import { isRegisteredRoot, type LlmProvider, resolveSummaryModel } from "@handyman/toolbox-core";
import { readJsonObject } from "./relay";
import { sendJson } from "./respond";
import { getRuntime } from "./runtime";

export interface RelayTarget {
  /** The validated, registered harness project root. */
  root: string;
  /** Resolved provider from the runtime singleton. */
  provider: LlmProvider;
  /** Cheap classification model (same criterion as /api/summarize, /api/ask);
   *  undefined means "the adapter's configured default". */
  model: string | undefined;
  /** The parsed body, for route-specific fields. */
  body: Record<string, unknown>;
}

export async function resolveRelayTarget(
  request: Request,
  /** Echoed in the 400 so each route names its own body shape. */
  bodyShape: string,
): Promise<RelayTarget | Response> {
  const runtime = getRuntime();
  const body = await readJsonObject(request);
  if (body === null) {
    return sendJson(400, { ok: false, error: `invalid body: expects ${bodyShape}` });
  }
  const root = typeof body.root === "string" ? body.root : "";
  if (!root) {
    return sendJson(400, { ok: false, error: "root is required" });
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
  return {
    root,
    provider,
    model: resolveSummaryModel(bodyModel, providerId, process.env),
    body,
  };
}

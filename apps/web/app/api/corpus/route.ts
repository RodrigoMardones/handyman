/**
 * GET /api/corpus (feature 44): the search corpus for the client-side BM25
 * index, served natively from @handyman/toolbox-core (bundle-safe). Same
 * payload and headers as the Node observer.
 */
import { buildCorpus } from "@handyman/toolbox-core";
import { sendJson } from "../../../lib/respond";
import { getRuntime } from "../../../lib/runtime";

export const dynamic = "force-dynamic";

export function GET(): Response {
  const runtime = getRuntime();
  return sendJson(200, { documents: buildCorpus(runtime.hroot) });
}

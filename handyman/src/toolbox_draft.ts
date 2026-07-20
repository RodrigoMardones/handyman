/**
 * Shim (feature 42): the intake-draft layer moved verbatim to
 * @handyman/toolbox-core (packages/toolbox-core/src/draft.ts). The Node
 * observer (toolbox_serve.ts) was decommissioned in feature 50; the
 * remaining consumers of this entrypoint are apps/web (via the package
 * exports) and tests/test_toolbox_draft.js.
 *
 * The only local logic: buildDraftSystem keeps its historical default —
 * the intake template is a handyman skill asset (../assets from src/ and
 * dist/), a path the core package cannot know, so the shim rebinds it.
 */

import { fileURLToPath } from "node:url";
import {
  buildDraftSystem as coreBuildDraftSystem,
  type DraftSystem,
} from "@handyman/toolbox-core/draft";

export * from "@handyman/toolbox-core/draft";

/** Bundled skill assets dir (../assets from both src/ and dist/). */
const ASSETS_DIR = fileURLToPath(new URL("../assets", import.meta.url));

export function buildDraftSystem(assetsDir: string = ASSETS_DIR): DraftSystem {
  return coreBuildDraftSystem(assetsDir);
}

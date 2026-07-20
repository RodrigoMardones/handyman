/**
 * Shim (feature 42): workspace resolution moved verbatim to
 * @handyman/toolbox-core (packages/toolbox-core/src/workspace.ts) so the
 * observer data layer is importable without the CLI package. This module
 * keeps the historical ./core/workspace.js import path (and the core barrel)
 * stable for every CLI and for core/workspace.test.ts.
 */
export {
  PLATFORM_ROLE_DIRS,
  resolveWorkspace,
  VALID_STATUS,
} from "@handyman/toolbox-core/workspace";

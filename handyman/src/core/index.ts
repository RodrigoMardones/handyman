/** Public API of the Handyman TypeScript core. */

export type { UnifiedDiffOptions } from "./diff.js";
export { SequenceMatcher, unifiedDiff } from "./diff.js";
export {
  loadFeatureList,
  saveFeatureList,
  serializeFeatureList,
} from "./featureList.js";
export { formatHalfEven } from "./rounding.js";
export type { ValidationResult } from "./schema.js";
export { validateFeatureList, validateHarnessConfig, validateSprint } from "./schema.js";
export { getVersion, HANDYMAN_VERSION } from "./version.js";
export { PLATFORM_ROLE_DIRS, resolveWorkspace, VALID_STATUS } from "./workspace.js";

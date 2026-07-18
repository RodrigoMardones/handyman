/**
 * Canonical version of the Handyman TypeScript toolchain.
 *
 * This is the version of the greenfield TS package, tracked independently
 * of the shipped skill's harness metadata version in SKILL.md.
 */
export const HANDYMAN_VERSION = "0.1.0";

/** Returns the current Handyman toolchain version. */
export function getVersion(): string {
  return HANDYMAN_VERSION;
}

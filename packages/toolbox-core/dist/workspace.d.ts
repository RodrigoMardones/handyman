/**
 * Platform directories where role files (`.agent.md`) are allowed to live.
 * Promoted to the core from `validate_harness.py` so every CLI shares the same
 * definition (e.g. `tools_discovery` declares the same role roots).
 */
export declare const PLATFORM_ROLE_DIRS: readonly string[];
/**
 * The four-status feature contract. Shared so the validator and any other CLI
 * agree on what a valid `status` value is.
 */
export declare const VALID_STATUS: readonly string[];
export declare function resolveWorkspace(root: string): string;
/**
 * Resolve the workspace knowledge directory. New layout: `memory/`; legacy
 * harnesses keep `docs/`. Preference: an existing `memory/` wins, an existing
 * `docs/` is honored, and a fresh workspace gets `memory/`. Surfaces keep the
 * name "docs" (MCP URIs, observer endpoints); only the disk layout moved.
 */
export declare function resolveDocsDir(workspace: string): string;

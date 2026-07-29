// Project pinning at the MCP client (feature 103, mastra_project_pinning):
// the CODE-level enforcement of the HARD STOP rule that used to live only in
// prompts (ADR Mastra, known debt — two project-drift incidents where the
// model ran tools against ANOTHER registry harness). Every handyman_* tool
// that declares a `project` arg is wrapped at connect time so:
//   - no `project` in the call     → the pinned root is INJECTED (absolute
//                                    path — unambiguous since F99/F101);
//   - `project` equal to the pin   → passes (the absolute root, a resolved-
//                                    equal absolute path, or the pinned
//                                    root's basename — the registry-name
//                                    shorthand the templates teach);
//   - any OTHER `project`          → REJECTED with an error naming both the
//                                    pin and the attempt (a loud rejection
//                                    teaches the model; a silent rewrite
//                                    would hide the drift) plus a structured
//                                    console.warn (the telemetry sink is
//                                    per-feature run-scoped, not reachable
//                                    from tool-wrap time).
// Tools that are not from the handyman MCP (github_*, workspace, web) and
// handyman tools WITHOUT a `project` arg (harness_list, fleet_* — the
// server's needsProject:false set) pass through untouched.
//
// Verified empirically against @mastra/mcp 1.15.0 (2026-07-29):
//   - tool.inputSchema is a JsonSchemaWrapper: the inner JSON schema comes
//     from getSchema() (plain JSON schemas are handled too, for tests);
//   - execute(input) takes the args object TOP-LEVEL (an agent-loop
//     { context } shape is validated away by the wrapper — pinning top-level
//     covers both conventions).
import { basename, isAbsolute, resolve } from 'node:path';

interface PinnableTool {
  inputSchema?: unknown;
  execute?: (input: unknown, ...rest: unknown[]) => unknown;
}

/** The JSON-schema `properties` of a tool input schema, across the shapes a
 *  schema can take here (MCPClient JsonSchemaWrapper, plain JSON schema). */
function schemaProperties(inputSchema: unknown): Record<string, unknown> | undefined {
  if (!inputSchema || typeof inputSchema !== 'object') return undefined;
  const schema = inputSchema as {
    getSchema?: () => unknown;
    jsonSchema?: unknown;
    properties?: unknown;
  };
  const json = typeof schema.getSchema === 'function' ? schema.getSchema() : inputSchema;
  const props = (json as { properties?: unknown } | undefined)?.properties;
  return props && typeof props === 'object' ? (props as Record<string, unknown>) : undefined;
}

/** Does this tool declare a `project` argument? The wrap gate — the server's
 *  needsProject:false tools (harness_list, fleet_*) do not declare it, so
 *  they are naturally left alone. */
export function acceptsProjectArg(tool: unknown): boolean {
  const props = schemaProperties((tool as PinnableTool)?.inputSchema);
  return props !== undefined && 'project' in props;
}

/** Same-project rule: the pinned absolute root, a resolved-equal absolute
 *  path (trailing slashes, symlinks-as-typed), or the pinned root's basename
 *  (the registry-name shorthand). Anything else is a foreign project. */
export function isSameProject(attempted: unknown, projectRoot: string): boolean {
  if (typeof attempted !== 'string' || attempted.trim() === '') return false;
  if (attempted === projectRoot || attempted === basename(projectRoot)) return true;
  return isAbsolute(attempted) && resolve(attempted) === resolve(projectRoot);
}

/** Wrap every handyman tool that accepts `project` with the pinning guard.
 *  Returns the pinned tool map plus the names actually wrapped (for the boot
 *  log — a 0 there means the inputSchema shape drifted and pinning is INERT). */
export function pinToolsToProject(
  tools: Record<string, unknown>,
  projectRoot: string,
  opts: { prefix?: string; warn?: (message: string) => void } = {},
): { tools: Record<string, unknown>; pinned: string[] } {
  const prefix = opts.prefix ?? 'handyman_';
  const warn = opts.warn ?? ((message: string) => console.warn(message));
  const pinned: string[] = [];
  const wrapped: Record<string, unknown> = { ...tools };
  for (const [name, tool] of Object.entries(tools)) {
    if (!name.startsWith(prefix) || !acceptsProjectArg(tool)) continue;
    const pinnable = tool as PinnableTool;
    if (typeof pinnable.execute !== 'function') continue;
    const execute = pinnable.execute.bind(tool);
    pinned.push(name);
    wrapped[name] = {
      ...(tool as Record<string, unknown>),
      // async so a pinning rejection surfaces as a PROMISE rejection (the
      // underlying MCP execute is async; a sync throw would break consumers
      // that only handle rejections).
      execute: async (input: unknown, ...rest: unknown[]) => {
        if (!input || typeof input !== 'object' || Array.isArray(input)) {
          return execute(input, ...rest);
        }
        const args = { ...(input as Record<string, unknown>) };
        const attempted = args.project;
        if (attempted === undefined || attempted === null || attempted === '') {
          args.project = projectRoot;
        } else if (!isSameProject(attempted, projectRoot)) {
          const message =
            `[pinning] ${name} rejected: this agent is pinned to project "${projectRoot}" ` +
            `but the call attempted "${String(attempted)}". ` +
            `Retry with project="${projectRoot}" or omit the "project" argument.`;
          warn(message);
          throw new Error(message);
        }
        return execute(args, ...rest);
      },
    };
  }
  return { tools: wrapped, pinned };
}

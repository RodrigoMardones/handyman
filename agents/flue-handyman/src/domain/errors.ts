// Error taxonomy (feature 94), from explore_flue_runtime_api.md §5.2. Three
// classes, and the class DECIDES the retry policy:
//
//   domain_outcome  -> a business/terminal outcome, NOT an error to fix:
//                      the red verifier refusing feature_close, a duplicate
//                      feature_add, a conflicting review verdict, an aborted
//                      or retry-exhausted submission. Policy: NEVER retry;
//                      the leader reports and stops.
//   transient_infra -> infra hiccup: provider 429/5xx, undici timeouts,
//                      dropped streams, a draining runtime. Policy: reconnect
//                      to the SAME admission/stream with a bounded budget
//                      (the backend keeps working; never re-dispatch).
//   protocol_error  -> the invocation itself is wrong: tool input/output
//                      validation, undeclared subagent, busy session. Policy:
//                      the model corrects its own call (the error comes back
//                      as a tool result); if it reaches a human, it's our bug.
//
// Classification keys off the STABLE contracts only: the FlueError `type`
// (snake_case) and the SDK error name/status — never the `message` (the
// package documents messages as non-API).
import { classifyClientError, isTransientClientError } from './client-error-classes.mjs';

export type FailureClass = 'domain_outcome' | 'transient_infra' | 'protocol_error';
export type RetryPolicy = 'never' | 'reconnect' | 'model_corrects';

export { classifyClientError, isTransientClientError };

/** FlueError `type` values (snake_case, the stable contract) -> class.
 *  Unlisted types fall back in classify(): transient_infra, so hiccups
 *  recover and a bounded budget keeps real bugs from looping forever. */
const FLUE_TYPE_CLASS: Record<string, FailureClass> = {
  // Protocol: the model/caller can correct the invocation.
  tool_input_validation_error: 'protocol_error',
  tool_output_validation_error: 'protocol_error',
  tool_output_serialization_error: 'protocol_error',
  tool_legacy_definition_error: 'protocol_error',
  tool_name_conflict_error: 'protocol_error',
  action_input_validation_error: 'protocol_error',
  action_output_validation_error: 'protocol_error',
  action_output_serialization_error: 'protocol_error',
  subagent_not_declared: 'protocol_error',
  delegation_depth_exceeded: 'protocol_error',
  session_busy: 'protocol_error',
  session_already_exists: 'protocol_error',
  session_not_found: 'protocol_error',
  skill_not_registered: 'protocol_error',
  skill_definition_validation_error: 'protocol_error',
  provider_registration_error: 'protocol_error',
  sandbox_operation_unsupported: 'protocol_error',
  // Transient infra: draining runtime, interrupted/timed-out work, store I/O.
  runtime_unavailable: 'transient_infra',
  submission_interrupted: 'transient_infra',
  submission_timeout: 'transient_infra',
  conversation_stream_store_error: 'transient_infra',
  // Terminal outcomes: deliberate abort or exhausted internal retries.
  submission_aborted: 'domain_outcome',
  submission_retry_exhausted: 'domain_outcome',
};

/** Classify a FlueError by its stable `type`. Undefined when unknown. */
export function classifyFlueType(type: string): FailureClass | undefined {
  return FLUE_TYPE_CLASS[type];
}

/** Handyman MCP tool results with isError are DOMAIN outcomes: the CLIs
 *  enforce business rules (verifier gate, one-in-progress, verdict
 *  conflicts), so their rejections are never retryable by the caller.
 *  Returns undefined for non-handyman tools and non-error results. */
export function classifyHandymanToolResult(
  toolName: string,
  isError: boolean,
): FailureClass | undefined {
  return isError && toolName.startsWith('mcp__handyman__') ? 'domain_outcome' : undefined;
}

/** Unified entry: FlueError-shaped (`type`), then client-side (name/status),
 *  defaulting to transient_infra (bounded recovery) for the unknown. */
export function classify(err: unknown): FailureClass {
  const type = (err as { type?: unknown })?.type;
  if (typeof type === 'string') {
    const cls = classifyFlueType(type);
    if (cls !== undefined) return cls;
  }
  return classifyClientError(err);
}

/** The retry policy each class implies. */
export function retryPolicy(cls: FailureClass): RetryPolicy {
  switch (cls) {
    case 'domain_outcome':
      return 'never';
    case 'protocol_error':
      return 'model_corrects';
    case 'transient_infra':
      return 'reconnect';
  }
}

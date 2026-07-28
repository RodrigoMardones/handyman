// Client-side error classes (feature 94), plain .mjs so BOTH the TS modules
// (src/domain/errors.ts) and the standalone driver (run-feature.mjs, no build
// step) share ONE source of truth. Duck-typed on err.name / err.status: the
// driver catches whatever the SDK or undici throws, so instanceof checks
// against SDK classes would be fragile here.
//
// Classes (mirrors src/domain/errors.ts):
//   transient_infra -> reconnect/retry with a bounded budget
//   protocol_error  -> the model/caller must correct the invocation
//   domain_outcome  -> terminal outcome (deliberate abort, exhausted retries,
//                      execution failure): NEVER retry, report

/** Client error names that mean "the connection died, the work may live on"
 *  (Durable Streams: re-attach to the same admission, never re-dispatch). */
export const TRANSIENT_CLIENT_ERROR_NAMES = new Set([
  'HeadersTimeoutError', // undici: blocking wait timed out client-side
  'FetchError', // @durable-streams/client
  'StreamClosedError', // stream dropped mid-wait
  'DurableStreamError', // generic durable-streams failure
]);

/** Client error names that mean "stop": deliberate abort, terminal execution
 *  failure, or a wire-protocol mismatch retrying will never fix. */
export const TERMINAL_CLIENT_ERROR_NAMES = new Set([
  'FetchBackoffAbortError', // aborted during backoff (deliberate)
  'FlueExecutionError', // the target itself failed
  'UnsupportedFlueEventVersionError', // SDK/runtime event-schema mismatch
]);

/** Classify a client-side (SDK/undici) error into the taxonomy. */
export function classifyClientError(err) {
  const name = err?.name;
  if (TRANSIENT_CLIENT_ERROR_NAMES.has(name)) return 'transient_infra';
  if (TERMINAL_CLIENT_ERROR_NAMES.has(name)) return 'domain_outcome';

  // HTTP status when the error carries one (FlueApiError): 429/5xx are
  // transient; other 4xx mean the request itself is wrong.
  const status = err?.status;
  if (typeof status === 'number') {
    if (status === 429 || status >= 500) return 'transient_infra';
    if (status >= 400) return 'protocol_error';
  }

  // Unknown client failure: treat as transient so transient hiccups recover;
  // the driver's bounded budget keeps a real bug from retrying forever.
  return 'transient_infra';
}

/** True when the driver should re-attach to the same admission (bounded). */
export function isTransientClientError(err) {
  return classifyClientError(err) === 'transient_infra';
}

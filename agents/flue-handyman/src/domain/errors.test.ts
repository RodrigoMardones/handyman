// Unit tests for the error taxonomy: duck-typed fake errors, no API, no
// runtime. The class tables are the contract — keep them honest here.
import { describe, expect, it } from 'vitest';
import {
  classify,
  classifyClientError,
  classifyFlueType,
  classifyHandymanToolResult,
  isTransientClientError,
  retryPolicy,
} from './errors';

function named(name: string, extra: Record<string, unknown> = {}): Error {
  const err = new Error('fake') as Error & Record<string, unknown>;
  err.name = name;
  Object.assign(err, extra);
  return err;
}

describe('classifyFlueType (FlueError snake_case types)', () => {
  it('maps protocol errors (the model corrects)', () => {
    for (const t of [
      'tool_input_validation_error',
      'tool_output_validation_error',
      'subagent_not_declared',
      'session_busy',
      'skill_not_registered',
      'provider_registration_error',
    ]) {
      expect(classifyFlueType(t)).toBe('protocol_error');
    }
  });

  it('maps transient infra (reconnect with budget)', () => {
    for (const t of ['runtime_unavailable', 'submission_interrupted', 'submission_timeout']) {
      expect(classifyFlueType(t)).toBe('transient_infra');
    }
  });

  it('maps terminal outcomes (never retry)', () => {
    for (const t of ['submission_aborted', 'submission_retry_exhausted']) {
      expect(classifyFlueType(t)).toBe('domain_outcome');
    }
  });

  it('returns undefined for unknown types (classify() falls back)', () => {
    expect(classifyFlueType('some_future_error')).toBeUndefined();
  });
});

describe('classifyClientError (SDK/undici, duck-typed)', () => {
  it('transient: timeouts, fetch and stream failures', () => {
    for (const n of ['HeadersTimeoutError', 'FetchError', 'StreamClosedError', 'DurableStreamError']) {
      expect(classifyClientError(named(n))).toBe('transient_infra');
      expect(isTransientClientError(named(n))).toBe(true);
    }
  });

  it('terminal: deliberate abort, execution failure, event-version mismatch', () => {
    for (const n of ['FetchBackoffAbortError', 'FlueExecutionError', 'UnsupportedFlueEventVersionError']) {
      expect(classifyClientError(named(n))).toBe('domain_outcome');
      expect(isTransientClientError(named(n))).toBe(false);
    }
  });

  it('status-driven: 429/5xx transient, other 4xx protocol', () => {
    expect(classifyClientError(named('FlueApiError', { status: 429 }))).toBe('transient_infra');
    expect(classifyClientError(named('FlueApiError', { status: 503 }))).toBe('transient_infra');
    expect(classifyClientError(named('FlueApiError', { status: 404 }))).toBe('protocol_error');
    expect(classifyClientError(named('FlueApiError', { status: 400 }))).toBe('protocol_error');
  });

  it('unknown client failures default to transient (bounded by the driver budget)', () => {
    expect(classifyClientError(named('WeirdError'))).toBe('transient_infra');
  });
});

describe('classifyHandymanToolResult (MCP domain outcomes)', () => {
  it('handyman tool errors are domain outcomes (business gates)', () => {
    expect(classifyHandymanToolResult('mcp__handyman__feature_close', true)).toBe('domain_outcome');
    expect(classifyHandymanToolResult('mcp__handyman__feature_add', true)).toBe('domain_outcome');
  });

  it('ignores non-errors and foreign tools', () => {
    expect(classifyHandymanToolResult('mcp__handyman__feature_close', false)).toBeUndefined();
    expect(classifyHandymanToolResult('mcp__other__x', true)).toBeUndefined();
  });
});

describe('classify + retryPolicy', () => {
  it('prefers the stable FlueError type when present', () => {
    expect(classify({ type: 'session_busy', message: 'x' })).toBe('protocol_error');
    expect(classify({ type: 'runtime_unavailable' })).toBe('transient_infra');
  });

  it('falls back to client classification without a type', () => {
    expect(classify(named('HeadersTimeoutError'))).toBe('transient_infra');
  });

  it('policy: domain -> never, transient -> reconnect, protocol -> model_corrects', () => {
    expect(retryPolicy('domain_outcome')).toBe('never');
    expect(retryPolicy('transient_infra')).toBe('reconnect');
    expect(retryPolicy('protocol_error')).toBe('model_corrects');
  });
});

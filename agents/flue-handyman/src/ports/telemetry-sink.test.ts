// Unit tests for the telemetry sink: fake FlueEvent-shaped objects, a temp
// dir and an injected console. No API calls, no runtime server.
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createTelemetrySink, projectEvent } from './telemetry-sink';
import type { FlueEvent } from '../flue';

function fakeEvent(fields: Record<string, unknown>): FlueEvent {
  return { v: 3, eventIndex: 1, timestamp: '2026-07-28T00:00:00.000Z', ...fields } as unknown as FlueEvent;
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'hm-tel-'));
}

function sinkIn(dir: string) {
  const infos: string[] = [];
  const warns: string[] = [];
  const sink = createTelemetrySink({
    dir,
    info: (l) => infos.push(l),
    warn: (l) => warns.push(l),
  });
  return { sink, infos, warns };
}

function readJsonl(file: string): Record<string, unknown>[] {
  return readFileSync(file, 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
}

describe('telemetry sink', () => {
  it('correlates events into one JSONL file per instance', () => {
    const dir = tempDir();
    const { sink } = sinkIn(dir);
    sink(fakeEvent({ type: 'agent_start', instanceId: 'feat-a' }));
    sink(fakeEvent({ type: 'agent_start', instanceId: 'feat-b' }));
    sink(fakeEvent({ type: 'idle', instanceId: 'feat-a' }));

    expect(readdirSync(dir).sort()).toEqual(['agent-feat-a.jsonl', 'agent-feat-b.jsonl']);
    expect(readJsonl(join(dir, 'agent-feat-a.jsonl'))).toHaveLength(2);
    expect(readJsonl(join(dir, 'agent-feat-b.jsonl'))).toHaveLength(1);
  });

  it('never writes message content: deltas and payloads become sizes', () => {
    const dir = tempDir();
    const { sink } = sinkIn(dir);
    sink(fakeEvent({ type: 'text_delta', instanceId: 'f', turnId: 't1', text: 'SECRET-CONTENT' }));
    const [line] = readJsonl(join(dir, 'agent-f.jsonl'));
    expect(line.text).toEqual({ chars: 14 });
    expect(line.turnId).toBe('t1');
    expect(JSON.stringify(line)).not.toContain('SECRET-CONTENT');

    const projected = projectEvent(
      fakeEvent({
        type: 'turn',
        turnId: 't2',
        purpose: 'agent',
        durationMs: 5,
        isError: false,
        request: { messages: [{ role: 'user', content: 'SECRET' }] },
        response: { text: 'SECRET' },
      }),
    );
    expect(JSON.stringify(projected)).not.toContain('SECRET');
    expect(projected.request).toEqual({ chars: expect.any(Number) });
    expect(projected.purpose).toBe('agent');
  });

  it('keeps safe scalars and usage verbatim, redacts tool payloads', () => {
    const projected = projectEvent(
      fakeEvent({
        type: 'tool',
        toolName: 'mcp__handyman__feature_close',
        toolCallId: 'c1',
        durationMs: 42,
        isError: true,
        result: { output: 'x'.repeat(50) },
        usage: { input: 10, output: 5, totalTokens: 15 },
      }),
    );
    expect(projected.toolName).toBe('mcp__handyman__feature_close');
    expect(projected.durationMs).toBe(42);
    expect(projected.isError).toBe(true);
    expect(projected.result).toEqual({ chars: expect.any(Number) });
    expect(projected.usage).toEqual({ input: 10, output: 5, totalTokens: 15 });
  });

  it('emits outcome-oriented console lines, never tool-call noise', () => {
    const dir = tempDir();
    const { sink, infos, warns } = sinkIn(dir);

    // A failed tool call is data for the model (recoverable): no console line.
    sink(fakeEvent({ type: 'tool', isError: true, toolName: 'x', instanceId: 'f' }));
    expect(warns).toHaveLength(0);
    expect(infos).toHaveLength(0);

    sink(fakeEvent({ type: 'submission_settled', submissionId: 's1', outcome: 'failed', instanceId: 'f' }));
    expect(warns.some((w) => w.includes('s1') && w.includes('failed'))).toBe(true);

    sink(fakeEvent({ type: 'submission_settled', submissionId: 's2', outcome: 'completed', instanceId: 'f' }));
    expect(infos.some((l) => l.includes('s2') && l.includes('completed'))).toBe(true);

    sink(fakeEvent({ type: 'operation', operationKind: 'task', isError: true, instanceId: 'f' }));
    expect(warns.some((w) => w.includes('task') && w.includes('failed'))).toBe(true);
  });
});

/**
 * Relay plumbing for the native LLM endpoints (feature 45): byte-parity
 * with toolbox_serve.ts's readJsonObject + SSE framing.
 *
 * - readJsonObject: JSON object body capped at maxBytes; null on oversized,
 *   malformed, or non-object payloads (same contract as the observer).
 * - relayResponse: text/event-stream Response with the observer's exact
 *   relay headers (content-type, no-store, keep-alive, nosniff, CSP) whose
 *   sse() writes `event: <name>\ndata: <json>\n\n` frames and end() closes.
 */
import { CSP_HEADER } from "@handyman/toolbox-core";

const DEFAULT_MAX_BYTES = 256 * 1024;

export async function readJsonObject(
  request: Request,
  maxBytes = DEFAULT_MAX_BYTES,
): Promise<Record<string, unknown> | null> {
  const reader = request.body?.getReader();
  if (!reader) {
    return null;
  }
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      size += value.byteLength;
      if (size > maxBytes) {
        // oversized body: stop reading, reject downstream
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  let data: unknown;
  try {
    data = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  } catch {
    return null;
  }
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return null;
}

export type SseWrite = (event: string, data: unknown) => void;

/**
 * Run `handler` against an SSE stream. The handler receives sse() and end();
 * it must call end() exactly once (after result or error), mirroring the
 * observer's relay handlers.
 */
export function relayResponse(
  handler: (sse: SseWrite, end: () => void) => void | Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const sse: SseWrite = (event, data) => {
        if (closed) {
          return;
        }
        try {
          controller.enqueue(encoder.encode(`event: ${event}\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const end = (): void => {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // already closed by the peer
          }
        }
      };
      void handler(sse, end);
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": CSP_HEADER,
    },
  });
}

/**
 * GET /events (feature 43): the SSE change feed, served natively by Next.
 *
 * Byte-parity with toolbox_serve.ts's /events: an initial `retry: 2000`
 * frame, unnamed `data: {"type":"change"}` frames debounced from fs.watch
 * (via the runtime hub), and a `: keepalive` comment every 25 s. Headers
 * match the Node server exactly (text/event-stream + no-store + keep-alive;
 * serve adds no CSP/nosniff on this route).
 *
 * force-dynamic + the runtime ReadableStream keep the stream unbuffered -
 * the same primitive proxy.ts already uses to forward upstream SSE without
 * buffering (verified by the feature-38 oracle run).
 */
import { getRuntime } from "../../lib/runtime";

export const dynamic = "force-dynamic";

const KEEPALIVE_MS = 25_000;

export function GET(request: Request): Response {
  const runtime = getRuntime();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (chunk: string): void => {
        if (closed) {
          return;
        }
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      send("retry: 2000\n\n");
      const unsubscribe = runtime.hub.subscribe(() => {
        send('data: {"type":"change"}\n\n');
      });
      const keepalive = setInterval(() => send(": keepalive\n\n"), KEEPALIVE_MS);
      request.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(keepalive);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // stream already errored/closed by the peer
        }
      });
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    },
  });
}

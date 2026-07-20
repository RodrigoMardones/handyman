/**
 * Response helpers for the native toolBox route handlers (feature 44):
 * byte-parity with toolbox_serve.ts's send/sendJson - the same four headers
 * on every response (content-type, no-store, nosniff, CSP) and the same
 * JSON.stringify payloads.
 */
import { CSP_HEADER } from "@handyman/toolbox-core";

export function send(
  status: number,
  body: string,
  type = "application/json; charset=utf-8",
): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": type,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": CSP_HEADER,
    },
  });
}

export function sendJson(status: number, data: unknown): Response {
  return send(status, JSON.stringify(data));
}

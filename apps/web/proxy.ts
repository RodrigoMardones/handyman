import type { NextRequest } from "next/server";

/**
 * DNS-rebinding guard: only 127.0.0.1 / localhost / [::1] may address this
 * process, regardless of port. proxy() runs on every request on the Node.js
 * runtime (Next 16 renamed middleware -> proxy.ts; not configurable), before
 * Next's own routing chain. This guard is proxy()'s only job now that the Node
 * observer is gone and every route is served natively.
 */
function hostAllowed(host: string): boolean {
  const bare = host.replace(/:\d+$/, "");
  return bare === "127.0.0.1" || bare === "localhost" || bare === "[::1]";
}

/**
 * Host guard (see hostAllowed), then let Next serve everything natively.
 *
 * There is no upstream to forward to and no route manifest to consult: the
 * strangler migration is complete (Fase 4,
 * .handyman/docs/sprints/plan-migracion-toolbox-nextjs.md), so every path has
 * its own app/**\/page.tsx or route.ts and unmatched paths fall through to
 * Next's own 404. The test_web_*.sh suites assert those route files directly.
 */
export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  if (!hostAllowed(host)) {
    return Response.json({ ok: false, error: "forbidden host" }, { status: 403 });
  }
}

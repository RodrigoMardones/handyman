import type { NextConfig } from "next";
import { HTML_CSP_HEADER } from "@handyman/toolbox-core";

/**
 * proxy.ts holds the per-request Host guard (the only request-level logic left
 * after feature 50 decommissioned the Node observer). It is not a proxy
 * anymore: nothing is forwarded, every route is served natively.
 *
 * headers(): the JSON responses get their CSP from lib/respond.ts, but route
 * handlers cannot set headers for the PAGES, and CSP is precisely a
 * document-level control - an HTML page with no CSP is unprotected no matter
 * what the APIs send. This restores on the pages what the retired Node
 * observer served on its HTML. The source pattern excludes /api/* (whose
 * responses keep respond.ts's stricter CSP_HEADER, rather than getting a
 * second conflicting one) and /events, which carries NO CSP at all: it sets
 * its headers inline in app/events/route.ts and the retired observer did not
 * send one there either, so byte-parity means leaving it alone. CSP on an SSE
 * stream would be inert anyway.
 *
 * allowedDevOrigins: Next 16 blocks cross-origin access to its dev resources
 * (the Turbopack HMR WebSocket on /_next/webpack-hmr) unless the host is
 * allowlisted. Accessing the dev server through 127.0.0.1 (the only host
 * proxy.ts admits, see hostAllowed) while Next expects localhost would
 * otherwise break HMR with ERR_INVALID_HTTP_RESPONSE, so 127.0.0.1 is listed
 * here. localhost stays allowed by default.
 */
const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [
      {
        source: "/((?!api/|events).*)",
        headers: [{ key: "Content-Security-Policy", value: HTML_CSP_HEADER }],
      },
    ];
  },
  // Best-effort externalization. NOTE (feature 43): both bundlers treat
  // symlinked workspace packages as app code and bundle them regardless of
  // this list (their real path lives outside node_modules), which breaks
  // handyman's import.meta.url asset resolution (SKILL.md, intake template,
  // panel asset). That is why lib/toolboxState.ts loads the handyman state
  // entry at RUNTIME via a variable dynamic import instead of a static one.
  // @handyman/toolbox-core is bundle-safe (pure fs/data code), so its static
  // imports stay. The list remains for layouts where the packages resolve
  // under a real node_modules.
  serverExternalPackages: ["handyman", "@handyman/toolbox-core"],
};

export default nextConfig;

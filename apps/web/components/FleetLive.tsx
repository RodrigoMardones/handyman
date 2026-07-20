"use client";

import { renderFleetHtml, type FleetState } from "../app/fleet/fleetHtml";
import { useLiveHtml } from "../lib/useLiveHtml";

/**
 * Live layer for /fleet (feature toolbox_next_fleet_view).
 *
 * The Server Component (app/fleet/page.tsx) resolves the initial fleet state
 * via a direct buildState() import and ships it as real HTML via
 * renderFleetHtml. This Client Component subscribes to the /events
 * Server-Sent-Events feed through useLiveHtml and re-renders the region on
 * every "change" tick. Since feature 43 (toolbox_next_runtime_events) both
 * URLs are SAME-ORIGIN: Next serves /events natively as an unbuffered
 * ReadableStream route handler, so the old direct-to-Node-port wiring is gone.
 *
 * The re-render reuses the exact same renderer the server used
 * (renderFleetHtml), so server markup and post-update markup agree by
 * construction: no hydration drift, no second styling path. Every value is
 * already HTML-escaped by the renderer, so handing it to
 * dangerouslySetInnerHTML on this read-only surface is safe (same contract as
 * the legacy panel: harness text never becomes markup).
 *
 * The HTML is DERIVED from the hook's state, so React owns the node: see
 * lib/useLiveHtml.ts for why the old hand-written innerHTML swap was a latent
 * bug rather than a style choice.
 *
 * Design (design-taste-frontend, motion dial 3): the only motion is a soft
 * pulse on the live status dot, disabled under prefers-reduced-motion via CSS.
 */
export function FleetLive({
  eventsUrl,
  stateUrl,
  fallbackState,
}: {
  /** Same-origin SSE feed URL ("/events"), served natively by this app. */
  eventsUrl: string;
  /** Same-origin state URL ("/api/state"), served natively by this app. */
  stateUrl: string;
  /** Initial state already rendered by the RSC; used until the first refresh
   *  and as a fallback if the upstream is briefly unreachable. */
  fallbackState: FleetState;
}) {
  const { state, live } = useLiveHtml<FleetState>({
    eventsUrl,
    stateUrl,
    initialState: fallbackState,
  });

  return (
    <div className="fleet-live">
      <p className="fleet-live__status" data-live={live} aria-live="polite">
        <span className="fleet-live__dot" aria-hidden="true" />
        <span className="fleet-live__label">
          {live === "live" ? "live" : live === "connecting" ? "connecting" : "stale"}
        </span>
      </p>
      {/* Hidden from assistive tech as a live region because the polite
          status above already announces changes. */}
      <div
        className="fleet-live__region"
        aria-busy={live === "connecting" ? "true" : "false"}
        dangerouslySetInnerHTML={{ __html: renderFleetHtml(state) }}
      />
    </div>
  );
}

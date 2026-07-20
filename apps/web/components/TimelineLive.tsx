"use client";

import { announce } from "../lib/announce";
import { renderTimelineHtml, type TimelineState } from "../app/timeline/timelineHtml";
import { useLiveHtml } from "../lib/useLiveHtml";

/**
 * Live layer for /timeline (feature toolbox_next_timeline_search).
 *
 * Mirrors FleetLive's contract: the Server Component (app/timeline/page.tsx)
 * resolves the state via a direct buildState() import and ships it as real
 * HTML via renderTimelineHtml. This Client Component subscribes to the
 * same-origin /events feed through useLiveHtml (served natively by this app
 * since feature 43) and re-renders the region with the exact same renderer, so
 * server markup and post-update markup agree by construction.
 *
 * Every value rendered is HTML-escaped by the renderer, so handing it to
 * dangerouslySetInnerHTML on this read-only surface is safe (harness text
 * never becomes markup). The HTML is derived from the hook's state, so React
 * owns the node - see lib/useLiveHtml.ts.
 *
 * A11y: SSE refreshes are announced through the debounced polite live region;
 * losing/regaining the feed goes through the assertive one (both rendered
 * statically by ToolboxShell, written by lib/announce.ts).
 */
export function TimelineLive({
  eventsUrl,
  stateUrl,
  fallbackState,
}: {
  /** Same-origin SSE feed URL ("/events"), served natively by this app. */
  eventsUrl: string;
  /** Same-origin state URL ("/api/state"), served natively by this app. */
  stateUrl: string;
  /** Initial state already rendered by the RSC. */
  fallbackState: TimelineState;
}) {
  const { state, live } = useLiveHtml<TimelineState>({
    eventsUrl,
    stateUrl,
    initialState: fallbackState,
    // Debounced by the announcer: bursts collapse into one summary.
    onRefresh: () => announce.polite("timeline updated"),
    onReconnect: () => announce.assertive("live updates reconnected"),
    onDisconnect: () => announce.assertive("live updates disconnected: retrying"),
  });

  return (
    <div className="timeline-live">
      <p className="timeline-live__status" data-live={live} aria-live="polite">
        <span className="timeline-live__dot" aria-hidden="true" />
        <span className="timeline-live__label">
          {live === "live" ? "live" : live === "connecting" ? "connecting" : "stale"}
        </span>
      </p>
      <div
        className="timeline-live__region"
        aria-busy={live === "connecting" ? "true" : "false"}
        dangerouslySetInnerHTML={{ __html: renderTimelineHtml(state) }}
      />
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

export type LiveStatus = "live" | "stale" | "connecting";

/**
 * The shared live-region contract for /fleet, /harness/<name> and /timeline.
 *
 * Every one of those views does the same thing: subscribe to the same-origin
 * /events SSE feed, re-fetch /api/state on each tick, and re-render a region
 * with the very same renderer the Server Component used, so server markup and
 * post-update markup agree by construction.
 *
 * They used to do it by hand-writing `node.innerHTML = render(state)` into a
 * ref while React also owned the node through a constant
 * `dangerouslySetInnerHTML`. That is a latent bug, not a style choice: React
 * diffs the `__html` PROP, not the DOM, so the moment anything makes the prop
 * differ from what React last recorded, React re-applies it and wipes the
 * out-of-band write. /search hit exactly that and looked permanently stuck on
 * "building index..." (see components/SearchClient.tsx).
 *
 * The fix is to make the HTML DERIVED state: this hook owns the subscription
 * and the latest state, the caller renders `render(state)` through
 * `dangerouslySetInnerHTML`, and React owns the node end to end. The ref and
 * the manual swap are gone, so the whole class of bug is gone with them - not
 * just the one instance.
 */
export function useLiveHtml<T>(options: {
  /** Same-origin SSE feed URL ("/events"), served natively by this app. */
  eventsUrl: string;
  /** Same-origin state URL ("/api/state"), served natively by this app. */
  stateUrl: string;
  /** State the RSC already rendered; used until the first successful refresh. */
  initialState: T;
  /** Fired after each successful refresh (the polite a11y channel). */
  onRefresh?: () => void;
  /** Fired when the feed comes back after having been down (assertive). */
  onReconnect?: () => void;
  /** Fired the first time the feed drops after having been live (assertive). */
  onDisconnect?: () => void;
}): { state: T; live: LiveStatus } {
  const { eventsUrl, stateUrl, initialState } = options;
  const [state, setState] = useState<T>(initialState);
  const [live, setLive] = useState<LiveStatus>("connecting");

  // The callbacks are re-created on every render by the caller. Keeping them
  // in a ref lets the effect stay on an empty dependency list (connect once,
  // stay connected) without going stale.
  const handlers = useRef(options);
  handlers.current = options;

  useEffect(() => {
    // No EventSource in the current environment (older test runner, SSR
    // audit, etc.): degrade to the static server-rendered HTML and stop.
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      setLive("stale");
      return;
    }

    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    // Tracks loss/recovery for the assertive channel without re-subscribing.
    let conn: "connecting" | "live" | "down" = "connecting";

    const refresh = async (): Promise<void> => {
      try {
        const response = await fetch(stateUrl, { cache: "no-store" });
        if (!response.ok) {
          return;
        }
        setState((await response.json()) as T);
        handlers.current.onRefresh?.();
      } catch {
        // Upstream briefly unreachable: keep the last state rendered; the
        // status dot already reads "stale".
      }
    };

    const connect = (): void => {
      es = new EventSource(eventsUrl);
      es.onopen = () => {
        if (conn === "down") {
          handlers.current.onReconnect?.();
        }
        conn = "live";
        setLive("live");
      };
      // The feed posts unnamed data messages of the form
      // `data: {"type":"change"}\n\n`. React to any message: the only thing to
      // do is re-fetch the state and let React re-render.
      es.onmessage = () => {
        setLive("live");
        void refresh();
      };
      es.onerror = () => {
        if (conn === "live") {
          handlers.current.onDisconnect?.();
        }
        conn = "down";
        setLive("stale");
        es?.close();
        // The server also re-arms the feed (retry: 2000), but a manual
        // reconnect keeps the status dot honest if the tab was backgrounded
        // and the socket dropped without an error frame.
        reconnectTimer = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      es?.close();
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
    };
    // eventsUrl/stateUrl are stable for the life of the page (constant
    // same-origin paths), so an empty dependency list is correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { state, live };
}

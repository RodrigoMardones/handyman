"use client";

import { useEffect, useState } from "react";
import {
  renderAgentHtml,
  type AgentTelemetrySummary,
  type AgentViewState,
} from "../app/agent/agentHtml";

/**
 * Live layer for /agent (feature 95 web_live_agent_view).
 *
 * DOCUMENTED DEVIATION from the *Live.tsx mold: this component does NOT use
 * lib/useLiveHtml. That hook expects an SSE events feed plus a state URL;
 * this view's source (the flue-handyman telemetry JSONL) has no SSE feed, so
 * the honest live mechanism is POLLING: every POLL_MS the client re-fetches
 * the same-origin /api/agent?feature=... route handler and swaps the
 * rendered region. When a feed for this source exists, migrating back to the
 * hook is the intent.
 *
 * Everything else keeps the mold's contracts: the re-render reuses the exact
 * same renderer the server used (renderAgentHtml), so server markup and
 * post-update markup agree by construction; every value is already
 * HTML-escaped by the renderer, which keeps dangerouslySetInnerHTML safe on
 * this read-only surface; and React owns the node (derived state, never a
 * hand-written innerHTML swap).
 *
 * CSP: connect-src is 'self', so the client only ever calls the same-origin
 * /api/agent route; the Flue runtime origin is probed server-side by
 * app/api/agent/loadAgentState.ts, never from here.
 */
const POLL_MS = 5000;

/** Payload shape of GET /api/agent (only what the client reads). */
interface AgentApiResponse {
  ok?: boolean;
  runtime?: "online" | "offline";
  telemetry?: AgentTelemetrySummary | null;
}

export function AgentLive({
  feature,
  initialState,
}: {
  /** Feature selected server-side; null until the user picks one (no poll). */
  feature: string | null;
  /** Initial state already rendered by the RSC; used until the first poll
   *  and kept if a poll fails (the status line then reports "stale"). */
  initialState: AgentViewState;
}) {
  const [state, setState] = useState<AgentViewState>(initialState);
  const [live, setLive] = useState<"live" | "stale">("live");

  useEffect(() => {
    if (feature === null) {
      return; // nothing to poll until a feature is chosen
    }
    let cancelled = false;
    const tick = async (): Promise<void> => {
      try {
        const response = await fetch(`/api/agent?feature=${encodeURIComponent(feature)}`);
        if (!response.ok) {
          throw new Error(`status ${response.status}`);
        }
        const data = (await response.json()) as AgentApiResponse;
        if (cancelled) {
          return;
        }
        setState({
          runtime: data.runtime === "online" ? "online" : "offline",
          feature,
          telemetry: data.telemetry ?? null,
        });
        setLive("live");
      } catch {
        if (!cancelled) {
          setLive("stale");
        }
      }
    };
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [feature]);

  return (
    <div className="agent-live">
      <p className="agent-live__status" data-live={live} aria-live="polite">
        <span className="agent-live__dot" aria-hidden="true" />
        <span className="agent-live__label">
          {live === "live" ? "en vivo" : "sin actualizar"}
        </span>
      </p>
      {/* Hidden from assistive tech as a live region because the polite
          status above already announces changes. */}
      <div
        className="agent-live__region"
        dangerouslySetInnerHTML={{ __html: renderAgentHtml(state) }}
      />
    </div>
  );
}

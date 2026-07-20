"use client";

import { useState } from "react";
import { renderHarnessHtml, type HarnessState } from "../app/harness/harnessHtml";
import { useLiveHtml } from "../lib/useLiveHtml";

/**
 * Live layer for /harness/[name] (feature toolbox_next_harness_view).
 *
 * Mirrors FleetLive's contract: the Server Component (app/harness/[name]/
 * page.tsx) resolves the fleet state via a direct buildState() import and
 * ships it as real HTML via renderHarnessHtml(name). This Client Component
 * subscribes to the /events Server-Sent-Events feed through useLiveHtml and
 * re-renders the region on every "change" tick. Since feature 43
 * (toolbox_next_runtime_events) both URLs are SAME-ORIGIN: Next serves
 * /events natively as an unbuffered ReadableStream route handler, same
 * rationale as FleetLive.
 *
 * The re-render reuses the exact same renderer the server used
 * (renderHarnessHtml), so server markup and post-update markup agree by
 * construction: no hydration drift, no second styling path. Every value is
 * already HTML-escaped by the renderer, so handing it to
 * dangerouslySetInnerHTML on this read-only surface is safe (same contract as
 * the legacy panel: harness text never becomes markup). The HTML is derived
 * from the hook's state, so React owns the node even across the dialog's
 * re-renders - see lib/useLiveHtml.ts.
 *
 * The markdown quick-view buttons (Workspace + Docs) open a dialog that
 * fetches the file from /api/md?root=&file= and renders it as preformatted,
 * HTML-escaped text. Per the toolbox_serve.ts security model ("markdown is
 * rendered with textContent only - harness text never becomes markup"), the
 * dialog never interprets the body as HTML: zero new markdown deps, zero XSS
 * surface. This is intentionally simpler than the legacy panel's
 * marked+DOMPurify pipeline and matches the design-taste-frontend "zero new
 * dependencies" constraint inherited from features 38/39/40.
 *
 * Design (design-taste-frontend, motion dial 3): the only motion is a soft
 * pulse on the live status dot, disabled under prefers-reduced-motion via CSS.
 */
export function HarnessLive({
  name,
  eventsUrl,
  stateUrl,
  mdUrl,
  fallbackState,
}: {
  /** Harness project_name, used to select the snapshot out of /api/state. */
  name: string;
  /** Same-origin SSE feed URL ("/events"), served natively by this app. */
  eventsUrl: string;
  /** Same-origin state URL ("/api/state"), served natively by this app. */
  stateUrl: string;
  /** Same-origin base URL for /api/md?root=&file= (proxied to the Node
   *  upstream until feature 44 steals it natively). */
  mdUrl: string;
  /** Initial state already rendered by the RSC; used until the first refresh
   *  and as a fallback if the upstream is briefly unreachable. */
  fallbackState: HarnessState;
}) {
  const [dialog, setDialog] = useState<{ title: string; body: string; loading: boolean } | null>(null);
  const { state, live } = useLiveHtml<HarnessState>({ eventsUrl, stateUrl, initialState: fallbackState });

  // Markdown dialog opener: delegated to the region so the re-rendered
  // buttons after each SSE swap still work without re-binding. The button's
  // data-api-md (the /api/md file token) + data-root drive the fetch.
  const openMd = async (token: string, root: string): Promise<void> => {
    setDialog({ title: token, body: "", loading: true });
    try {
      const params = new URLSearchParams({ root, file: token });
      const response = await fetch(`${mdUrl}?${params.toString()}`, { cache: "no-store" });
      const body = response.ok ? await response.text() : `error: HTTP ${response.status}`;
      setDialog({ title: token, body, loading: false });
    } catch (error) {
      setDialog({
        title: token,
        body: `error: ${error instanceof Error ? error.message : "fetch failed"}`,
        loading: false,
      });
    }
  };

  const handleClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest("[data-api-md]") as HTMLButtonElement | null;
    if (!button) {
      return;
    }
    const token = button.dataset.apiMd;
    const root = button.dataset.root;
    if (token && root) {
      void openMd(token, root);
    }
  };

  const closeDialog = (): void => setDialog(null);

  return (
    <div className="harness-live">
      <p className="harness-live__status" data-live={live} aria-live="polite">
        <span className="harness-live__dot" aria-hidden="true" />
        <span className="harness-live__label">
          {live === "live" ? "live" : live === "connecting" ? "connecting" : "stale"}
        </span>
      </p>
      <div
        className="harness-live__region"
        aria-busy={live === "connecting" ? "true" : "false"}
        onClick={handleClick}
        dangerouslySetInnerHTML={{ __html: renderHarnessHtml(state, name) }}
      />
      {dialog ? (
        <div
          className="harness-live__dialog"
          role="dialog"
          aria-modal="true"
          aria-label={`markdown preview: ${dialog.title}`}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeDialog();
            }
          }}
        >
          <div className="harness-live__dialog-body">
            <header className="harness-live__dialog-head">
              <h3>{dialog.title}</h3>
              <button type="button" className="harness-live__dialog-close" onClick={closeDialog} aria-label="close">
                close
              </button>
            </header>
            {dialog.loading ? (
              <p className="harness-live__dialog-loading">loading...</p>
            ) : (
              // Security: the body is rendered as preformatted TEXT only.
              // /api/md returns raw markdown; per toolbox_serve.ts the contract
              // is "harness text never becomes markup", so we escape via
              // white-space: pre and textContent semantics (React escapes the
              // string by default inside <pre>).
              <pre className="harness-live__dialog-pre">{dialog.body}</pre>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

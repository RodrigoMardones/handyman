"use client";

import DOMPurify from "dompurify";
import { marked } from "marked";
import { useEffect, useRef, useState } from "react";
import { announce } from "../lib/announce";
import { renderSanitized } from "../lib/md";
import styles from "./FleetSummaryClient.module.css";

/**
 * Fleet summary client (feature toolbox_next_intake_ask_ui), mounted at the
 * bottom of /fleet.
 *
 * Migrates the legacy panel's FleetSummary (handyman/assets/toolbox_panel.js)
 * onto the unified app's primitives:
 *
 *  - provider select (default zai, otherwise first available), via
 *    GET /api/providers
 *  - Summarize button -> POST /api/summarize with fetch+reader SSE parser
 *    (events delta | result | error), cancelable via AbortController
 *  - streamed summary rendered through renderSanitized (marked + DOMPurify
 *    with the panel's FORBID policy); the renderer paints the (cached) +
 *    model indicators when result.cached / result.model are set
 *
 * The summary is read-only and grounded on /api/state (the relay's system
 * prompt ties it to the fleet counts, recent closures, harness names). Cache
 * hit returns the canonical summary in result (no deltas), so the card
 * handles both paths in one place.
 *
 * Security: every dynamic value outside the summary body is React-escaped.
 * The summary body is sanitized via renderSanitized BEFORE
 * dangerouslySetInnerHTML - never raw.
 */

/** Provider entry from /api/providers (only available ones are listed). */
interface ProviderEntry {
  id: string;
  available: boolean;
  model: string | null;
}

/** Subset of the SSE `result` event of POST /api/summarize the UI surfaces. */
interface SummaryResult {
  summary_md?: string;
  cached?: boolean;
  model?: string;
}

/** Frame parsed out of the SSE-over-POST stream. */
interface SseFrame {
  event: string;
  data: unknown;
}

/** Parse one SSE frame (already split out) into {event, data}. */
function parseSseFrame(frame: string): SseFrame {
  let event = "message";
  let data = "";
  for (const line of frame.split("\n")) {
    const clean = line.endsWith("\r") ? line.slice(0, -1) : line;
    if (clean.startsWith("event:")) {
      event = clean.slice(6).trim();
    } else if (clean.startsWith("data:")) {
      data += clean.slice(5).trim();
    }
  }
  let parsed: unknown = null;
  if (data) {
    try {
      parsed = JSON.parse(data);
    } catch {
      parsed = { raw: data };
    }
  }
  return { event, data: parsed };
}

/**
 * POST a JSON body to an SSE-relay route and dispatch its stream to the
 * handlers. Mirror of the legacy panel's streamSseOverPost. Validation
 * failures are plain JSON 400s, NOT SSE - they surface as onError.
 */
async function streamSseOverPost(
  url: string,
  body: Record<string, unknown>,
  handlers: {
    onDelta: (text: string) => void;
    onResult: (data: Record<string, unknown>) => void;
    onError: (err: { code?: string; message?: string }) => void;
    onDone?: () => void;
  },
  signal: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    if (signal.aborted) {
      return;
    }
    handlers.onError({ code: "network_error", message: "network error" });
    return;
  }
  if (!res.ok || !res.body) {
    let message = `HTTP ${res.status}`;
    try {
      const err = (await res.json()) as { error?: string };
      if (err && err.error) {
        message = String(err.error);
      }
    } catch {
      // keep the status text
    }
    handlers.onError({ code: "http_error", message });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const dispatch = (frame: string): void => {
    if (!frame.trim()) {
      return;
    }
    const { event, data } = parseSseFrame(frame);
    if (event === "delta" && data && typeof (data as { text?: string }).text === "string") {
      handlers.onDelta((data as { text: string }).text);
    } else if (event === "result") {
      handlers.onResult((data as Record<string, unknown>) ?? {});
    } else if (event === "error") {
      handlers.onError((data as { code?: string; message?: string }) ?? { code: "provider_error" });
    }
  };
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      dispatch(frame);
    }
  }
  dispatch(buffer);
  handlers.onDone?.();
}

export function FleetSummaryClient({
  providersUrl,
  summarizeUrl,
}: {
  /** Same-origin provider availability URL ("/api/providers"). */
  providersUrl: string;
  /** Same-origin SSE-over-POST summarize URL ("/api/summarize"). */
  summarizeUrl: string;
}) {
  const [providers, setProviders] = useState<ProviderEntry[]>([]);
  const [provider, setProvider] = useState<string>("");
  const [provLoaded, setProvLoaded] = useState(false);
  const [summaryMd, setSummaryMd] = useState("");
  const [phase, setPhase] = useState<"idle" | "streaming" | "done" | "error">("idle");
  const [cached, setCached] = useState(false);
  const [model, setModel] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  // Provider availability once on mount; only available adapters are
  // selectable. Default to "zai" when present (the server resolves its
  // cheap summary model), otherwise the first available adapter.
  useEffect(() => {
    let cancelled = false;
    fetch(providersUrl, { cache: "no-store" })
      .then(async (r) => r.json())
      .then((data: { providers?: ProviderEntry[] }) => {
        if (cancelled) {
          return;
        }
        const list = (data.providers ?? []).filter((p) => p.available);
        setProviders(list);
        setProvLoaded(true);
        if (list.some((p) => p.id === "zai")) {
          setProvider("zai");
        } else if (list.length) {
          setProvider(list[0].id);
        }
      })
      .catch(() => {
        setProvLoaded(true);
        setProviders([]);
      });
    return () => {
      cancelled = true;
    };
  }, [providersUrl]);

  // Cancel an in-flight summary on unmount.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      abortRef.current = null;
    },
    [],
  );

  const startSummary = (): void => {
    if (phase === "streaming" || !provider) {
      return;
    }
    setSummaryMd("");
    setCached(false);
    setModel("");
    setErrorMsg("");
    setPhase("streaming");
    const controller = new AbortController();
    abortRef.current = controller;
    void streamSseOverPost(
      summarizeUrl,
      { provider },
      {
        onDelta: (text) => setSummaryMd((prev) => prev + text),
        onResult: (event) => {
          const typed = event as SummaryResult;
          if (typed && typeof typed.summary_md === "string" && typed.summary_md) {
            setSummaryMd(typed.summary_md);
          }
          setCached(!!typed?.cached);
          if (typed && typed.model) {
            setModel(String(typed.model));
          }
          setPhase("done");
        },
        onError: (err) => {
          const message = err.message || err.code || "provider error";
          setErrorMsg(String(message));
          setPhase("error");
          announce.assertive(`summary failed: ${message}`);
        },
        onDone: () => {
          if (abortRef.current === controller) {
            abortRef.current = null;
          }
        },
      },
      controller.signal,
    );
  };

  const busy = phase === "streaming";
  const sanitizedSummary = renderSanitized(summaryMd, { marked, DOMPurify });

  return (
    <section className={styles.summary} aria-label="Fleet summary">
      <div className={styles.head}>
        <strong>Summary</strong>
        <select
          aria-label="summary provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          disabled={!provLoaded || providers.length === 0}
        >
          {providers.length === 0 ? (
            <option value="">{provLoaded ? "-" : "loading..."}</option>
          ) : (
            providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id}
                {p.model ? ` (${p.model})` : ""}
              </option>
            ))
          )}
        </select>
        <button type="button" disabled={!provider || busy} onClick={startSummary}>
          {busy ? "summarizing..." : "Summarize"}
        </button>
        {phase === "done" && cached ? (
          <span className={styles.cached}>(cached)</span>
        ) : null}
        {phase === "done" && model ? (
          <span className={styles.model}>model: {model}</span>
        ) : null}
      </div>

      {provLoaded && providers.length === 0 ? (
        <p className={styles.empty} role="note">
          no LLM providers available - set an API key (Z_AI_API_KEY /
          ANTHROPIC_API_KEY) or run Ollama, then reload.
        </p>
      ) : null}

      {phase === "error" ? (
        <p className={styles.error} role="alert">
          summary failed: {errorMsg}
        </p>
      ) : null}

      {sanitizedSummary || busy ? (
        <div
          className={`md-body ${styles.body}`}
          dangerouslySetInnerHTML={{ __html: sanitizedSummary }}
        />
      ) : null}
    </section>
  );
}

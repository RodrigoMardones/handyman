"use client";

import DOMPurify from "dompurify";
import { marked } from "marked";
import { useEffect, useRef, useState } from "react";
import { announce } from "../lib/announce";
import { linkCitations, renderSanitized } from "../lib/md";
import { MdDialog, type MdDocRequest } from "./MdDialog";
import styles from "./AskClient.module.css";

/**
 * Client layer for /ask (feature toolbox_next_intake_ask_ui).
 *
 * Migrates the legacy panel's AskView (handyman/assets/toolbox_panel.js)
 * onto the unified app's primitives:
 *
 *  - harness + provider selectors (harness from RSC, providers via
 *    GET /api/providers)
 *  - question textarea
 *  - answer streamed over POST /api/ask with a fetch+reader SSE parser
 *    (events delta | result | error), cancelable via AbortController
 *  - citation rewriting: linkCitations rewrites viewable [fuente: <ref>]
 *    into a markdown link with #cite=<ref>, BEFORE renderSanitized applies
 *    marked + DOMPurify (the panel's FORBID policy)
 *  - ONE delegated click handler on the answer container reads the href and
 *    opens the source through the shared /api/md dialog (MdDialog from
 *    feature 47) for the harness the answer was asked about (askedRoot)
 *
 * The askedRoot capture matters: if the harness selector changes after an
 * answer is shown, citation clicks keep opening against the harness the
 * answer was actually asked about (else they would silently swap sources).
 *
 * Security: every dynamic value outside the answer body is React-escaped.
 * The answer body is sanitized via linkCitations + renderSanitized BEFORE
 * dangerouslySetInnerHTML - never raw.
 */

/** Provider entry from /api/providers (only available ones are listed). */
interface ProviderEntry {
  id: string;
  available: boolean;
  model: string | null;
}

/** Fragment returned in the SSE `result` event of POST /api/ask. */
interface AskFragment {
  ref: string;
  kind: string;
}

/** Subset of the SSE `result` event the UI surfaces. */
interface AskResult {
  answer_md?: string;
  fragments?: AskFragment[];
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
 * failures are plain JSON 400s, NOT SSE - they surface as onError. The
 * AbortController signal lets the view cancel an in-flight request.
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

export function AskClient({
  harnesses,
  providersUrl,
  askUrl,
  mdUrl,
}: {
  /** Registered harnesses from the RSC (project_name + project_root). */
  harnesses: Array<{ name: string; root: string }>;
  /** Same-origin provider availability URL ("/api/providers"). */
  providersUrl: string;
  /** Same-origin SSE-over-POST ask URL ("/api/ask"). */
  askUrl: string;
  /** Same-origin markdown API base ("/api/md") for the citation dialog. */
  mdUrl: string;
}) {
  const [root, setRoot] = useState<string>(harnesses[0]?.root ?? "");
  const [providers, setProviders] = useState<ProviderEntry[]>([]);
  const [provider, setProvider] = useState<string>("");
  const [provLoaded, setProvLoaded] = useState(false);
  const [question, setQuestion] = useState("");
  const [answerMd, setAnswerMd] = useState("");
  const [fragments, setFragments] = useState<AskFragment[]>([]);
  const [model, setModel] = useState("");
  const [phase, setPhase] = useState<"idle" | "streaming" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  // The harness the current answer was asked about - citation links must
  // keep opening against it even if the selector changes afterwards.
  const [askedRoot, setAskedRoot] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const [mdDoc, setMdDoc] = useState<MdDocRequest | null>(null);

  // Provider availability once on mount; only available adapters are
  // selectable. Default to "zai" when present (the server resolves its
  // cheap model), otherwise the first available adapter.
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

  // Keep the selected harness valid if the fleet changes.
  useEffect(() => {
    if (harnesses.length && !harnesses.some((h) => h.root === root)) {
      setRoot(harnesses[0].root);
    }
  }, [harnesses, root]);

  // Cancel an in-flight ask on unmount (navigating away).
  useEffect(
    () => () => {
      abortRef.current?.abort();
      abortRef.current = null;
    },
    [],
  );

  const startAsk = (): void => {
    if (phase === "streaming" || !root || !provider || !question.trim()) {
      return;
    }
    setAnswerMd("");
    setFragments([]);
    setModel("");
    setErrorMsg("");
    setAskedRoot(root);
    setPhase("streaming");
    const controller = new AbortController();
    abortRef.current = controller;
    void streamSseOverPost(
      askUrl,
      { root, question, provider },
      {
        onDelta: (text) => setAnswerMd((prev) => prev + text),
        onResult: (event) => {
          const typed = event as AskResult;
          if (typed && typeof typed.answer_md === "string" && typed.answer_md) {
            setAnswerMd(typed.answer_md);
          }
          setFragments(Array.isArray(typed?.fragments) ? typed.fragments : []);
          if (typed && typed.model) {
            setModel(String(typed.model));
          }
          setPhase("done");
        },
        onError: (err) => {
          const message = err.message || err.code || "provider error";
          setErrorMsg(String(message));
          setPhase("error");
          announce.assertive(`ask failed: ${message}`);
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

  // Citation rewriting happens BEFORE sanitize: linkCitations rewrites
  // viewable refs into markdown links, then renderSanitized applies
  // marked + DOMPurify with the panel's FORBID policy.
  const sanitizedAnswer = renderSanitized(linkCitations(answerMd), { marked, DOMPurify });

  // ONE delegated click handler on the answer container: citation links
  // carry their ref in the href (#cite=<ref>, written by linkCitations), so
  // opening goes through the existing md-dialog viewer via GET /api/md for
  // the harness the answer was asked about.
  const onAnswerClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement | null;
    const link = target?.closest?.("a") ?? null;
    if (!link) {
      return;
    }
    const href = link.getAttribute("href") ?? "";
    if (!href.startsWith("#cite=")) {
      return;
    }
    event.preventDefault();
    const ref = decodeURIComponent(href.slice(6));
    setMdDoc({ root: askedRoot || root, file: ref, title: `fuente: ${ref}` });
  };

  const busy = phase === "streaming";
  const canAsk = !!root && !!provider && !!question.trim() && !busy;

  if (!harnesses.length) {
    return (
      <p className={styles.empty} role="note">
        no harnesses registered - the ask view needs a target harness
      </p>
    );
  }

  return (
    <div className={styles.ask}>
      <p className={styles.help}>
        Ask a question about one harness. The answer is grounded on the top BM25
        fragments of its corpus; every claim carries a [fuente: ref] citation that
        opens the source document.
      </p>

      <div className={styles.form}>
        <label className={styles.field}>
          <span>Harness</span>
          <select value={root} onChange={(e) => setRoot(e.target.value)}>
            {harnesses.map((h) => (
              <option key={h.root} value={h.root}>
                {h.name}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span>Provider</span>
          <select
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
        </label>

        <label className={`${styles.field} ${styles.question}`}>
          <span>Question</span>
          <textarea
            rows={3}
            placeholder="e.g. which features are blocked and why?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
        </label>

        <div className={styles.linkrow}>
          <button type="button" disabled={!canAsk} onClick={startAsk}>
            {busy ? "asking..." : "Ask"}
          </button>
          {phase === "done" && model ? (
            <span className={styles.where}>model: {model}</span>
          ) : null}
        </div>
      </div>

      {provLoaded && providers.length === 0 ? (
        <p className={styles.error} role="note">
          no LLM providers available - set an API key (Z_AI_API_KEY /
          ANTHROPIC_API_KEY) or run Ollama, then reload.
        </p>
      ) : null}

      {phase === "error" ? (
        <p className={styles.error} role="note">
          ask failed: {errorMsg}
        </p>
      ) : null}

      {answerMd || busy ? (
        <section className={styles.answerSection} aria-label="Answer">
          <div
            className={`md-body ${styles.answer}`}
            onClick={onAnswerClick}
            dangerouslySetInnerHTML={{ __html: sanitizedAnswer }}
          />
          {fragments.length > 0 ? (
            <div className={styles.where}>
              grounded on:{" "}
              {fragments.map((f) => `${f.ref} (${f.kind})`).join(", ")}
            </div>
          ) : null}
        </section>
      ) : null}

      <MdDialog doc={mdDoc} mdUrl={mdUrl} onClose={() => setMdDoc(null)} />
    </div>
  );
}

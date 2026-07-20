"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { announce } from "../lib/announce";
import { renderSanitized } from "../lib/md";
import { submitIntake, type SubmitIntakeResult } from "../actions/intake";
import styles from "./IntakeClient.module.css";

/**
 * Client layer for /intake (feature toolbox_next_intake_ask_ui).
 *
 * Migrates the legacy panel's IntakeView (handyman/assets/toolbox_panel.js)
 * onto the unified app's primitives:
 *
 *  - harness select (server-provided list - the same one ToolboxShell /
 *    palette receive - so no extra fetch)
 *  - provider select via GET /api/providers (only available adapters; the
 *    default is the first available adapter)
 *  - tag picker for workspace files via GET /api/files?root= (multi-select)
 *  - draft streamed over POST /api/draft with a fetch+reader SSE parser
 *    (events delta | result | error), cancelable via AbortController
 *  - sanitized preview rendered through lib/md.ts renderSanitized
 *    (marked + DOMPurify with the panel's FORBID policy)
 *  - submit via the server action submitIntake (apps/web/actions/intake.ts
 *    from feature 46) with progressive enhancement: the form's native submit
 *    works without JS too - the JS layer adds the live preview + tag picker.
 *
 * Progressive enhancement: the WHOLE intake is one <form action>. The draft
 * textarea lives INSIDE the form and is named draft_md, so a no-JS submit
 * still delivers a feature request to feature-request.md (the user pastes a
 * draft into the textarea and presses Submit). The JS layer adds the live
 * SSE draft + tag picker on top.
 *
 * Security: every dynamic value outside the rendered markdown body is
 * React-escaped. The markdown body itself is sanitized via renderSanitized
 * BEFORE dangerouslySetInnerHTML - never raw. Cero external assets; the
 * deps (marked + dompurify) are bundled by Next.
 */

/** One taggable workspace file from /api/files. */
interface TagFile {
  path: string;
  size: number;
}

/** Provider entry from /api/providers (only available ones are listed). */
interface ProviderEntry {
  id: string;
  available: boolean;
  model: string | null;
}

/** Subset of the SSE `result` event from POST /api/draft that the preview
 *  surfaces (archetype + possible duplicates). */
interface DraftResult {
  archetype?: string;
  draft_md?: string;
  possible_duplicates?: Array<{ name: string }>;
  /** Acceptance mode (feature 33): the drafted bullets and whether the model
   *  actually put the green gate last (checked server-side, never enforced). */
  acceptance_md?: string;
  gate_last?: boolean;
}

/**
 * What the view is drafting (feature 33). The two acceptance variants are one
 * flat control rather than a mode plus a nested source picker: there are only
 * three states and they are mutually exclusive, so a nested widget would cost
 * more than it explains.
 */
type IntakeMode = "intake" | "acceptance-diff" | "acceptance-spec";

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
 * failures (unregistered root, bad body, unknown provider) are plain JSON
 * 400s, NOT SSE - they surface as onError. The AbortController signal lets
 * the view cancel an in-flight request.
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

/**
 * Progressive-enhancement form action wrapper. Forwards the four intake
 * fields (root, draft_md, files) to submitIntake and surfaces a single
 * {ok, message, path?, files?} result for the UI.
 */
async function intakeAction(
  _prev: SubmitIntakeResult | null,
  formData: FormData,
): Promise<SubmitIntakeResult> {
  const root = String(formData.get("root") ?? "");
  const draftMd = String(formData.get("draft_md") ?? "");
  const filesRaw = formData.getAll("files");
  const files = filesRaw.map((f) => String(f)).filter((f) => f.length > 0);
  return submitIntake(root, draftMd, files);
}

export function IntakeClient({
  harnesses,
  providersUrl,
  filesUrl,
  draftUrl,
  acceptanceUrl,
}: {
  /** Registered harnesses from the RSC (project_name + project_root). */
  harnesses: Array<{ name: string; root: string }>;
  /** Same-origin provider availability URL ("/api/providers"). */
  providersUrl: string;
  /** Same-origin taggable-files URL ("/api/files"). */
  filesUrl: string;
  /** Same-origin SSE-over-POST draft URL ("/api/draft"). */
  draftUrl: string;
  /** Same-origin SSE-over-POST acceptance URL ("/api/acceptance", feature 33). */
  acceptanceUrl: string;
}) {
  // --- server action (progressive enhancement form) -------------------------
  const [submitResult, submitFormAction] = useActionState<SubmitIntakeResult | null, FormData>(
    intakeAction,
    null,
  );

  // --- draft machine --------------------------------------------------------
  const [mode, setMode] = useState<IntakeMode>("intake");
  const [root, setRoot] = useState<string>(harnesses[0]?.root ?? "");
  const [providers, setProviders] = useState<ProviderEntry[]>([]);
  const [provider, setProvider] = useState<string>("");
  const [provLoaded, setProvLoaded] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [draftMd, setDraftMd] = useState("");
  const [phase, setPhase] = useState<"idle" | "streaming" | "done" | "error">("idle");
  const [result, setResult] = useState<DraftResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // --- tag picker -----------------------------------------------------------
  const [tagFiles, setTagFiles] = useState<TagFile[]>([]);
  const [tagQuery, setTagQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagsOpen, setTagsOpen] = useState(false);

  // Provider availability once on mount; only available adapters are
  // selectable. Default to the first available adapter (the legacy panel
  // preferred "zai"; here we keep it simple and let the server pick the
  // cheap model per adapter).
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
        if (list.length && !list.some((p) => p.id === provider)) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the taggable workspace files for the selected harness whenever it
  // changes. Only a REGISTERED root resolves; selection is reset so stale
  // paths from another harness never travel into a draft or submission.
  useEffect(() => {
    if (!root) {
      setTagFiles([]);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({ root });
    fetch(`${filesUrl}?${params.toString()}`, { cache: "no-store" })
      .then(async (r) => r.json())
      .then((data: { files?: TagFile[] }) => {
        if (cancelled) {
          return;
        }
        setTagFiles(Array.isArray(data.files) ? data.files : []);
      })
      .catch(() => {
        if (!cancelled) {
          setTagFiles([]);
        }
      });
    setSelectedTags([]);
    return () => {
      cancelled = true;
    };
  }, [root, filesUrl]);

  // Keep the selected harness valid if the fleet changes.
  useEffect(() => {
    if (harnesses.length && !harnesses.some((h) => h.root === root)) {
      setRoot(harnesses[0].root);
    }
  }, [harnesses, root]);

  // Cancel any in-flight draft on unmount.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      abortRef.current = null;
    },
    [],
  );

  const startDraft = (): void => {
    if (phase === "streaming") {
      return;
    }
    if (!root || !provider) {
      return;
    }
    // acceptance-diff needs no prompt: the material is the working diff.
    if (mode !== "acceptance-diff" && !prompt.trim()) {
      return;
    }
    setDraftMd("");
    setResult(null);
    setErrorMsg("");
    setCopied(false);
    setPhase("streaming");
    const controller = new AbortController();
    abortRef.current = controller;
    const [url, body] =
      mode === "intake"
        ? [draftUrl, { root, prompt, provider, files: selectedTags }]
        : mode === "acceptance-diff"
          ? [acceptanceUrl, { root, provider, source: "diff" }]
          : [acceptanceUrl, { root, provider, source: "spec", spec: prompt }];
    void streamSseOverPost(
      url,
      body,
      {
        onDelta: (text) => setDraftMd((prev) => prev + text),
        onResult: (event) => {
          const typed = event as DraftResult;
          setResult(typed);
          // Both relays end with the full text in their own field; prefer it
          // over the accumulated deltas so the pane matches the server.
          const final = typed?.draft_md || typed?.acceptance_md;
          if (typeof final === "string" && final) {
            setDraftMd(final);
          }
          setPhase("done");
        },
        onError: (err) => {
          const message = err.message || err.code || "provider error";
          setErrorMsg(String(message));
          setPhase("error");
          announce.assertive(`draft failed: ${message}`);
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

  const cancelDraft = (): void => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (phase === "streaming") {
      setPhase("idle");
    }
  };

  const toggleTag = (path: string): void => {
    setSelectedTags((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path],
    );
  };
  const removeTag = (path: string): void =>
    setSelectedTags((prev) => prev.filter((p) => p !== path));
  const filteredTags = tagFiles.filter((f) =>
    f.path.toLowerCase().includes(tagQuery.toLowerCase()),
  );

  const doCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(draftMd);
      setCopied(true);
      announce.polite("draft copied to clipboard");
    } catch {
      setCopied(false);
      announce.assertive("copy failed - select and copy the text manually");
    }
  };

  const busy = phase === "streaming";
  // acceptance-diff draws its material from the working diff, so an empty
  // prompt is valid there and only there.
  const canDraft =
    !!root && !!provider && !busy && (mode === "acceptance-diff" || !!prompt.trim());
  const sanitizedPreview = renderSanitized(draftMd, { marked, DOMPurify });

  if (!harnesses.length) {
    return (
      <p className={styles.empty} role="note">
        no harnesses registered - the intake needs a target harness
      </p>
    );
  }

  return (
    <div className={styles.intake}>
      <p className={styles.help}>
        Draft a feature request from a short prompt. Tag workspace files to add
        them as context, edit the streamed draft, then copy it or submit it directly
        to the harness as feature-request.md.
      </p>

      {/*
        Progressive enhancement form: native submit works without JS through
        the submitIntake server action (which receives formData fields). The
        JS layer adds the live preview + tag picker on top.
      */}
      <form action={submitFormAction} className={styles.form}>
        {/* Feature 33: the same harness/provider selectors and the same safe
            markdown preview serve both modes; only the endpoint and the body
            change. */}
        <label className={styles.field}>
          <span>Mode</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as IntakeMode)}>
            <option value="intake">intake (feature request)</option>
            <option value="acceptance-diff">aceptacion (desde el diff)</option>
            <option value="acceptance-spec">aceptacion (desde una spec)</option>
          </select>
        </label>

        <label className={styles.field}>
          <span>Harness</span>
          <select name="root" value={root} onChange={(e) => setRoot(e.target.value)}>
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

        <label className={`${styles.field} ${styles.prompt}`}>
          <span>{mode === "acceptance-spec" ? "Spec" : "Prompt"}</span>
          <textarea
            rows={4}
            placeholder={
              mode === "acceptance-diff"
                ? "not used: the working diff (git diff HEAD) is the input"
                : mode === "acceptance-spec"
                  ? "paste the spec or issue to turn into observable acceptance"
                  : "e.g. add a recent-commands view to the toolbox panel"
            }
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={mode === "acceptance-diff"}
          />
        </label>

        <div className={styles.field}>
          <span>Context files</span>
          <div className={styles.tagPicker}>
            <div className={styles.tagChips}>
              {selectedTags.length === 0 ? (
                <span className={styles.muted}>no files tagged</span>
              ) : (
                selectedTags.map((p) => (
                  <span key={p} className={styles.tagChip}>
                    {p}
                    <button
                      type="button"
                      className={styles.tagX}
                      aria-label={`remove ${p}`}
                      onClick={() => removeTag(p)}
                    >
                      ✕
                    </button>
                  </span>
                ))
              )}
            </div>
            <div className={styles.tagSearch}>
              <input
                type="search"
                placeholder={tagsOpen ? "filter files..." : "add files..."}
                value={tagQuery}
                onFocus={() => setTagsOpen(true)}
                onChange={(e) => {
                  setTagQuery(e.target.value);
                  setTagsOpen(true);
                }}
              />
              {tagsOpen && tagFiles.length > 0 ? (
                <ul className={styles.tagList}>
                  {filteredTags.slice(0, 200).map((f) => (
                    <li key={f.path}>
                      <label>
                        <input
                          type="checkbox"
                          checked={selectedTags.includes(f.path)}
                          onChange={() => toggleTag(f.path)}
                        />
                        <span className={styles.tagPath}>{f.path}</span>
                        <span className={styles.tagSize}>{f.size} B</span>
                      </label>
                    </li>
                  ))}
                  {filteredTags.length === 0 ? (
                    <li className={styles.muted}>no files match &ldquo;{tagQuery}&rdquo;</li>
                  ) : null}
                </ul>
              ) : null}
              {tagsOpen && tagFiles.length === 0 ? (
                <p className={styles.muted}>no taggable files found in this workspace</p>
              ) : null}
            </div>
            {tagsOpen ? (
              <button
                type="button"
                className={styles.tagDone}
                onClick={() => setTagsOpen(false)}
              >
                done ({selectedTags.length})
              </button>
            ) : null}
          </div>
        </div>

        <div className={styles.linkrow}>
          {busy ? (
            <button type="button" onClick={cancelDraft}>
              cancel
            </button>
          ) : (
            <button type="button" disabled={!canDraft} onClick={startDraft}>
              Draft
            </button>
          )}
        </div>

        {/* The draft region lives INSIDE the form: the textarea below is
            named draft_md, so a no-JS submit (paste a draft, press Submit)
            posts it to the server action without ever calling /api/draft.
            The JS layer streams /api/draft into this same textarea. */}
        <section className={styles.draftSection} aria-label="Draft">
          <div className={styles.linkrow}>
            <strong>Draft</strong>
            {result && result.archetype ? (
              <span className={styles.where}>archetype: {result.archetype}</span>
            ) : null}
            {/* Feature 33: the server checks deterministically whether the
                model actually put the green gate last. It is reported, not
                enforced - the human decides what to do about it. */}
            {result && typeof result.gate_last === "boolean" ? (
              <span className={styles.where}>
                {result.gate_last ? "gate verde: ultima bala ✓" : "falta el gate verde al final ✗"}
              </span>
            ) : null}
            <button type="button" disabled={!draftMd} onClick={doCopy}>
              {copied ? "copied!" : "copy"}
            </button>
            <button
              type="submit"
              disabled={!draftMd || busy}
              title="submit the reviewed draft to feature-request.md"
            >
              Submit
            </button>
          </div>
          <textarea
            name="draft_md"
            className={styles.edit}
            rows={14}
            readOnly={busy}
            value={draftMd}
            onChange={(e) => setDraftMd(e.target.value)}
            placeholder={busy ? "streaming..." : "paste or stream a draft, then submit"}
          />
          <details>
            <summary>preview (sanitized)</summary>
            <div
              className={`md-body ${styles.preview}`}
              dangerouslySetInnerHTML={{ __html: sanitizedPreview }}
            />
          </details>
          {result &&
          Array.isArray(result.possible_duplicates) &&
          result.possible_duplicates.length > 0 ? (
            <div className={styles.where}>
              possible duplicates:{" "}
              {result.possible_duplicates.map((d) => d.name).join(", ")}
            </div>
          ) : null}
        </section>

        {/* Hidden fields carry the tagged files into the server action when
            the form is submitted without JS. */}
        {selectedTags.map((p) => (
          <input key={p} type="hidden" name="files" value={p} />
        ))}
      </form>

      {provLoaded && providers.length === 0 ? (
        <p className={styles.error} role="note">
          no LLM providers available - set an API key (Z_AI_API_KEY / ANTHROPIC_API_KEY)
          or run Ollama, then reload.
        </p>
      ) : null}

      {phase === "error" ? (
        <p className={styles.error} role="note">
          draft error: {errorMsg}
        </p>
      ) : null}

      {submitResult ? (
        submitResult.ok ? (
          <p className={styles.ok} role="status">
            {submitResult.message}
            {submitResult.path ? ` (${submitResult.path})` : ""}
          </p>
        ) : (
          <p className={styles.error} role="alert">
            submission failed: {submitResult.message}
          </p>
        )
      ) : null}

    </div>
  );
}

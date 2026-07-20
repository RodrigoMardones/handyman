"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./MdDialog.module.css";

/**
 * Shared markdown quick-view dialog (feature toolbox_next_timeline_search).
 * One component, many openers: the /search results ("open" on non-feature
 * hits) and the command palette's open-doc actions both funnel here. It is
 * the Next-side equivalent of the legacy panel's MdDialog.
 *
 * Given a request {root, file, title} it fetches the document from
 * /api/md?root=&file= (the resolveMd allowlist: only whitelisted files of a
 * REGISTERED harness resolve) and shows the body as preformatted,
 * HTML-escaped TEXT. Per the observer security model ("harness text never
 * becomes markup") the dialog never interprets the body as HTML: zero
 * markdown deps, zero XSS surface. The sanitized-markdown upgrade (marked +
 * DOMPurify, decision D2) is feature 48's scope and will land inside this
 * one component.
 *
 * Uses a native <dialog> via showModal(): focus trap and focus-return to
 * the opener come for free, Esc closes natively (the cancel event), and a
 * backdrop click closes explicitly.
 */
export interface MdDocRequest {
  root: string;
  file: string;
  title: string;
}

export function MdDialog({
  doc,
  mdUrl,
  onClose,
}: {
  /** The document to show, or null when the dialog is closed. */
  doc: MdDocRequest | null;
  /** Same-origin base URL for the markdown API ("/api/md"). */
  mdUrl: string;
  /** Called when the dialog closes (Esc, close button, backdrop). */
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [body, setBody] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // Open/close the native dialog to mirror the doc prop.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) {
      return;
    }
    if (doc && !dialog.open) {
      dialog.showModal();
    }
    if (!doc && dialog.open) {
      dialog.close();
    }
  }, [doc]);

  // Fetch the requested file whenever the request changes. A missing file or
  // an unregistered root surfaces as the /api/md error text in the body;
  // the dialog itself never crashes.
  useEffect(() => {
    if (!doc) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    setBody("");
    const params = new URLSearchParams({ root: doc.root, file: doc.file });
    fetch(`${mdUrl}?${params.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        const text = response.ok ? await response.text() : `(not available: HTTP ${response.status})`;
        if (!cancelled) {
          setBody(text);
          setLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setBody(`(not available: ${error instanceof Error ? error.message : "fetch failed"})`);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [doc, mdUrl]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-label={doc ? `markdown preview: ${doc.title}` : "markdown preview"}
      onClose={onClose}
      onClick={(event) => {
        // Backdrop click: the dialog element itself is the target only when
        // the click landed outside the panel content.
        if (event.target === ref.current) {
          onClose();
        }
      }}
    >
      <div className={styles.panel}>
        <header className={styles.head}>
          <h3 className={styles.title}>{doc ? doc.title : ""}</h3>
          <button type="button" className={styles.close} onClick={onClose}>
            close
          </button>
        </header>
        {loading ? (
          <p className={styles.loading}>loading...</p>
        ) : (
          // Security: preformatted TEXT only. React escapes the string, and
          // white-space handling comes from CSS; /api/md bodies never become
          // markup here.
          <pre className={styles.pre}>{body}</pre>
        )}
      </div>
    </dialog>
  );
}

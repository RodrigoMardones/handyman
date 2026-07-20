"use client";

import { useId, useState } from "react";
import { announce } from "../lib/announce";
import styles from "./AddFeatureForm.module.css";

/**
 * Register a feature in this harness, from the panel (feature 60).
 *
 * The first action the panel can take on harness STATE - /intake already wrote
 * a document (feature-request.md), this writes the state machine. It POSTs to
 * /api/feature, which routes through the same validated append `feature.js add`
 * uses; it never spawns a process.
 *
 * Deliberately a plain sibling of HarnessLive, not markup injected into it.
 * HarnessLive owns its region through dangerouslySetInnerHTML derived from the
 * live state, so anything hand-written into that node is clobbered on the next
 * SSE tick. React owns this form instead, and the two never touch.
 *
 * Nothing refreshes the queue here on purpose: the write lands inside a watched
 * workspace, so the runtime fs.watch hub fires /events and HarnessLive refetches
 * /api/state on its own. Re-fetching here too would be a second, racing source
 * of truth for the same document.
 *
 * Acceptance is one criterion per line, mirroring the CLI's repeatable
 * --acceptance. Blank lines are dropped by the route.
 */
export function AddFeatureForm({ root }: { root: string }) {
  const nameId = useId();
  const acceptanceId = useId();
  const titleId = useId();

  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [acceptance, setAcceptance] = useState("");
  const [phase, setPhase] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [message, setMessage] = useState("");

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setPhase("sending");
    setMessage("");
    try {
      const response = await fetch("/api/feature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          root,
          name: name.trim(),
          title: title.trim() || null,
          acceptance: acceptance.split("\n"),
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        id?: number;
        error?: string;
      };
      if (response.ok && payload.ok) {
        setPhase("ok");
        setMessage(`registered feature ${payload.id} '${name.trim()}' (pending)`);
        announce.polite(`feature ${payload.id} registered`);
        setName("");
        setTitle("");
        setAcceptance("");
        return;
      }
      setPhase("error");
      setMessage(payload.error ?? `HTTP ${response.status}`);
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "request failed");
    }
  };

  const busy = phase === "sending";

  return (
    <section className={styles.panel} aria-labelledby={`${nameId}-heading`}>
      <h2 className={styles.heading} id={`${nameId}-heading`}>
        Register a feature
      </h2>
      <p className={styles.hint}>
        Writes to this harness&rsquo;s <code>feature_list.json</code> through the same validated
        append the CLI uses. The queue above refreshes on its own.
      </p>
      <form className={styles.form} onSubmit={submit}>
        <label className={styles.label} htmlFor={nameId}>
          Name
          <input
            className={styles.input}
            id={nameId}
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="harness_verb_write_contract"
            pattern="[A-Za-z0-9_\-]+"
            title="letters, digits, underscore and hyphen only"
            required
            disabled={busy}
          />
        </label>
        <label className={styles.label} htmlFor={titleId}>
          Title <span className={styles.optional}>(optional)</span>
          <input
            className={styles.input}
            id={titleId}
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="One line describing the outcome"
            disabled={busy}
          />
        </label>
        <label className={styles.label} htmlFor={acceptanceId}>
          Acceptance <span className={styles.optional}>(one criterion per line)</span>
          <textarea
            className={styles.textarea}
            id={acceptanceId}
            name="acceptance"
            value={acceptance}
            onChange={(event) => setAcceptance(event.target.value)}
            rows={5}
            placeholder={"node dist/x.js does Y and exits 0\nbash tests/run_tests.sh passes"}
            required
            disabled={busy}
          />
        </label>
        <div className={styles.actions}>
          <button className={styles.submit} type="submit" disabled={busy}>
            {busy ? "registering..." : "Register"}
          </button>
        </div>
      </form>
      {phase === "ok" || phase === "error" ? (
        <p
          className={phase === "ok" ? styles.ok : styles.error}
          role={phase === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}

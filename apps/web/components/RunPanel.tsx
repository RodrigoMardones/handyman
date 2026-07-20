"use client";

import { useCallback, useEffect, useState } from "react";
import { announce } from "../lib/announce";
import styles from "./RunPanel.module.css";

/**
 * Launch and watch an agent run on this harness, from the panel (feature 70;
 * engine select, run history and continue mode added in feature 72,
 * runner_observer).
 *
 * Like AddFeatureForm, a plain React sibling of HarnessLive - never markup
 * injected into its dangerouslySetInnerHTML region (the clobber lesson from
 * the /search regression). React owns this panel end to end.
 *
 * No polling: the run's log lands inside the target harness's watched
 * workspace, so every write becomes an /events tick; this component refetches
 * /api/run on those ticks plus once per action. A run that goes quiet
 * between ticks shows its last known state until the next disk write - the
 * exit footer line guarantees a final tick.
 *
 * When the runner is disabled (the default) the panel renders only the
 * opt-in hint: the button would be a guaranteed 403, same reasoning as the
 * root-less AddFeatureForm.
 *
 * The server is the authority on Continue: the button only appears once the
 * last run has exited, and if the target feature is no longer in_progress
 * the 422 from POST /api/run is surfaced verbatim rather than guessed at
 * client-side.
 */

interface EngineInfo {
  id: string;
  label: string;
  available: boolean;
}

interface RunHistoryEntry {
  feature: string;
  root: string;
  engine: string;
  started_at: string;
  phase: "running" | "exited";
  exit?: { code: number | null; signal: string | null; at: string };
}

interface RunStatus {
  enabled: boolean;
  phase: "idle" | "running" | "exited";
  feature?: string;
  engine?: string;
  started_at?: string;
  exit?: { code: number | null; signal: string | null; at: string };
  log_tail?: string;
  engines?: EngineInfo[];
  runs?: RunHistoryEntry[];
}

export function RunPanel({
  root,
  pending,
  enabled,
  eventsUrl,
}: {
  root: string;
  pending: string[];
  enabled: boolean;
  eventsUrl: string;
}) {
  const [status, setStatus] = useState<RunStatus | null>(null);
  const [feature, setFeature] = useState(pending[0] ?? "");
  const [engine, setEngine] = useState("claude");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const hasPending = pending.length > 0;

  const refetch = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch("/api/run", { cache: "no-store" });
      setStatus((await response.json()) as RunStatus);
    } catch {
      // observer unreachable: keep the last known status
    }
  }, []);

  useEffect(() => {
    if (!enabled || !hasPending) {
      return;
    }
    void refetch();
    if (typeof EventSource === "undefined") {
      return;
    }
    const es = new EventSource(eventsUrl);
    es.onmessage = () => {
      void refetch();
    };
    return () => es.close();
  }, [enabled, eventsUrl, hasPending, refetch]);

  if (!enabled) {
    return (
      <section className={styles.panel} aria-labelledby="run-panel-heading">
        <h2 className={styles.heading} id="run-panel-heading">
          Run an agent
        </h2>
        <p className={styles.hint}>
          The runner is off (the observer default). Start the observer with{" "}
          <code>TOOLBOX_RUNNER=1</code> to launch agent sessions from here.
        </p>
      </section>
    );
  }

  if (!hasPending) {
    return (
      <section className={`${styles.panel} ${styles.emptyPanel}`} aria-labelledby="run-panel-heading">
        <h2 className={styles.heading} id="run-panel-heading">
          No work ready
        </h2>
        <p className={styles.emptyHint}>Add a feature to make work available to the runner.</p>
      </section>
    );
  }

  const running = status?.phase === "running";
  const engines = status?.engines ?? [];
  const runs = status?.runs ?? [];
  // Continue is offered once the last run exited and it targeted the same
  // feature this panel would relaunch; the server still owns the real
  // in_progress check (a stale/unrelated feature just surfaces the 422).
  const canContinue = status?.phase === "exited" && status.feature !== undefined;

  const launch = async (body: Record<string, unknown>, verb: string): Promise<void> => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (response.ok && payload.ok) {
        setMessage(`${verb} '${body.feature as string}'`);
        announce.polite(`agent run ${verb}`);
      } else {
        setMessage(payload.error ?? `HTTP ${response.status}`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "request failed");
    } finally {
      setBusy(false);
      void refetch();
    }
  };

  const start = (): Promise<void> => launch({ root, feature, engine }, "agent launched on");

  const continueRun = (): Promise<void> =>
    launch({ root, feature: status?.feature, engine, mode: "continue" }, "agent resumed on");

  const stop = async (): Promise<void> => {
    setBusy(true);
    try {
      await fetch("/api/run", { method: "DELETE", cache: "no-store" });
      announce.polite("agent run stopped");
    } catch {
      // refetch below reports the real state either way
    } finally {
      setBusy(false);
      void refetch();
    }
  };

  return (
    <section className={styles.panel} aria-labelledby="run-panel-heading">
      <h2 className={styles.heading} id="run-panel-heading">
        Run an agent
      </h2>
      <p className={styles.hint}>
        Launches a headless agent session on one pending feature of this harness. One run at a
        time; its log lives in <code>progress/run-&lt;feature&gt;.log</code>.
      </p>
      <div className={styles.controls}>
        <label className={styles.label} htmlFor="run-feature-select">
          Pending feature
          <select
            className={styles.select}
            id="run-feature-select"
            value={feature}
            onChange={(event) => setFeature(event.target.value)}
            disabled={busy || running || pending.length === 0}
          >
            {pending.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.label} htmlFor="run-engine-select">
          Engine
          <select
            className={styles.select}
            id="run-engine-select"
            value={engine}
            onChange={(event) => setEngine(event.target.value)}
            disabled={busy || running}
          >
            {engines.map((e) => (
              <option key={e.id} value={e.id} disabled={!e.available}>
                {e.label}
                {e.available ? "" : " (unavailable)"}
              </option>
            ))}
          </select>
        </label>
        {running ? (
          <button className={styles.stop} type="button" onClick={stop} disabled={busy}>
            Stop run
          </button>
        ) : (
          <button
            className={styles.submit}
            type="button"
            onClick={start}
            disabled={busy || feature.length === 0}
          >
            {busy ? "launching..." : "Run agent"}
          </button>
        )}
        {!running && canContinue ? (
          <button className={styles.submit} type="button" onClick={continueRun} disabled={busy}>
            {busy ? "resuming..." : `Continue '${status?.feature}'`}
          </button>
        ) : null}
      </div>
      {status !== null && status.phase !== "idle" ? (
        <p className={styles.status} role="status" aria-live="polite">
          {status.phase === "running"
            ? `running '${status.feature}' (${status.engine}) since ${status.started_at}`
            : `'${status.feature}' (${status.engine}) exited code=${status.exit?.code ?? "null"} signal=${status.exit?.signal ?? "none"}`}
        </p>
      ) : null}
      {message ? (
        <p className={styles.message} role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
      {status?.log_tail ? <pre className={styles.log}>{status.log_tail}</pre> : null}
      {runs.length > 0 ? (
        <div className={styles.history}>
          <h3 className={styles.historyHeading}>Runs</h3>
          <ul className={styles.historyList}>
            {runs.map((r, i) => (
              <li key={`${r.feature}-${r.started_at}-${i}`} className={styles.historyItem}>
                <span className={styles.historyFeature}>{r.feature}</span>
                <span className={styles.historyEngine}>{r.engine}</span>
                <span className={styles.historyPhase}>
                  {r.phase === "running"
                    ? `running since ${r.started_at}`
                    : `exited code=${r.exit?.code ?? "null"} signal=${r.exit?.signal ?? "none"}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

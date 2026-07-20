import { AppNav } from "../../components/AppNav";
import { TimelineLive } from "../../components/TimelineLive";
import { getRuntime } from "../../lib/runtime";
import { getBuildState } from "../../lib/toolboxState";
import type { TimelineState } from "./timelineHtml";
import styles from "./page.module.css";

/**
 * /timeline: the merged closure chronology across the toolBox (feature
 * toolbox_next_timeline_search). Migrates the legacy panel's #/timeline
 * view with the same pattern as /fleet and /harness/[name]: the Server
 * Component resolves the initial state with a DIRECT buildState() call (no
 * HTTP hop) and TimelineLive subscribes same-origin to /events + /api/state
 * for live refreshes. force-dynamic keeps the read live.
 *
 * ToolboxShell mounts the cross-view chrome here (command palette, global
 * shortcuts, theme toggle, a11y live regions).
 *
 * If the local read fails unexpectedly the page still renders with an
 * empty-state message rather than a 500.
 */
export const dynamic = "force-dynamic";

interface StateWithHarnesses extends TimelineState {
  harnesses?: Array<{ project_name: string; project_root: string }>;
}

const EMPTY_STATE: StateWithHarnesses = { harnesses: [], timeline: [] };

async function loadState(): Promise<{ state: StateWithHarnesses; ok: boolean }> {
  try {
    const runtime = getRuntime();
    const buildState = await getBuildState();
    return { state: buildState(runtime.hroot) as unknown as StateWithHarnesses, ok: true };
  } catch {
    return { state: EMPTY_STATE, ok: false };
  }
}

export default async function TimelinePage() {
  const { state, ok } = await loadState();
  const shellHarnesses = (state.harnesses ?? []).map((harness) => ({
    name: harness.project_name,
    root: harness.project_root,
  }));

  return (
    <main className={styles.page}>
      <AppNav harnesses={shellHarnesses} activeItem="Activity" currentKind="page" />

      {!ok ? (
        <section className={styles.down} role="alert">
          <h2>Observer state unavailable</h2>
          <p>
            Reading the toolBox registry failed. Check <code>HANDYMAN_ROOT</code> and reload.
          </p>
        </section>
      ) : null}

      <div className={styles.timeline}>
        <TimelineLive eventsUrl="/events" stateUrl="/api/state" fallbackState={state} />
      </div>
    </main>
  );
}

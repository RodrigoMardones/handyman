import { FleetLive } from "../../components/FleetLive";
import { FleetSummaryClient } from "../../components/FleetSummaryClient";
import { ToolboxShell } from "../../components/ToolboxShell";
import { getRuntime } from "../../lib/runtime";
import { getBuildState } from "../../lib/toolboxState";
import type { FleetState } from "./fleetHtml";
import styles from "./page.module.css";

/**
 * /fleet: first migrated view in apps/web (feature toolbox_next_fleet_view).
 *
 * Since feature 43 (toolbox_next_runtime_events) the Server Component
 * resolves the initial fleet state with a DIRECT buildState() call (loaded
 * at runtime via lib/toolboxState.ts) - no HTTP hop to the Node upstream - and
 * the live layer subscribes same-origin: /events and /api/state are served
 * natively by this app (route handlers over the runtime singleton), so the
 * client never needs the Node port. force-dynamic keeps the read live: the
 * state document reads the registry and workspaces on every request.
 *
 * If the local read fails unexpectedly the page still renders with an
 * empty-state message rather than a 500: /fleet degrades to "nothing to
 * show yet" instead of crashing.
 */
export const dynamic = "force-dynamic";

const EMPTY_STATE: FleetState = {
  harnesses: [],
  fleet: { harnesses: 0, unreadable: 0, status_counts: {} },
};

async function loadState(): Promise<{ state: FleetState; ok: boolean }> {
  try {
    const runtime = getRuntime();
    const buildState = await getBuildState();
    return { state: buildState(runtime.hroot) as unknown as FleetState, ok: true };
  } catch {
    return { state: EMPTY_STATE, ok: false };
  }
}

export default async function FleetPage() {
  const { state, ok } = await loadState();

  return (
    <main className={styles.page}>
      <nav className={styles.nav} aria-label="Primary">
        <a className={styles.brand} href="/">
          <span className={styles.brandMark}>handyman</span>
          <span className={styles.brandName}>toolBox</span>
        </a>
        <ul className={styles.navLinks}>
          <li>
            <a href="/fleet" aria-current="page">Fleet</a>
          </li>
          <li>
            <a href="/timeline">Timeline</a>
          </li>
          <li>
            <a href="/search">Search</a>
          </li>
        </ul>
        <ToolboxShell
          harnesses={(state.harnesses ?? []).map((harness) => ({
            name: harness.project_name,
            root: harness.project_root,
          }))}
        />
      </nav>

      {!ok ? (
        <section className={styles.down} role="alert">
          <h2>Observer state unavailable</h2>
          <p>
            Reading the toolBox registry failed. Check <code>HANDYMAN_ROOT</code> and reload.
          </p>
        </section>
      ) : null}

      <div className={styles.fleet}>
        <FleetLive eventsUrl="/events" stateUrl="/api/state" fallbackState={state} />
      </div>

      <FleetSummaryClient providersUrl="/api/providers" summarizeUrl="/api/summarize" />
    </main>
  );
}

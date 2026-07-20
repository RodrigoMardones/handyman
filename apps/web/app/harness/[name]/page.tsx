import { AppNav } from "../../../components/AppNav";
import { HarnessLive } from "../../../components/HarnessLive";
import { RunPanel } from "../../../components/RunPanel";
import { getRuntime } from "../../../lib/runtime";
import { getBuildState } from "../../../lib/toolboxState";
import type { HarnessState } from "../harnessHtml";
import styles from "./page.module.css";

/**
 * /harness/[name]: the per-harness view migrated from the legacy panel
 * (feature toolbox_next_harness_view). This page "steals" the
 * /harness/<name> route family out of proxy.ts (see the NEXT_HANDLED sets
 * there): unmigrated paths still fall through to the Node upstream.
 *
 * Since feature 43 (toolbox_next_runtime_events) the Server Component
 * resolves the fleet state with a DIRECT buildState() call (loaded at
 * runtime via lib/toolboxState.ts) - no HTTP hop - and the live layer subscribes
 * same-origin: /events and /api/state are served natively by this app.
 * /api/md is still relative too: proxy.ts forwards it to the Node upstream
 * until feature 44 steals it, so the dialog keeps working either way.
 *
 * Same format as the legacy panel's HarnessView: meta-list, MetricsStrip,
 * signals row, workspace + docs markdown quick-view, Queue/Kanban by
 * status, and the graphify iframe when the harness ships an export.
 *
 * If the local read fails unexpectedly the page still renders with an
 * empty-state message rather than a 500.
 */
export const dynamic = "force-dynamic";

const EMPTY_STATE: HarnessState = {
  harnesses: [],
  fleet: { harnesses: 0, unreadable: 0, status_counts: {} },
};

async function loadState(): Promise<{ state: HarnessState; ok: boolean }> {
  try {
    const runtime = getRuntime();
    const buildState = await getBuildState();
    return { state: buildState(runtime.hroot) as unknown as HarnessState, ok: true };
  } catch {
    return { state: EMPTY_STATE, ok: false };
  }
}

export default async function HarnessPage({ params }: { params: Promise<{ name: string }> }) {
  const { name: rawName } = await params;
  const name = decodeURIComponent(rawName);
  const { state, ok } = await loadState();
  // The register action needs the harness's project_root, which is the token
  // /api/feature checks against the registry. Resolved server-side from the
  // state we already have: no extra fetch, and no root typed by hand.
  const snapshot = (state.harnesses ?? []).find((entry) => entry.project_name === name);
  const root = snapshot?.project_root ?? "";
  const pending = (snapshot?.features ?? [])
    .filter((feature) => feature.status === "pending")
    .map((feature) => feature.name);
  // Read per request (the page is force-dynamic): the same server answers
  // honestly whether it was booted as observer or as observer+runner.
  const runnerOn = process.env.TOOLBOX_RUNNER === "1";

  return (
    <main className={styles.page}>
      <AppNav
        harnesses={(state.harnesses ?? []).map((harness) => ({
          name: harness.project_name,
          root: harness.project_root,
        }))}
        activeItem="Fleet"
        currentKind="location"
      />

      {!ok ? (
        <section className={styles.down} role="alert">
          <h2>Observer state unavailable</h2>
          <p>
            Reading the toolBox registry failed. Check <code>HANDYMAN_ROOT</code> and reload.
          </p>
        </section>
      ) : null}

      <div className={styles.harness}>
        <header className={styles.contextHeader}>
          <div className={styles.contextCopy}>
            <div className={styles.breadcrumb} role="navigation" aria-label="Breadcrumb">
              <ol>
                <li>
                  <a href="/fleet">Fleet</a>
                </li>
                <li aria-current="page">{name}</li>
              </ol>
            </div>
            <h1 className={styles.title}>{name}</h1>
          </div>
          <a className={styles.primaryAction} href={`/harness/${encodeURIComponent(name)}/new`}>Add feature</a>
        </header>
        {root ? (
          <div className={styles.actionBar}>
            <RunPanel
              root={root}
              pending={pending}
              enabled={runnerOn}
              eventsUrl="/events"
            />
          </div>
        ) : null}
        <HarnessLive
          name={name}
          eventsUrl="/events"
          stateUrl="/api/state"
          mdUrl="/api/md"
          fallbackState={state}
        />
      </div>
    </main>
  );
}

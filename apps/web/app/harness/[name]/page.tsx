import { AddFeatureForm } from "../../../components/AddFeatureForm";
import { HarnessLive } from "../../../components/HarnessLive";
import { ToolboxShell } from "../../../components/ToolboxShell";
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
  const root =
    (state.harnesses ?? []).find((entry) => entry.project_name === name)?.project_root ?? "";

  return (
    <main className={styles.page}>
      <nav className={styles.nav} aria-label="Primary">
        <a className={styles.brand} href="/">
          <span className={styles.brandMark}>handyman</span>
          <span className={styles.brandName}>toolBox</span>
        </a>
        <ul className={styles.navLinks}>
          <li>
            <a href="/fleet">Fleet</a>
          </li>
          <li>
            <a href={`/harness/${encodeURIComponent(name)}`} aria-current="page">
              Harness
            </a>
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

      <div className={styles.harness}>
        <HarnessLive
          name={name}
          eventsUrl="/events"
          stateUrl="/api/state"
          mdUrl="/api/md"
          fallbackState={state}
        />
        {/* Rendered only for a harness present in the registry: without a
            project_root the POST could not pass isRegisteredRoot anyway, so
            offering the form would be offering a guaranteed rejection. */}
        {root ? <AddFeatureForm root={root} /> : null}
      </div>
    </main>
  );
}

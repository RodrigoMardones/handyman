import { AppNav } from "../../../../components/AppNav";
import { NewFeatureForm } from "../../../../components/NewFeatureForm";
import { getRuntime } from "../../../../lib/runtime";
import { getBuildState } from "../../../../lib/toolboxState";
import type { HarnessState } from "../../harnessHtml";
import styles from "../page.module.css";

/**
 * /harness/[name]/new (feature 71, new_feataure_view): a single view that
 * orders the whole "create a request" space that used to be split across two
 * independent panels on /harness/[name] (AddFeatureForm + RunPanel, chosen by
 * hand afterwards from the pending queue). Same resolution pattern as the
 * parent page: force-dynamic, project_root resolved server-side from the
 * fleet state (never typed by hand), TOOLBOX_RUNNER read per request so the
 * page answers honestly whether an agent can be assigned from here.
 *
 * Reuses the parent page's CSS module (../page.module.css) for the nav/shell
 * chrome - same shell, different body - instead of duplicating those rules.
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

export default async function NewFeaturePage({ params }: { params: Promise<{ name: string }> }) {
  const { name: rawName } = await params;
  const name = decodeURIComponent(rawName);
  const { state, ok } = await loadState();
  const snapshot = (state.harnesses ?? []).find((entry) => entry.project_name === name);
  const root = snapshot?.project_root ?? "";
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
        <div className={styles.breadcrumb} role="navigation" aria-label="Breadcrumb">
          <ol>
            <li>
              <a href="/fleet">Fleet</a>
            </li>
            <li>
              <a href={`/harness/${encodeURIComponent(name)}`}>{name}</a>
            </li>
            <li aria-current="page">New feature</li>
          </ol>
        </div>
        <h1 className="harness-header__title">New request &mdash; {name}</h1>
        {root ? (
          <NewFeatureForm root={root} runnerEnabled={runnerOn} filesUrl="/api/files" />
        ) : (
          <p className={styles.down} role="alert">
            &lsquo;{name}&rsquo; is not a registered harness: no request can be filed against it.
          </p>
        )}
      </div>
    </main>
  );
}

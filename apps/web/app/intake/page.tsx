import { AppNav } from "../../components/AppNav";
import { IntakeClient } from "../../components/IntakeClient";
import { getRuntime } from "../../lib/runtime";
import { getBuildState } from "../../lib/toolboxState";
import styles from "./page.module.css";

/**
 * /intake: feature-request authoring view (feature
 * toolbox_next_intake_ask_ui). Migrates the legacy panel's IntakeView onto
 * the unified app's primitives.
 *
 * The Server Component only needs the harness list (for the selector, the
 * ToolboxShell palette and to keep the selected harness valid). Everything
 * else is client-side progressive enhancement: the form's native POST goes
 * through the submitIntake server action (feature 46) so it works without
 * JS, and the IntakeClient layer adds the live SSE draft preview + tag
 * picker on top. force-dynamic keeps the harness read live.
 */
export const dynamic = "force-dynamic";

interface StateSubset {
  harnesses?: Array<{ project_name: string; project_root: string }>;
}

async function loadHarnesses(): Promise<Array<{ name: string; root: string }>> {
  try {
    const runtime = getRuntime();
    const buildState = await getBuildState();
    const state = buildState(runtime.hroot) as unknown as StateSubset;
    return (state.harnesses ?? []).map((harness) => ({
      name: harness.project_name,
      root: harness.project_root,
    }));
  } catch {
    return [];
  }
}

export default async function IntakePage() {
  const shellHarnesses = await loadHarnesses();

  return (
    <main className={styles.page}>
      <AppNav harnesses={shellHarnesses} activeItem="Draft" currentKind="page" />

      <div className={styles.intake}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>handyman toolBox</p>
          <h1 className={styles.title}>Intake</h1>
        </header>
        <IntakeClient
          harnesses={shellHarnesses}
          providersUrl="/api/providers"
          filesUrl="/api/files"
          draftUrl="/api/draft"
          acceptanceUrl="/api/acceptance"
        />
      </div>
    </main>
  );
}

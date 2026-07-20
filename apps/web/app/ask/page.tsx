import { AskClient } from "../../components/AskClient";
import { ToolboxShell } from "../../components/ToolboxShell";
import { getRuntime } from "../../lib/runtime";
import { getBuildState } from "../../lib/toolboxState";
import styles from "./page.module.css";

/**
 * /ask: grounded question-and-answer view (feature
 * toolbox_next_intake_ask_ui). Migrates the legacy panel's AskView onto the
 * unified app's primitives.
 *
 * The Server Component only needs the harness list (for the selector, the
 * ToolboxShell palette and to keep the selected harness valid). AskClient
 * streams the answer over POST /api/ask, rewrites viewable [fuente: <ref>]
 * citations into #cite= links and opens the source through the shared
 * /api/md dialog. force-dynamic keeps the harness read live.
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

export default async function AskPage() {
  const shellHarnesses = await loadHarnesses();

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
            <a href="/timeline">Timeline</a>
          </li>
          <li>
            <a href="/search">Search</a>
          </li>
        </ul>
        <ToolboxShell harnesses={shellHarnesses} />
      </nav>

      <div className={styles.ask}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>handyman toolBox</p>
          <h1 className={styles.title}>Ask</h1>
        </header>
        <AskClient
          harnesses={shellHarnesses}
          providersUrl="/api/providers"
          askUrl="/api/ask"
          mdUrl="/api/md"
        />
      </div>
    </main>
  );
}

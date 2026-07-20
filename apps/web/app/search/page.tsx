import { SearchClient } from "../../components/SearchClient";
import { ToolboxShell } from "../../components/ToolboxShell";
import { getRuntime } from "../../lib/runtime";
import { getBuildState } from "../../lib/toolboxState";
import styles from "./page.module.css";

/**
 * /search: fleet-wide BM25 search (feature toolbox_next_timeline_search).
 * Migrates the legacy panel's #/search view: the index is built CLIENT-SIDE
 * by SearchClient (MiniSearch over GET /api/corpus, served natively by this
 * app since feature 44) and every keystroke is answered locally with zero
 * network. Non-feature hits open through the shared /api/md dialog.
 *
 * The Server Component only needs the harness list (for the command
 * palette's go-to-harness / open-doc actions); force-dynamic keeps that
 * read live and off the build-time prerender.
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

export default async function SearchPage() {
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
            <a href="/search" aria-current="page">Search</a>
          </li>
        </ul>
        <ToolboxShell harnesses={shellHarnesses} />
      </nav>

      <div className={styles.search}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>handyman toolBox</p>
          <h1 className={styles.title}>Search</h1>
        </header>
        <SearchClient corpusUrl="/api/corpus" eventsUrl="/events" mdUrl="/api/md" />
      </div>
    </main>
  );
}

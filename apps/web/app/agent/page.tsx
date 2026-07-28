import { AgentLive } from "../../components/AgentLive";
import { ToolboxShell } from "../../components/ToolboxShell";
import { getRuntime } from "../../lib/runtime";
import { getBuildState } from "../../lib/toolboxState";
import { isValidFeatureName, loadAgentState } from "../api/agent/loadAgentState";
import type { AgentViewState } from "./agentHtml";
import styles from "./page.module.css";

/**
 * /agent: read-only observer view of the live Flue agent per feature
 * (feature 95 web_live_agent_view).
 *
 * The Server Component resolves the initial state with a DIRECT
 * loadAgentState() call (the same loader /api/agent uses: telemetry JSONL +
 * liveness probe - no HTTP hop to its own route handler) and the live layer
 * polls /api/agent same-origin from the client (see components/AgentLive.tsx
 * for why polling and not the SSE hook). force-dynamic keeps the read live:
 * the JSONL grows on every agent event.
 *
 * If the load fails unexpectedly the page still renders a role="alert"
 * banner instead of a 500, same degradation contract as /fleet.
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

export default async function AgentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.feature;
  const candidate = Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "");
  const feature = isValidFeatureName(candidate) ? candidate : null;

  let state: AgentViewState = { runtime: "offline", feature: null, telemetry: null };
  let ok = true;
  if (feature !== null) {
    try {
      state = await loadAgentState(feature);
    } catch {
      // loadAgentState never throws by contract; stay defensive so the page
      // degrades to a banner instead of a 500 if that ever changes.
      state = { runtime: "offline", feature, telemetry: null };
      ok = false;
    }
  }
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
          <li>
            <a href="/agent" aria-current="page">Agent</a>
          </li>
        </ul>
        <ToolboxShell harnesses={shellHarnesses} />
      </nav>

      {!ok ? (
        <section className={styles.down} role="alert">
          <h2>Estado del agente no disponible</h2>
          <p>La lectura de la telemetría falló. Recarga la página para reintentar.</p>
        </section>
      ) : null}

      <div className={styles.agent}>
        {/* Plain GET form, no JS required: it reloads the view with
            ?feature=<name> and the Server Component does the rest. */}
        <form className={styles.picker} method="get" action="/agent">
          <label className={styles.pickerLabel} htmlFor="agent-feature">
            Feature
          </label>
          <input
            id="agent-feature"
            name="feature"
            type="text"
            defaultValue={feature ?? ""}
            placeholder="95_web_live_agent_view"
            pattern="[A-Za-z0-9_\-]+"
            autoComplete="off"
          />
          <button type="submit">Ver agente</button>
        </form>
        <AgentLive feature={feature} initialState={state} />
      </div>
    </main>
  );
}

/**
 * Pure HTML renderer for the /agent view (feature 95 web_live_agent_view).
 *
 * Why a string renderer and not JSX? Same load-bearing reasons as /fleet
 * (app/fleet/fleetHtml.ts):
 *
 *  1. Testability without a Next build: a plain TS module that turns a state
 *     object into an HTML string is importable directly by a Node test
 *     (tests/test_web_agent.sh transpiles it standalone), JSX is not. That is
 *     why this module has ZERO imports: not even lib/ ones.
 *  2. One renderer for server and client: the Server Component ships the
 *     initial markup and the polling client (components/AgentLive.tsx) swaps
 *     the region with the exact same function, so both renders agree by
 *     construction and there is no hydration drift.
 *
 * Security: every dynamic value is HTML-escaped via `esc()`. No attribute is
 * ever built from raw text. The string contains no <script>, no external
 * src, no inline event handler.
 *
 * Visible copy is Spanish (product language of this view); class names stay
 * English for parity with the other observer views.
 */

/** One settled submission, as aggregated by app/api/agent/loadAgentState.ts. */
export interface AgentOutcomeEntry {
  submissionId: string | null;
  outcome: string | null;
}

/** Aggregate of the telemetry JSONL for one feature. */
export interface AgentTelemetrySummary {
  total: number;
  byType: Record<string, number>;
  lastType: string | null;
  lastTimestamp: string | null;
  outcomes: AgentOutcomeEntry[];
  toolErrors: number;
  slowOps: number;
}

/** State consumed by renderAgentHtml; mirrors the /api/agent payload. */
export interface AgentViewState {
  runtime: "online" | "offline";
  feature: string | null;
  telemetry: AgentTelemetrySummary | null;
}

/** HTML-escape every interpolated value. Mirrors the panel contract: agent
 *  text never becomes markup. Copied verbatim from app/fleet/fleetHtml.ts. */
function esc(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Format an ISO timestamp as a short, locale-stable "YYYY-MM-DD HH:MM UTC"
 *  so the "last activity" line does not flicker between locales on server
 *  and client renders. Returns the raw string escaped if it is not
 *  parseable, "-" when there is no timestamp at all. */
function fmtTimestamp(iso: string | null): string {
  if (!iso) {
    return "-";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return esc(iso);
  }
  const pad = (n: number): string => String(n).padStart(2, "0");
  return esc(
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
      date.getUTCDate(),
    )} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`,
  );
}

/** No feature selected yet: invite the user to pick one (the page ships a
 *  plain GET form for that, no JS required). */
function inviteSection(): string {
  return `<section class="agent-section agent-section--empty" aria-label="Elegir feature">
    <h2 class="agent-section__title">Elige una feature</h2>
    <p class="empty">Indica el nombre de una feature para ver el estado vivo de su agente Flue.</p>
  </section>`;
}

/** Status chips: runtime liveness + whether telemetry exists at all. */
function statusSection(state: AgentViewState): string {
  const online = state.runtime === "online";
  const runtimeChip = `<span class="agent-chip agent-chip--${online ? "online" : "offline"}">runtime ${
    online ? "online" : "offline"
  }</span>`;
  const telemetryChip = state.telemetry
    ? `<span class="agent-chip">telemetría <bdi class="agent-chip__count">${esc(
        state.telemetry.total,
      )}</bdi></span>`
    : `<span class="agent-chip agent-chip--zero">sin telemetría</span>`;
  return `<section class="agent-section" aria-label="Estado del runtime">
    <h2 class="agent-section__title">Estado</h2>
    <p class="agent-chips">${runtimeChip}${telemetryChip}</p>
  </section>`;
}

/** Feature selected but no telemetry file: distinguish "the runtime is down
 *  and there is nothing recorded" from "runtime up, just no events yet". */
function emptyTelemetrySection(runtime: AgentViewState["runtime"]): string {
  if (runtime === "offline") {
    return `<section class="agent-section agent-section--down" aria-label="Runtime offline">
      <h2 class="agent-section__title">Runtime offline</h2>
      <p class="empty">El runtime Flue no responde y no hay telemetría registrada para esta feature.</p>
    </section>`;
  }
  return `<section class="agent-section agent-section--empty" aria-label="Sin telemetría">
    <h2 class="agent-section__title">Sin telemetría</h2>
    <p class="empty">No hay eventos registrados para esta feature todavía.</p>
  </section>`;
}

/** Activity summary: total events, last event type, last event time (from
 *  the events themselves, never the wall clock), plus the error counters. */
function summarySection(telemetry: AgentTelemetrySummary): string {
  const total = telemetry.total;
  const errorChip = (label: string, count: number): string =>
    `<span class="agent-chip ${count > 0 ? "agent-chip--alert" : "agent-chip--zero"}">${label} <bdi class="agent-chip__count">${esc(
      count,
    )}</bdi></span>`;
  return `<section class="agent-section" aria-label="Resumen de actividad">
    <h2 class="agent-section__title">Actividad</h2>
    <p class="agent-meta">
      <span class="agent-meta__total"><bdi>${esc(total)}</bdi> evento${total === 1 ? "" : "s"}</span>
      <span>último: <bdi>${esc(telemetry.lastType ?? "-")}</bdi></span>
      <span>a las <bdi class="agent-meta__ts">${fmtTimestamp(telemetry.lastTimestamp)}</bdi></span>
    </p>
    <p class="agent-chips">
      ${errorChip("errores de herramienta", telemetry.toolErrors)}
      ${errorChip("operaciones lentas", telemetry.slowOps)}
    </p>
  </section>`;
}

/** Event counts by type, sorted by type name with a plain code-point
 *  comparator so the table is stable across runtimes and locales. */
function byTypeSection(byType: Record<string, number>): string {
  const entries = Object.entries(byType).sort((a, b) =>
    a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
  );
  if (entries.length === 0) {
    return "";
  }
  const rows = entries
    .map(
      ([type, count]) =>
        `<tr><th class="agent-table__type" scope="row">${esc(type)}</th><td class="agent-table__count">${esc(
          count,
        )}</td></tr>`,
    )
    .join("");
  return `<section class="agent-section" aria-label="Eventos por tipo">
    <h2 class="agent-section__title">Eventos por tipo</h2>
    <div class="table-wrap">
      <table class="agent-table">
        <thead>
          <tr>
            <th scope="col">Tipo</th>
            <th scope="col">Eventos</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </section>`;
}

/** The last submission settlements (max 5, kept by the loader). Rendered
 *  newest first: the array arrives in chronological order. */
function outcomesSection(outcomes: AgentOutcomeEntry[]): string {
  if (outcomes.length === 0) {
    return "";
  }
  const items = [...outcomes]
    .reverse()
    .map(
      (entry) =>
        `<li class="agent-outcome">
        <span class="agent-outcome__id">${esc(entry.submissionId ?? "(sin id)")}</span>
        <span class="agent-outcome__value">${esc(entry.outcome ?? "?")}</span>
      </li>`,
    )
    .join("");
  return `<section class="agent-section" aria-label="Últimos resultados">
    <h2 class="agent-section__title">Últimos resultados</h2>
    <ul class="agent-outcomes">${items}</ul>
  </section>`;
}

/**
 * Render the /agent body from the loader state. Pure: same input always
 * yields the same HTML, no I/O, no Date.now(), no locale-dependent calls.
 */
export function renderAgentHtml(state: AgentViewState): string {
  const feature = state.feature;
  const meta = feature
    ? `Feature <bdi class="agent-header__feature">${esc(feature)}</bdi>`
    : "Ninguna feature seleccionada";
  const body = !feature
    ? inviteSection()
    : statusSection(state) +
      (state.telemetry
        ? summarySection(state.telemetry) +
          byTypeSection(state.telemetry.byType) +
          outcomesSection(state.telemetry.outcomes)
        : emptyTelemetrySection(state.runtime));
  return `<header class="agent-header">
      <p class="agent-header__eyebrow">handyman toolBox</p>
      <h1 class="agent-header__title">Agente</h1>
      <p class="agent-header__meta">${meta}</p>
    </header>
    ${body}`;
}

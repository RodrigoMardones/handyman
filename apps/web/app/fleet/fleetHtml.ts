/**
 * Pure HTML renderer for the /fleet view (feature toolbox_next_fleet_view).
 *
 * Why a string renderer and not JSX? Two reasons, both load-bearing:
 *
 *  1. Testability without a Next build. The acceptance criterion asks for a
 *     test that verifies the *render* of /fleet against a state fixture with
 *     no network and no full Next build. A plain TS module that turns a state
 *     object into an HTML string is importable directly by a Node test; JSX
 *     is not, without running the whole apps/web toolchain. This mirrors how
 *     the legacy panel ships its own markup and keeps the parity oracle
 *     (feature 36) meaningful.
 *  2. SSE live updates without React reconciliation. The /events feed signals
 *     a change; the cheapest correct response is to re-fetch /api/state and
 *     swap the rendered region. Because every value below is text-escaped
 *     (harness text never becomes markup, same contract as toolbox_serve.ts),
 *     a full innerHTML replace of a read-only surface is safe and avoids a
 *     hydration mismatch between server and client.
 *
 * Security: every dynamic value is HTML-escaped via `esc()`. No attribute is
 * ever built from raw text. The string contains no <script>, no external
 * src, no inline event handler.
 *
 * Design (design-taste-frontend, same skill used by toolbox_next_landing):
 * one theme, one accent (terracotta-on-slate tokens from globals.css),
 * pill badges, 14px cards, 10px code/panel surfaces. The page Theme Lock
 * and Color Consistency Lock carry over from the landing page: this module
 * never introduces a second accent or a raw hex.
 */

/** Subset of /api/state that /fleet renders. Loose on purpose: the upstream
 *  contract (buildState, handyman/src/toolbox_state.ts) adds more fields over
 *  time, and we only read what we display. */
export interface HarnessState {
  project_root: string;
  project_name: string;
  error: string | null;
  workspace?: string;
  status_counts: Record<string, number>;
  signals?: Array<{ signal: string; detail: string }>;
  features?: Array<{
    id: number | null;
    name: string;
    title: string;
    status: string;
    sprint: string | null;
    blocked_reason: string | null;
    depends_on: number[];
  }>;
  has_graph?: boolean;
}

export interface FleetAggregate {
  harnesses: number;
  unreadable: number;
  status_counts: Record<string, number>;
}

export interface FleetState {
  generated_at?: string;
  harnesses?: HarnessState[];
  fleet?: FleetAggregate;
  registry?: string;
  registry_error?: string | null;
  skill_version?: string | null;
}

/** Status order is part of the contract (STATUSES in toolbox.ts): pending,
 *  in_progress, done, blocked. Keeping it here lets the kanban columns and
 *  the per-harness counts render in a stable, expected order. */
const STATUS_ORDER = ["pending", "in_progress", "done", "blocked"] as const;

/** Human labels for the status tokens used as kanban columns + badges. */
const STATUS_LABEL: Record<string, string> = {
  pending: "pending",
  in_progress: "in progress",
  done: "done",
  blocked: "blocked",
};

/** HTML-escape every interpolated value. Mirrors the panel contract: harness
 *  text never becomes markup. */
function esc(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Format an ISO timestamp as a short, locale-stable "YYYY-MM-DD HH:MM" so the
 *  "generated at" line does not flicker between locales between server and
 *  client renders. Returns the raw string if it is not parseable. */
function fmtTimestamp(iso: string | undefined): string {
  if (!iso) {
    return "live";
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

/** A single status chip, used in both the kanban column headers and the
 *  per-harness row. */
function statusChip(status: string, count: number): string {
  const label = STATUS_LABEL[status] ?? esc(status);
  return `<span class="chip chip--${esc(status)}" title="${esc(status)}">${esc(label)}<bdi class="chip__count">${esc(count)}</bdi></span>`;
}

/** Aggregate kanban: one column per status with the fleet-wide count. These
 *  numbers come straight from /api/state.fleet.status_counts. */
function kanbanSection(fleet: FleetAggregate | undefined): string {
  const counts = fleet?.status_counts ?? {};
  const cells = STATUS_ORDER.map((status) => {
    const count = counts[status] ?? 0;
    return `<li class="kanban__cell">
      ${statusChip(status, count)}
      <span class="kanban__label">${esc(STATUS_LABEL[status] ?? status)}</span>
    </li>`;
  }).join("");
  const total = fleet?.harnesses ?? 0;
  const unreadable = fleet?.unreadable ?? 0;
  return `<section class="fleet-section kanban" aria-label="Fleet status overview">
    <h2 class="fleet-section__title">Fleet status</h2>
    <p class="kanban__meta">
      <span class="kanban__total"><bdi>${esc(total)}</bdi> harness${total === 1 ? "" : "es"}</span>
      ${
        unreadable > 0
          ? `<span class="kanban__unreadable"><bdi>${esc(unreadable)}</bdi> unreadable</span>`
          : ""
      }
    </p>
    <ol class="kanban__grid">${cells}</ol>
  </section>`;
}

/** Per-harness row: name, status chips, and the signal list. Renders a row
 *  for every harness in /api/state.harnesses, including unreadable ones
 *  (which carry a single UNREADABLE signal). */
function harnessRow(harness: HarnessState): string {
  const name = harness.project_name || harness.project_root || "(unnamed harness)";
  const counts = harness.status_counts ?? {};
  const chips = STATUS_ORDER.map((status) => {
    const count = counts[status] ?? 0;
    if (count === 0) {
      return `<span class="chip chip--${esc(status)} chip--zero" title="${esc(status)}">${esc(
        STATUS_LABEL[status] ?? status,
      )}<bdi class="chip__count">0</bdi></span>`;
    }
    return statusChip(status, count);
  }).join("");

  const signals = harness.signals ?? [];
  const signalList =
    signals.length === 0
      ? `<ul class="signals signals--ok" aria-label="No health signals"><li class="signals__ok">no signals</li></ul>`
      : `<ul class="signals" aria-label="Health signals">${signals
          .map(
            (signal) =>
              `<li class="signal signal--${esc(signal.signal.toLowerCase())}">` +
              `<span class="signal__tag">${esc(signal.signal)}</span>` +
              `<span class="signal__detail">${esc(signal.detail)}</span></li>`,
          )
          .join("")}</ul>`;

  const errorCell = harness.error
    ? `<p class="harness__error" role="note">${esc(harness.error)}</p>`
    : "";

  // The name links to /harness/<project_name> (the per-harness view resolves
  // by project_name). encodeURIComponent output is attribute-safe. Without a
  // project_name there is nothing to open, so it stays a plain span.
  const title = harness.project_name
    ? `<a class="harness__title" href="/harness/${encodeURIComponent(
        harness.project_name,
      )}">${esc(name)}</a>`
    : `<span class="harness__title">${esc(name)}</span>`;

  return `<tr class="harness${harness.error ? " harness--error" : ""}">
    <th class="harness__name" scope="row">
      ${title}
      <span class="harness__root" title="${esc(harness.project_root)}">${esc(
        harness.project_root,
      )}</span>
    </th>
    <td class="harness__counts">${chips}</td>
    <td class="harness__signals">${errorCell}${signalList}</td>
  </tr>`;
}

/** The full table of registered harnesses with their per-harness status counts
 *  and health signals. */
function harnessTableSection(harnesses: HarnessState[]): string {
  if (harnesses.length === 0) {
    return `<section class="fleet-section fleet-section--empty" aria-label="Registered harnesses">
      <h2 class="fleet-section__title">Harnesses</h2>
      <p class="empty">No harnesses registered. Register one with <code>node dist/toolbox.js register PATH</code>.</p>
    </section>`;
  }
  const rows = harnesses.map(harnessRow).join("");
  return `<section class="fleet-section" aria-label="Registered harnesses">
    <h2 class="fleet-section__title">Harnesses</h2>
    <div class="table-wrap">
      <table class="harness-table">
        <thead>
          <tr>
            <th scope="col">Harness</th>
            <th scope="col">Status counts</th>
            <th scope="col">Signals</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </section>`;
}

/**
 * Render the /fleet body from a parsed /api/state document. Pure: same input
 * always yields the same HTML, no I/O, no Date.now(). The "generated at"
 * timestamp is taken from state.generated_at so server and client renders
 * agree (no hydration drift from local clocks).
 */
export function renderFleetHtml(state: FleetState): string {
  const harnesses = Array.isArray(state.harnesses) ? state.harnesses : [];
  const generated = fmtTimestamp(state.generated_at);
  return `<header class="fleet-header">
      <p class="fleet-header__eyebrow">handyman toolBox</p>
      <h1 class="fleet-header__title">Fleet</h1>
      <p class="fleet-header__meta">Last refresh <bdi class="fleet-header__ts" data-generated="${esc(
        state.generated_at ?? "",
      )}">${generated}</bdi></p>
    </header>
    ${kanbanSection(state.fleet)}
    ${harnessTableSection(harnesses)}`;
}

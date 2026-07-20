/**
 * Pure HTML renderer for the /harness/[name] view (feature
 * toolbox_next_harness_view). Migrates the legacy panel's HarnessView
 * (handyman/assets/toolbox_panel.js) to the same string-renderer pattern
 * used by /fleet (feature toolbox_next_fleet_view, see fleetHtml.ts).
 *
 * Why a string renderer and not JSX? The same two load-bearing reasons as
 * fleetHtml.ts:
 *
 *   1. Testability without a Next build: the acceptance criterion asks for a
 *      test that verifies the render of /harness/[name] against a snapshot
 *      fixture with no network and no full Next build. A plain TS module that
 *      turns a state object into an HTML string is importable directly by a
 *      Node test; JSX is not, without running the whole apps/web toolchain.
 *      This keeps the parity oracle (feature 36) meaningful.
 *   2. SSE live updates without React reconciliation: the /events feed
 *      signals a change; the cheapest correct response is to re-fetch
 *      /api/state and swap the rendered region. Because every value below is
 *      text-escaped (harness text never becomes markup, same contract as
 *      toolbox_serve.ts), a full innerHTML replace of a read-only surface is
 *      safe and avoids a hydration mismatch between server and client.
 *
 * Security: every dynamic value is HTML-escaped via `esc()`. No attribute is
 * ever built from raw text. The string contains no <script>, no external
 * src, no inline event handler. The graphify <iframe> src is built from the
 * harness name (escaped into the URL path) pointing at the same-origin
 * /graph/NAME/graph.html served by the Node upstream.
 *
 * Design (design-taste-frontend, same skill used by toolbox_next_landing and
 * toolbox_next_fleet_view): one theme, one accent (terracotta-on-slate tokens
 * from globals.css), pill badges, 14px cards, 10px code/panel surfaces. The
 * page Theme Lock and Color Consistency Lock carry over from the landing
 * page: this module never introduces a second accent or a raw hex.
 */

/** Subset of /api/state.harnesses[i] that /harness/[name] renders. Loose on
 *  purpose: the upstream contract (buildState, handyman/src/toolbox_state.ts)
 *  adds more fields over time, and we only read what we display. */
export interface HarnessMetrics {
  throughput?: Record<string, number>;
  review_verdicts?: {
    approved?: number;
    changes_requested?: number;
    approval_rate?: number | null;
  };
  coverage?: {
    done?: number;
    with_reports?: number;
    missing?: string[];
  };
}

export interface HarnessFeature {
  id: number | null;
  name: string;
  title: string;
  status: string;
  sprint: string | null;
  blocked_reason?: string | null;
  depends_on?: number[];
}

export interface HarnessSession {
  feature?: string | null;
  status?: string | null;
  role?: string | null;
  updated?: string | null;
}

export interface HarnessSnapshot {
  project_root: string;
  project_name: string;
  error?: string | null;
  workspace?: string;
  status_counts?: Record<string, number>;
  signals?: Array<{ signal: string; detail: string }>;
  features?: HarnessFeature[];
  has_graph?: boolean;
  metrics?: HarnessMetrics | null;
  session?: HarnessSession | null;
  version?: {
    installed?: string | null;
    current?: string | null;
    behind?: boolean | null;
  };
  last_closure?: string | null;
}

export interface HarnessState {
  generated_at?: string;
  harnesses?: HarnessSnapshot[];
  fleet?: { harnesses: number; unreadable: number; status_counts: Record<string, number> };
}

/** Status order is part of the contract (STATUSES in toolbox.ts): pending,
 *  in_progress, done, blocked. Keeping it here lets the kanban columns and
 *  the per-harness counts render in a stable, expected order. */
const STATUS_ORDER = ["pending", "in_progress", "done", "blocked"] as const;

/** Human labels for the status tokens used as kanban columns + chips. */
const STATUS_LABEL: Record<string, string> = {
  pending: "pending",
  in_progress: "in progress",
  done: "done",
  blocked: "blocked",
};

/** Domain docs exposed as quick-view buttons (mirrors DOC_FILES in the legacy
 *  panel). A missing file stays listed; the /api/md dialog surfaces the fetch
 *  error if the doc does not exist. */
const DOC_FILES = ["business", "architecture", "conventions", "verification"] as const;

/** Markdown links rendered above Docs (mirrors mdLinks in the legacy panel):
 *  the operational artifacts every harness ships. The first tuple entry is the
 *  /api/md `file` token and MUST be one the core's MD_TOKENS publishes, NOT a
 *  filename - resolveMd maps the token to the real path, so "current.md" is
 *  rejected with 400. This renderer stays import-free (the suites transpile it
 *  standalone), so the coupling is pinned by a test instead: see
 *  test_web_harness.sh "harnessHtml /api/md tokens are all accepted by core
 *  resolveMd". The label is what the button shows. */
const MD_LINKS: ReadonlyArray<readonly [string, string]> = [
  ["current", "current"],
  ["history", "history"],
  ["checkpoints", "checkpoints"],
  ["index", "workspace MOC"],
];

/** Window (in days) for the "closures" KPI + sparkline, matching the legacy
 *  MetricsStrip's `const days = 14`. */
const THROUGHPUT_DAYS = 14;

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

/** Format an ISO timestamp as a short "YYYY-MM-DD" date for the last-closure
 *  line. Returns the raw string if it is not parseable, and "none" when empty
 *  so the meta-list never shows a blank. */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) {
    return "none";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return esc(iso);
  }
  const pad = (n: number): string => String(n).padStart(2, "0");
  return esc(
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`,
  );
}

/** Encode a harness name into a /graph/<name>/graph.html path segment safely.
 *  Uses encodeURIComponent for the path piece; the renderer only ever
 *  interpolates the result into an <iframe src> attribute, and esc() would
 *  double-encode it, so this returns the raw encoded segment. */
function graphSrc(name: string): string {
  return `/graph/${encodeURIComponent(name)}/graph.html`;
}

/** Sum the last N days of throughput (date keys are "YYYY-MM-DD"). Returns 0
 *  when throughput is missing or empty. Mirrors the legacy panel's
 *  `lastDaysSeries(metrics.throughput, days).reduce(...)`. */
function recentClosures(throughput: Record<string, number> | undefined, days: number): number {
  if (!throughput) {
    return 0;
  }
  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - (days - 1));
  let total = 0;
  for (const [key, value] of Object.entries(throughput)) {
    const d = new Date(key);
    if (Number.isNaN(d.getTime())) {
      continue;
    }
    if (d.getTime() >= cutoff.getTime()) {
      total += Number(value) || 0;
    }
  }
  return total;
}

/** Build an inline SVG sparkline of the last N days of throughput. Each bar
 *  is a thin rounded rect; the height is proportional to the day's count
 *  relative to the peak. Zero days render as a flat baseline so an idle
 *  harness still shows a calm, readable strip (not a hole). The SVG carries
 *  no external src and no script: it is a static <svg> with <rect> children,
 *  which keeps the "no external assets" invariant. */
function sparkline(throughput: Record<string, number> | undefined, days: number): string {
  const series: number[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    const pad = (n: number): string => String(n).padStart(2, "0");
    const key = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    series.push(Number(throughput?.[key] ?? 0) || 0);
  }
  const width = 120;
  const height = 28;
  const gap = 1;
  const barWidth = (width - gap * (series.length - 1)) / series.length;
  const peak = Math.max(1, ...series);
  const bars = series
    .map((value, index) => {
      const h = Math.round((value / peak) * height);
      const x = index * (barWidth + gap);
      const y = height - h;
      return `<rect class="spark__bar" x="${esc(x.toFixed(2))}" y="${esc(
        y.toFixed(2),
      )}" width="${esc(barWidth.toFixed(2))}" height="${esc(h.toFixed(2))}" rx="1.5"></rect>`;
    })
    .join("");
  return `<svg class="spark" viewBox="0 0 ${esc(width)} ${esc(
    height,
  )}" preserveAspectRatio="none" aria-hidden="true">${bars}</svg>`;
}

/** The KPI strip: approval rate, report coverage, closures (14d), and the
 *  throughput sparkline. Mirrors the legacy panel's MetricsStrip + Kpi. When
 *  metrics are null (unreadable harness), the strip degrades to a single
 *  note instead of four empty cards. */
function metricsStrip(metrics: HarnessMetrics | null | undefined): string {
  if (!metrics) {
    return `<p class="kpi-note">metrics unavailable - the harness state could not be read</p>`;
  }
  const rate = metrics.review_verdicts?.approval_rate ?? null;
  const coverage = metrics.coverage ?? {};
  const done = Number(coverage.done ?? 0);
  const withReports = Number(coverage.with_reports ?? 0);
  const closures = recentClosures(metrics.throughput, THROUGHPUT_DAYS);
  const rateText = rate === null ? "n/a" : `${Math.round(rate * 100)}%`;
  return `<div class="kpis">
    <p class="kpi"><span class="kpi__value">${esc(rateText)}</span><span class="kpi__label">approval rate</span></p>
    <p class="kpi"><span class="kpi__value">${esc(withReports)}/${esc(done)}</span><span class="kpi__label">report coverage (done)</span></p>
    <p class="kpi"><span class="kpi__value">${esc(closures)}</span><span class="kpi__label">closures (${THROUGHPUT_DAYS}d)</span></p>
    <p class="kpi kpi--spark">${sparkline(metrics.throughput, THROUGHPUT_DAYS)}<span class="kpi__label">throughput (${THROUGHPUT_DAYS}d)</span></p>
  </div>`;
}

/** Health signals row: one pill per signal, or a single calm "no signals" pill
 *  when the harness is healthy. Mirrors the legacy panel's Badge row. */
function signalsRow(signals: Array<{ signal: string; detail: string }> | undefined): string {
  const list = signals ?? [];
  if (list.length === 0) {
    return `<p class="signals"><span class="pill pill--ok">OK (no signals)</span></p>`;
  }
  const pills = list
    .map(
      (signal) =>
        `<span class="pill pill--warn"><b class="pill__tag">${esc(
          signal.signal,
        )}</b>: ${esc(signal.detail)}</span>`,
    )
    .join("");
  return `<p class="signals">${pills}</p>`;
}

/** The meta-list: root, version, session, last closure. Reads like a debug
 *  header so an engineer can confirm which harness they are looking at. */
function metaList(harness: HarnessSnapshot): string {
  const installed = harness.version?.installed ?? null;
  const current = harness.version?.current ?? null;
  const versionText = installed
    ? current
      ? `${installed}${harness.version?.behind ? ` (behind ${current})` : ""}`
      : installed
    : "unknown";
  const session = harness.session ?? null;
  const sessionText = session?.feature
    ? `${esc(session.feature)}${session.status ? ` (${esc(session.status)})` : ""}`
    : "idle";
  return `<ul class="meta-list">
    <li><span class="meta-list__key">root</span><span class="meta-list__val" title="${esc(
      harness.project_root,
    )}">${esc(harness.project_root)}</span></li>
    <li><span class="meta-list__key">version</span><span class="meta-list__val">${esc(
      versionText,
    )}</span></li>
    <li><span class="meta-list__key">session</span><span class="meta-list__val">${sessionText}</span></li>
    <li><span class="meta-list__key">last closure</span><span class="meta-list__val">${fmtDate(
      harness.last_closure,
    )}</span></li>
  </ul>`;
}

/** A markdown quick-view button. The token is the /api/md `file` argument; the
 *  label is what the button shows. data-api-md + data-root drive the
 *  HarnessLive dialog opener (no inline handler: the attribute is read by the
 *  client's addEventListener). */
function mdButton(root: string, token: string, label: string): string {
  return `<button type="button" class="md-btn" data-api-md="${esc(token)}" data-root="${esc(
    root,
  )}">${esc(label)}</button>`;
}

/** Kanban column for one status: header (label + count) and the list of
 *  features in that status. The "in progress" column is the "features
 *  corriendo" surface the brief calls out; the others give it context. */
function kanbanColumn(status: string, features: HarnessFeature[]): string {
  const inStatus = features.filter((feature) => feature.status === status);
  const count = inStatus.length;
  const cards = inStatus
    .map((feature) => {
      const idText = feature.id === null ? "-" : `#${feature.id}`;
      const blocked =
        status === "blocked" && feature.blocked_reason
          ? `<span class="card__blocked">${esc(feature.blocked_reason)}</span>`
          : "";
      const sprint =
        feature.sprint && feature.sprint !== null
          ? `<span class="card__sprint">${esc(feature.sprint)}</span>`
          : "";
      return `<li class="card card--${esc(status)}">
        <p class="card__title"><span class="card__id">${esc(idText)}</span>${esc(
          feature.title || feature.name,
        )}</p>
        <p class="card__name">${esc(feature.name)}</p>
        ${sprint}${blocked}
      </li>`;
    })
    .join("");
  return `<section class="kanban__column kanban__column--${esc(status)}" aria-label="${esc(
    STATUS_LABEL[status] ?? status,
  )} column">
    <header class="kanban__column-head">
      <span class="kanban__column-label">${esc(STATUS_LABEL[status] ?? status)}</span>
      <bdi class="kanban__column-count">${esc(count)}</bdi>
    </header>
    <ul class="kanban__column-body">${cards}</ul>
  </section>`;
}

/** The Queue: four kanban columns (pending / in progress / done / blocked).
 *  Empty when the harness has no feature_list.json. */
function queueSection(features: HarnessFeature[] | undefined): string {
  const list = Array.isArray(features) ? features : [];
  if (list.length === 0) {
    return `<section class="queue queue--empty" aria-label="Feature queue">
      <h2 class="section-title">Queue</h2>
      <p class="empty">no features in feature_list.json</p>
    </section>`;
  }
  const columns = STATUS_ORDER.map((status) => kanbanColumn(status, list)).join("");
  return `<section class="queue" aria-label="Feature queue">
    <h2 class="section-title">Queue</h2>
    <div class="kanban">${columns}</div>
  </section>`;
}

/** The graphify knowledge-graph iframe. Rendered only when the harness ships a
 *  graphify export (has_graph); otherwise a calm empty state pointing at the
 *  /graphify command. Same iframe contract as the legacy panel. */
function graphSection(name: string, hasGraph: boolean | undefined): string {
  if (!hasGraph) {
    return `<section class="graph graph--empty" aria-label="Knowledge graph">
      <h2 class="section-title">Knowledge graph</h2>
      <p class="empty">no graphify export yet (run <code>/graphify</code> in the project to build one)</p>
    </section>`;
  }
  return `<section class="graph" aria-label="Knowledge graph">
    <h2 class="section-title">Knowledge graph</h2>
    <iframe class="graph__frame" title="graphify knowledge graph for ${esc(
      name,
    )}" src="${esc(graphSrc(name))}" loading="lazy"></iframe>
  </section>`;
}

/**
 * Render the /harness/[name] body from a parsed /api/state document and the
 * harness name. Pure: same input always yields the same HTML, no I/O, no
 * Date.now() (the throughput window is anchored on the current UTC day, which
 * is deterministic within a single render pass and matches the legacy panel).
 *
 * Returns an empty-state string when the harness is unknown or unreadable so
 * the page degrades instead of crashing.
 */
export function renderHarnessHtml(state: HarnessState, name: string): string {
  const harnesses = Array.isArray(state.harnesses) ? state.harnesses : [];
  const harness = harnesses.find((entry) => entry.project_name === name);
  if (!harness) {
    return `<header class="harness-header">
        <p class="harness-header__eyebrow">handyman toolBox</p>
        <h1 class="harness-header__title">${esc(name)}</h1>
      </header>
      <p class="empty" role="note">unknown harness: ${esc(name)}</p>`;
  }
  if (harness.error) {
    return `<header class="harness-header">
        <p class="harness-header__eyebrow">handyman toolBox</p>
        <h1 class="harness-header__title">${esc(name)}</h1>
      </header>
      <p class="error" role="alert">ERROR: ${esc(harness.error)}</p>`;
  }
  const root = harness.project_root || "";
  const mdLinks = MD_LINKS.map(([token, label]) => mdButton(root, token, label)).join("");
  const docs = DOC_FILES.map((doc) =>
    mdButton(root, `docs:${doc}.md`, doc),
  ).join("");
  return `<header class="harness-header">
      <p class="harness-header__eyebrow">handyman toolBox</p>
      <h1 class="harness-header__title">${esc(name)}</h1>
      <p class="harness-header__meta">Last refresh <bdi class="harness-header__ts">${fmtDate(
        state.generated_at,
      )}</bdi></p>
    </header>
    ${metaList(harness)}
    ${metricsStrip(harness.metrics)}
    ${signalsRow(harness.signals)}
    <section class="md-links" aria-label="Workspace artifacts">
      <h2 class="section-title">Workspace</h2>
      <div class="md-links__row">${mdLinks}</div>
    </section>
    <section class="docs" aria-label="Domain docs">
      <h2 class="section-title">Docs</h2>
      <div class="md-links__row">${docs}</div>
    </section>
    ${queueSection(harness.features)}
    ${graphSection(name, harness.has_graph)}`;
}

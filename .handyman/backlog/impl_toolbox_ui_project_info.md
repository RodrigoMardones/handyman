---
feature: toolbox_ui_project_info
status: implemented
role: implementer
updated: 2026-07-17
tags: [handyman/role/implementer, handyman/feature/toolbox_ui_project_info]
---

# Implementation Report: toolbox_ui_project_info

Plan A of `docs/analisis-ui-observador-toolbox.md`: expose in the harness
detail view what `metrics.collect()` already computes (KPI strip + hand-rolled
SVG sparkline), add a Docs quick-view section over the existing `/api/md`
whitelist, and render dates relative with the absolute in `title` (port of the
legacy `fmt.*` layer).

## Files Changed

- `handyman/src/toolbox_serve.ts`:
  - `snapshotMetrics()` + per-harness `metrics` key in `/api/state`. Zero
    duplicated logic: `harnessSnapshot()` already spreads `collect()` output
    (throughput/review_verdicts/coverage) into each snapshot, so the server
    only regroups those three fields under `metrics`; it degrades to `null`
    when the harness was unreadable (`collect()` never ran, fields absent).
  - `PANEL_CSS`: `.kpis`/`.kpi`/`.sparkline` rules, `--hw-*` tokens only
    (sparkline color is `var(--hw-accent)` consumed via `currentColor`).
- `handyman/assets/toolbox_panel.js`:
  - `fmt` helper (`parse`/`rel`) — relative deltas ("3d ago", "2h ago");
    date-only stamps parse as local midnight; unparseable or future values
    fall back to the raw string. `RelDate` renders the relative text with the
    absolute value in `title`.
  - `SessionLine` component replaces the `sessionLine()` string so the
    session's `updated` date is also relative+titled (fleet table + detail).
  - `Sparkline`: single hand-rolled `<polyline>` over a zero-filled 14-day
    UTC series from `metrics.throughput`; `role="img"` +
    `aria-label="throughput sparkline: N closure(s) in the last 14 days"`;
    `stroke="currentColor"`, no chart library.
  - `MetricsStrip` (KPI strip): approval rate (`n/a` when null), report
    coverage (`with_reports/done done`), closures last 14 days, sparkline.
    Renders "metrics unavailable" when the block is null.
  - Docs section: business/architecture/conventions/verification buttons via
    the existing `onOpenMd(root, "docs:<name>.md", …)` → `/api/md` mechanism
    and the existing md dialog.
  - `TimelineView` dates and `last closure` (fleet row + detail meta) go
    through `RelDate`.
- `tests/test_toolbox_serve.sh` (new cases only; no existing assertion
  edited): fixture gains `backlog/review_alpha.md` (status: approved); TS2b
  asserts the `/api/state` metrics payload (keys present,
  `throughput["2026-06-01"] === 1`, numeric `approval_rate === 1`,
  `coverage.done/with_reports === 1`); TS3b asserts `docs:business.md` serves
  200 with content and a missing `docs:architecture.md` 404s; a panel-asset
  case asserts the sparkline markers (`<polyline`, `role="img"`,
  `aria-label`) and the `fmt` helper ship.

## Key Decisions

- **Missing doc degrade (criterion 3, "your call")**: missing docs stay
  listed; clicking one opens the dialog with the fetch error text —
  `openMd`'s catch now shows `(not available: 404)` instead of the opaque
  `(not available)`. Filtering would have required the server to stat four
  files per harness on every `/api/state`; the 404-in-dialog path costs
  nothing and tells the human *why*.
- **`metrics` groups existing snapshot fields instead of calling
  `collect()` again** — same logic by construction, one disk pass, and the
  unreadable-harness `null` falls out of the existing degradation.
- **Sparkline window = 14 days, zero-filled** (matches the "closures last
  14d" KPI and the STALE signal window) rather than plotting only dates with
  closures — gaps are the signal a sparkline exists to show.

## Test Output

`./init.sh` → exit 0, `ALL SUITES PASSED`, `VERIFIER: all gates passed`.

```text
toolBox observer suite (test_toolbox_serve.sh)
  PASS serve boots on an ephemeral port and prints the URL
  PASS GET / returns the React panel with root div and the four vendor scripts
  PASS panel asset is valid JS (node --check)
  PASS panel asset ships the sparkline (accessible polyline) and fmt helpers
  PASS /api/state carries snapshots, signals, features, fleet and timeline
  PASS /api/state carries per-harness metrics (throughput, verdicts, coverage)
  PASS /api/md serves whitelisted files and refuses everything else
  PASS /api/md serves docs:<name>.md and 404s a doc the harness lacks
  PASS /api/corpus indexes features, progress, backlog and docs
  PASS /graph serves the harness graphify export and 404s the unknown
  PASS vendor libs (react, react-dom, htm, minisearch) serve from node_modules
  PASS observer is read-only (POST 405) and refuses foreign Host headers
  PASS SSE emits a change event when the workspace mutates
Summary: 13 run, 13 passed, 0 failed
```

Additionally smoke-rendered the panel with ReactDOMServer + stubbed browser
globals (scratchpad, not committed): harness detail, broken harness, timeline
and fleet views all render; sparkline emits the expected polyline/aria-label;
relative dates carry the absolute in `title`.

## For the Reviewer

- `npm run lint` is green for the touched files; the 23 pre-existing
  `noNonNullAssertion` warnings in `src/feature.ts` were there before and are
  untouched.
- The panel isn't biome-linted (`files.includes` is `src/**`); it is gated by
  `node --check` + the marker greps in the suite.
- `Sparkline`/`lastDaysSeries` use UTC day keys (`toISOString`), consistent
  with how `buildState` computes `today`; `fmt.parse` uses local midnight for
  display deltas — a deliberate mismatch (display vs bucketing) worth a look.
- Security model untouched: GET-only, same-origin fetches, all new dynamic
  content rendered as React text children.

---
feature: toolbox_ui_project_info
status: approved
role: reviewer
updated: 2026-07-17
tags: [handyman/role/reviewer, handyman/feature/toolbox_ui_project_info]
---

# Review: toolbox_ui_project_info (#19, Plan A)

**Verdict: APPROVED**

Scope reviewed: uncommitted diff on `feat/toolbox-ui-observer` touching
`handyman/src/toolbox_serve.ts`, `handyman/assets/toolbox_panel.js`,
`tests/test_toolbox_serve.sh`, `.handyman/feature_list.json` (features 19-23
added by planning; 19 `in_progress`). `handyman/src/metrics.ts` is untouched —
correctly so (see criterion 1).

## Verification performed

1. Read impl report, design doc (`docs/analisis-ui-observador-toolbox.md` §1-2
   + Plan A), `.handyman/docs/{conventions,architecture,verification}.md`
   (no CHECKPOINTS.md exists in `.handyman/`).
2. Inspected the full diff and the surrounding untouched code
   (`harnessSnapshot`/`snapshots` in `toolbox.ts`, `collect()` in
   `metrics.ts`, `resolveMd` in `toolbox_serve.ts`).
3. Ran `./init.sh` from repo root: **exit 0**, `ALL SUITES PASSED`,
   `VERIFIER: all gates passed`; toolbox_serve suite `13 run, 13 passed`.
4. Independent smoke (ReactDOMServer over the real panel source, not the
   implementer's script): rendered `MetricsStrip` with fixture metrics, the
   null path, `RelDate` with a hostile payload, and exercised `fmt.rel`
   boundary cases directly.

## Per-criterion check

### 1. /api/state per-harness metrics reusing collect() — PASS
`snapshotMetrics()` (toolbox_serve.ts:126) only destructures
`throughput`/`review_verdicts`/`coverage` off the `Snapshot`, which
`harnessSnapshot()` populates via `Object.assign(snapshot, collect(rootStr))`
(toolbox.ts). Zero duplicated logic — the panel numbers are by construction
the exact objects the `metrics` CLI prints. Null degradation: when the root
is not a directory `harnessSnapshot` returns early, the three fields are
absent, `snapshotMetrics` returns `null`, and the panel shows
"metrics unavailable" (smoke-verified). TS2b asserts the payload shape and
values (`throughput["2026-06-01"]===1`, `approval_rate===1`,
`coverage.done/with_reports===1`) against the live server.

### 2. KPI strip + hand-rolled sparkline — PASS
`MetricsStrip` renders approval rate (`n/a` on null rate — verified: rate 0
would render "0%", not "n/a", since the guard is `rate === null`), report
coverage (`with_reports/done done`), closures last 14 days, and `Sparkline`:
exactly one `<polyline>`, no chart library, no new dependency (package.json
untouched, per architecture dependency policy). `role="img"` +
`aria-label="throughput sparkline: N closure(s) in the last 14 days"`
confirmed in rendered output. Color is `stroke="currentColor"` with
`.sparkline { color: var(--hw-accent) }`; all new CSS uses `--hw-*` tokens
only, no raw hex. Zero-filled 14-day series; `step` divides by
`series.length - 1 = 13`, no division-by-zero (days is the constant 14).
Rendered polyline verified: 14 points, correct scaling within the
120x28 viewBox.

### 3. Docs quick-view buttons — PASS
`DOC_FILES` (business/architecture/conventions/verification) render as
buttons calling the pre-existing `onOpenMd(root, "docs:<name>.md", ...)` →
`/api/md` path; `resolveMd` already whitelists `docs:<name>` behind
`MD_NAME_RE` and joins under the workspace (no traversal surface added).
Graceful degradation: missing doc → 404 → dialog shows
`(not available: 404)` (improved from the opaque `(not available)`; the
change is additive, existing behavior for other errors preserved). TS3b
asserts the 200-with-content and 404 paths.

### 4. Relative dates with absolute in title — PASS
`fmt.parse`/`fmt.rel` + `RelDate` applied to timeline dates, fleet
last-closure, detail meta, and session `updated` (fleet + detail).
Boundary math verified by direct execution: `3d ago`, `just now` (<1m),
`3h ago`, `14mo ago`; future stamps and unparseable strings fall back to the
raw value; null → "?"/"none" preserving the old placeholders. Date-only
stamps parse as local midnight (correct for display deltas). Absolute value
lands in `title` (verified in rendered output).

### 5. Tests — PASS
`git diff` on `tests/test_toolbox_serve.sh` contains **zero removed lines**:
existing assertions are untouched. New: fixture `backlog/review_alpha.md`,
TS2b (metrics payload), TS3b (docs quick-view), panel-asset sparkline/fmt
marker case. Suite green inside a green `./init.sh` (exit 0).

## Security check (observer must stay read-only)

- No new endpoints, no writes, GET-only/Host-check/registry-allowlist code
  untouched.
- All new dynamic client content is React children or props — no
  `dangerouslySetInnerHTML`, no string-built markup. Hostile-input smoke:
  `"><img src=x onerror=alert(1)>` as a date renders fully escaped in both
  the `title` attribute (`&quot;&gt;...`) and text content.
- Sparkline SVG interpolations are all locally computed numbers
  (`points` from `toFixed(1)`, `aria-label` from a numeric reduce/constant);
  no untrusted string ever reaches SVG markup.
- `e.message` in the md-dialog fallback is a self-constructed status string
  or a browser network-error message, rendered as an escaped text child.

## Issues found

1. **[Low, cosmetic — accepted]** Timezone edge: harness stamps are UTC
   dates (`toISOString().slice(0,10)`) while `fmt.parse` treats date-only as
   local midnight. West of UTC in the evening, a same-day closure carries
   tomorrow's UTC date, parses as a future local time, and `rel()` falls back
   to showing the raw absolute date — graceful, never wrong data, self-heals
   within hours. Disclosed by the implementer. Not blocking.
2. **[Low — accepted]** The `metrics: null` degradation path has no
   automated test (fixture has only one healthy harness); acceptance only
   requires the metrics payload be covered, and I verified the null path by
   direct render ("metrics unavailable"). Worth a broken-harness fixture in
   a future test-hardening pass.
3. **[Info]** React dev-mode warns `Invalid DOM property 'class'` when
   server-rendering; the whole pre-existing panel uses `class` via htm and
   renders correctly in the browser — not a regression of this diff.

## Convention/architecture conformance

- No new external dependency (architecture §2). Read-only observation
  preserved (toolbox contract). Biome lint green for touched `src/**`;
  panel gated by `node --check` + marker asserts as before. Exit-code
  contracts untouched. Black-box suite extended, never adapted
  (verification anti-pattern avoided).

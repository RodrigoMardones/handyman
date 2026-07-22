---
type: Implementation Log
feature: toolbox_next_harness_view
id: 41
status: implemented
role: implementer
updated: 2026-07-18
tags: [handyman/backlog, handyman/impl]
---

# Impl: toolbox_next_harness_view

> Second migrated view in apps/web: the per-harness drill-down that the
> legacy UMD panel calls HarnessView. Server Component resolves the fleet
> state from the upstream /api/state, picks the requested harness by
> project_name, and renders the same format as the panel - meta-list
> (root / version / session / last closure), the MetricsStrip (approval
> rate, report coverage, closures 14d, throughput sparkline), the signals
> row, the Workspace + Docs markdown quick-view buttons (opened via /api/md
> in a client-side dialog), the Queue/Kanban by status (pending / in
> progress / done / blocked - the "features corriendo"), and the graphify
> knowledge-graph iframe when the harness ships an export. A Client
> Component subscribes to the upstream /events SSE feed and swaps the
> rendered region in place on every change tick.
>
> Pattern reuse: this feature is a direct sibling of toolbox_next_fleet_view
> (39). Same RSC + SSE + pure-string-renderer shape, same design-taste-
> frontend discipline (native CSS + CSS Modules, terracotta-on-slate tokens
> from globals.css, zero new dependencies, one accent, Page Theme Lock +
> Color Consistency Lock inherited from the landing page), same SSE-direct-
> to-Node-port rationale (Next's fallback rewrite buffers SSE), same
> upstream-unreachable graceful degradation. The skill set is exactly the
> one used by 38 (scaffold) and 39 (fleet), as the brief required.

## Design read (tasteskill v2 section 0.B)

Reading this as a per-harness dashboard for the same engineers running
multi-agent coding workflows, one level deeper than /fleet: where /fleet
is the overview table, /harness/[name] is the cockpit for one harness.
Same calm technical language, native CSS plus CSS Modules, the existing
terracotta-on-slate palette, zero new dependencies.

Dials (section 1, derived from the dashboard/dev-tool signal rows, dialed
against the "data table" caveat): DESIGN_VARIANCE 5 (meta grid + KPI strip
+ kanban grid + iframe - four distinct families, same predictability reward
as /fleet), MOTION_INTENSITY 3 (one CSS pulse on the live dot, the same as
/fleet), VISUAL_DENSITY 6 (cockpit-leaning: dense KPI values, tabular
numerals, tight kanban cells, meta grid).

Design system (section 2): same honest native-CSS aesthetic as /fleet,
labeled here rather than claimed as a named framework.

## Tasteskill v2 Pre-Flight Check (section 14)

[PASS] Brief inference declared - the "Reading this as" line above.
[PASS] Dial values explicit and reasoned - VARIANCE 5 / MOTION 3 / DENSITY 6,
  same rationale as /fleet; motion kept low because the surface rewards calm.
[PASS] Design system chosen or aesthetic labeled honestly - native CSS +
  CSS Modules, labeled above, no framework claimed.
[PASS] Redesign mode detected and audited - greenfield route /harness/[name];
  the legacy UMD HarnessView is explicitly left intact (strangler).
[PASS] ZERO em-dashes or en-dashes anywhere - enforced by test_web_harness.sh
  TWH2 (same node scan as /fleet; macOS grep has no -P).
[PASS] Page Theme Lock - one prefers-color-scheme block in globals.css,
  unchanged; /harness/[name] adds no second theme override.
[PASS] Color Consistency Lock - one accent (terracotta) reused across the live
  dot, in_progress cards/chips, warn pills, md-btn hover, focus ring; no
  second hue.
[PASS] Shape Consistency Lock - pill badges/chips/buttons, 14px
  cards/kanban/meta cells, 10px panel/code surfaces; follows the radius rule.
[PASS] Button Contrast Check - md-btn uses border + text on bg-elevated with
  accent hover; dialog-close same pattern; nav active pill on-accent fill.
[PASS] CTA Button Wrap - no marketing CTAs; nav links + md-btn are short
  labels, no max-width constraint.
[PASS] Form Contrast Check - not applicable, the only form-like control is
  the md-btn (a button, not an input).
[PASS] Serif discipline - not applicable, no serif; system sans reused.
[PASS] Premium-consumer palette check - not a premium-consumer brief;
  terracotta-on-slate already avoids the banned beige/brass family.
[PASS] Italic descender clearance - not applicable, no italic display type.
[PASS] Hero fits the viewport - not a hero page; the harness header (eyebrow
  + title + meta) is compact, the meta grid sits immediately below.
[PASS] Hero top padding capped - not applicable (no hero); page top padding
  is var(--space-5).
[PASS] Hero stack discipline - not applicable (no hero); the harness header
  is eyebrow + title + meta, three short elements.
[PASS] Eyebrow count within the mechanical ceiling - exactly one eyebrow
  ("handyman toolBox") on the whole view.
[PASS] Split-Header Ban - the harness header stacks eyebrow/title/meta at
  full measure; no floating corner paragraph.
[PASS] Zigzag Alternation Cap - no image-beside-text split anywhere.
[PASS] No Duplicate CTA Intent - the three nav entries (Fleet, Harness,
  Panel) are distinct destinations.
[PASS] Logo wall is logo only - not applicable.
[PASS] Bento Background Diversity - not applicable; the kanban cells are
  uniform data tiles.
[PASS] Trusted-by logo wall under hero - not applicable.
[PASS] Copy Self-Audit - every visible string re-read; "Last refresh" reads
  a UTC date; the empty states name the exact command (/graphify, etc.).
[PASS] Motion motivated - the only motion is the live-dot pulse (signals
  live state), disabled under prefers-reduced-motion via CSS.
[PASS] Marquee max one per page - zero marquees.
[PASS] Navigation on one line - one 68px row, three links plus wordmark,
  collapses under 640px.
[PASS] Section-Layout-Repetition check - four regions (header stack, meta
  grid, KPI strip, kanban grid) of four distinct layout families, plus the
  iframe; no repeated layout family.

## Files

Created:
- apps/web/app/harness/harnessHtml.ts - Pure, dependency-free renderer.
  `renderHarnessHtml(state, name) -> htmlString`. Mirrors fleetHtml.ts:
  every dynamic value is HTML-escaped via esc(); no <script>, no external
  src, no inline handler. The graphify <iframe> src is built from
  encodeURIComponent(name) pointing at the same-origin /graph/NAME/graph.html.
  Exports the HarnessState / HarnessSnapshot / HarnessMetrics interfaces the
  page + client share. Renders: meta-list, MetricsStrip (KPIs + an inline
  SVG throughput sparkline, no deps), signals pills, Workspace + Docs
  md-buttons (data-api-md + data-root attributes drive the client dialog),
  Queue/Kanban by status, graphify section (iframe or empty state).
  Degrades to an empty-state string for unknown / errored harness.
- apps/web/app/harness/[name]/page.tsx - Server Component. Awaits params,
  decodes the name, fetches `${TOOLBOX_UPSTREAM}/api/state` with
  cache:"no-store" at request time, renders a sticky nav (Fleet / Harness /
  Panel) + an upstream-unreachable banner + <HarnessLive> with the resolved
  events/state/md URLs and the requested name.
- apps/web/components/HarnessLive.tsx - Client Component ("use client").
  Opens an EventSource on the upstream /events URL, re-fetches /api/state on
  every message, and swaps the region's innerHTML with renderHarnessHtml.
  Status dot (live/connecting/stale) + auto-reconnect. Also owns the
  markdown quick-view dialog: a delegated click handler on the region reads
  data-api-md + data-root, fetches /api/md?root=&file=, and renders the body
  as preformatted ESCAPED text inside <pre>. Per the toolbox_serve.ts
  security model ("harness text never becomes markup"), the dialog never
  interprets the body as HTML - zero markdown deps, zero XSS surface.
- apps/web/app/harness/[name]/page.module.css - Page styles. Reuses
  globals.css tokens only (no raw hex, no second accent). The nav shell is
  the same language as /fleet. Generated classes are scoped to .harness via
  :global() so the page shell stays module-scoped.
- tests/test_web_harness.sh - 11 cases (TWH1-TWH8): files exist; zero
  em-dashes/en-dashes across apps/web; renderHarnessHtml renders fixture
  data (meta-list, KPIs, signals, docs buttons, every kanban column, the
  running feature, blocked reason, graphify iframe when has_graph, graphify
  empty when not, no external src, no injected script); degrades on
  unknown/errored harness; renderer is deterministic; proxy.ts steals
  /harness/* into Next; HarnessLive subscribes to upstream /events; HarnessLive
  wires the /api/md dialog.

Modified:
- apps/web/proxy.ts - Added NEXT_HANDLED_PREFIXES = ["/harness/"] and a
  prefix-match branch in proxy(). /harness/<anything> is now served by Next,
  never forwarded to the Node upstream. The exact-name set ("/", "/fleet")
  is unchanged. The strangler comment documents both sides (prefix entry +
  app/harness/[name]/page.tsx).
- tests/run_tests.sh - wired test_web_harness.sh after test_web_fleet.sh.

## Acceptance coverage

1. GET /harness/[name] renders the real harness snapshot resolved server-
   side: VERIFIED via `next build` - the route map lists `f /harness/[name]`
   (Dynamic, server-rendered on demand), i.e. served by Next, not proxied.
   tsc --noEmit and `next build` both pass. The render contract (meta-list,
   MetricsStrip, signals, Docs, Queue/Kanban by status, graphify iframe when
   has_graph) is asserted by test_web_harness.sh TWH3 against a fixture.
2. Live SSE refresh: HarnessLive opens EventSource on the upstream /events
   URL and re-fetches + swaps on each message (TWH7). SSE points at the Node
   upstream port, never the Next port (Next's fallback rewrite buffers SSE -
   documented in proxy.ts and the plan), same as /fleet.
3. No external assets: VERIFIED - the render test asserts `src="http` and
   `<script` are both absent from the rendered HTML; grep on apps/web source
   shows no external src. Same invariant as /fleet and the legacy panel.
4. Legacy UMD panel intact + test_toolbox_serve.sh unchanged: VERIFIED -
   ALL SUITES PASSED with zero assertion edits (toolbox_serve 48/48,
   landing 3/3, fleet 9/9, harness 11/11, plus all other suites).
5. Test against a fixture, no network: VERIFIED - test_web_harness.sh TWH3
   transpiles harnessHtml.ts with the project's own typescript and runs it
   against a state fixture in-process; TWH4 covers the unknown/errored
   degrade paths; TWH5 asserts determinism.
6. proxy.ts steals /harness/<name> into Next + app/harness/[name]/page.tsx
   exists: VERIFIED - TWH1 + TWH6.
7. run_tests.sh passes and ./init.sh exits 0: VERIFIED - ALL SUITES PASSED;
   ./init.sh preflight status: ok, exit 0.

## Notes / decisions

- Pure string renderer vs JSX: chosen for the same two reasons as /fleet -
  testability without a Next build, and clean SSE reconciliation (swap
  innerHTML on a read-only surface; safe because all values are escaped).
- The markdown quick-view dialog renders /api/md body as preformatted
  ESCAPED text, not via marked+DOMPurify. This is deliberately simpler than
  the legacy panel and matches design-taste-frontend's "zero new
  dependencies" constraint: React escapes the string inside <pre> by
  default, so harness text never becomes markup (same security contract as
  toolbox_serve.ts). The panel's marked pipeline stays untouched on the
  Node port; this Next view ships a read-only text preview.
- The throughput sparkline is an inline <svg> with <rect> bars built from
  the last 14 days of metrics.throughput. No chart library, no external
  asset; the "no external src" invariant holds.
- proxy.ts gained a prefix list (NEXT_HANDLED_PREFIXES) because /harness/
  [name] is dynamic: a single exact-name entry could not cover every
  harness name. The match uses a "/" boundary so "/harnessx" would NOT
  match - the prefix is precise.
- SSE goes straight to the Node upstream, never the Next port. The server
  passes the resolved eventsUrl down; the client never guesses the port.
- Verified the known cache_control tool-rendering artifact is output-only:
  grep -c against every edited/created file returned 0 on disk (per the
  standing note in user memory). The artifact is visible in terminal/
  read_file output but never lands in files.

## Verifier results

- `cd apps/web && npx tsc --noEmit` -> exit 0
- `NEXT_TELEMETRY_DISABLED=1 npx next build` -> Compiled successfully;
  route map lists `f /harness/[name]` (Dynamic, server-rendered on demand)
- `bash tests/run_tests.sh` -> ALL SUITES PASSED (harness 11/11)
- `./init.sh` -> preflight status: ok, exit 0

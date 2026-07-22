---
type: Implementation Log
feature: toolbox_next_fleet_view
id: 39
status: implemented
role: implementer
updated: 2026-07-18
tags: [handyman/backlog, handyman/impl]
---

# Impl: toolbox_next_fleet_view

> First migrated view in apps/web. Server Component resolves initial fleet
> state from the upstream /api/state; a Client Component subscribes to the
> upstream /events SSE feed and swaps the rendered region in place. The
> legacy UMD panel and every other path are untouched (strangler pattern).
> Design follows design-taste-frontend (the same skill used by
> toolbox_next_landing): native CSS + CSS Modules, the terracotta-on-slate
> tokens already in globals.css, zero new dependencies, one accent, one
> theme, page Theme Lock + Color Consistency Lock inherited from the
> landing page.

## Design read (tasteskill v2 section 0.B)

Reading this as a developer-tool fleet dashboard for engineers running
multi-agent coding workflows, with a calm technical language, leaning toward
native CSS plus CSS Modules and the existing terracotta-on-slate palette.
Zero new dependencies is the same hard constraint as the landing page.

Dials (section 1, derived from the dashboard/dev-tool signal rows, dialed
against the "data table" caveat in the skill header which warns against
over-styling data surfaces): DESIGN_VARIANCE 5 (grid kanban + table layout,
asymmetric header; deliberately lower than the landing's 7 because a fleet
table rewards predictability), MOTION_INTENSITY 3 (one CSS pulse on the live
dot, one row hover; nothing cinematic), VISUAL_DENSITY 6 (cockpit-leaning:
dense chip rows, tabular numerals, tight kanban cells).

Design system (section 2): no official system fits a local devtool
observer. Built as an honest native-CSS aesthetic (section 2.B), labeled
here rather than claimed as a named framework.

## Tasteskill v2 Pre-Flight Check (section 14)

[PASS] Brief inference declared - the "Reading this as" line above.
[PASS] Dial values explicit and reasoned - VARIANCE 5 / MOTION 3 / DENSITY 6,
  tied to the dev-tool + data-table signal rows; motion kept low because the
  data surface rewards calm.
[PASS] Design system chosen or aesthetic labeled honestly - native CSS +
  CSS Modules, labeled above, no framework claimed.
[PASS] Redesign mode detected and audited - greenfield route, no prior
  /fleet page to preserve; the legacy UMD panel is explicitly left intact.
[PASS] ZERO em-dashes or en-dashes anywhere - enforced by test_web_fleet.sh
  TWF2, which scans all of apps/web (reusing the landing's node scan because
  macOS grep has no -P).
[PASS] Page Theme Lock - one prefers-color-scheme block in globals.css,
  unchanged; /fleet adds no second theme override.
[PASS] Color Consistency Lock - one accent (terracotta) reused across the
  live dot, in_progress chips, signal tags, nav active state; no second hue.
[PASS] Shape Consistency Lock - pill chips and badges, 14px cards/kanban
  cells, 10px signal tags; follows the landing's radius rule.
[PASS] Button Contrast Check - the nav active pill uses on-accent text on
  the accent fill; non-active links use text-muted on bg-sunken hover.
[PASS] CTA Button Wrap - no marketing CTAs on this view (it is a dashboard);
  the nav links are short labels with no max-width constraint.
[PASS] Form Contrast Check - not applicable, this view has no form inputs.
[PASS] Serif discipline - not applicable, no serif is used; the system sans
  stack from globals.css is reused verbatim.
[PASS] Premium-consumer palette check - not a premium-consumer brief; the
  terracotta-on-slate palette already avoids the banned beige/brass family.
[PASS] Italic descender clearance - not applicable, no italic display type.
[PASS] Hero fits the viewport - this is not a hero page; the fleet header
  (eyebrow + title + meta) is compact, the table sits immediately below.
[PASS] Hero top padding capped - not applicable (no hero); page top padding
  is var(--space-5), well under any hero ceiling.
[PASS] Hero stack discipline - not applicable (no hero); the fleet header
  is eyebrow + title + meta, three short elements, no tagline under them.
[PASS] Eyebrow count within the mechanical ceiling - exactly one eyebrow
  ("handyman toolBox") on the whole view, trivially under the ceiling of 3.
[PASS] Split-Header Ban - the fleet header stacks eyebrow/title/meta at full
  measure; no floating corner paragraph beside a big headline.
[PASS] Zigzag Alternation Cap - no image-beside-text split anywhere.
[PASS] No Duplicate CTA Intent - the two nav entries (Fleet, Panel) are
  distinct destinations, not duplicate CTAs.
[PASS] Logo wall is logo only - not applicable, no trusted-by logo wall.
[PASS] Bento Background Diversity - not applicable, the kanban cells are
  uniform data tiles, not a marketing bento.
[PASS] Trusted-by logo wall lives under the hero - not applicable.
[PASS] Copy Self-Audit - every visible string re-read before shipping; the
  "generated at" line reads "Last refresh ... UTC", the empty state names
  the exact register command.
[PASS] Motion motivated - the only motion is the live-dot pulse (signals
  live state) and the row hover (aids scanning a dense table); both are
  disabled under prefers-reduced-motion via CSS.
[PASS] Marquee max one per page - zero marquees.
[PASS] Navigation on one line - one 68px row, two links plus wordmark,
  collapses gracefully under 640px.
[PASS] Section-Layout-Repetition check - three regions (header, kanban,
  table) of three distinct layout families (centered header stack,
  4-column grid, tabular rows); no repeated layout family.

## Files

Created:
- apps/web/app/fleet/page.tsx - Server Component. Fetches
  `${TOOLBOX_UPSTREAM}/api/state` with cache:"no-store" at request time,
  renders a sticky nav + an upstream-unreachable banner (degrades instead
  of 500) + `<FleetLive>` with the resolved events/state URLs.
- apps/web/app/fleet/fleetHtml.ts - Pure, dependency-free renderer.
  `renderFleetHtml(state) -> htmlString`. Every dynamic value is HTML-
  escaped via esc(); no <script>, no external src, no inline handler.
  Importable directly by a Node test (no JSX), which is what makes the
  fixture render test possible without a Next build.
- apps/web/components/FleetLive.tsx - Client Component ("use client").
  Opens an EventSource on the upstream /events URL passed from the server,
  re-fetches /api/state on every message, and swaps the region's
  innerHTML with renderFleetHtml. Status dot (live/connecting/stale) +
  auto-reconnect on error. Reduced-motion handled in CSS.
- apps/web/app/fleet/page.module.css - Page styles. Reuses globals.css
  tokens only (no raw hex, no second accent). Plain generated classes are
  scoped to .fleet via :global() so the page shell stays module-scoped.
- tests/test_web_fleet.sh - 9 cases (TWF1-TWF6): files exist; zero
  em-dashes/en-dashes across apps/web; renderFleetHtml renders fixture
  data (harness names, status counts, signal tags, kanban aggregate, no
  external src, no injected script); renderer is deterministic; proxy.ts
  steals /fleet into Next; FleetLive subscribes to upstream /events.

Modified:
- apps/web/proxy.ts - NEXT_HANDLED_PATHNAME (single "/") became
  NEXT_HANDLED_PATHNAMES = new Set(["/", "/fleet"]). The strangler comment
  now documents that adding a migrated view = adding its path here AND its
  app/<path>/page.tsx.
- tests/run_tests.sh - wired test_web_fleet.sh after test_web_landing.sh.

## Acceptance coverage

1. GET /fleet renders the real fleet with initial state resolved server-
   side: VERIFIED live (curl through Next dev against a fake upstream
   returned HTTP 200, 18696 bytes, with alpha-harness/beta-harness, their
   status_counts, and the STALE_WIP signal in the served HTML; the Next dev
   log shows `GET /fleet 200 ... application-code: 38ms`, i.e. served by
   Next, not proxied). tsc --noEmit and `next build` both pass; /fleet is
   listed as ƒ (dynamic, server-rendered on demand) in the build route map.
2. Live SSE refresh: FleetLive opens EventSource on the upstream /events
   URL and re-fetches + swaps on each message. The served HTML embeds the
   resolved upstream events URL (e.g. http://127.0.0.1:<nodeport>/events)
   in the client bundle, proving the wiring reaches the Node port, not the
   Next port (Next's fallback rewrite buffers SSE - documented in proxy.ts
   and the plan). Existing test "SSE emits a change event when the
   workspace mutates" still passes.
3. No external assets: VERIFIED - grep on the served /fleet HTML: src="http
   = 0, src="https = 0. Same invariant as the legacy panel.
4. Legacy UMD panel intact + test_toolbox_serve.sh unchanged: VERIFIED -
   48/48 pass with zero assertion edits.
5. Test against a fixture, no network: VERIFIED - test_web_fleet.sh TWF3
   transpiles fleetHtml.ts with the project's own typescript and runs it
   against a state fixture in-process; TWF6 asserts the EventSource wiring.
6. run_tests.sh passes and ./init.sh exits 0: VERIFIED - ALL SUITES PASSED
   (toolbox_serve 48/48, landing 3/3, fleet 9/9, plus all other suites);
   ./init.sh preflight status: ok.

## Notes / decisions

- Pure string renderer vs JSX: chosen for testability (no Next build needed
  for the render test) and for clean SSE reconciliation (swap innerHTML on
  a read-only surface; safe because all values are escaped). The landing
  page uses JSX; this view uses a string renderer because it reconciles on
  every SSE tick and the render must be importable by a Node test.
- SSE goes straight to the Node upstream, never the Next port. The server
  passes the resolved eventsUrl down; the client never guesses the port.
- The upstream-unreachable state renders a banner instead of a 500, so
  /fleet degrades gracefully if the Node observer is not running.
- proxy.ts edit is minimal and additive; the comment now documents the
  two-sided strangler step (Set entry + page.tsx).
- Verified the known cache_control tool-rendering artifact is output-only:
  grep -c against every edited file returned 0 on disk after each edit
  (per the standing note in user memory). The artifact is visible in
  terminal/read_file output but never lands in files.

## Verifier results

- `cd apps/web && npx tsc --noEmit` -> exit 0
- `NEXT_TELEMETRY_DISABLED=1 npx next build` -> Compiled successfully,
  /fleet listed as ƒ (Dynamic, server-rendered on demand)
- `bash tests/run_tests.sh` -> ALL SUITES PASSED (fleet 9/9)
- `./init.sh` -> preflight status: ok, exit 0

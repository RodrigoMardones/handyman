---
type: Implementation Log
feature: toolbox_next_landing
status: implemented
role: implementer
updated: 2026-07-18
tags: [handyman/role/implementer, handyman/feature/toolbox_next_landing]
---

# Implementation Report: toolbox_next_landing

Landing page for handyman toolBox at `apps/web/app/page.tsx`, following
tasteskill v2 (`design-taste-frontend/SKILL.md`) end to end. `proxy.ts` was
not touched: `/` is the only route this feature steals from the strangler
fallback, everything else (every JSON endpoint, the legacy panel, `/events`)
still proxies to the Node server unchanged.

## Files Added

- `apps/web/app/page.tsx` (new) - the landing page itself. Server Component,
  9 `<section>` elements, full Pre-Flight Check (tasteskill section 14, 62
  boxes) as a header comment.
- `apps/web/app/page.module.css` (new) - all section-specific layout CSS.
- `apps/web/app/globals.css` (new) - design tokens (color, spacing, radius,
  font stacks), reset, dark-mode block, skip-link utility. Imported from
  `layout.tsx`.
- `apps/web/components/ScrollReveal.tsx` (new) - the only Client Component
  in this feature (`"use client"`). Hand-rolled IntersectionObserver reveal,
  the "lighter alternative" from tasteskill section 5.C, since `motion/react`
  is out of scope (zero new dependencies).
- `apps/web/components/ScrollReveal.module.css` (new) - motion lives only
  here, entirely gated behind `@media (prefers-reduced-motion: no-preference)`.
- `tests/test_web_landing.sh` (new) - 3 cases: `page.tsx` exists, zero
  em-dash/en-dash anywhere in `apps/web` (node scan, macOS bash 3.2 safe, no
  `grep -P`), `page.tsx` has at least 8 `<section` occurrences.
- `.handyman/docs/current/audit-toolbox-next-landing.md` (new) - the
  Section-Layout-Repetition and Hero-discipline audits the feature's
  acceptance criteria ask for explicitly, both PASS.

## Files Changed

- `apps/web/app/layout.tsx` - added `export const metadata` (title +
  description), imported `./globals.css`, and rewrote the header comment:
  it used to say "every path has no matching page.tsx"; now it explains
  that `toolbox_next_landing` steals exactly `/`, while every other path
  still falls through `proxy.ts` untouched.
- `tests/run_tests.sh` - wired `test_web_landing.sh` in with `run_suite`,
  after `test_toolbox_serve.sh`.
- `.handyman/docs/verification.md` - appended a paragraph to the existing
  "apps/web (Next.js strangler)" section documenting the carve-out: `GET /
  returns the React panel` still passes byte for byte in the suite's default
  mode (Node server direct, what `tests/run_tests.sh` runs), but no longer
  applies when `TOOLBOX_BASE_URL` points at the Next port (`/` now serves
  the landing, not the legacy panel); every JSON endpoint and `/events`
  keep proxying byte-equivalent through the untouched `proxy.ts`.

`proxy.ts` and `next.config.ts`: not touched, as required.

## Design Notes

**Dials** (tasteskill section 1): `DESIGN_VARIANCE 7`, `MOTION_INTENSITY 4`,
`VISUAL_DENSITY 4`. Reasoning: this is a developer-tool landing page for
engineers running multi-agent workflows (top of the "landing page" preset
band on variance, since the audience reads dense technical layouts
comfortably); a devtool audience does not need cinematic choreography
(motion kept to fluid CSS transitions plus one scroll-reveal pattern); the
product itself is data-dense but a page selling it should still breathe
(density kept at "daily app", not "cockpit").

**Design system**: no official system from tasteskill section 2 fits a
local devtool observer. Built as an honest native-CSS aesthetic (CSS
Modules + custom properties), explicitly labeled rather than pretending to
be a named framework. Zero new dependencies per the feature brief: no
Tailwind, no shadcn, no icon library, no `motion/react`, no external fonts
(system font stacks only, defined in `globals.css`).

**Palette**: one accent (terracotta, `#c15a2a` light / `#ff8f5c` dark,
saturation kept under 80%) on cool slate neutrals, deliberately not the
banned beige+brass+espresso "premium consumer" family and not "AI purple".
Locked across all 9 sections (Color Consistency Lock).

**Shape lock**: buttons are full pill, cards and bento tiles are 14px, code
and panel surfaces are 10px. Documented in `globals.css` and followed
everywhere (Shape Consistency Lock).

**Hero paradigm**: Asymmetric Split Hero (tasteskill section 10) - headline
and CTAs on the left in a `max-width: 37rem` column, a Picsum-seed
photograph on the right at a 4:5 aspect ratio, nothing centered
(`DESIGN_VARIANCE 7 > 4` avoids the centered-hero default per section 4.3).

**Layout families per section** (9 sections, 9 distinct families, well
above the acceptance floor of 8 sections / 4 families):

1. Hero - Asymmetric Split Hero.
2. Metrics - divided stat strip (hairline `border-left`, no cards).
3. Capabilities - asymmetric bento grid (6 real capabilities to 6 grid
   areas: 1 large 2x2, 4 standard, 1 full-width band, no empty cells).
4. Manifesto - full-width editorial quote, no asset (the project's own
   line from `docs/business.md`: "el chat coordina, pero el disco es la
   fuente de verdad", rendered in English as "The chat coordinates. The
   disk is the source of truth.").
5. Pipeline - connected-steps rail (the real `disk -> fs.watch -> SSE ->
   browser` pipeline documented in `toolbox_serve.ts`'s own header comment).
6. Security - featured 2x2 spec tiles (tasteskill section 4.9's
   "featured-vs-rest" alternative to a bordered spec table).
7. Architecture - single-column code panel with the real monorepo tree from
   `docs/sprints/plan-migracion-toolbox-nextjs.md`.
8. Providers - horizontal scroll-snap cards (tasteskill section 4.9's
   alternative to a plain list for the 4 registered/future providers).
9. CTA - centered command band with the real install commands from
   `README.md`.

Only the hero uses an image-beside-text split, so the Zigzag Alternation
Cap (max 2 in a row) is never approached.

**Copy**: every fact on the page is real, sourced from the project's own
docs and code (`127.0.0.1` bind, `48 / 48` parity cases from the latest
`test_toolbox_serve.sh` runs recorded in prior backlog reports, `4 roles`
from `README.md`, `1 write route` from `docs/architecture.md`, the disk to
browser pipeline from `toolbox_serve.ts`, the monorepo layout and install
commands from the plan doc and `README.md`). No invented company names, no
fake testimonials, no "Jane Doe". English copy, matching the toolBox
panel's own UI language (`handyman/assets/toolbox_panel.js`), while the new
audit doc stays in Spanish per `docs/conventions.md`'s convention for
`docs/`.

**Images**: no image-generation tool is available in this environment
(documented in the feature brief), so all 3 images are
`https://picsum.photos/seed/<descriptive-seed>/<w>/<h>` with explicit
`width`/`height` and honest placeholder alt text (native `<img>`, no
`next/image`, `fetchPriority="high"` on the hero image only).

**Motion**: `ScrollReveal` (IntersectionObserver, fade + rise on
`transform`/`opacity` only) sequences attention down the page as sections
enter the viewport (storytelling justification, tasteskill section
"MOTION MUST BE MOTIVATED"). Entirely inert under
`prefers-reduced-motion: reduce` by construction: the opacity/transform
starting state and the transition itself only exist inside a
`@media (prefers-reduced-motion: no-preference)` block, so reduced-motion
users see the final state immediately with no JS branching needed.

## Audit Results (all 4 required, all PASS)

1. **Pre-Flight Check** (tasteskill section 14, 62 boxes): documented as a
   header comment in `apps/web/app/page.tsx`, every box marked `[PASS]`
   with a one-line justification. The one contested box (icon library) is
   marked PASS with an explicit override: zero new dependencies is a hard
   brief constraint, so the page ships zero pictorial icons at all, only
   the single geometric wordmark mark tasteskill section 4.8 explicitly
   allows.
2. **Section-Layout-Repetition**: PASS. Full table with the "why distinct"
   justification per section in
   `.handyman/docs/current/audit-toolbox-next-landing.md`.
3. **Hero discipline**: PASS. Word counts, top-padding measurement, stack
   count (3 elements) and viewport-stability reasoning table in the same
   audit doc.
4. **Em-dash/en-dash**: PASS, zero instances anywhere in `apps/web`
   (`.tsx`, `.css`, `.ts`), enforced by `tests/test_web_landing.sh` and
   re-verified against the actual Turbopack-built HTML output (see below).

## Test Output

`pnpm --filter @handyman/web typecheck` (from repo root): clean, no errors.

`pnpm --filter @handyman/web build` (from repo root):

```text
▲ Next.js 16.2.10 (Turbopack)
✓ Compiled successfully in 749ms
  Running TypeScript ...
  Finished TypeScript in 663ms ...
✓ Generating static pages using 4 workers (3/3) in 147ms

Route (app)
┌ ○ /
└ ○ /_not-found

ƒ Proxy (Middleware)
○  (Static)  prerendered as static content
```

`/` is fully static-prerendered. Runtime-verified the actual built HTML
(`apps/web/.next/server/app/index.html`, not just the source): 9
`<section>` elements, 3 `<img>` tags each with real `alt`/`width`/`height`,
`<h1>` renders "Your agent fleet, streamed live to the browser.", `<title>`
carries the new metadata, zero `—`/`–` characters present in the rendered
output.

`bash tests/run_tests.sh` (tail):

```text
apps/web landing suite (test_web_landing.sh)
  PASS apps/web/app/page.tsx exists
  PASS apps/web has zero em-dashes (U+2014) and zero en-dashes (U+2013)
  PASS page.tsx contains at least 8 <section occurrences

Summary: 3 run, 3 passed, 0 failed
-> suite OK

==============================================
ALL SUITES PASSED
```

All prior suites (including the 48/48 `test_toolbox_serve.sh` parity
oracle, run in its default mode against the Node server directly) stayed
green and unedited: this feature adds a new route on the Next side only,
the default test run never boots Next at all.

`./init.sh`: exit code 0 (`status: ok`, worklist and preflight both clean).

`shellcheck -S warning tests/test_web_landing.sh tests/run_tests.sh`: clean.

## Risks / Notes

- `pnpm --filter @handyman/web build` was deliberately kept OUT of
  `tests/run_tests.sh` (too slow for the default loop); it was run manually
  as part of this feature's verification and is documented above, matching
  the acceptance criteria's own wording ("`pnpm --filter web build` ...").
- The carve-out on `GET / returns the React panel` only matters when an
  operator points `TOOLBOX_BASE_URL` at the Next port (the parity-oracle
  paridad mode from feature `toolbox_parity_oracle`); the suite's default
  invocation (what CI and `tests/run_tests.sh` actually run) is completely
  unaffected, since it boots `dist/toolbox_serve.js` directly and never
  touches Next.

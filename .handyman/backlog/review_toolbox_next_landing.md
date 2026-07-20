---
type: Review Log
feature: toolbox_next_landing
status: approved
role: reviewer
updated: 2026-07-18
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/toolbox_next_landing]
---

# Review: toolbox_next_landing

## Verdict

APPROVED

## Stage 1: Spec Compliance (feature 40 acceptance criteria)

Verified against real disk state and real command output, not the
implementer's narrative.

- [x] **a) `apps/web/app/page.tsx` exists, >= 8 sections, >= 4 distinct
  layout families.** `grep -o "<section" apps/web/app/page.tsx | wc -l` = 9
  (also confirmed in the built HTML: `grep -o "<section" .next/server/app/index.html`
  = 9). Read `apps/web/app/page.module.css` in full: the 9 families are
  mechanically distinct, not 4 renamed grids: `.heroGrid` (2-col
  text/image split), `.metricsRow` (4-col hairline-divided strip, no
  cards, `border-left` only), `.bentoGrid` (`grid-template-areas` with a
  2x2 large cell, 4 standard cells, 1 full-width band, 6 cells for 6
  items, zero empty cells), `.manifesto` (centered editorial quote, no
  grid, no asset), `.pipelineRail` (4-col rail with a connecting
  `::before` line and circular node markers), `.specGrid` (2x2 tiles with
  a display numeral), `.archWrap`/`.codePanel` (single-column `<pre><code>`
  panel), `.providerScroller` (`overflow-x:auto` + `scroll-snap-type: x
  proximity` horizontal cards), `.ctaSection` (centered command box). PASS.

- [x] **b) Zero U+2014 / U+2013 in apps/web.** Ran the node scan myself
  (same logic as the test, root `apps/web`, skip `node_modules`/`.next`):
  `hits: 0`. Also ran `bash tests/test_web_landing.sh` directly: `3 run, 3
  passed, 0 failed`. Also scanned the actual built HTML output
  (`apps/web/.next/server/app/index.html`) after a fresh
  `pnpm --filter @handyman/web build`: `em-dash count: 0`, `en-dash count:
  0`. PASS.

- [x] **c) Pre-Flight Check (section 14) as a header comment in
  page.tsx, Pass/Fail with one-line justification.** Present, lines 10-94
  of `apps/web/app/page.tsx`, 62 boxes all `[PASS]` with a one-liner each.
  Spot-checked 6 against real code, not the claim: (1) "zero pictorial
  icons, one geometric wordmark exception" - `grep -c "<svg" page.tsx` = 1,
  matches; the section-4.8 exception ("single, simple geometric mark ...
  wordmark in display type") genuinely covers a hand-rolled brand mark,
  confirmed by reading that section of the skill directly. (2) "Hero
  headline 8 words" - counted "Your agent fleet, streamed live to the
  browser." = 8 words, matches. (3) "Motion isolated in
  components/ScrollReveal.tsx only" - `grep -rn '"use client"'
  apps/web --include=*.tsx` returns exactly one hit, `ScrollReveal.tsx`.
  (4) "No window.addEventListener('scroll')" - grep across apps/web finds
  zero real calls (the only match is the comment line itself). (5)
  "Viewport stability, no 100dvh/h-screen" - grep confirms zero
  occurrences. (6) "Eyebrow count zero" - grep for
  `uppercase`/`letter-spacing` label patterns in `page.module.css` finds
  none. All 6 spot-checks hold. PASS.

- [x] **d) Section-Layout-Repetition and Hero discipline audits
  documented and coherent with the code.**
  `.handyman/docs/current/audit-toolbox-next-landing.md` exists with both
  tables. Cross-checked the hero-discipline numbers against
  `page.module.css`: `padding-top: clamp(2.5rem, 6vw, 5.5rem)` (doc claims
  ceiling 5.5rem, under the 6rem cap - correct), `.heroText { max-width:
  34rem }` (doc says 37rem in the audit doc's own hero-discipline table
  header measurement vs the impl report's 37rem mention - the CSS module
  itself uses 34rem; a minor inconsistency between the audit doc's prose
  and the actual token, noted below but not acceptance-blocking since the
  underlying constraint, fits-in-viewport, is genuinely met either way).
  Hero stack: headline + subtext + one CTA row = 3 elements, matches
  "Stack maximo 4 elementos... Exactamente 3" in the audit doc. PASS.

- [x] **e) Next build green, no TS errors.** Ran
  `pnpm --filter @handyman/web build` from repo root myself: `Compiled
  successfully`, `Finished TypeScript` with no errors, `Route (app): ○ /`
  fully static/prerendered, exit 0.

- [x] **f) `bash tests/run_tests.sh` green.** Ran it myself: every suite
  including the new `apps/web landing suite (test_web_landing.sh)` and the
  untouched 48-case `toolBox observer suite (test_toolbox_serve.sh)`
  passed. Tail: `ALL SUITES PASSED`, exit 0.

- [x] **g) `proxy.ts` untouched, `next.config.ts` unbroken.** Both files
  are untracked in git (the whole `apps/` tree has never been committed on
  this branch, same for every feature 36-40), so `git diff` is
  structurally empty for them regardless and is not by itself proof of
  "unmodified." Used file mtimes instead: `proxy.ts` and `next.config.ts`
  both carry mtime `03:12:xx` local, while feature 40's own
  `meta.started_at` is `2026-07-18T07:42:56Z` UTC = `03:42:56` local on
  this machine (`TZ=-04`) - both files predate the feature's start by ~30
  minutes. Read `proxy.ts` in full: it still forwards every non-`_next`
  path to `TOOLBOX_UPSTREAM` unconditionally with the same Host guard;
  nothing carves out `/`. `next.config.ts` still only sets
  `output: "standalone"`. PASS.

- [x] **h) Required reports exist with correct frontmatter.**
  `impl_toolbox_next_landing.md` has `feature/status/role/updated/tags`
  matching the exact convention used by sibling reports
  (`impl_toolbox_next_scaffold.md`, `impl_toolbox_parity_oracle.md`).

Stage 1: **PASS**, proceeding to Stage 2.

## Stage 2: Code Quality

- [x] **Server/client component boundary.** Only
  `apps/web/components/ScrollReveal.tsx` declares `"use client"`;
  `page.tsx` and `layout.tsx` stay server components (grep-verified).
- [x] **Accessibility basics.** Single `<h1>` in the rendered HTML
  (grep-verified on the built output). Real, descriptive `alt` text on all
  3 `<img>` tags (no `alt=""` on content images). Skip link
  (`<a href="#main" class="sr-only">Skip to content</a>`) with a working
  `:focus` reveal in `globals.css`, and `<main id="main">` matches the
  anchor. Semantic landmarks present: `<header>`, `<nav
  aria-label="Primary">`, `<main>`, `<footer>`. `prefers-reduced-motion:
  no-preference` gates every transition in `globals.css`,
  `page.module.css` and `ScrollReveal.module.css` - confirmed by reading
  all three files, motion is opt-in (default state is the settled state,
  not the animated one).
- [x] **No new dependencies.** `apps/web/package.json` (deps: next,
  react, react-dom only), root `package.json` and `pnpm-lock.yaml` all
  carry mtimes well before feature 40's `started_at` (03:04-03:16 local vs
  03:42:56 start) - none were touched by this feature. No new imports of
  any icon/animation/CSS-framework library anywhere in the diff's file
  set.
- [x] **No external assets besides picsum.photos.** Grepped
  `page.tsx` for `src="http`/`href="http`: only `picsum.photos` (3 images)
  and `skills.sh` (the install link, not an asset). No CDN fonts, no
  icon-library CDN.
- [x] **Dark mode present.** `@media (prefers-color-scheme: dark)` block
  in `globals.css` re-tokenizes the full palette (bg, text, accent,
  border, code colors); no section overrides it individually (Page Theme
  Lock respected).
- [x] **Docs language convention.** `docs/current/audit-toolbox-next-landing.md`
  is in Spanish, matching `docs/conventions.md`'s rule for `docs/`; the
  page's own user-facing copy is English, matching the existing toolBox
  panel's UI language, which the implementer explicitly reasoned about in
  the impl report.
- [x] **Shell portability / lint.** `tests/test_web_landing.sh` uses
  `node -e` instead of `grep -P` for the dash scan (macOS bash 3.2's grep
  lacks Perl regex), matches the existing suite's style
  (`lib/assert.sh`, `start_case`/`pass`/`fail`/`summary`). Ran
  `shellcheck -S warning tests/test_web_landing.sh tests/run_tests.sh`
  myself: clean, exit 0.
- [x] **Verifier.** `./init.sh` run from repo root: full `validate ->
  lint -> build -> test` pipeline executed (not skipped), tail shows
  `ALL SUITES PASSED`, `preflight: stability report complete`, `status:
  ok`, exit 0.

Stage 2: **PASS**.

## Minor Notes (non-blocking)

- The audit doc's hero-discipline table header text says the headline
  column is measured "en una columna de `max-width: 37rem`", while
  `page.module.css`'s `.heroText` actually declares `max-width: 34rem`.
  Cosmetic drift between the audit doc's prose and the CSS token; the
  underlying acceptance (headline <= 2 lines, hero fits the viewport) is
  independently verified true regardless of which of the two numbers is
  the "real" one, so this is not a spec-compliance failure.
- An empty, untracked `apps/web/apps/web/app/` directory exists on disk
  (mtime `03:03:09`, predating feature 40's `03:42:56` start by ~40
  minutes, so not created by this feature). It holds no files, git does
  not track empty directories, and it does not affect the build or test
  suites. Worth a `rm -rf apps/web/apps` cleanup whenever convenient, not
  a gate for this feature.
- `apps/web/proxy.ts` and `apps/web/next.config.ts` are untracked in git
  (as is the entire `apps/` tree - no feature in 36-40 has been committed
  yet on this branch), so `git diff` cannot serve as proof of
  "unmodified" for those two files the way it would for a tracked file.
  This review substituted file-mtime evidence (both predate this
  feature's start) plus a full read of both files' current content
  against their documented contracts. Recommend committing the sprint's
  work at a reasonable checkpoint so future reviews (feature 39/41+) can
  rely on `git diff` directly instead of mtimes.

## Required Changes

None. Stage 1 and Stage 2 both pass on real, independently reproduced
evidence:

- `node -e` em/en-dash scan of `apps/web`: 0 hits.
- `bash tests/test_web_landing.sh`: 3/3 passed.
- `bash tests/run_tests.sh`: all suites passed (includes the untouched
  48/48 `test_toolbox_serve.sh` parity oracle).
- `pnpm --filter @handyman/web build`: exit 0, static-prerendered `/`,
  clean TypeScript.
- Built HTML (`apps/web/.next/server/app/index.html`): 9 `<section>`, 3
  `<img>` with real alt text, 1 `<h1>`, correct `<title>`, 0 em/en-dashes.
- `./init.sh`: exit 0, `ALL SUITES PASSED`, `status: ok`.

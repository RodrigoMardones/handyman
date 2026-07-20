---
type: Review Log
feature: 47
reviewer: reviewer
verdict: APPROVED
date: 2026-07-18
tags: [handyman/review, apps/web, next, timeline, search, a11y]
---

# Review — toolbox_next_timeline_search

Reviewer verdict: **APPROVED**. All five acceptance bullets pass with live
verifier evidence, the new dep is justified, the renderers are pure and
covered by a transpiled suite, and the parity oracle is byte-identical for
feature 47's scope. Two nits noted at the bottom, neither blocking.

## Spec coverage (one line per acceptance bullet, pass/fail + evidence)

1. **PASS** — `apps/web/app/timeline/page.tsx` is a force-dynamic RSC that
   resolves state via direct `getBuildState()` (no HTTP hop) and feeds it to
   `TimelineLive`; `app/timeline/timelineHtml.ts` is a pure, importable,
   HTML-escaping string renderer (no React/JSX/Next imports — confirmed by
   `grep` and by TWS2 transpiling+running it in-process); `TimelineLive`
   subscribes to same-origin `/events` and re-polls `/api/state` on every
   tick, swapping the region via the same renderer. See TWS2 + TWS10.
2. **PASS** — `SearchClient.tsx` builds the MiniSearch BM25 index client-side
   from `GET /api/corpus` (fields `title`+`text`, boost x2, prefix, fuzzy
   0.1, top-30), answers per keystroke with no fetch in the search path
   (TWS9 asserts the literal comment `no fetch anywhere in this path`), and
   non-feature hits open through the shared `MdDialog` against `mdUrl="/api/md"`
   wired in `app/search/page.tsx`. See TWS3 + TWS9 + TWS-shared-dialog case.
3. **PASS** — `ToolboxShell.tsx` mounts the command palette (cmd/ctrl+K
   toggle, ArrowDown/Up/j/k/Enter nav), one document-level keydown listener
   via the pure `lib/shortcuts.ts` interpreter with the text-field guard
   (input/textarea/select/contenteditable inert for `/`, `?`, `g+letter`),
   a persistent theme toggle (light/dark/system under `hw-theme:1`,
   system DELETES the key) with the anti-flash snippet injected before the
   React tree in `layout.tsx`, and two static live regions
   (`#live-polite`/`#live-assertive`) written through `lib/announce.ts`
   (debounced-polite / immediate-assertive). See TWS4 + TWS5 + TWS6 + TWS7 + TWS8.
4. **PASS** — No new external origins introduced by feature 47 (the only
   `src="https://…"` hits are in `app/page.tsx`, the landing page from
   feature 39, untouched by this branch); `minisearch` is the single new
   `apps/web` dependency and is justified in `docs/architecture.md` citing
   feature 47 / C3 / decision D1; the new renderers are pure and covered by
   `tests/test_web_timeline_search.sh` (16/16), pattern-matching
   `test_web_fleet.sh` / `test_web_harness.sh`.
5. **PASS** — `tests/test_toolbox_serve.sh` shows **48/48** in default mode
   with assertions untouched by feature 47; `bash tests/run_tests.sh` ends
   with `ALL SUITES PASSED`; `./init.sh` exits 0. Oracle integrity
   confirmed: the file is NOT in the working-tree diff (`git status --short`
   omits it) — the `git diff main..HEAD` drift is from earlier features
   44/45/46 (summarize/ask/intake relays + parity-oracle knobs), unrelated
   to feature 47.

## Verifier results

- `./init.sh`: **exit 0** (`status: ok`; the "no ready features" NOTE is
  expected — feature 47 is `in_progress`).
- `bash tests/run_tests.sh`: **ALL SUITES PASSED** (every suite reports
  `-> suite OK`, including the new `test_web_timeline_search.sh` registered
  into the runner).
- `bash tests/test_web_timeline_search.sh`: **16 run, 16 passed, 0 failed**
  (transpiles the 6 pure modules with the project's own typescript and runs
  them in-process against fixtures; also structural checks for files,
  layout anti-flash wiring, listener count, shared dialog, MiniSearch dep
  declaration, live wiring and proxy).
- `bash tests/test_toolbox_serve.sh`: **48 run, 48 passed, 0 failed**
  (default mode, against `node dist/toolbox_serve.js` — the carve-out
  documented in `docs/verification.md` for `TOOLBOX_BASE_URL`->Next is not
  exercised here; default is the gate).
- `git diff main..HEAD -- tests/test_toolbox_serve.sh`: shows 254+/12- but
  **NONE of it is from feature 47** — the file is absent from
  `git status --short`, and the commits that last touched it
  (`e62cd5f feat: migration to next.js`) predate this branch's feature work.
  The drift corresponds to features 44/45/46 (summarize/ask relays, intake,
  parity-oracle knobs) already reviewed and merged on this branch. Bullet 5
  integrity holds: feature 47 did not edit the oracle to make 48/48 pass.
- `find handyman/scripts tests -name '*.sh' | xargs shellcheck -S warning`:
  **exit 0** (clean, per verification.md CI scope).

## Architecture (C3) — deps + external origins + listener count

- **New dep**: `apps/web/package.json` adds exactly `"minisearch": "^7.2.0"`
  under `dependencies`. No other new deps (workspace refs
  `@handyman/toolbox-core` and `handyman` are pre-existing). `pnpm-lock.yaml`
  resolves `minisearch` consistently across the workspace consumers.
- **C3 justification**: `docs/architecture.md` §2 (Politica de dependencias)
  adds a dedicated bullet "`minisearch` en `apps/web`" citing **feature 47,
  CHECKPOINTS C3** and **decision D1** of
  `backlog/explore_toolbox_next_unification.md`, with the rationale: same
  engine + same version handyman already vendors as UMD, imported as ESM;
  no platform equivalent for BM25 with prefix/fuzzy; it disappears from the
  Node side when the legacy panel is retired (feature 49); every other new
  surface stays zero-dep (CSS tokens + string renderers + a deterministic
  hand-rolled palette ranker). This matches the explore decisions D1/D2.
- **External origins**: grep over `apps/web/app/**/*.tsx`, `apps/web/app/**/*.ts`,
  `apps/web/components/*.tsx`, `apps/web/lib/*.ts` for
  `src="http|unpkg|cdn|<script src=|https://` returns ZERO hits in any
  feature-47 file. The 3 hits in `app/page.tsx` (`picsum.photos`) belong to
  the landing page (feature 39) and are untouched by this branch
  (`git status --short apps/web/app/page.tsx` is empty). The single
  `vendor/[...slug]/route.ts` hit is the word "CDN" inside a comment
  ("strict CSP blocks any CDN"). The anti-flash snippet is same-origin
  inline (`<script dangerouslySetInnerHTML>` with no `src`), preserving the
  no-external-assets invariant.
- **One global keydown listener**: independent count of
  `document.addEventListener("keydown"` across `apps/web/{components,app,lib}`
  = **1** (in `ToolboxShell.tsx`). TWS8 already asserts this; re-verified.

## Renderer purity

`apps/web/app/timeline/timelineHtml.ts`, `apps/web/app/search/searchHtml.ts`,
`apps/web/lib/palette.ts`, `apps/web/lib/shortcuts.ts`, `apps/web/lib/theme.ts`,
`apps/web/lib/announce.ts` — all six have **zero** `import`/`require`
statements (independently grepped) and no React/Next/`@handyman` imports.
The transpiled suite proves they run as plain CommonJS modules under Node:

- `renderTimelineHtml` / `renderSearchResultsHtml` are deterministic
  (same-input ⇒ same-output, asserted in TWS2/TWS3) and HTML-escape every
  interpolation (asserted with `<script>` and `beta <b>` fixtures).
- `buildPaletteActions` / `rankPaletteActions` are pure data + arithmetic
  scoring (no MiniSearch here — D1 holds for the palette).
- `interpretKeydown` + `isTextEntryTarget` are pure data-in/data-out
  (cmd+k everywhere, `/`+`?`+`g+letter` inert in text fields, palette
  j/k/Enter behavior, chord expiry — all asserted in TWS5).
- `themeDecision` / `normalizeStoredTheme` / `THEME_ANTIFLASH_SNIPPET` keep
  the `hw-theme:1` contract (system DELETES key + attribute; explicit modes
  persist) — asserted in TWS6; the snippet string itself is data, no DOM.
- `mergeAnnouncements` is pure (asserted in TWS7); `announce` keeps a
  module-level singleton state for the debounced writer, which is the
  intended browser-side writer (not exercised at import time; the suite
  only covers `mergeAnnouncements`). This matches the announce port
  contract from `toolbox_a11y_live`.

## Live wiring + proxy

- **Same-origin live refresh**: `TimelineLive.tsx` opens
  `new EventSource(eventsUrl)` with `eventsUrl="/events"` passed from the
  page, and re-fetches `stateUrl="/api/state"` on each message, swapping
  the region via `renderTimelineHtml`. It does NOT point at the legacy
  observer port. Connection loss/recovery routes through `announce.assertive`
  (immediate) and refreshes through `announce.polite` (debounced). TWS10
  asserts the wiring literally.
- **Proxy**: `apps/web/proxy.ts` registers `"/timeline"` and `"/search"` in
  `NEXT_HANDLED_PATHNAMES`, so Next serves them natively instead of
  forwarding to the Node upstream. TWS-proxy case asserts both entries.
  The rest of the strangler surface is unchanged.

## a11y (live regions, anti-flash, shortcut guard)

- **Two static live regions**: `ToolboxShell.tsx` renders
  `<div id="live-polite" role="status" aria-live="polite">` and
  `<div id="live-assertive" role="alert" aria-live="assertive">`, both with
  the `srOnly` class — present in the SSR HTML and only ever written to via
  `lib/announce.ts`. TWS8 asserts all four attributes are present.
- **Anti-flash**: `layout.tsx` injects
  `<script dangerouslySetInnerHTML={{ __html: THEME_ANTIFLASH_SNIPPET }} />`
  as the FIRST child of `<body>`, before `{children}`. `globals.css` has
  explicit `:root[data-theme="light"]` (line 81) and
  `:root[data-theme="dark"]` (line 97) token blocks; with no attribute the
  `prefers-color-scheme` media query rules. TWS6-layout case asserts both.
- **Text-field guard**: `isTextEntryTarget` returns true for
  input/textarea/select/contenteditable; `interpretKeydown` short-circuits
  to `none` for `/`, `?`, and the `g+letter` chord when `ctx.inField` is
  true, while cmd/ctrl+K still fires (the guard is checked AFTER the
  cmd/ctrl+K branch). TWS5 covers the exact cases.

## Shared dialog wiring

- `MdDialog` is the single markdown quick-view surface. Both openers funnel
  through it: `SearchClient.tsx` (non-feature hits via `data-md-*`) and
  `ToolboxShell.tsx` (palette `open-md` actions) render `<MdDialog …/>`
  with `mdUrl="/api/md"`, and `app/search/page.tsx` passes
  `mdUrl="/api/md"` to `SearchClient`. TWS-shared-dialog case asserts the
  wiring. The dialog renders the body as preformatted TEXT (React-escaped
  `<pre>`), so harness text never becomes markup — matching the observer
  security model and deferring the marked+DOMPurify upgrade to feature 48
  (decision D2).

## Risks / nits (non-blocking)

1. **`feature_list.json` trailing newline** — `git diff HEAD` shows the
   file lost its final newline (`\ No newline at end of file`) alongside
   the legitimate `pending -> in_progress` mutation. This is almost
   certainly an artifact of `node dist/feature.js start` (the CLI owns
   this file, not the editor), and conventions.md's "newline final" note
   is a determinism preference for the CLI's own writes. Not a manual
   edit, not a schema violation, not in scope for feature 47's product
   code. Worth a follow-up to confirm `feature.js` always emits a trailing
   newline, but it does not block this feature.
2. **`announce.ts` module-level singleton state** — the `state` object and
   `announce` writer hold module-scoped mutable state. This is the intended
   port (one writer per page, regions are singletons by id) and is not
   exercised by the transpiled suite (which only covers the pure
   `mergeAnnouncements`). It is technically a side-effecting module, but
   only at call-time (no DOM access at import; the `typeof document`
   guard makes it SSR-safe). The acceptance bullet's "renderer purity"
   intent — deterministic, transpile-and-require — is preserved for the
   functions the suite actually runs. No change requested; flagged for
   transparency.
3. **Oracle carve-out consistency** — `docs/verification.md` documents the
   42/48 Next-mode carve-out (the 6 `GET /` panel-markup cases including
   CSP). Feature 47 does not change that picture: `/timeline` and `/search`
   are NEW Next routes with no Node-side equivalent to proxy, so they add
   no new carve-out cases. Default 48/48 is green. No action needed;
   noted so the next reviewer of feature 48/49 has the full picture.

## Verdict + required changes

**APPROVED.** No required changes. Feature 47 may move to `done` once the
leader updates `progress/current.md` (reset) and `progress/history.md`
(append) per C5, and runs `node dist/feature.js done 47` to seal
`meta.done_at`. Approval rests on the checklist (C1–C5), the green verifier
output (init.sh exit 0, run_tests ALL SUITES PASSED, oracle 48/48 default
with feature-47-oracle diff empty, new suite 16/16), the C3 dep
justification, the renderer purity (zero imports, transpiled coverage),
and the same-origin live wiring — not on prose.

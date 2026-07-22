---
type: Review Log
feature: 48
reviewer: reviewer
verdict: APPROVED
date: 2026-07-18
tags: [handyman/review, apps/web, next, intake, ask, fleet-summary, sanitization]
---

# Review — toolbox_next_intake_ask_ui

Reviewer verdict: **CHANGES_REQUESTED**. One blocking defect: the
`FleetSummaryClient` component exists and is structurally correct, but is
**never mounted on `/fleet`** — so the second half of acceptance bullet 2
("`FleetSummary` en `/fleet` muestra summary con indicador (cached) y
model") is not actually delivered in product code. Everything else
(intake UI, ask UI with delegated citations, sanitization policy
byte-exact with the panel, renderer purity, deps + C3, oracle integrity,
typecheck) is APPROVED-quality and needs no change. The fix is small and
local: mount the component.

## Spec coverage (one line per acceptance bullet, pass/fail + evidence)

1. **PASS** — `/intake` is a `force-dynamic` RSC (`apps/web/app/intake/page.tsx`)
   that hands real React inputs to `IntakeClient` (`useActionState` over
   `submitIntake`, native `<form action>` so the POST works with JS off =
   progressive enhancement), wires `/api/providers`, `/api/files?root=` and
   `/api/draft` (SSE-over-POST with `AbortController`), previews via
   `renderSanitized(draftMd, { marked, DOMPurify })`. `submitIntake` (feat 46)
   is reused unchanged — `git diff --stat apps/web/actions/intake.ts` is
   empty and the signature `submitIntake(root, draftMd, files)` matches
   `IntakeClient.tsx:185`. The feat-46 suite already asserts the disk write
   to `feature-request.md`. TIA6-intake asserts the wiring.
2. **PARTIAL → blocking** — `/ask` is fully wired and correct
   (`AskClient.tsx` streams `/api/ask`, applies `linkCitations` BEFORE
   `renderSanitized`, ONE delegated `onAnswerClick` intercepts
   `a[href^="#cite="]`, decodes via `decodeURIComponent`, opens `MdDialog`
   against `mdUrl="/api/md"` for `askedRoot || root`). **BUT the
   `FleetSummary` half is missing**: `FleetSummaryClient.tsx` is never
   imported or rendered by `app/fleet/page.tsx` or `components/FleetLive.tsx`
   (exhaustive `grep -rn 'FleetSummaryClient' apps/web --include='*.ts*'`
   returns only its own definition + the renderer comments in
   `summaryHtml.ts`/`md.ts`). Feature 48's working-tree diff to
   `app/fleet/page.tsx` adds the Timeline/Search nav links and mounts
   `<ToolboxShell>` — it does NOT add `<FleetSummaryClient>`. So the summary
   card cannot reach the user. This contradicts the impl report (which
   claims `FleetSummary en /fleet` at lines 18, 19, 107) and the user
   request's "Files changed" promise (`apps/web/app/fleet/page.tsx (mounts
   FleetSummaryClient)`).
3. **PASS** — `apps/web/lib/md.ts` exports `FORBID_TAGS`/`FORBID_ATTR`/
   `DOMPURIFY_OPTIONS`/`MARKED_OPTIONS`/`CITE_RE`/`VIEWABLE_REF_RE` that are
   **byte-exact** with the legacy panel's `renderMd` + `linkCitations`
   (`handyman/assets/toolbox_panel.js:1029-1052` and `:1225-1252`). Every
   `dangerouslySetInnerHTML` in the three new client components is fed by a
   `sanitized*` variable computed through `renderSanitized(...)`:
   `IntakeClient.tsx:557` (`sanitizedPreview`), `AskClient.tsx:399`
   (`sanitizedAnswer`, computed as `renderSanitized(linkCitations(answerMd),
   …)`), `FleetSummaryClient.tsx:307` (`sanitizedSummary`). No RSC or route
   handler calls `renderSanitized` (LLM markdown renders client-side only).
   No external origins on any feat-48 surface
   (`grep -rEn 'src="https?://|unpkg|cdn'` on intake/ask/summary/md =
   empty). TIA2 + TIA7 enforce all of this.
4. **PASS** — `intakeHtml.ts`, `askHtml.ts`, `summaryHtml.ts`, `lib/md.ts`
   are import-clean of `react`/`next`/`marked`/`dompurify`/`@handyman`
   (verified: `grep -nE "from ['\"](react|next|marked|dompurify|@handyman)"
   <those 4 files>` = empty; the renderers only relatively import
   `escapeHtml` from `../../lib/md`, which is itself pure). `lib/md.ts`
   takes `marked`/`DOMPurify` as injectable params (the seam). Suite
   transpiles all four with the project's own TS and runs them in-process
   against fixtures (TIA2-TIA5, 9 cases). Deps justified in
   `docs/architecture.md` §2 C3 bullet "marked + dompurify en apps/web"
   citing feature 48 + decision D2.
5. **PASS** — `tests/test_toolbox_serve.sh` shows **48/48** default with
   assertions untouched; `git diff --stat
   tests/test_toolbox_serve.sh handyman/src/toolbox_serve.ts
   handyman/assets/toolbox_panel.js` is **empty** (working-tree invariant
   holds — these three files are NOT in feature 48's working-tree changes).
   `bash tests/run_tests.sh` ends with `ALL SUITES PASSED`; `./init.sh`
   exits 0 with `status: ok` and `lint: OK`.

## Verifier results

- `./init.sh`: **exit 0** (`status: ok`). The lint phase passes (the two
  SC2034 unused-var regressions the leader fixed in
  `tests/test_web_intake_ask.sh` are gone; `SHELL_COMPONENT`/`MD_DIALOG`
  were removed). The "no ready features" NOTE is expected — feat 48 is
  `in_progress`.
- `bash tests/run_tests.sh`: **ALL SUITES PASSED** (every suite reports
  `-> suite OK`, including the new `test_web_intake_ask.sh` registered at
  line ~45 of `run_tests.sh`).
- `bash tests/test_web_intake_ask.sh`: **18 run, 18 passed, 0 failed**
  (TIA1 file-existence, TIA2 md.ts policy/escape/link/renderSanitized,
  TIA3-TIA5 the three renderers transpiled pure with escaping + determinism,
  TIA6 client-wiring structural, TIA7 cross-view invariants).
- `bash tests/test_web_timeline_search.sh`: **16 run, 16 passed, 0 failed**
  (sibling feat-47 regression green).
- `bash tests/test_toolbox_serve.sh`: **48 run, 48 passed, 0 failed**
  (oracle intact, default mode).
- Protected-files working-tree diff: `git diff --stat
  tests/test_toolbox_serve.sh handyman/src/toolbox_serve.ts
  handyman/assets/toolbox_panel.js` → **empty**. Oracle integrity holds;
  feature 48 did not edit any of the three to make 48/48 pass.
- Typecheck: `cd apps/web && npx tsc --noEmit` → **0 errors**.

## Security review (THE most important section)

- **FORBID policy byte-exact vs panel**: **MATCH**.
  `apps/web/lib/md.ts:30-46` `FORBID_TAGS` =
  `["script","style","iframe","frame","form","input","textarea","button",
  "select","object","embed","link","meta","base"]` — identical to
  `toolbox_panel.js:1234-1238`. `FORBID_ATTR` (lines 54-66) =
  `["onerror","onclick","onload","onmouseover","onmouseout","onsubmit",
  "onfocus","onblur","onchange","style","formaction","srcset"]` — identical
  to `toolbox_panel.js:1238-1241`. `DOMPURIFY_OPTIONS` (lines 74-80):
  `ALLOW_DATA_ATTR: false`, `ALLOWED_URI_REGEXP:
  /^(?!(?:javascript|data|vbscript):)/i`, `KEEP_CONTENT: false` — all
  identical to `toolbox_panel.js:1242-1244`. `MARKED_OPTIONS`:
  `{ breaks: true, gfm: true }` — identical to `toolbox_panel.js:1249`.
  The panel and the seam produce the same sanitization policy byte-for-byte.
  TIA2-forbid asserts every one of these constants in-process.
- **linkCitations byte-exact vs panel**: **MATCH**.
  `CITE_RE = /\[fuente:\s*([^\]]+?)\s*\]/g` and
  `VIEWABLE_REF_RE =
  /^(current|history|checkpoints|index|backlog:[\w.-]+\.md|docs:[\w.-]+\.md)$/`
  — identical to `toolbox_panel.js:1029,1032`. The rewrite is byte-identical:
  viewable → `[\\[fuente: ${ref}\\]](#cite=${encodeURIComponent(ref)})`,
  non-viewable → `` `${match}` `` (code chip), matching
  `toolbox_panel.js:1034-1040`. The leading backslashes inside the link
  text are deliberate (escape the brackets for marked). TIA2-link asserts
  every viewable ref (`current`/`history`/`backlog:foo.md`/`docs:bar.md`/
  `checkpoints`/`index`) becomes a `#cite=` link with correct encoding
  (colon → `%3A`), non-viewable (`feature:xyz`) becomes a code chip with no
  `#cite=`, and mixed inputs are deterministic.
- **renderSanitized purity + call sites**: **MATCH**.
  `lib/md.ts` is import-clean of marked/dompurify (grep-verified); it takes
  them as `{ marked?, DOMPurify? }` params and, when either is missing,
  gracefully degrades to `escapeHtml(source).replace(/\r?\n/g, "<br>")`
  (identical to `toolbox_panel.js:1230-1231`) — never raw markup. The three
  client components import the real libs once at module top
  (`import DOMPurify from "dompurify"; import { marked } from "marked";`)
  and pass them in; RSC/route handlers never call `renderSanitized` (grep
  across `apps/web/app` and `apps/web/api` — the only hits are in the
  renderer comment blocks, not in RSC bodies). This is the security model:
  LLM markdown is only ever rendered client-side, post-hydration, through
  one sanctioned function.
- **LLM markdown never reaches dangerouslySetInnerHTML unsanitized**:
  **CONFIRMED**. Each `dangerouslySetInnerHTML` in the three new clients is
  fed by a `sanitized*` local:
  - `IntakeClient.tsx:555-558` → `sanitizedPreview = renderSanitized(draftMd,
    { marked, DOMPurify })` (line 354).
  - `AskClient.tsx:397-400` → `sanitizedAnswer = renderSanitized(linkCitations(answerMd),
    { marked, DOMPurify })` (line 351) — citations rewritten BEFORE
    sanitize, so `#cite=` links survive DOMPurify's fragment allowlist.
  - `FleetSummaryClient.tsx:305-308` → `sanitizedSummary = renderSanitized(summaryMd,
    { marked, DOMPurify })` (line 252).
  No other `dangerouslySetInnerHTML` site in the feature. Every dynamic
  value OUTSIDE those three pre-sanitized slots is React-escaped (the
  renderers `escapeHtml` the archetype/duplicates/model/grounded/error
  strings; the client components let React escape provider ids, harness
  names, error messages, etc.).
- **Cero external origins**: **CONFIRMED**. `grep -rEn 'src="https?://|unpkg|cdn'`
  over `apps/web/app/intake`, `apps/web/app/ask`,
  `apps/web/app/fleet/summaryHtml.ts`, `apps/web/components/{Intake,Ask,FleetSummary}Client.tsx`,
  `apps/web/lib/md.ts` → empty. `marked` + `dompurify` are bundled by Next
  (real ESM imports), no UMD `<script src>` anywhere. TIA7-origins enforces
  it.

## Architecture (C3) — deps + purity + listener invariant + zero-dash

- **Deps**: `apps/web/package.json` adds `"marked": "^12.0.0"` and
  `"dompurify": "^3.2.0"` under `dependencies`, `"@types/dompurify":
  "^3.2.0"` under `devDependencies`. The lockfile already resolves these
  (handyman vendors them as UMD), so no new resolutions. Versions match the
  C3 narrative (`marked@^12`, `dompurify@^3.2`).
- **C3 justification**: `docs/architecture.md` §2 has a dedicated bullet
  `**\`marked\` + \`dompurify\` en \`apps/web\`** (feature 48, CHECKPOINTS C3,
  decision D2 de backlog/explore_toolbox_next_unification.md)` explaining
  the same engine, same versions, ESM instead of UMD, single home for the
  policy at `lib/md.ts`, dep-injectable for the transpiled suite, and the
  rationale (no platform equivalent for marked + a sanitizer; disappears
  from Node when the panel is retired in feat 49; `@types/dompurify`
  devDep-only because dompurify 3.x ships its own types). TIA7-deps asserts
  the package.json declarations + the C3 cite.
- **Renderer purity**: all four new pure modules
  (`lib/md.ts`, `intakeHtml.ts`, `askHtml.ts`, `summaryHtml.ts`) are
  import-clean of react/next/marked/dompurify/@handyman; the three
  renderers relatively import only `escapeHtml` from `../../lib/md`. The
  suite transpiles them with the project's TS and runs them in-process
  (TIA2-TIA5) — they are CommonJS-runnable, deterministic, no side effects
  at import.
- **One global keydown listener**: `grep -rc 'document.addEventListener("keydown"'
  apps/web/{components,app,lib} | awk -F: '{s+=$2} END{print s}'` = **1**
  (the `ToolboxShell` listener from feat 47). The three new clients do not
  add their own. TIA7-listener enforces it.
- **Zero em/en-dash**: source-level `grep -rln $'\xe2\x80\x94' apps/web
  --include='*.ts' --include='*.tsx' --include='*.css' --include='*.json' |
  grep -v '.next'` = **empty** (en-dash variant also empty). The em-dash
  hits under `apps/web/.next/standalone/` are stale build output from a
  pre-fix `next build`; `.next/` is gitignored (`git check-ignore` confirms;
  `git status --short apps/web/.next` is empty). The leader's mechanical
  `—` → `-` / ` — ` → ` - ` replacement (per impl report lines 94-99) holds
  in source. The provider-empty placeholder is `"-"` not `"—"`.

## Progressive enhancement (/intake form works without JS)

**CONFIRMED.** `IntakeClient.tsx` wraps the entire intake in a single
`<form action={submitFormAction}>` where `submitFormAction` comes from
`useActionState(intakeAction, null)`. The draft textarea is a real React
`<textarea name="draft_md">` inside the form (line 537), the harness select
carries `name="root"` (line 399), and the tagged files are rendered as
real `<input type="hidden" name="files" value={p}>` (lines 574-576). With
JS off, a user pastes a draft, picks a harness, and presses Submit — the
form POSTs through `submitIntake` (a `"use server"` action) which writes
`feature-request.md`. The JS layer adds the live SSE draft (`/api/draft`),
the tag picker (`/api/files`), the clipboard copy, and the sanitized
preview — all progressive. None of the form fields is rendered via
`dangerouslySetInnerHTML`; the preview is the only sanitized-HTML region
and it lives inside a `<details>` (line 553), separate from the submit
path. This matches the legacy panel's intent and decision D2.

## Ask citation delegation (one handler, askedRoot, MdDialog)

**CONFIRMED.** `AskClient.tsx:382-396` defines exactly ONE click handler
`onAnswerClick` on the answer `<div>` (line 397 `onClick={onAnswerClick}`).
It:
1. Resolves the clicked anchor via `event.target.closest("a")`.
2. Bails unless `href.startsWith("#cite=")` (so normal links, if any, are
   untouched).
3. `event.preventDefault()`, `decodeURIComponent(href.slice(6))` to recover
   the ref.
4. `setMdDoc({ root: askedRoot || root, file: ref, title: \`fuente: ${ref}\` })`
   — and `askedRoot` is captured at ask-start (`setAskedRoot(root)` at line
   257) so the dialog keeps opening the harness the answer was actually
   asked about, even if the selector changes afterwards.
5. `<MdDialog doc={mdDoc} mdUrl={mdUrl} onClose={…} />` (line 409) with
   `mdUrl="/api/md"` from the page (line 78) handles the fetch + render.

`linkCitations` runs BEFORE `renderSanitized` (line 351), so the `#cite=`
hrefs are written into the markdown and survive DOMPurify (same-origin
fragment). Non-viewable refs (`feature:*`) become code chips, not links,
so they never trigger the handler. This is the exact security + UX model
of the legacy panel, ported cleanly.

## FleetSummary contract (cached + model)

**Component-level: CORRECT. Mount-level: MISSING (blocking).**

`FleetSummaryClient.tsx` itself is right: it POSTs `summarizeUrl`
(`/api/summarize`) with `{ provider }`, streams deltas into `summaryMd`,
renders through `renderSanitized(summaryMd, { marked, DOMPurify })`, and on
the `result` event reads `typed.cached` → `setCached(!!typed?.cached)`
(line 222) and `typed.model` → `setModel(String(typed.model))` (line 225).
The chips render conditionally on `phase === "done"`:
- `{phase === "done" && cached ? <span …>(cached)</span>}` (line 280)
- `{phase === "done" && model ? <span …>model: {model}</span>}` (line 284)

Both fields are exactly what feat 30's `result` event already provides, so
the data contract is sound.

**But the component is never mounted.** The second half of acceptance
bullet 2 ("FleetSummary en /fleet muestra summary…") requires the card to
appear on the `/fleet` page, and it does not. See the blocking defect
below.

## Risks / nits

1. **BLOCKING — `FleetSummaryClient` is never mounted on `/fleet`.**
   Exhaustive evidence:
   - `grep -rn 'FleetSummaryClient' apps/web --include='*.ts' --include='*.tsx'`
     returns only: the component's own definition
     (`components/FleetSummaryClient.tsx:156`), its css import (`:8`), the
     renderer comments in `app/fleet/summaryHtml.ts:7,19,26`, the
     `lib/md.ts:7` docstring, and stale copies under `.next/standalone/`.
     **Zero mount sites.**
   - `app/fleet/page.tsx` imports `FleetLive` and `ToolboxShell` — NOT
     `FleetSummaryClient`. Its working-tree diff adds Timeline/Search nav
     links + `<ToolboxShell>`; no `<FleetSummaryClient>`.
   - `components/FleetLive.tsx` imports `renderFleetHtml` + `FleetState`
     only — no summary.
   - `git log apps/web/app/fleet/page.tsx` shows it was last touched by
     feat 43 (`50741d4`), and feat 48's working-tree change does not add
     the mount — only nav + shell.
   The impl report contradicts this (lines 18, 19, 107 claim the summary
   is at `/fleet`); the user request's "Files changed" also promises
   "apps/web/app/fleet/page.tsx (mounts FleetSummaryClient)". The promise
   is unfulfilled.

   **Required fix (small, scoped to product code the implementer owns):**
   add `<FleetSummaryClient providersUrl="/api/providers"
   summarizeUrl="/api/summarize" />` somewhere inside the `/fleet` page
   (e.g. after `<FleetLive …/>` inside `<div className={styles.fleet}>`,
   or in its own `<section>`), import it at the top of
   `app/fleet/page.tsx`, and add a structural assertion to
   `tests/test_web_intake_ask.sh` that mounts the component (e.g. a TIA6
   case that greps `app/fleet/page.tsx` for `FleetSummaryClient` — the
   current TIA6-FleetSummary only checks the component file itself, not
   that it is mounted anywhere; that is a coverage gap that let this slip).
   Re-run the suite; expect 18/18 → 19/19 (or 18/18 if the new case
   replaces a placeholder).

2. **Test-coverage gap (related to #1).** TIA6-FleetSummary asserts the
   component exists, POSTs `/api/summarize`, and surfaces `(cached)` +
   `model` — but no case asserts that anything **mounts** it. The
   equivalent intake/ask cases implicitly cover mounting via the page
   wiring greps (`providersUrl="/api/providers"` in `INTAKE_PAGE`, etc.),
   but FleetSummary has no such page-level assertion. Recommend adding one
   alongside the fix above so this regression cannot recur.

3. **Non-blocking nit — stale `.next/standalone/` build output.** The
   `apps/web/.next/standalone/apps/web/…` tree contains pre-fix em-dash
   copies of the new files. `.next/` is gitignored (confirmed via
   `git check-ignore` and `git status --short apps/web/.next` = empty), so
   this does NOT pollute the repo or the working tree. It is purely a local
   build artifact. A `rm -rf apps/web/.next` before the next `next build`
   would clean it, but it has zero effect on any verifier and is out of
   scope for this feature's source. No action required; flagged for
   transparency (and consistent with the render-leak awareness rule: the
   source files are clean, the build output is stale).

4. **Non-blocking nit — `announce.ts` module singleton.** Same observation
   as the feat-47 review: `lib/announce.ts` holds module-scoped mutable
   state for the debounced writer. This is the intended browser-side port
   (one writer per page, regions are singletons by id), SSR-safe via the
   `typeof document` guard, and not exercised by the transpiled suite
   (which only covers the pure `mergeAnnouncements`). The three new
   clients call `announce.assertive`/`announce.polite` at call-time only,
   never at import. No change requested.

## Verdict + required changes

**CHANGES_REQUESTED.** One blocking defect (FleetSummary not mounted) +
one related test-gap. Everything else is APPROVED-quality.

**Required before re-review:**

1. Mount `<FleetSummaryClient providersUrl="/api/providers"
   summarizeUrl="/api/summarize" />` on the `/fleet` page (in
   `apps/web/app/fleet/page.tsx`) so acceptance bullet 2's "FleetSummary en
   /fleet" is actually delivered. The component itself is correct; only the
   mount is missing.
2. Add a structural assertion in `tests/test_web_intake_ask.sh` that
   `app/fleet/page.tsx` mounts `FleetSummaryClient` (close the coverage
   gap that allowed the slip).
3. Re-run `./init.sh`, `bash tests/run_tests.sh`,
   `bash tests/test_web_intake_ask.sh`, `bash tests/test_toolbox_serve.sh`,
   `cd apps/web && npx tsc --noEmit` — all must be green.

**Not required (already green/correct):** sanitization policy (byte-exact
with panel), `linkCitations` (byte-exact), renderer purity, intake
progressive enhancement, ask citation delegation, deps + C3, oracle
integrity, listener invariant, zero-dash source, typecheck.

## Re-review (post fix)

Focused re-review of the one blocking defect (FleetSummaryClient not
mounted on `/fleet`). The leader's fix lands cleanly.

**Fix verified.**

1. **Mount is real and correct.** `apps/web/app/fleet/page.tsx` line 2
   adds `import { FleetSummaryClient } from "../../components/FleetSummaryClient";`
   (real import, not a comment) and line 90 renders it as JSX:
   `<FleetSummaryClient providersUrl="/api/providers" summarizeUrl="/api/summarize" />`.
   It is a sibling of `<div className={styles.fleet}>` at the foot of
   `<main>` — NOT inside the `!ok` condition, NOT in a loop, NOT
   double-mounted. Props match the component's contract at
   `apps/web/components/FleetSummaryClient.tsx:156` (`providersUrl` +
   `summarizeUrl`, both same-origin).
2. **Regression test catches it.** `tests/test_web_intake_ask.sh` adds the
   case "FleetSummaryClient is mounted on /fleet (import + render)" which
   greps for FOUR markers independently as a logical AND
   (`grep -q A "$FLEET_PAGE" && grep -q B ... && grep -q C ... && grep -q D ...`):
   `import { FleetSummaryClient }`, `<FleetSummaryClient`,
   `providersUrl="/api/providers"`, `summarizeUrl="/api/summarize"`.
   Removing any one of the import / JSX / either prop fails the case. The
   suite is now 19 cases (was 18).
3. **No collateral damage.** The existing `/fleet` structure is intact:
   `FleetLive` still mounted at line 87, `ToolboxShell` still mounted at
   line 69, the `!ok` down-state `<section>` still present at line 77.
   Mount is purely additive.

**Verifier results (fresh run this session):**

- `./init.sh`: **exit 0** (`status: ok`, `lint: OK`, `build: OK`).
- `bash tests/run_tests.sh`: **ALL SUITES PASSED**.
- `bash tests/test_web_intake_ask.sh`: **19 run, 19 passed, 0 failed**.
- `bash tests/test_toolbox_serve.sh`: **48 run, 48 passed, 0 failed** (oracle intact).
- `cd apps/web && npx tsc --noEmit`: **0 errors**.
- Protected-files working-tree diff:
  `git diff --stat tests/test_toolbox_serve.sh handyman/src/toolbox_serve.ts handyman/assets/toolbox_panel.js`
  → **empty** (oracle integrity holds; feat 48 did not edit any of the three).
- Render-leak audit: `grep -cF '{"$mid":24'` returns **0** on
  `fleet/page.tsx`, `FleetSummaryClient.tsx`, and this report. The
  trailing `{"$mid":24,"mimeType":"cache_control","data":"ZXBoZW1lcmFs"}`
  blobs in tool output are rendering artifacts, not file content.

**Verdict: APPROVED.** The blocking defect is resolved with a minimal,
additive mount + a regression case that prevents recurrence. All four
focus items (mount real/correct, regression test catches removal,
verifier green, no collateral damage) pass. The previously-APPROVED
audit items (sanitization byte-exact, linkCitations byte-exact,
renderSanitized purity + call sites, renderer purity, deps + C3, oracle
integrity, typecheck, progressive enhancement, ask citation delegation,
zero external origins, one-listener invariant, zero-dash invariant)
remain green and were not re-touched in this focused re-review.

APPROVED

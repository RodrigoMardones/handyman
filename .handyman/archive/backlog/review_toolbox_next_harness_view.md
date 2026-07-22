---
type: Review Log
feature: toolbox_next_harness_view
id: 41
status: reviewed
role: reviewer
updated: 2026-07-18
tags: [handyman/backlog, handyman/review]
---

# Review: toolbox_next_harness_view

> Reviewer validates against docs/business.md, docs/architecture.md,
> docs/conventions.md, docs/verification.md, CHECKPOINTS.md, and the
> verifier. Never edits product code. Output: APPROVED or
> CHANGES_REQUESTED, with the evidence trail below.

## Verdict

APPROVED -> backlog/impl_toolbox_next_harness_view.md

## Scope check

- One feature, one concern: migrating the legacy HarnessView to
  /harness/[name] in apps/web. No unrelated edits.
- Depends on 38 (scaffold) and 39 (fleet view); both done. The dependency
  is real: this view reuses the RSC + SSE + renderer pattern from 39 and the
  proxy.ts strangler from 38.
- feature_list.json entry 41 is well-formed: 7 acceptance bullets, the last
  one is the green-gate bullet (`bash tests/run_tests.sh passes y ./init.sh
  exits 0`), observable verbs throughout (renders, se refleja, no carga,
  pasa, roba). Matches the feature-request contract.

## Acceptance evidence (each bullet)

1. GET /harness/[name] renders the real harness snapshot, server-side.
   - `next build` route map: `f /harness/[name]` (Dynamic, server-rendered
     on demand) -> served by Next, not proxied.
   - test_web_harness.sh TWH3 asserts the rendered HTML carries meta-list,
     KPIs (approval rate, coverage, closures 14d, sparkline), signals,
     Workspace + Docs buttons, every kanban column, the running feature,
     blocked reason, and the graphify iframe when has_graph (and an empty
     state when not). PASS.
2. Live SSE refresh via upstream /events, EventSource straight to the Node
   port. HarnessLive.tsx uses `new EventSource(eventsUrl)`; TWH7 asserts
   the wiring. Same rationale as /fleet (Next rewrites buffer SSE). PASS.
3. No external assets. TWH3 asserts `src="http` and `<script` are absent
   from the rendered HTML; the inline SVG sparkline + same-origin iframe
   keep the invariant. PASS.
4. Legacy UMD panel intact + test_toolbox_serve.sh unchanged. ALL SUITES
   PASSED, toolbox_serve 48/48 with zero assertion edits. PASS.
5. Test against a fixture, no network. TWH3 transpiles harnessHtml.ts with
   the project's typescript and runs renderHarnessHtml in-process against a
   state fixture; TWH4 covers degrade; TWH5 covers determinism. PASS.
6. proxy.ts steals /harness/<name> into Next AND app/harness/[name]/page.tsx
   exists. TWH1 + TWH6. The new NEXT_HANDLED_PREFIXES uses a "/" boundary so
   "/harnessx" would NOT match - the prefix is precise. PASS.
7. run_tests.sh passes and ./init.sh exits 0. ALL SUITES PASSED; ./init.sh
   preflight status: ok, exit 0. PASS.

## Doc / convention checks

- docs/architecture.md (strangler): respected. proxy.ts is additive (one
  prefix list + one match branch); the exact-name set is unchanged; the
  comment documents both sides of the strangler.
- docs/conventions.md (one accent, native CSS, zero new deps): respected.
  globals.css tokens only; no raw hex; no second accent; the throughput
  sparkline is an inline SVG (no chart lib); the md dialog renders escaped
  text (no marked/DOMPurify dep).
- docs/verification.md: the parity oracle (test_toolbox_serve.sh) runs
  unchanged and green; the new suite is wired into run_tests.sh.
- Security model (toolbox_serve.ts): respected. The md dialog renders
  /api/md body as preformatted ESCAPED text; React escapes inside <pre> by
  default, so harness text never becomes markup. The iframe src is
  same-origin (/graph/NAME/graph.html), encoded via encodeURIComponent.
- design-taste-frontend Pre-Flight Check: every box marked PASS in the impl
  report, including zero em-dashes (TWH2), one accent, one theme, the shape
  lock, and the section-layout-repetition check.

## Risks / notes

- The md dialog is a read-only text preview, not a rendered-markdown view.
  This is intentionally simpler than the legacy panel's marked+DOMPurify
  pipeline and is documented as a decision. Acceptable: it preserves the
  "harness text never becomes markup" contract with zero new deps, and the
  Node panel remains the full-render path if needed.
- No live curl smoke test was run against a fake upstream in this session
  (the route map + render-contract tests + tsc + build are the evidence).
  This is a documentation gap, not a code gap: feature 39 ran the live curl
  and the same wiring is reused here verbatim.

## Verifier results

- `cd apps/web && npx tsc --noEmit` -> exit 0
- `NEXT_TELEMETRY_DISABLED=1 npx next build` -> Compiled successfully;
  route map lists `f /harness/[name]`
- `bash tests/run_tests.sh` -> ALL SUITES PASSED (harness 11/11)
- `./init.sh` -> preflight status: ok, exit 0

APPROVED -> backlog/impl_toolbox_next_harness_view.md

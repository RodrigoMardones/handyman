---
type: Implementation Log
feature: toolbox_ask_fleet
status: implemented
role: implementer
updated: 2026-07-18
tags: [handyman/backlog/impl]
---

# Implementation report: toolbox_ask_fleet (feature #31)

Grounded fleet Q&A for the toolBox observer: a `#/ask` panel view backed by
`POST /api/ask` that retrieves the BM25 top-k fragments of one harness's
corpus (reusing `buildCorpus`), streams the LLM's answer over SSE with a
mandatory `[fuente: <ref>]` citation per claim, and links each citation to
its real document through the existing `GET /api/md` viewer. No disk writes,
no cache — each question is fresh.

## What changed (file-by-file)

- **`handyman/src/toolbox_ask.ts` (new)** — two-layer module mirroring
  `toolbox_summary.ts`:
  - `retrieveTopK(question, docs, k=6)`: MiniSearch (dynamic import, fields
    `["title","text"]`, `searchOptions {prefix:true, fuzzy:0.2}` — same
    pattern as `detectDuplicates`) over the given corpus docs; returns
    `AskFragment[]` (`{id, ref, kind, title, score, excerpt}` with the
    excerpt capped at 1200 chars); `[]` on empty corpus/question.
  - `composeAskSystem()`: English anti-hallucination system prompt —
    fragments are the ONLY source of truth, every claim must carry a
    verbatim `[fuente: <ref>]` bound to a provided fragment ref, exact
    `"no sé"` when insufficient, concise markdown.
  - `composeAskPrompt(question, fragments)`: labeled block, each fragment
    as `[fuente: <ref>] (<kind>: <title>)` + excerpt, then the question
    under a `---- user question ----` marker (the marker also drives the
    mock-LLM routing in tests).
  - `relayAsk({system, prompt, draft, fragments, ...})`: injected `DraftFn`
    seam; result `{answer_md, model, fragments}` (fragments echoed);
    `LlmError` → `onError`, unknown errors wrapped as `provider_error`.
- **`handyman/src/toolbox_serve.ts`** — new `handleAskRequest` +
  `POST /api/ask` route (handled before the GET-only guard, alongside
  draft/summarize/intake). Validation before any LLM call: JSON object body
  (400), non-empty `root` (400), non-empty trimmed `question` (400),
  registered root (400), provider default `"zai"` / unknown → 400. Corpus =
  `buildCorpus(hroot)` filtered to `id.startsWith(root + "::")`. Model via
  the existing `resolveSummaryModel` (unchanged — same cheap-model
  precedence as summarize). SSE events: `delta {text}`, `result {answer_md,
  model, fragments:[{ref,kind,title,score}]}` (excerpts stay server-side),
  `error {code,message}`. Header endpoint list, security-model bullet and
  the POST-exceptions routing comment updated to the four POST routes.
  Added a small `.ask-answer` block to `PANEL_CSS`.
- **`handyman/assets/toolbox_panel.js`** — new `AskView` (harness selector,
  provider selector defaulting to zai, question textarea, Ask button)
  streaming via the shared `streamSseOverPost("/api/ask", ...)` with abort
  on unmount; `linkCitations()` + one delegated click handler for citation
  links (details below); errors → `announce.assertive("ask failed: ...")`;
  empty-provider actionable hint (same text as FleetSummary/Intake). Wiring:
  nav link `ask`, hash route `#/ask`, palette action `view_ask` (with
  `g a` go-shortcut), SHORTCUTS_HELP row updated.
- **`tests/test_toolbox_serve.sh`** — mock LLM now buffers the request body
  and routes on the `"---- user question"` marker (ask → deterministic cited
  answer; anything else → the original summarize deltas, so all existing
  summarize assertions pass byte-identically). New TS7b3 block (after the
  summarize cases — the shared call counter's `calls=1` cache-hit assertion
  has already run — and before TS8's workspace mutation): SSE-shape +
  citation + top-k fragment case, unregistered-root 400, empty/missing
  question 400, and the structural panel-marker case. Header comment
  updated. Already wired in `run_tests.sh` line 36 (unchanged).

## Design decisions

- **Retrieval k = 6** (`DEFAULT_TOP_K` in toolbox_ask.ts), excerpts capped
  at 1200 chars: 6 × 1.2 KB ≈ 7 KB of context — enough grounding for the
  fixture-scale corpora while staying well inside a cheap model's window.
  The handler passes the whole per-root corpus and lets `retrieveTopK`
  pick; corpus docs are reused as-is (`AskDoc` is a structural subset of
  the server's `CorpusDoc`, so "reusa buildCorpus" holds with zero copying).
- **Citation links through DOMPurify**: the answer markdown is
  post-processed BEFORE `renderMd`. `linkCitations()` rewrites each
  `[fuente: <ref>]` whose ref matches the `/api/md` whitelist
  (`current|history|checkpoints|index|backlog:*.md|docs:*.md`) into a
  markdown link `[\[fuente: ref\]](#cite=<encodeURIComponent(ref)>)`;
  marked emits `<a href="#cite=...">[fuente: ref]</a>`, which survives the
  existing sanitize config untouched (DOMPurify allows `<a href>`; a `#`
  href passes `ALLOWED_URI_REGEXP`; `FORBID_TAGS`/`FORBID_ATTR`/
  `ALLOW_DATA_ATTR:false` are NOT weakened — the ref rides the href, not a
  data attribute). ONE delegated click handler on the answer container
  intercepts `#cite=` hrefs and opens the ref via the existing `openMd`
  md-dialog (`GET /api/md?root=&file=<ref>`), pinned to the harness the
  answer was asked about (`askedRoot`), not the current selector value.
  Non-viewable refs (`feature:*`) are wrapped in backticks → the `.md-body
  code` style renders them as highlighted chips, no dead links.
- **Mock-prompt routing in tests**: the mock's completion handler now reads
  the body and branches on the `"---- user question"` substring that only
  `composeAskPrompt` emits. Summarize keeps its fixed `"fleet " + "summary
  ok"` deltas, so no existing assertion changed. The shared `/v1/calls`
  counter stays valid because the ask cases run strictly after the
  summarize cache-hit assertion (documented in the test block comment).
- `resolveSummaryModel` was reused as-is (no rename): the spec allowed a
  trivial generalization but a plain call keeps summarize behavior
  byte-identical and the diff minimal; the ask handler comments the shared
  cheap-model rationale.

## Test evidence

`cd handyman && npm run build` — clean (tsc, no diagnostics). `node --check
assets/toolbox_panel.js` — OK. `biome check src/toolbox_ask.ts` — clean;
`src/toolbox_serve.ts` carries only the same three pre-existing diagnostics
as HEAD (organizeImports / noImplicitAnyLet / format debt) — no new ones.

`bash tests/run_tests.sh` (tail):

```
  PASS POST /api/ask streams SSE delta + result with citation and top-k fragments
  PASS POST /api/ask rejects an unregistered root with 400
  PASS POST /api/ask rejects an empty or missing question with 400
  PASS panel asset ships the #/ask view (route, palette action, citation links, failure announce)
  ...
  PASS SSE emits a change event when the workspace mutates

Summary: 48 run, 48 passed, 0 failed
-> suite OK

==============================================
ALL SUITES PASSED
```

`./init.sh` (tail):

```
--> worklist: OK
    32 toolbox_backlog_triage
    ...
    ready: 4 feature(s)
    status: ok
==> preflight: stability report complete (read-only; exit 0)
status: ok
```

Exit code 0.

Rendering pipeline spot-check (node, marked with the panel's transform):
`the alpha feature is done [fuente: backlog:impl_alpha.md] and planned
[fuente: feature:alpha]` →
`<p>... <a href="#cite=backlog%3Aimpl_alpha.md">[fuente:
backlog:impl_alpha.md]</a> ... <code>[fuente: feature:alpha]</code></p>`.

## Risks / notes

- The result event's `fragments` drop the excerpts on the wire (refs +
  kind/title/score only) — the client needs only refs to link; if a future
  view wants to show excerpts, extend the map in `handleAskRequest`.
- Citation-ref validation is by construction (the system prompt + the
  client links only whitelist-shaped refs); an invented viewable-shaped ref
  would render as a link whose md-dialog then shows the `/api/md` 400/404
  text — fail-safe, no injection surface.
- The top-k assertion in tests pins `feature:alpha` (both question terms
  hit its text) rather than a tie-prone backlog doc; the citation-presence
  assertion (`backlog:impl_alpha.md`) comes from the deterministic mock, so
  the case is stable against BM25 tie-break drift.
- `index` refs are viewable/linkable in the panel although `buildCorpus`
  does not currently emit an `index` ref — harmless forward-compat with
  `resolveMd`'s whitelist.

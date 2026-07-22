---
type: Review Log
feature: toolbox_ask_fleet
status: approved
role: reviewer
updated: 2026-07-18
tags: [handyman/backlog/review]
---

# Review: toolbox_ask_fleet (feature #31)

## Verdict

**APPROVED.** All six acceptance criteria are verifiably satisfied. The
implementation reuses the existing corpus/relay/sanitize infrastructure with
no weakening of the security model, both verifiers are green (run
independently by the reviewer), and dist/ is rebuilt and consistent with src.
Scope reviewed: #31's delta (`toolbox_ask.ts` new, plus the ask-specific
changes in `toolbox_serve.ts`, `toolbox_panel.js`, `test_toolbox_serve.sh`);
feature #30's summarize files share the branch and were treated as baseline.

## Acceptance-by-acceptance

### 1. `#/ask` view (nav + route + palette, question box, harness/provider selectors) — PASS

`handyman/assets/toolbox_panel.js`:
- Nav link `<a href="#/ask">ask</a>` and hash route `#/ask` →
  `AskView` in `App()`.
- Palette action `{ id: "view_ask", label: "go to ask", hash: "#/ask",
  key: "a" }` in `VIEW_ACTIONS`; `SHORTCUTS_HELP` updated to
  `g then f · t · s · i · a` (no key collision).
- `AskView` renders a harness `<select>` (kept valid as the fleet changes
  over SSE), a provider `<select>` (populated from `/api/providers`,
  available-only, defaults to zai), a question `<textarea>`, and an Ask
  button gated on root+provider+non-empty question. In-flight ask aborted on
  unmount via `AbortController`.

### 2. `POST /api/ask` — top-k BM25 in Node reusing buildCorpus, SSE relay, no disk writes — PASS

- `handleAskRequest` (`handyman/src/toolbox_serve.ts`): corpus =
  `buildCorpus(deps.hroot).filter((d) => d.id.startsWith(`${root}::`))` —
  buildCorpus reused verbatim, filtered to the requested root.
- `retrieveTopK` (`handyman/src/toolbox_ask.ts`): MiniSearch dynamic import
  (BM25, fields `["title","text"]`, `{prefix:true, fuzzy:0.2}` — same
  pattern as `detectDuplicates`), k=6, excerpts capped at 1200 chars; `[]`
  on empty corpus/question. `AskDoc` is a structural subset of `CorpusDoc`,
  zero copying.
- SSE relay: `delta {text}` → `result {answer_md, model, fragments}`
  (fragments stripped to `{ref, kind, title, score}` on the wire) →
  `error {code, message}`. Routed before the GET-only guard alongside
  draft/summarize/intake; the four-POST routing comment and the header
  security-model bullet are updated accordingly.
- No disk writes: `toolbox_ask.ts` imports no fs; `handleAskRequest` only
  reads (registry, corpus). No cache — each question calls the provider.

### 3. System prompt: verbatim `[fuente: <ref>]` bound to provided fragments + "no sé" — PASS

`composeAskSystem()` states fragments are the ONLY source of truth, every
claim must carry `[fuente: <ref>]` with the ref copied VERBATIM from a
provided fragment ("Never invent, merge, or alter a ref"), and requires the
exact reply `"no sé"` when fragments are insufficient. `composeAskPrompt()`
repeats the exact citation form in each fragment header so only provided
refs can be copied.

*Note (info):* the feature text writes the form as `[fuente: ruta#id]`; the
implementation uses `[fuente: <ref>]` where `<ref>` is the `/api/md` route
identifier (`backlog:x.md`, `current`, …). Corpus granularity is
whole-document, so there is no sub-`#id`; the ref is exactly what makes
acceptance 4's linking work. Deviation in literal spelling only — accepted.

### 4. Citations link to real paths via GET /api/md; DOMPurify NOT weakened — PASS

- `linkCitations()` runs BEFORE `renderMd`: refs matching
  `VIEWABLE_REF_RE` (`current|history|checkpoints|index|backlog:*.md|
  docs:*.md` — mirrors the server's `resolveMd` whitelist, `[\w.-]+` bars
  `/` traversal) become markdown links to `#cite=<encodeURIComponent(ref)>`;
  non-viewable refs (`feature:*`) become inert code chips.
- Reviewer reproduced the pipeline in Node with the repo's marked:
  `alpha done [fuente: backlog:impl_alpha.md], planned [fuente:
  feature:alpha], evil [fuente: ../../etc/passwd.md]` →
  `<a href="#cite=backlog%3Aimpl_alpha.md">[fuente: backlog:impl_alpha.md]</a>`,
  `<code>[fuente: feature:alpha]</code>`,
  `<code>[fuente: ../../etc/passwd.md]</code>` (traversal-shaped ref fails
  the whitelist → chip, never a link).
- Sanitize config verified unchanged against HEAD (the diff touches it only
  in a comment): `FORBID_TAGS`, `FORBID_ATTR`, `ALLOW_DATA_ATTR:false`,
  `ALLOWED_URI_REGEXP:/^(?!(?:javascript|data|vbscript):)/i`,
  `KEEP_CONTENT:false` all intact. `<a href="#cite=...">` survives: `a`/
  `href` are not forbidden and a fragment href passes the URI regexp.
- ONE delegated click handler (`onAnswerClick` on the answer `.md-body`,
  via `closest("a")` + `#cite=` prefix check) opens the ref through the
  existing `openMd(root, file, label)` md-dialog (`GET /api/md?root=&file=`),
  pinned to `askedRoot` — the harness the answer was asked about — not the
  live selector value. `preventDefault()` stops the hash router from
  swallowing the click.

### 5. Tests: fake provider + fixture corpus, top-k, SSE shape, citation, 400s, no network — PASS

`tests/test_toolbox_serve.sh` TS7b3 (already wired via `run_tests.sh`):
- Mock LLM (127.0.0.1, exported as `OLLAMA_BASE_URL`) now buffers the body
  and routes on the `"---- user question"` marker only `composeAskPrompt`
  emits: ask → deterministic cited answer; everything else → the original
  summarize deltas, so every pre-existing summarize/draft/intake assertion
  is untouched (diff is purely additive around them).
- Happy path asserts: `event: delta` and `event: result` frames present;
  `answer_md` contains `[fuente: backlog:impl_alpha.md]` (citation);
  `fragments.length > 0` with full `{ref, kind, title, score}` shape;
  top-k hit pinned on `feature:alpha` (both question terms in its text —
  stable against tie-break drift).
- Guards: unregistered root → 400; empty (`"   "`) and missing question →
  400. Structural panel case checks `"/api/ask"`, `href="#/ask"`,
  `view_ask`, `fuente`, `ask failed` markers.
- Ordering documented and correct: TS7b3 runs after the summarize cache-hit
  assertion (shared `/v1/calls` counter still valid) and before TS8's
  workspace mutation.
- No network beyond 127.0.0.1: mock binds 127.0.0.1, observer binds
  127.0.0.1, provider "ollama" points at the mock.

### 6. Verifier green — PASS (run by reviewer, evidence below)

## Security contract

- **Observer read-only:** `/api/ask` writes no disk (verified by reading the
  full handler and module); `/api/intake` remains the sole write.
- **Validation before any LLM call:** body-shape 400, root 400, question
  400, registered-root 400, unknown-provider 400 all fire before
  `provider.draft` and before the SSE `writeHead`. Body capped at 256 KB by
  `readJsonObject`.
- **No key material in responses:** SSE carries only delta text, the result
  payload, and `LlmError` code/message (pre-existing error surface,
  unchanged by this feature).
- **Live-region invariant intact:** zero `aria-live` occurrences in the
  panel asset; AskView reuses `announce.assertive` (the static
  `live-assertive` region the server renders) and a non-live
  `role="note"` paragraph.
- **dist/ rebuilt:** `dist/toolbox_ask.js` exists (mtime Jul 18 01:54,
  alongside rebuilt `toolbox_serve.js`/`toolbox_summary.js`/
  `toolbox_llm.js`); spot-check confirms `DEFAULT_TOP_K = 6`,
  `EXCERPT_CAP = 1200`, the "no sé" prompt text, and 7 `/api/ask`
  occurrences in `dist/toolbox_serve.js` — consistent with src.

## Findings (severity-ranked)

1. **Low — unguarded async handler (pre-existing pattern).**
   `handleAskRequest(req, res, ...)` is invoked without a rejection guard in
   the route dispatch; a throw between `readJsonObject` and the try-scoped
   `relayAsk` (e.g. a MiniSearch dynamic-import failure inside
   `retrieveTopK`) would surface as an unhandled rejection. Identical to the
   existing draft/summarize/intake dispatch pattern and the import is a
   bundled dependency, so not blocking — a shared `.catch` wrapper would be
   a nice follow-up hardening for all four POST handlers.
2. **Info — citation form vs spec literal.** `[fuente: <ref>]` instead of
   the spec's `[fuente: ruta#id]` (see acceptance 3 note). Accepted: the
   ref is the real `/api/md` route id and there is no sub-document id at
   corpus granularity.
3. **Info — `index` ref linkable but never emitted.** `VIEWABLE_REF_RE`
   accepts `index` though `buildCorpus` never produces that ref; harmless
   forward-compat with `resolveMd`, already flagged by the implementer.

## Verifier evidence (reviewer-run)

`bash tests/run_tests.sh` tail:

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

`./init.sh` tail (exit code 0):

```
--> worklist: OK
    32 toolbox_backlog_triage
    33 toolbox_acceptance_from_diff
    34 toolbox_review_notes
    35 toolbox_retro_lessons
    ready: 4 feature(s)
    status: ok
==> preflight: stability report complete (read-only; exit 0)
status: ok
```

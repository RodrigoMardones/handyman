---
type: Implementation Log
feature: toolbox_fleet_summary
status: implemented
role: implementer
updated: 2026-07-18
tags: [handyman/backlog/impl]
---

# Implementation report: toolbox_fleet_summary (#30)

POST /api/summarize on the toolBox observer: digests the /api/state document,
caches by its sha256 hash, and relays the chosen LLM provider's ~5-line fleet
summary over SSE. Fleet view gets a Summarize control with a sanitized
markdown output and a "(cached)" note on replays.

## What changed (file-by-file)

- **handyman/src/toolbox_llm.ts** — `DraftRequest` gains optional
  `model?: string`. Both adapters (anthropic + openai-compat) now resolve
  `req.model ?? options.model`, send it as the request-body model, and report
  it in `DraftResult.model`. Everything else untouched.
- **handyman/src/toolbox_summary.ts** (new) — mirrors toolbox_draft.ts's
  two-layer split:
  - `buildSummaryDigest(state)`: deterministic compact digest of buildState()
    — per harness {project name, feature status counts, signal labels, error
    flag}, the fleet aggregate, and the recent timeline entries (date/kind/
    text, cap 15). Volatile fields (generated_at, registry path, metrics,
    sessions) are excluded so the hash is stable on an unchanged fleet.
  - `summaryHash(digest)`: sha256 hex (node:crypto) over a canonical JSON
    (recursively key-sorted stringify).
  - `composeSummarySystem()`: English system prompt restricting the model to
    the provided fleet-state data ONLY — asks for ~5 narrative lines (recent
    closures, pending features, notable signals, harness names), forbids
    inventing features/harnesses/numbers, and REQUIRES answering exactly
    "no sé" when the data is insufficient (anti-hallucination).
  - `composeSummaryPrompt(digest)`: labeled plain-text FLEET STATE block.
  - `relaySummary({system, prompt, draft, onDelta, onResult, onError})`:
    injected DraftFn, LlmError funneled to onError (unknown failures wrapped
    as provider_error), result {summary_md, model}. HTTP-agnostic.
  - `SummaryCache`: bounded Map keyed by hash storing {summary_md, model,
    created_at ISO}; keeps the most recent 16 insertions, evicts oldest.
- **handyman/src/toolbox_serve.ts** — POST /api/summarize handled next to
  /api/draft before the GET-only guard. Body {provider?, model?} (or `{}`);
  provider defaults to "zai"; unknown/unbuilt provider → 400
  {ok:false,error:"unknown provider"}. Flow: buildState → digest → hash;
  cache hit → single SSE `event: result` {summary_md, model, cached:true,
  hash} WITHOUT calling the provider; miss → provider.draft(..., model)
  streaming `event: delta` {text}, then cache + `event: result`
  {..., cached:false, hash}; provider failure → `event: error`
  {code, message}. Never writes disk. `resolveSummaryModel()` documents the
  precedence (see Design decisions). One `SummaryCache` per serveMain
  process. File-header endpoint list and the GET-only-guard comment updated
  to cover the third POST route. PANEL_CSS gains a small `.fleet-summary`
  block (select styling + output card) reusing existing tokens.
- **handyman/assets/toolbox_panel.js** — the intake's SSE-over-POST client is
  generalized to `streamSseOverPost(url, body, handlers, signal)`
  (`streamDraftSse` kept as a thin /api/draft wrapper, so every existing
  structural test still greps its markers). New `FleetSummary` component
  rendered at the bottom of `FleetView`: provider select (available
  providers from /api/providers, default zai when present), Summarize
  button, deltas streamed into a sanitized markdown block via
  renderMd + dangerouslySetInnerHTML (marked + DOMPurify), a "(cached)"
  note when result.cached is true, and failures announced via
  `announce.assertive("summary failed: ...")`. No new aria-live surfaces
  (the live-region invariant test still holds).
- **tests/test_toolbox_serve.sh** — a mock OpenAI-compatible LLM server
  (mockllm.js, written into the fixture) boots BEFORE the observer; its port
  is exported as OLLAMA_BASE_URL so provider "ollama" becomes the
  deterministic fake. Four new cases after TS7b, before TS8 (the two
  summarize calls are adjacent with no workspace mutation between them):
  SSE delta+result with summary_md "fleet summary ok" and cached:false; the
  immediate second call cached:true, identical summary/hash, mock completion
  count still 1; unknown provider → 400; panel structural greps
  ("/api/summarize", "summary failed", "(cached)"). Already wired in
  run_tests.sh line 36; no test touches the network (127.0.0.1 only).

## Design decisions

- **Model resolution** (`resolveSummaryModel` in toolbox_serve.ts):
  `body.model ?? env.TOOLBOX_SUMMARY_MODEL ?? ("glm-4.7-flash" when provider
  is "zai" AND Z_AI_API_MODE === "paas") ?? undefined` (undefined = the
  provider's configured model). Rationale: glm-4.7-flash is a free/cheap
  model on Z.ai pay-as-you-go paas/v4 (verified on docs.z.ai pricing, July
  2026), but the Z.ai Coding Plan Anthropic endpoint empirically serves only
  GLM-5.2 (toolbox_llm.ts header), so forcing flash there would break. The
  per-request override rides the new `DraftRequest.model` field.
- **Hash/digest stability**: the digest is built field-by-field in fixed
  insertion order and hashed via a recursively key-sorted canonical JSON, so
  neither object-key order nor volatile state fields (generated_at) can move
  the hash. Signals depend on the server's `today` (date granularity) — the
  hash is stable within a day for an unchanged fleet, which is the cache's
  contract. Timeline is capped at 15 entries.
- **Mock-server test approach**: rather than stubbing inside Node, the suite
  boots a real localhost HTTP mock speaking the OpenAI SSE dialect
  (2 content deltas + stop + [DONE]) and counts completion calls via
  GET /v1/calls. Exporting OLLAMA_BASE_URL makes the always-instantiated
  "ollama" provider the fake (its health check hits GET /models on that
  base), so the observer runs the REAL adapter + relay code path with zero
  network. The single observer boot line changed only by the env prefix;
  all 40 pre-existing cases still pass.
- **Cache placement**: server-side, keyed by state hash, bounded to 16 —
  per-process like the provider set, so a restart (or any fleet change)
  naturally invalidates.

## Test evidence

`cd handyman && npm run build` — clean (tsc, no errors). `npm run lint`
(biome) reports the same pre-existing findings as on HEAD; the new
toolbox_summary.ts is format/lint clean (no new diagnostics introduced).

`bash tests/run_tests.sh` tail:

```
  PASS POST /api/summarize streams SSE delta + result from the fake provider
  PASS second identical POST /api/summarize is a cache hit (provider not called again)
  PASS POST /api/summarize rejects an unknown provider with 400
  PASS panel asset ships the fleet Summarize control (route, cached note, failure announce)
  ...
Summary: 44 run, 44 passed, 0 failed
-> suite OK

==============================================
ALL SUITES PASSED
```

`./init.sh` tail (exit 0):

```
    ready: 5 feature(s)
    status: ok
==> preflight: stability report complete (read-only; exit 0)
status: ok
```

## Risks / notes

- The digest includes health-signal labels computed against the server's
  current date, so a cached summary can be replayed across a midnight
  boundary until the signal set changes; acceptable for a 16-entry
  observability cache.
- `npm run lint` (biome) fails on HEAD already (pre-existing
  noNonNullAssertion/format debt in feature.ts, toolbox_draft.ts,
  toolbox_serve.ts); init.sh's blocking lint gate is shellcheck and stays
  green. This change adds no new biome diagnostics.
- On a cache hit the panel shows the summary only via the final `result`
  event (no deltas) — handled by preferring `event.summary_md` in the
  result handler.
- The fleet Summarize control lists only *available* providers; with no key
  and no Ollama it renders an actionable empty hint instead of a dead
  button.

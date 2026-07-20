---
type: Review Log
feature: toolbox_fleet_summary
status: approved
role: reviewer
updated: 2026-07-18
tags: [handyman/backlog/review]
---

# Review: toolbox_fleet_summary (#30)

**Verdict: APPROVED.** All five acceptance criteria are verifiably satisfied,
both verifiers are green (44/44 tests, init.sh exit 0), and the observer's
security contract (read-only, CSP, host guard, live-region invariant) is
intact. No blocking findings.

Scope reviewed: `handyman/src/toolbox_llm.ts`, `handyman/src/toolbox_summary.ts`
(new), `handyman/src/toolbox_serve.ts`, `handyman/assets/toolbox_panel.js`,
`tests/test_toolbox_serve.sh`. Dirty-baseline harness-state files
(`.handyman/*`, `harness.config.json`, `handyman/skills-lock.json`) excluded
per protocol.

## Acceptance check

### 1. POST /api/summarize relays the chosen provider over SSE (zai default) — PASS

`handleSummarizeRequest` in toolbox_serve.ts is routed before the GET-only
guard alongside /api/draft and /api/intake. Provider defaults to `"zai"` when
the body omits it; unknown/unbuilt provider is a plain 400
`{ok:false,error:"unknown provider"}`. The state document (`buildState`) is
digested (`buildSummaryDigest`), prompted, and the provider's deltas are
relayed as `event: delta` / final `event: result` SSE frames with
`Content-Type: text/event-stream`, `Cache-Control: no-store`, nosniff and the
CSP header.

Model default logic is sane: `resolveSummaryModel` precedence is
`body.model → TOOLBOX_SUMMARY_MODEL → glm-4.7-flash (only zai + Z_AI_API_MODE=paas) → provider's configured model`.
This matches the toolbox_llm.ts header: the Z.ai Coding Plan Anthropic
endpoint serves only GLM-5.2, so flash is forced exclusively on the
OpenAI-compatible paas/v4 path where it is actually servable. The per-request
override rides the new optional `DraftRequest.model` field, resolved as
`req.model ?? options.model` in both adapters and reflected in
`DraftResult.model` — a minimal, backward-compatible change.

### 2. Cache by state hash; second call cached without provider call — PASS

`buildSummaryDigest` keeps only stable fields (per-harness project name,
status counts, signal labels, error flag; fleet aggregate; timeline capped at
15) and excludes volatile ones (generated_at, registry path, metrics,
sessions). `summaryHash` is sha256 over a recursively key-sorted canonical
JSON, so key order cannot move the hash. `SummaryCache` is a bounded (16)
insertion-ordered Map, one instance per serve process. On a hit the handler
emits a single `event: result {..., cached:true, hash}` and returns before
`relaySummary` — the provider is structurally unreachable on that path.

**The test genuinely proves the provider was not called again:** the mock LLM
server counts POST /v1/chat/completions calls and exposes them at
GET /v1/calls; after the second summarize the test asserts `cached=True`,
identical `summary_md`, `HASH2 = HASH1`, **and `calls == 1`** (mock call
counter). The two summarize cases are adjacent with no workspace mutation
between them (TS8's mutation comes later), so the hash is deterministically
unchanged.

### 3. System prompt tied to /api/state data + "no sé" requirement — PASS

`composeSummarySystem` declares the FLEET STATE block the ONLY source of
truth, asks for ~5 markdown lines covering recent closures,
pending/in-progress/blocked features, notable health signals and the harness
names involved, forbids inventing features/harnesses/dates/numbers, requires
mentioned counts to match the data exactly, and rule 4 requires answering
exactly `"no sé"` when the data is insufficient. `composeSummaryPrompt`
renders precisely the /api/state-derived digest: fleet counts, per-harness
status counts + signals + UNREADABLE flag, and the dated timeline.

### 4. Tests with fake provider, SSE well-formed, cache hit, no network — PASS

test_toolbox_serve.sh boots a localhost mock OpenAI-compatible server
(bound `127.0.0.1`, ephemeral port) before the observer and exports it as
`OLLAMA_BASE_URL`, making the always-instantiated "ollama" provider a
deterministic fake — the real adapter + relay code path runs with zero
external network. Case 1 asserts well-formed SSE (`event: delta` present,
`event: result` with parsed JSON data line, `summary_md == "fleet summary
ok"`, `cached=False`, non-empty hash). Case 2 asserts the cache hit (above).
Case 3 asserts the 400. Case 4 greps the panel asset for the route, the
failure announcement and the "(cached)" note. The `False`/`True` string
comparisons are correct: `tests/lib/jsonget.js` deliberately prints
Python-style boolean reprs. The suite was already wired in run_tests.sh
line 36; only the observer boot line gained the env prefix, plus a mock
cleanup in the trap — all 40 pre-existing cases are semantically untouched
and pass.

### 5. run_tests.sh + init.sh green — PASS (evidence below)

## Security contract

- **Read-only observer:** handleSummarizeRequest performs no fs writes
  (verified by inspection: buildState read, in-memory cache, res.write only).
  POST /api/intake remains the sole disk write; the file-header and
  GET-only-guard comments were updated to document the third POST route.
- **Bind/host/CSP:** the 127.0.0.1 bind, Host-header check and CSP_HEADER
  are untouched; the summarize response reuses the same security headers as
  the draft relay.
- **No key material:** the handler never touches apiKey/Authorization
  (grep-verified); error SSE carries only `{code, message}` from LlmError,
  whose HTTP mapper documents never echoing key material (pre-existing).
- **Live-region invariant:** TS1c ("exactly two static live regions") still
  passes. FleetSummary adds no aria-live surface — errors go through the
  existing `announce.assertive` singleton and a `role="note"` paragraph;
  markdown output goes through `renderMd` (marked + DOMPurify), same as the
  intake view.

## Regressions / conventions

- Existing tests: only additive changes plus the env prefix on the single
  observer boot line; `streamDraftSse` kept as a thin wrapper over the new
  `streamSseOverPost` so all structural greps still match. 44/44 pass.
- dist/: `npm run build` runs clean (tsc, no errors); `dist/toolbox_summary.js`
  exists and is newer than its source; the whole black-box suite runs against
  dist, so staleness would have failed loudly.
- Conventions: strict TS, ESM, camelCase/SCREAMING_SNAKE, no new
  dependencies (node:crypto only), intent comments in the house style,
  toolbox_summary.ts mirrors the toolbox_draft.ts two-layer split
  (architecture.md observer layering respected).
- CHECKPOINTS C3/C4: changed files match the observer architecture; changed
  modules are covered by 4 new black-box cases.

## Findings (non-blocking, informational)

1. **[low] Cache spans midnight signal drift** — the digest includes
  health-signal labels computed against the server's date, so a cached
  summary can replay across a midnight boundary until the signal set
  changes. Acknowledged in the impl report; acceptable for a bounded
  per-process observability cache (any fleet change or restart invalidates).
2. **[low] Unhandled-rejection pattern shared with /api/draft** —
  `handleSummarizeRequest(...)` is fired without `.catch()`, same as the
  pre-existing `handleDraftRequest`. Provider failures are already funneled
  through `relaySummary`'s try/catch; only a `buildState` throw could
  reject, and /api/state shares that exposure. Consistent with the existing
  pattern; no change requested.
3. **[info] Pre-existing biome debt** — `npm run lint` findings are
  identical to HEAD; the new file adds no diagnostics. init.sh's blocking
  lint (shellcheck) is green.

## Verifier evidence

`bash tests/run_tests.sh` tail (run by reviewer, 2026-07-18):

```
  PASS POST /api/summarize streams SSE delta + result from the fake provider
  PASS second identical POST /api/summarize is a cache hit (provider not called again)
  PASS POST /api/summarize rejects an unknown provider with 400
  PASS panel asset ships the fleet Summarize control (route, cached note, failure announce)
  ...
  PASS SSE emits a change event when the workspace mutates

Summary: 44 run, 44 passed, 0 failed
-> suite OK

==============================================
ALL SUITES PASSED
```

`./init.sh` tail (exit 0):

```
--> worklist: OK
    31 toolbox_ask_fleet
    32 toolbox_backlog_triage
    33 toolbox_acceptance_from_diff
    34 toolbox_review_notes
    35 toolbox_retro_lessons
    ready: 5 feature(s)
    status: ok
==> preflight: stability report complete (read-only; exit 0)
status: ok
```

---
type: Review Log
feature: toolbox_provider_registry
status: approved
role: reviewer
updated: 2026-07-18
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/toolbox_provider_registry]
---

# Review: toolbox_provider_registry

## Verdict

APPROVED

## Acceptance Criteria — pass/fail with evidence

1. **PROVIDER_REGISTRY as data + buildProviders reduces to a table loop — PASS.**
   `handyman/src/toolbox_llm.ts:334-373` defines `PROVIDER_REGISTRY: ProviderRegistryEntry[]`
   (zai, claude, ollama; copilot intentionally excluded, unchanged). `buildProviders`
   (:383-417) is a single `for (const entry of PROVIDER_REGISTRY)` loop; the only
   conditional inside is `variant.adapter === "anthropic"`, a generic adapter-kind
   dispatch, not a per-provider branch. `grep -n "entry.id\|=== \"zai\"\|=== \"claude\"\|=== \"ollama\"\|=== \"copilot\""
   handyman/src/toolbox_llm.ts` returns only the two `id: entry.id` passthroughs at
   :398/:406 — zero id branches.

2. **Identical behavior — PASS**, verified by reconstructing pre-change `buildProviders`
   from `git diff`:
   - zai: `defaultModel: "glm-5.2"`, `modelEnvKey: "Z_AI_MODEL"` reproduces the old
     `env.Z_AI_MODEL ?? "glm-5.2"` (same `??`, not `||`, precedence). `resolveVariant`
     reproduces the old `Z_AI_API_MODE === "paas"` ternary (paas → openai-compat,
     `api.z.ai/api/paas/v4`, `thinkingControl: true`; else → anthropic,
     `api.z.ai/api/anthropic`, `auth: "bearer"`) byte-for-byte.
   - claude: `defaultModel: "claude-opus-4-8"`, `modelEnvKey: "ANTHROPIC_MODEL"`,
     anthropic adapter at `api.anthropic.com` — unchanged.
   - ollama: no `apiKeyEnvKey` (never skipped for a missing key, same as before),
     `modelEnvKey: "OLLAMA_MODEL"` default `llama3.2`, `baseUrl: env.OLLAMA_BASE_URL ??
     default`, `healthCheck: true` — unchanged. `apiKey: apiKey || undefined` in the
     openai-compat branch normalizes ollama's empty-string apiKey to `undefined`,
     matching the old code path that never passed an `apiKey` field for ollama at all
     (`options.apiKey` is optional on `OpenAiCompatAdapterOptions` and read as
     `options.apiKey ?? ""` / `if (options.apiKey)`, so omitted vs. explicit
     `undefined` are indistinguishable).
   - copilot: still outside the table, still surfaced only via `FUTURE_PROVIDER_IDS`
     in `providersInfo` (:428-430) — untouched.
   - GLM quirks: `thinkingControl` flag flows unchanged into
     `openAiCompatProvider`'s existing `...(options.thinkingControl && !req.reasoning ?
     { thinking: { type: "disabled" } } : {})` (:260); `OPENAI_MAX_TOKENS_CAP = 131072`
     (:86) is untouched adapter-level code, applied identically.
   - Note: `DraftRequest.model?` and the `req.model ?? options.model` lines in both
     adapters are pre-existing, unrelated to this feature — they belong to features 30
     (`toolbox_fleet_summary`) / 31 (`toolbox_ask_fleet`), already `"done"` in
     `feature_list.json` and consumed by `toolbox_serve.ts`'s
     `resolveSummaryModel`/`handleSummarizeRequest`/`handleAskRequest`. They are
     superimposed in the same uncommitted working tree but out of this feature's
     scope; confirmed additive/optional so they don't affect criterion 2.

3. **GET /api/providers shape + Ollama test fake — PASS.** `providersInfo()`
   (:420-432) is untouched, still returns `{id, available, model}` plus the
   `FUTURE_PROVIDER_IDS` entries. `tests/test_toolbox_serve.sh` still drives the
   fake via `OLLAMA_BASE_URL` (lines 73-161) with no changes needed; suite assertion
   `PASS /api/providers reports id/available/model and declares copilot future` is
   green (see test run below).

4. **New test provider via one table entry only — PASS.** `tests/test_toolbox_llm.js`
   suite T8 (diff hunk adding ~43 lines) does
   `llm.PROVIDER_REGISTRY.push({ id: "test-provider", ... })` at runtime and never
   touches `buildProviders`; asserts the entry is skipped without its key, instantiated
   with the right model once the key is set, its `draft()` hits the variant's
   `baseUrl` through the openai-compat adapter, and it appears in `providersInfo()`.
   All 4 new assertions pass (see below).

5. **Full test + init gate — PASS.**
   - `node tests/test_toolbox_llm.js` → `25 run, 25 passed, 0 failed` (includes T8).
   - `bash tests/run_tests.sh` → 3 suites, `ALL SUITES PASSED` (includes
     `test_toolbox_draft.js`: 24/24, `test_toolbox_serve.sh`: 48/48, including the
     `/api/providers` shape assertion and the `/api/summarize`/`/api/ask` suites from
     the concurrently-present features 30/31).
   - `npm run build --prefix handyman` (tsc) → clean, no errors.
   - `./init.sh` → `EXIT:0`, `preflight: stability report complete (read-only; exit 0)`,
     `status: ok`.

## Stage 1: Spec Compliance

- [x] Every acceptance criterion is satisfied
- [x] The change stays inside the feature's declared scope (only `toolbox_llm.ts` +
      `test_toolbox_llm.js` touched by this feature; other modified files in the tree
      belong to already-"done" features 30/31, not to this diff)
- [x] The implementation report exists and matches what changed
      (`.handyman/backlog/impl_toolbox_provider_registry.md`)

## Stage 2: Code Quality

- [x] Architecture respected — declarative table + generic adapter-kind dispatch,
      no per-provider branching
- [x] Conventions respected — doc comments explain each quirk's provenance, matches
      existing file style
- [x] Tests meaningful and green — T8 exercises skip/instantiate/draft/providersInfo
      for a registry-only addition
- [x] Verifier exits 0 — `./init.sh` exit 0, `bash tests/run_tests.sh` all green

## Required Changes

None.

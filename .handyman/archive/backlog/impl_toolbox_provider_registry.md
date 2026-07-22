---
type: Implementation Log
feature: toolbox_provider_registry
status: implemented
role: implementer
updated: 2026-07-18
tags: [handyman/role/implementer, handyman/feature/toolbox_provider_registry]
---

# Implementation Report: toolbox_provider_registry

## Files Changed

- `handyman/src/toolbox_llm.ts`
  - `LlmProviderId` changed from a closed union (`"zai" | "claude" | "ollama" | "copilot"`)
    to `string`, documented as "PROVIDER_REGISTRY is the source of truth for which ids
    exist" — adding a provider no longer requires widening a type.
  - Added `ProviderVariant` (adapter kind + baseUrl + the three existing adapter quirks:
    `auth`, `thinkingControl`, `healthCheck`) and `ProviderRegistryEntry` (`id`,
    `apiKeyEnvKey?`, `modelEnvKey?`, `defaultModel`, `resolveVariant(env) => ProviderVariant`).
  - Added `export const PROVIDER_REGISTRY: ProviderRegistryEntry[]` — a plain, mutable
    array with 3 entries (`zai`, `claude`, `ollama`); `copilot` stays out of the table
    since it has no adapter (unchanged: still only surfaced via `FUTURE_PROVIDER_IDS`
    inside `providersInfo`).
  - Rewrote `buildProviders(env, fetchImpl?)` to iterate `PROVIDER_REGISTRY`: resolve the
    api key from `entry.apiKeyEnvKey` (skip the entry if declared and empty), resolve the
    model via `entry.modelEnvKey ?? entry.defaultModel` (same `??` precedence as before,
    not `||`, so an explicit empty-string override is preserved), call
    `entry.resolveVariant(env)`, then dispatch on `variant.adapter` (`"anthropic"` vs
    `"openai-compat"`) to the existing `anthropicProvider`/`openAiCompatProvider`
    factories. The only conditional left in `buildProviders` is the generic
    adapter-kind switch — there are zero branches on provider `id`.
- `tests/test_toolbox_llm.js`
  - Added suite **T8**: pushes one entry (`id: "test-provider"`, own `apiKeyEnvKey`/
    `modelEnvKey`, `resolveVariant` returning a fixed `openai-compat` variant) onto
    `llm.PROVIDER_REGISTRY` at runtime, with no edit to `buildProviders`, and asserts:
    it is skipped without its key, instantiated with the right model once the key is
    set, its `draft()` actually hits the variant's `baseUrl` via the openai-compat
    adapter, and it shows up in `providersInfo()`.

No changes were needed in `toolbox_serve.ts`, `toolbox_summary.ts`, or `toolbox_ask.ts` —
they only consume `buildProviders`, `loadDotEnv`, `providersInfo`, `LlmProvider`, and
`LlmError`, none of which changed shape.

## Registry Entry Shape

```ts
export interface ProviderVariant {
  adapter: "anthropic" | "openai-compat";
  baseUrl: string;
  auth?: "x-api-key" | "bearer";       // anthropic adapter only
  thinkingControl?: boolean;           // openai-compat adapter only
  healthCheck?: boolean;               // openai-compat adapter only
}

export interface ProviderRegistryEntry {
  id: LlmProviderId;
  apiKeyEnvKey?: string;               // omit => no upfront key needed (ollama)
  modelEnvKey?: string;
  defaultModel: string;
  resolveVariant: (env: Record<string, string | undefined>) => ProviderVariant;
}
```

## How Each Quirk Became Declarative

- **zai dual mode (paas vs Coding Plan).** `resolveVariant` reads `env.Z_AI_API_MODE`
  and returns either the `openai-compat` variant (`api.z.ai/api/paas/v4`,
  `thinkingControl: true`) or the `anthropic` variant (`api.z.ai/api/anthropic`,
  `auth: "bearer"`). The mode switch lives entirely inside the entry's own function;
  `buildProviders` just calls `resolveVariant(env)` for every entry the same way.
- **Env var precedence.** `Z_AI_API_KEY`/`Z_AI_MODEL`, `ANTHROPIC_API_KEY`/
  `ANTHROPIC_MODEL`, `OLLAMA_MODEL`/`OLLAMA_BASE_URL` are declared as
  `apiKeyEnvKey`/`modelEnvKey` fields (or read inside `resolveVariant` for
  `OLLAMA_BASE_URL`, since that one is baseUrl, not model). `??` (not `||`) is kept for
  the fallback so an intentionally empty override still wins, matching prior behavior.
- **GLM quirks (thinking disabled, max_tokens cap).** `thinkingControl: true` on zai's
  paas variant is unchanged data (the cap itself, `OPENAI_MAX_TOKENS_CAP = 131072`, was
  already adapter-level and untouched). `resolveVariant` sets the flag; the adapter
  still absorbs the actual behavior.
- **Ollama health-check.** `healthCheck: true` on ollama's (only) variant; no
  `apiKeyEnvKey` means the entry is never skipped for a missing key — availability is
  decided by the adapter's existing health probe.
- **Copilot "registered but never available."** Left untouched as a non-adapter,
  non-table id: still declared only via `FUTURE_PROVIDER_IDS` and appended in
  `providersInfo`, exactly as before.

## Test Evidence

`node tests/test_toolbox_llm.js` (25 assertions, includes new T8):

```
toolBox LLM suite (test_toolbox_llm.js)
  PASS buildProviders without keys yields only ollama
  PASS buildProviders with keys yields zai, claude, ollama
  PASS zai defaults to glm-5.2 (Coding Plan endpoint)
  ...
  PASS new registry entry is skipped without its api key
  PASS new registry entry is instantiated once its api key is set
  PASS new registry entry's variant drives the openai-compat adapter
  PASS new registry entry appears in providersInfo

Summary: 25 run, 25 passed, 0 failed
```

`bash tests/run_tests.sh` (3 suites: `test_toolbox_llm.js`, `test_toolbox_draft.js`,
`test_toolbox_serve.sh`, including `PASS /api/providers reports id/available/model and
declares copilot future`):

```
Summary: 25 run, 25 passed, 0 failed
-> suite OK
...
Summary: 24 run, 24 passed, 0 failed
-> suite OK
...
Summary: 48 run, 48 passed, 0 failed
-> suite OK

ALL SUITES PASSED
```

`npm run build --prefix handyman` (tsc): clean, no errors.

`./init.sh`: exit code 0.

```
    test: OK
VERIFIER: all gates passed
...
--> worklist: OK
    ready: 6 feature(s)
    status: ok
==> preflight: stability report complete (read-only; exit 0)
status: ok
```

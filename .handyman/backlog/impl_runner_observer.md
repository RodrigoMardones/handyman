---
type: Implementation Log
feature: runner_observer
status: implemented
role: implementer
updated: 2026-07-20
actor: implementer-sonnet-run72
tags: [handyman/role/implementer, handyman/feature/runner_observer]
---

# Implementation Report: runner_observer

## Fix round 1 (post-review, CHANGES_REQUESTED)

The reviewer found (and reproduced live) that `sanitizedBaseEnv()` only
excluded `NODE_ENV`/`NEXT_*`/`__NEXT_*`, so `Z_AI_API_KEY` - a real
credential used by `packages/toolbox-core/src/llm.ts` - leaked into the
child of the `claude` engine, which does not need it. Fix applied
(reviewer's option a, the simplest that keeps the declarative pattern):

- `apps/web/lib/runner.ts`: new `ENGINE_SECRET_ENV_KEYS` set (today only
  `Z_AI_API_KEY`) excluded by `sanitizedBaseEnv` alongside
  `NODE_ENV`/`NEXT_*`/`__NEXT_*`, with a comment stating the rule: engine
  secrets never travel in the base; each engine's `childEnv()` injects its
  own (glm re-injects `Z_AI_API_KEY` as `ANTHROPIC_AUTH_TOKEN`, reading it
  from the server's own env, not from the sanitized base - unaffected).
- `tests/test_web_run.sh`, boot C, engine=claude case: added the missing
  negative assertion - the on-disk env dump must NOT contain
  `^Z_AI_API_KEY=` (the server boots with the key pinned to a known value,
  so absence is meaningful). The engine=glm case still asserts
  `ANTHROPIC_AUTH_TOKEN=zai-test-key-123` arrives.

Re-run after the fix (env saneado, `env -i HOME PATH USER TMPDIR LANG`):

- `bash tests/test_web_run.sh`: 24 run, 24 passed, 0 failed.
- `bash tests/run_tests.sh`: exit 0, `ALL SUITES PASSED`.
- `./init.sh`: exit 0, `VERIFIER: all gates passed` (lint OK, build OK,
  test OK).

Nothing else touched. Report below unchanged from round 0.

## Files Changed

- `apps/web/lib/runner.ts` (rewritten): adds `RUNNER_ENGINES` (declarative
  table, `PROVIDER_REGISTRY`'s pattern) with `claude` (always available,
  `childEnv: {}`) and `glm` (`available` iff `Z_AI_API_KEY` non-empty;
  `childEnv` sets `ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic`,
  `ANTHROPIC_AUTH_TOKEN=<Z_AI_API_KEY>`, `ANTHROPIC_MODEL=<Z_AI_MODEL ??
  "glm-5.2">`); `listEngines()` for the GET payload; `sanitizedBaseEnv()`
  strips `NODE_ENV` and any `NEXT_`/`__NEXT_`-prefixed key before composing
  the child's env (`{...sanitizedBaseEnv(env), ...engine.childEnv(env)}`);
  in-memory run history (`RUN_HISTORY_CAP = 20`, most-recent-first, one
  entry per `startRun`, mutated in place by the child's `exit`/`error`
  handlers); `StartRunOptions.mode` (`"start" | "continue"`),
  `buildContinuePrompt()` (resume prompt, server-side, from the validated
  feature name only), and the guard split: `mode: "continue"` requires
  `in_progress`, default `"start"` still requires `pending`. Renamed the old
  `featureIsPending`/boolean-or-null lookup to `findFeatureStatus`, which
  returns `""` for "feature not present" (still a 422, matching prior
  behavior) and `null` only when `feature_list.json` itself is unreadable
  (a 400) - this distinction was the one regression caught by the test
  suite during self-review (see Test Output).
- `apps/web/app/api/run/route.ts`: POST now reads optional `engine`/`mode`
  from the body and forwards them to `startRun`; new 422 branches
  `unknown_engine` ("unknown engine"), `engine_not_available` (the entry's
  `unavailableHint`, e.g. "engine not available: set Z_AI_API_KEY"), and
  `feature_not_in_progress` ("feature is not in_progress in that harness").
  GET is unchanged (still `runnerStatus(process.env)`, which now also
  carries `engines` and `runs`).
- `apps/web/components/RunPanel.tsx`: adds an engine `<select>` (unavailable
  engines rendered `disabled` with an inline hint), a `Continue '<feature>'`
  button shown once `status.phase === "exited"` (the server is the
  authority: an unrelated/no-longer-in_progress feature just surfaces the
  422 as `message`), and a `Runs` history list rendered from `status.runs`.
  `launch()` factors the POST call shared by `start`/`continueRun`.
- `apps/web/components/RunPanel.module.css`: `.history`/`.historyHeading`/
  `.historyList`/`.historyItem`/`.historyFeature`/`.historyEngine`/
  `.historyPhase` - existing tokens only, no new dependency.
- `apps/web/lib/featureName.ts` (new): `formatFeatureName(title)` - pure,
  no JSX/React import so it transpiles standalone like `fleetHtml.ts`.
  Lowercases, NFD-normalizes and strips combining diacritics, maps
  `[^A-Za-z0-9_-]` to `_`, collapses repeated `_`, trims leading/trailing
  `_`. Always matches `^[A-Za-z0-9_-]*$` (empty string when the title had
  no matchable characters).
- `apps/web/components/NewFeatureForm.tsx`: imports `formatFeatureName`;
  new `nameEdited` state flag; a `useEffect` re-derives `name` from `title`
  while `!nameEdited`; the name `<input>`'s `onChange` now also sets
  `nameEdited(true)` so a manual edit stops the auto-derivation; both reset
  on successful submit.
- `tests/test_web_run.sh` (extended, existing assertions untouched): three
  boots now (was two) - boot A unchanged; boot B gained engines-list,
  unknown-engine 422, glm-unavailable 422 (with `Z_AI_API_KEY` hint), runs
  history, and `mode: continue` guard + resume-prompt-in-argv cases; new
  boot C (`TOOLBOX_RUNNER_CMD` = a second, env-dumping fixture, with
  `Z_AI_API_KEY` pinned to a test value) asserts the child's env via the
  **on-disk** run log (not the API's `log_tail`, which is capped at 4096
  bytes and would truncate a realistic env dump, making a "no NODE_ENV"
  assertion pass for the wrong reason) - proves the sanitized base (no
  `NODE_ENV`/`NEXT_*`/`__NEXT_*`) for `engine=claude` and the three
  `ANTHROPIC_*` vars for `engine=glm`. Fixture's `feature_list.json` gained
  a 4th feature (`epsilon`, `in_progress`) for the continue-mode cases.
  `Z_AI_API_KEY` is now pinned explicitly on every boot (same reasoning as
  the pre-existing `TOOLBOX_RUNNER=0` pinning: `apps/web/.env` carries a
  real key for interactive use and `loadDotEnv` only fills *unset* vars).
  No test calls the real Z.ai API or any network endpoint; `engine: "glm"`
  only changes which env vars the fixture child receives.
- `tests/test_web_new_feature.sh` (extended): new structural case (TWN5)
  that `NewFeatureForm` imports/uses `formatFeatureName` from
  `lib/featureName.ts`, plus a unit section that transpiles
  `lib/featureName.ts` with the project's own TypeScript and `require()`s
  it in-process (same technique `test_web_fleet.sh` uses for
  `renderFleetHtml`) to exercise `formatFeatureName` against title/name
  fixtures including one with real diacritics ("Añadir Métricas" ->
  "anadir_metricas").
- `tests/run_tests.sh`: unchanged - both suites were already registered.

## Design Notes

- **Engines table.** Followed `packages/toolbox-core/src/llm.ts`'s
  `PROVIDER_REGISTRY` shape and spirit: an entry is `{id, label, available,
  childEnv, unavailableHint}`, all data; `startRun` looks the entry up by id
  and never branches on which engine it is. `glm` does not add a new binary
  or SDK call - it points the same `claude` CLI at Z.ai's existing
  Anthropic-compatible endpoint via env vars, reusing the exact
  baseUrl/auth shape the `zai` provider entry already uses for the
  in-process LLM relays. Adding a third engine later is one more table
  entry, not a new `if`.
- **Env sanitization.** `sanitizedBaseEnv` is a straight copy-with-exclusion
  over `process.env`, filtering `NODE_ENV` and any `NEXT_`/`__NEXT_`
  prefix, then engine `childEnv` is spread on top. This is the fix for the
  gap this feature's briefing named explicitly (`run-new_feataure_view.log`):
  a panel run under `next dev` was inheriting `NODE_ENV=development` and
  Next's internal `__NEXT_*` vars into the spawned agent, which then broke
  `next build` inside that agent's own verifier run.
- **Run history.** A plain array on the existing `globalThis` store, one
  entry pushed per `startRun` call (current run included), mutated in place
  by the same `child.on("exit"/"error")` handlers that already update
  `run.exit`, capped at 20 with a comment. Documented as in-memory-only
  (lost on server reboot); the per-feature `progress/run-<feature>.log` on
  disk remains the durable record, unchanged.
- **`mode: continue`.** Reuses `startRun` end-to-end (same spawn, same
  history push, same log file - appended to, not overwritten) with two
  differences gated on `options.mode`: which status the target feature must
  have (`in_progress` vs `pending`) and which prompt is built
  (`buildContinuePrompt` vs `buildRunPrompt`). Both prompts are built
  server-side from the same `RUN_FEATURE_RE`-validated name; nothing
  browser-typed reaches either.
- **`formatFeatureName` placement.** Kept out of `NewFeatureForm.tsx`
  entirely (no JSX, no React import) specifically so it can be transpiled
  and `require()`d in isolation the way `app/fleet/fleetHtml.ts` already is
  by `test_web_fleet.sh` - avoids a Next boot just to unit-test a string
  function.
- **Self-caught regression.** The first pass of `findFeature` returned
  `null` both when `feature_list.json` was unreadable AND when the named
  feature simply did not exist, which collapsed "unknown feature" from a
  422 (`feature_not_pending`, the pre-existing behavior pinned by
  `test_web_run.sh`'s TWN "unknown feature 422" case) into a 400
  (`workspace_error`). Caught by that pre-existing assertion during the
  first full-suite run; fixed by renaming to `findFeatureStatus` and having
  it return `""` (not `null`) for "feature not present", so both the
  continue-mode and start-mode status checks treat "absent" the same as
  "wrong status" - null is now reserved for genuine read/parse failure.
- **TypeScript friction.** `@types/node`'s `NodeJS.ProcessEnv` declares
  `NODE_ENV` as a required key, which fought the sanitized-env types
  (`sanitizedBaseEnv` deliberately omits it). Typed the sanitized/composed
  env as `Record<string, string | undefined>` and cast once at the
  `spawn()` call site with a one-line comment, rather than weakening the
  module's own types or reintroducing `NODE_ENV` just to satisfy the
  compiler.
- Did not touch `packages/toolbox-core` or `handyman/`, per the leader's
  scope note.

## Test Output

`bash tests/test_web_run.sh` (env saneado): 24 run, 24 passed, 0 failed.
`bash tests/test_web_new_feature.sh` (env saneado): 15 run, 15 passed, 0
failed.

`env -i HOME="$HOME" PATH="$PATH" USER="$USER" TMPDIR="${TMPDIR:-/tmp}"
LANG="${LANG:-en_US.UTF-8}" bash tests/run_tests.sh`:

```text
==============================================
ALL SUITES PASSED
```
(exit 0; every suite listed `-> suite OK`, including `test_web_run.sh` and
`test_web_new_feature.sh`.)

`env -i HOME="$HOME" PATH="$PATH" USER="$USER" TMPDIR="${TMPDIR:-/tmp}"
LANG="${LANG:-en_US.UTF-8}" bash ./init.sh`:

```text
    validate_harness: OK
--> drift: OK
--> sync: OK
--> discovery: OK
--> worklist: NOTE (no ready features - expected: single_in_progress is this
    feature; pending: 0, blocked: 1 [new_feataure_view, blocked on purpose])
    lint: OK
    build: OK
    test: OK
VERIFIER: all gates passed
status: ok
```
(exit 0.)

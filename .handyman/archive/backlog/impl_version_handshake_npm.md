---
type: Implementation Log
feature: version_handshake_npm
status: implemented
role: implementer
updated: 2026-07-19
tags: [handyman/role/implementer, handyman/feature/version_handshake_npm]
---

# Implementation Report: version_handshake_npm

Actor: agente-local (single-agent session)

## Files Changed

- `handyman/src/upgrade_harness.ts` — `currentSkillVersion()` falls back to the package-root `package.json` version when `SKILL.md` is absent. Fixes the published channel: `handyman-harness@3.0.0` ships no `SKILL.md`, so `upgrade_harness --check` (and the drift section of `preflight`) resolved the current version as `""` and errored.
- `handyman/src/cli.ts` — `handyman --version` / `-v` prints the package version; usage text mentions it.
- `handyman/scripts/pack_npm.mjs` — parity guard: the pack dies if `SKILL.md metadata.version != package.json version`. Verified negative case manually (9.9.9 vs 3.1.0 → `status: error`).
- `handyman/src/core/version.ts`, `version.test.ts` — deleted: `HANDYMAN_VERSION = "0.1.0"` was a third, stale version source with no consumers. Export removed from `core/index.ts`.
- `handyman/package.json` + `handyman/SKILL.md` — joint bump to `3.1.0`; SKILL.md gains a `## Versioning` section stating the contract (skill = usage manifest, npm = deterministic tools, one shared version, major pinned at `@3`). Prose elsewhere trimmed to stay within the 1000-word budget (exactly 1000).
- Harness re-sealed `2.1.1 -> 3.1.0` via `upgrade_harness` (no structural migrations; backup under `.handyman/.upgrade-backups/20260719-204458`).

## Design Notes

- Version authority is `package.json`; `SKILL.md` mirrors it and the pack guard enforces equality, so both channels (skill install and `npx handyman-harness@3`) always report the same version.
- The `@3` major pin in the skill is the delivery channel: minors publish without skill edits.
- ponytail: not built, named for later — a `scaffold` verb in the CLI (assets already ship in the tarball) so `bootstrap` stops depending on the skill-local `scripts/scaffold.sh`.

## Test Output

```text
vitest: 6 files, 80 passed
tests/test_docs.js: 219 run, 219 passed, 0 failed
./init.sh: exit 0 (lint/build/harness/test all OK)
pack: handyman-harness-3.1.0.tgz, status: ok
published-layout check: currentSkillVersion() == "3.1.0", cli --version == 3.1.0
```

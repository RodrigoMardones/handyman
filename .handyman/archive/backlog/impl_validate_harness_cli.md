---
type: Implementation Log
feature: validate_harness_cli
status: implemented
role: implementer
updated: 2026-07-16
tags: [handyman/role/implementer, handyman/feature/validate_harness_cli]
---

# Implementation Report: validate_harness_cli

## Files Changed

- `handyman/src/validate_harness.ts` (new, 533 LOC) — the TS port; reuses `resolveWorkspace`, `validateFeatureList` (ajv), and `parseFrontmatter` from the core.
- `handyman/src/core/workspace.ts` — promoted `PLATFORM_ROLE_DIRS` + `VALID_STATUS` to the core (shared with the future `tools_discovery` port #13).
- `handyman/src/core/index.ts` — re-exported the two new core names.
- `handyman/scripts/_resolve_compat.py` (new) — shim that restores `resolve_workspace` + `PLATFORM_ROLE_DIRS` for the three Python siblings still importing from the dropped module; delegates HARNESS_WORKSPACE resolution to the built Node artifact. Migration debt: drops when the last sibling is ported.
- `handyman/scripts/preflight.py`, `upgrade_harness.py`, `tools_discovery.py` — repointed the broken `from validate_harness import ...` to the shim; preflight's format block now calls `node dist/validate_harness.js`.
- `handyman/references/{anatomy,checklists,discovery,workflow}.md` — repointed active references to the Node artifact / TS source.
- `tests/test_init.sh` — repointed the oracle (T8–T19) to `node dist/validate_harness.js`; 0 assertions edited. Also repointed the stale `backlog.py` call site (T16) to `node dist/backlog.js`.
- `handyman/scripts/validate_harness.py` — **deleted** (strangler fig: no dual maintenance).

## Design Notes

- Faithful port of all 9 checks: required-files, feature_list parse, at-most-one in_progress, invalid status, depends_on references (live or archived), schema (ajv over the same `assets/schemas/feature_list.schema.json`), role-file detection, and the two non-blocking advisories (frontmatter + branch).
- `realpathSync(resolve(root))` mirrors Python `Path.resolve()` symlink-following (macOS `/var` -> `/private/var`); pattern borrowed from `backlog.ts`/`sprint.ts`/`metrics.ts`.
- Entry guard uses `import.meta.url === file://${process.argv[1]}` so the module is importable by tests yet runs `main` when invoked directly.

## Test Output

```text
Parity (byte-identical vs Python, 8 scenarios): 6 identical; 2 diverge only in
jsonschema-vs-ajv schema-error wording (oracle asserts only the "schema
violation" prefix, which is reproduced) — same non-blocking precedent as #14 evals.
Gates: typecheck ok; vitest 77/77; lint exit 0; build ok.
bash tests/run_tests.sh: ALL SUITES PASSED (init 17, upgrade 10, tools_discovery
16, preflight 11, ...). ./init.sh exit 0.
```

---
feature: sync_docs_handyman_v2
status: implemented
role: implementer
updated: 2026-07-17
tags: [handyman/role/implementer, handyman/feature/sync_docs_handyman_v2]
---

# Implementation Report: sync_docs_handyman_v2

Documentation-only feature. No source code changes. Brought the textual
representation of the harness in sync with its (migrated-to-Node, toolBox-equipped)
code state.

## Files Changed

- `handyman/references/toolbox.md` — Observer section: added `#/intake` route row;
  expanded the endpoints list with `/api/files`, `/api/intake`, the per-harness metrics
  in `/api/state`, and the vendor libs; corrected the now-false "POST /api/draft is the
  sole non-GET route and writes no disk" claim (there are two POST routes; `/api/draft`
  still writes no disk but `/api/intake` is the sole disk write) and documented the CSP.
  Added three subsections: `files?` param on `POST /api/draft`, `POST /api/intake` +
  `GET /api/files` (intake submit + tag picker), and Observer UI features (Plan A-E:
  project info/KPIs/sparkline, theme toggle, safe markdown render, a11y live regions,
  command palette + shortcuts). Revised the Future Work bullet (role-CLI writes) since
  `POST /api/intake` now exists.
- `.handyman/docs/architecture.md` — Replaced the obsolete "active migration" framing
  with the completed Node/TS reality. Layers now describe `src/*.ts` CLIs over `core/`,
  the `toolbox*` observer layer, and `ajv` (not Python/jsonschema). Principle 5 fixed
  `feature.py`/`sprint.py`/`backlog.py` -> `.js`. Added an `Intake y toolBox` section
  documenting the intake flow, the observer endpoints, and the start/close timestamps.
- `.handyman/docs/verification.md` — Full rewrite: Node single-track commands
  (`npm ci`/`npm run build`, `npm run typecheck|lint|test`), CI single-track Node
  description, test levels updated to `node dist/` + `test_docs.js`, a toolBox observer
  test section, and an anti-pattern on trusting the observer draft without human review.
- `handyman/references/templates.md` and `handyman/references/discovery.md` — verified
  current (already reference `node dist/...` and `src/...ts`); no edits needed.

## Design Notes

- Scope respected: only Markdown in `references/` and `.handyman/docs/`. No source
  (incl. `init.sh`, `ci.yml`, `package.json`) was touched.
- `toolbox.md` was already partly current (LLM layer + `/api/draft` from commit
  240b869); the gap was the newest features 23/26/27/28 (intake UI, command palette,
  `/api/intake` write, `/api/files`, Plan A-E, timestamps) and the now-incorrect
  "sole non-GET route / writes no disk" security claim.
- Endpoints and the CSP string were transcribed from the source-of-truth header comment
  in `handyman/src/toolbox_serve.ts` (lines 1-95) and the `CSP_HEADER` constant.

### Findings documented but out of scope (source, not docs)

- `init.sh` `run_build()` still runs `python3 -m compileall handyman/scripts tests`
  (comment: "After the migration this becomes `bunx tsc --noEmit`"). It exits 0 only
  because `handyman/scripts/` and `tests/` contain no `.py`; it does NOT compile the TS.
  CI runs the real `npm run build` (tsc). `init.sh` and CI are therefore out of sync on
  the build gate. Recommend a follow-up feature to point `run_build` at
  `cd handyman && npm run build`.
- ShellCheck scope drift: CI lintea `find scripts tests`, `init.sh` lintea
  `find handyman/scripts tests`; `scripts/` at repo root may not exist post-move.
- See `docs/analisis-iteraciones.md` and `docs/estado-migracion-ts.md` for context.

## Test Output

```text
$ ./init.sh                         -> INIT_EXIT=0  (ALL SUITES PASSED)
$ bash tests/run_tests.sh           -> RUNTESTS_EXIT=0
   15 suites, 240 tests, 0 failed (incl. test_docs.js, test_toolbox_serve.sh)
$ grep -r "POST /api/draft" references/ .handyman/docs/
   toolbox.md (x5), architecture.md, verification.md
```

Verification gate green. Acceptance criteria met.

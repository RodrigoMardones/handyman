---
feature: upgrade_harness_diff
status: approved
role: reviewer
updated: 2026-07-16
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/upgrade_harness_diff]
---

# Review: upgrade_harness_diff

## Verdict

APPROVED   <!-- or CHANGES_REQUESTED -->

## Stage 1: Spec Compliance

_Review the change against the feature request and its acceptance criteria first. A Stage 1 failure ends the review: report CHANGES_REQUESTED without moving to Stage 2, so spec drift is never buried under style feedback._

- [x] Every acceptance criterion is satisfied
  - `handyman/src/upgrade_harness.ts` replicates the full CLI contract of `upgrade_harness.py` (`--check`, default apply, `--dry-run`, `--root`, `-h`/`--help`, `--check`/`--dry-run` mutual exclusion at exit 2, unrecognized-arg/usage errors at exit 2). Read both files line by line; migration registry (1.6.0/1.7.0/1.8.0), `parse_version`/`compareSemVer`, `pending_migrations`, `_with_version` key-ordering, `make_backup`, `reseal_version`, and the argparse-shaped parser are all faithful transcriptions.
  - Uses the core: `resolveWorkspace` and `core/diff.ts` `unifiedDiff` for the `--dry-run` managed-file preview (`ensureManagedFile`, line 400 of upgrade_harness.ts).
  - `git diff 42a6592 HEAD -- tests/test_upgrade.sh` confirms only invocation lines (`python3 "$UPGRADE"` → `node "$UPGRADE"`) and the header comment changed; all 10 `start_case` assertions are byte-identical to the pre-port version. Suite still 10/10 passing.
  - `handyman/scripts/upgrade_harness.py` is deleted (`git show HEAD --stat` shows `330 -----` and the file is absent on disk). References repointed: `handyman/SKILL.md:79`, `handyman/references/anatomy.md:114-115`, `handyman/references/workflow.md:42`, `handyman/scripts/preflight.py` drift block (calls `node dist/upgrade_harness.js --check`), `init.sh:116`, `handyman/assets/init.template.sh:186,197`. Repo-wide grep for `upgrade_harness\.py` (excluding `.handyman/`, `docs/analisis-*`, `.git`) turns up only: (a) intentional literal CLI-output strings the port must reproduce byte-for-byte for parity (`PROG = "upgrade_harness.py"`, the `apply: scripts/upgrade_harness.py --root <root> ...` hint text printed by `--check`/apply — both present verbatim in the Python original too), and (b) historical/explanatory comments in `_resolve_compat.py`, `preflight.py`, and `test_upgrade.sh` describing that the `.py` was ported and dropped. No stale *invocation* references remain.
  - Parity evidence: implementation report documents 28/28 byte-identical scenarios (stdout, stderr, exit code, sha256 file tree) against a `python3.12` oracle, with two explicitly accepted, non-blocking divergences (JSON-parse error message wording on malformed `harness.config.json`; unreachable non-string `harness_version` truthiness edge case) — same class of divergence accepted for #9/#11/#14.
- [x] The change stays inside the feature's declared scope (no unrelated edits; `git show HEAD --stat` touches exactly the files the feature's scope implies).
- [x] The implementation report (`impl_upgrade_harness_diff.md`) exists, documents design notes for every notable divergence, and matches what actually changed.

## Stage 2: Code Quality

_Only after Stage 1 passes._

- [x] Architecture respected — reuses `resolveWorkspace`/`unifiedDiff` from `./core/index.js`; duplicates `readTextUniversal`/`splitlinesKeepEnds`/`pyRepr` locally per the established sibling-port precedent (#9/#11) rather than a premature core extraction.
- [x] Conventions respected — entry guard (`import.meta.url === file://${process.argv[1]}`) matches `update_harness.ts`/`sprint.ts`/`validate_harness.ts`; `node handyman/dist/upgrade_harness.js --help` verified live and matches the documented argparse-shaped output (usage line, options in registration order, "options:" header for python3.12 parity).
- [x] Tests meaningful and green — `bash tests/run_tests.sh` from repo root: **ALL SUITES PASSED** (test_upgrade.sh 10/10, plus all 12 other suites, 193/193 in test_docs.py).
- [x] Verifier exits 0 — `./init.sh` exit 0 (tools/files/state/lint/build/test all OK; drift block reports "harness is up to date" against the built `upgrade_harness.js`, confirming self-consistency).

### Runtime spot-checks (own fixtures, built in scratchpad, never inside the repo)

- `node handyman/dist/upgrade_harness.js --help` → matches documented usage/help text.
- `--check` against a behind (1.5.0) fixture → exit 1, correct drift report + pending-migrations list.
- `--dry-run` against the same fixture → exit 0, unified-diff preview of `docs/business.md` via `core/diff.ts`, **confirmed zero writes** (no file created, `harness_version` unchanged).
- `--check --dry-run` together → exit 2, `error: --check and --dry-run are mutually exclusive`, usage line to stderr.
- Default apply on the behind fixture → exit 0, `docs/business.md` created, `harness.config.json` backed up under `.upgrade-backups/<timestamp>/`, `harness_version` resealed to current (`1.20.20`), **key ordering preserved** (`harness_version` stays immediately after `harness_workspace`).
- Second apply run (idempotency) → exit 0, "up to date; nothing to apply", no further writes.
- Second fixture with **no pre-existing** `harness_version` key → after apply, `harness_version` is **inserted** immediately after `harness_workspace` and before a trailing key that was already present, confirming `_with_version`'s insert-vs-reassign key-ordering semantics are ported correctly for both cases.

## Required Changes

_None._

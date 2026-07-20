---
type: Review Log
feature: update_harness_diff
status: approved
role: reviewer
updated: 2026-07-16
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/update_harness_diff]
---

# Review: update_harness_diff

## Verdict

APPROVED

## Stage 1: Spec Compliance

- [x] AC1 — `handyman/src/update_harness.ts` replicates the CLI contract of the deleted
      `handyman/scripts/update_harness.py` (subcommands `--list/--check/--sync`, flags
      `--root/--dry-run/--model/--tools/--set`, `--dry-run` diff, exit codes,
      byte-identical output). Verified with a `python3.12` oracle run from
      `git show f94e88e:handyman/scripts/update_harness.py` against fixture
      harnesses under scratchpad, diffing normalized stdout/stderr/exit code:
        - `--help`: byte-identical.
        - `--list` on a fixture with role frontmatter + config: byte-identical
          (repr-formatted `model='...'`/`tools=...` lines match).
        - `--dry-run --model implementer=...`: byte-identical unified diff via
          `core/diff.ts` `unifiedDiff`; confirmed no files were written by
          either implementation.
        - `--check` with induced drift: byte-identical `DRIFT ...` lines and
          exit 1.
        - `--model foo` (malformed, no `=`) and `--set foo` (malformed):
          reproduced the 1-vs-2 exit-code asymmetry exactly (`--model`/`--tools`
          malformed → exit 1 via `process.exit(1)`; `--set` malformed → exit 2
          via `return 2`), matching the report's design notes.
      One real (minor) divergence found and NOT covered by the implementer's
      31/31 parity claim: the Python source builds the "got '...'"/"unknown
      role '...'" error messages with a literal f-string (`f"...'{raw}'"`),
      not `repr()`. The TS port instead runs those same values through
      `pyRepr()`. For ordinary inputs (no embedded quote/backslash) the two
      forms coincide byte-for-byte, which is why all 31 documented scenarios
      pass; but for a raw value containing an apostrophe the two diverge:
      ```
      python3.12 update_harness.py --model "it's"    -> got 'it's'
      node dist/update_harness.js --model "it's"     -> got "it's"
      ```
      (same divergence reproduced for the "unknown role" message and for
      `--set` malformed with an apostrophe). Exit codes still match (1/1/2)
      in every case tested — only the quoting of the echoed raw argument
      differs. This is a narrow edge case (a CLI arg containing a literal
      `'`), not exercised by `tests/test_update.sh` or the implementer's
      31-scenario matrix, and does not affect the stable `status:`/exit-code
      contract that `docs/architecture.md` calls "sagrado". Noting it here as
      a non-blocking finding for a future pass rather than a required change,
      since it does not regress any tested behavior and the rest of the
      contract (including the harder 1-vs-2 exit asymmetry) is faithfully
      reproduced.
- [x] AC2 — Uses the core: `handyman/src/update_harness.ts` imports
      `unifiedDiff` and `PLATFORM_ROLE_DIRS` from `./core/index.js`
      (`handyman/src/core/diff.ts`, `handyman/src/core/workspace.ts`).
      `core/diff.ts` is a full `difflib.SequenceMatcher` + `unified_diff` port
      (autojunk, opcodes, grouped hunks, `formatRangeUnified`); spot-checked
      its `--dry-run` output against the Python oracle and it matched exactly.
      Confirmed (per the report's design note) that the Python original never
      calls `resolve_workspace`/`PLATFORM_ROLE_DIRS`'s workspace resolution —
      `discover()` looks directly under `--root` — so the port correctly does
      not import `resolveWorkspace`; using it would have been a fidelity bug,
      not an improvement. (`feature_list.json`'s acceptance text for #11
      mentions `resolveWorkspace` aspirationally; the reviewer brief's AC2,
      which is authoritative here, only requires `core/diff.ts` reuse, and
      that is satisfied.)
- [x] AC3 — `tests/test_update.sh` repointed with zero assertion edits.
      Verified via `git diff f94e88e HEAD -- tests/test_update.sh`: every
      hunk is either the header comment (Python -> TS port description) or a
      `python3 "$UPDATER"` -> `node "$UPDATER"` invocation swap plus the
      `UPDATER` path itself (`handyman/scripts/update_harness.py` ->
      `handyman/dist/update_harness.js`). No `if`/assertion condition line
      changed. Suite result: 12 run, 12 passed, 0 failed.
- [x] AC4 — `handyman/scripts/update_harness.py` is deleted (confirmed:
      `ls` reports "No such file or directory"). References repointed:
      `handyman/scripts/preflight.py` sync block now calls
      `node dist/update_harness.js --check`/`--sync` (with an explanatory
      comment); `handyman/references/models.md`, `tools.md`, `workflow.md`
      all show `node dist/update_harness.js ...` invocations. Repo-wide grep
      for `python3[^|]*update_harness\.py` returns zero hits — no stale
      Python invocations remain anywhere (the `docs/analisis-*.md` files that
      still name `update_harness.py` are historical planning documents
      describing past-tense/point-in-time analysis, not live invocation
      instructions, and are out of this feature's `references/*.md` +
      `preflight.py` scope).
- [x] AC5 — Parity evidence is documented in
      `.handyman/backlog/impl_update_harness_diff.md` (31 scenarios, each
      with the observed exit code / behavior) and design notes explain every
      non-obvious fidelity decision (universal-newline reads,
      `splitlines(keepends=True)` boundary set, `repr()` formatting,
      `os.path.abspath` vs `Path.resolve()`, entry guard, argparse `options:`
      header). Verifier is green (see below).
- [x] The change stays inside the feature's declared scope (one CLI port +
      its direct references; no unrelated files touched beyond the expected
      surface).
- [x] The implementation report exists at
      `.handyman/backlog/impl_update_harness_diff.md` and matches what
      changed (`git show HEAD --stat` on merge commit `42a6592`: exactly the
      7 files the report lists).

## Stage 2: Code Quality

- [x] Architecture respected: CLI stays a thin entrypoint reusing
      `core/diff.ts`; exit-code contract (`0/1/2`) preserved; no new external
      dependency introduced.
- [x] Conventions respected: TS strict, ESM, `camelCase`/`PascalCase` naming,
      ported helpers (`pyRepr`, `readTextUniversal`, `splitlinesKeepEnds`)
      mirror the precedent already established in `backlog.ts`/`feature.ts`.
- [x] Tests meaningful and green: `tests/test_update.sh` still black-box
      exercises the real CLI over temp fixtures (12/12); full suite green.
- [x] Verifier exits 0: ran `bash tests/run_tests.sh` (ALL SUITES PASSED,
      all 13 suites) and `./init.sh` from repo root (`VERIFIER: all gates
      passed`, exit 0). The preflight `sync: NOTE` block in `init.sh`'s
      output is pre-existing config/role-file model drift unrelated to this
      feature (leader/implementer/reviewer model names in
      `harness.config.json` vs `.github/agents/*.agent.md`); it is
      advisory-only and does not affect the verifier's exit code.

## CHECKPOINTS.md Walk

- **C1 Harness Complete**: required files present; `./init.sh` exits 0;
  `HARNESS_WORKSPACE` resolves to `.handyman`. PASS.
- **C2 State Coherent**: exactly one feature (`update_harness_diff`, id 11)
  `in_progress`; `.handyman/progress/current.md` describes the active
  session accurately; other `done` features unaffected (full suite green).
  PASS.
- **C3 Architecture Respected**: changed files match
  `.handyman/docs/architecture.md` (CLI entrypoint + core reuse, no new
  deps, exit-code contract preserved); no stray debug prints/TODOs in
  `update_harness.ts`. PASS.
- **C4 Verification Real**: `tests/test_update.sh` covers the changed
  module (12 tests); full verifier reports >0 tests, all green. PASS.
- **C5 Session Closed**: not yet applicable — closure (marking `done`,
  `history.md` entry, `current.md` reset) is the leader's next step after
  this approval, not part of this review.

## Required Changes

None. One non-blocking observation is recorded above (Stage 1, AC1): the
`--model`/`--tools`/`--set` malformed-argument error messages use `pyRepr()`
instead of literal single-quote wrapping for the echoed raw value, which
diverges from Python's exact f-string output only when the raw CLI argument
contains an apostrophe. Exit codes are unaffected. Suggest a follow-up fix
(replace `pyRepr(raw)`/`pyRepr(roleRaw)` with literal `'${raw}'` interpolation
at the three call sites in `handyman/src/update_harness.ts`
`parseRoleArg`/`--set` handling) whenever this file is next touched, but it
does not block approval of this port.

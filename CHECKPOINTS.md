# CHECKPOINTS

Resolve `HARNESS_WORKSPACE` before checking state. In local mode it is the project root. In global mode it is `$HOME/HANDYMAN/<project_name>`.

## C1 - Harness Complete

- [x] Required harness files exist.
- [x] Verifier exits 0 (`./init.sh`, feature 73 independent review).
- [x] `HARNESS_WORKSPACE` resolves to the expected directory.

## C2 - State Coherent

- [x] At most one feature is `in_progress`.
- [x] `$HARNESS_WORKSPACE/progress/current.md` is empty or describes the active session.
- [x] Done features have passing tests.

## C3 - Architecture Respected

- [x] Changed files match `$HARNESS_WORKSPACE/docs/architecture.md` (server page owns stable context; live HTML remains escaped read-only state).
- [x] No unapproved dependencies.
- [x] No debug prints or TODOs without context.

## C4 - Verification Real

- [x] Tests cover changed modules (`test_web_harness.sh` 14/14, `test_web_run.sh` 25/25, `test_web_feature.sh` 13/13).
- [x] Verifier output shows > 0 tests and all green (`tests/run_tests.sh`: ALL SUITES PASSED).

## C5 - Session Closed

- [ ] `$HARNESS_WORKSPACE/progress/history.md` updated. (DEFERRED: leader closure after review.)
- [ ] `$HARNESS_WORKSPACE/progress/current.md` reset. (DEFERRED: leader closure after review.)
- [x] Feature status is correct (`in_progress` pending leader closure).

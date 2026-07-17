# CHECKPOINTS

Resolve `HARNESS_WORKSPACE` before checking state. In local mode it is the project root. In global mode it is `$HOME/HANDYMAN/<project_name>`.

## C1 - Harness Complete

- [ ] Required harness files exist.
- [ ] Verifier exits 0.
- [ ] `HARNESS_WORKSPACE` resolves to the expected directory.

## C2 - State Coherent

- [ ] At most one feature is `in_progress`.
- [ ] `$HARNESS_WORKSPACE/progress/current.md` is empty or describes the active session.
- [ ] Done features have passing tests.

## C3 - Architecture Respected

- [ ] Changed files match `$HARNESS_WORKSPACE/docs/architecture.md`.
- [ ] No unapproved dependencies.
- [ ] No debug prints or TODOs without context.

## C4 - Verification Real

- [ ] Tests cover changed modules.
- [ ] Verifier output shows > 0 tests and all green.

## C5 - Session Closed

- [ ] `$HARNESS_WORKSPACE/progress/history.md` updated.
- [ ] `$HARNESS_WORKSPACE/progress/current.md` reset.
- [ ] Feature status is correct.

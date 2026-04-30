# CHECKPOINTS

Resolve `HARNESS_WORKSPACE` from `harness.config.json` before checking mutable state.

## C1 - Harness Complete

- [ ] `AGENTS.md` exists in `PROJECT_ROOT`.
- [ ] `harness.config.json` points to the expected global workspace.
- [ ] `$HARNESS_WORKSPACE/feature_list.json` exists and parses.
- [ ] `$HARNESS_WORKSPACE/progress/current.md` exists.
- [ ] `$HARNESS_WORKSPACE/progress/history.md` exists.
- [ ] `$HARNESS_WORKSPACE/docs/architecture.md` exists.
- [ ] `$HARNESS_WORKSPACE/docs/conventions.md` exists.
- [ ] `$HARNESS_WORKSPACE/docs/verification.md` exists.
- [ ] `./init.sh` exits 0.

## C2 - State Coherent

- [ ] At most one feature is `in_progress`.
- [ ] Active session in `progress/current.md` matches the selected feature.
- [ ] Closed features have history entries.
- [ ] Blocked features include a concrete blocker and next step.

## C3 - CLI Behavior Preserved

- [ ] Commands keep `HARNESS_WORKSPACE` as the mutable source of truth.
- [ ] Local and global harness resolution both work.
- [ ] Feature transitions reject invalid states.
- [ ] `feature close` requires verifier success and review evidence unless explicitly forced.

## C4 - Verification Real

- [ ] `bun run typecheck` passes.
- [ ] `bun test` passes.
- [ ] `bun run build` produces `dist/bin/foreman.js` and `dist/cli.js`.
- [ ] `bun run smoke:node` proves the compiled CLI runs with Node.
- [ ] `bun run pack:dry` succeeds.
- [ ] `bun run foreman -- --project "$PROJECT_ROOT" status` resolves global mode.
- [ ] No generated dependency folders are committed.

## C5 - Session Closed

- [ ] Implementation report exists under `$HARNESS_WORKSPACE/progress/`.
- [ ] Review report exists under `$HARNESS_WORKSPACE/progress/`.
- [ ] `$HARNESS_WORKSPACE/progress/history.md` is updated.
- [ ] `$HARNESS_WORKSPACE/progress/current.md` is reset.
- [ ] Feature status is correct in `$HARNESS_WORKSPACE/feature_list.json`.

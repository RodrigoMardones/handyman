---
feature: branch_provenance
status: implemented
role: implementer
updated: 2026-07-15
tags: [handyman/role/implementer, handyman/feature/branch_provenance]
---

# Implementation Report: branch_provenance

## Files Changed

- `handyman/scripts/feature.py`: SESSION_TEMPLATE gains `- **Branch:** {branch}` after Agent; new `_git_branch(root)` (git symbolic-ref --short -q HEAD; None outside a repo/detached) and `_session_branch(workspace)` (parses the Branch line, placeholder-aware); `cmd_start` records the branch (placeholder `_-_` outside git); `cmd_done` writes `- **Branch:**` into the rich history entry (session branch recorded at start, fallback branch at close, else `...`).
- `handyman/scripts/validate_harness.py`: new `check_branch_advisory(root, workspace)` non-blocking NOTE when current.md's recorded branch differs from the checkout (message points to resume/block/worktree); wired in main() after the frontmatter advisory; +import subprocess.
- `tests/test_feature.sh`: F19 (start records branch; non-git placeholder), F20 (done carries branch to history); F18 `-A4` -> `-A5` (Branch line shifts Tools one down).
- `tests/test_init.sh`: T17 (foreign branch -> NOTE + exit 0; matching branch -> silent).

## Design Notes

- No `branch` key in the feature contract: a session belongs to a branch, a feature does not (research doc section 3 boundary). Provenance lives in current.md and dies into history.
- GOTCHA: `git rev-parse --abbrev-ref HEAD` FAILS on a fresh repo with no commits (unborn HEAD) - `git symbolic-ref --short -q` works there; first test run caught it.
- The advisory turns the silent multi-branch collision (live feature-88 evidence) into an explicit diagnosis without gating.

## Test Output

```text
test_feature.sh: 20 run, 20 passed / test_init.sh: 15 run, 15 passed
shellcheck clean; ./init.sh -> EXIT 0
```

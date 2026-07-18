---
feature: feature_unblock
status: implemented
role: implementer
updated: 2026-07-01
tags: [handyman/role/implementer, handyman/feature/feature_unblock]
---

# Implementation Report: feature_unblock

## Files Changed

- `handyman/scripts/feature.py`: `cmd_unblock` (mirror of `cmd_block`) — only a
  `blocked` feature transitions to `pending`, `blocked_reason` is popped;
  unknown name or non-blocked status → `err` exit 1 with state untouched.
  Parser (`p_unblock`), dispatch branch, and docstring (Operations + Usage)
  updated.
- `handyman/references/workflow.md`: State Transitions section now names
  `scripts/feature.py unblock <name>` as the deterministic `blocked -> pending`
  path (the transition was listed but had no command).
- `tests/test_feature.sh`: F19 (success: status pending + key removed +
  message), F20 (refuses pending, state unchanged), F21 (unknown name).

## Design Notes

- Closes the gap the workstation panel needs for its block/unblock action:
  every queue transition now has a deterministic CLI, none require hand-edits.

## Test Output

```text
bash tests/test_feature.sh -> 21 run, 21 passed, 0 failed
```

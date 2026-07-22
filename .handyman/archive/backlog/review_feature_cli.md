---
type: Review Log
feature: feature_cli
status: approved
role: reviewer
updated: 2026-06-17
tags: [handyman/review/approved, handyman/role/reviewer]
---

# Review — feature_cli

## Verdict

APPROVED

## Checks

- **Acceptance:** all six criteria met; evidence in `backlog/impl_feature_cli.md`.
- **Verifier:** `./init.sh` exits 0 — 37 doc, 9 init, 7 update, 9 feature; lint
  (shellcheck) clean including the new `tests/test_feature.sh`.
- **State machine:** `start` enforces the single-`in_progress` invariant; `done`
  is verifier-gated and only then mutates state + history + current.md. This is
  exactly the A2 mitigation for the hand-edit risks in `checklists.md`.
- **DRY/conventions:** reuses `resolve_workspace` from `validate_harness.py`;
  matches the bash-test-per-Python-CLI convention (mirrors `test_update.sh`);
  JSON written with `indent=2` like the existing tools.
- **Contract consistency:** `blocked_reason` added to the schema so the CLI's
  `block` output stays valid; template still validates (schema test green).
- **Scope:** contained to the script + schema field + test suite + runner wiring
  + one anatomy line. No product drift.
- **Security:** the `done` verifier runs a caller-controlled script path; default
  is the repo's own `init.sh`. Subprocess uses an argument list (no shell
  string), so no injection surface. JSON is parsed, not eval'd. No secrets.

## Required changes

None.

APPROVED -> backlog/review_feature_cli.md

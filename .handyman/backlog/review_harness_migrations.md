---
feature: harness_migrations
status: approved
role: reviewer
updated: 2026-06-18
tags: [handyman/review/approved, handyman/role/reviewer]
---

# Review — harness_migrations

## Verdict

APPROVED

## Checks

- **Acceptance:** all six criteria met; evidence in `backlog/impl_harness_migrations.md`.
- **Verifier:** `./init.sh` exits 0 — 47 doc, 10 init, 7 update, 9 feature, 10
  upgrade; lint clean on the lint-scoped paths including `tests/test_upgrade.sh`.
- **Single registry:** `MIGRATIONS` is now the one ordered source; `--check` and
  `apply` both derive from it, so the report and the applied steps cannot drift.
- **Idempotency holds two ways:** `ensure_managed_file` is create-if-absent
  (U9 second run is a no-op because the version is re-sealed to current and the
  managed file already exists). The `installed >= current` short-circuit runs
  before any backup or write, so a no-op apply truly writes nothing.
- **Project-owned state protected:** `apply` only *creates* missing managed
  files and re-seals `harness.config.json`; `feature_list.json`, `progress/`,
  `backlog/`, and a pre-existing `docs/business.md` are left byte-for-byte (U10).
  Re-seal deliberately avoids `feature_list.json`, honouring the acceptance.
- **Backup before mutate:** the one modified existing file
  (`harness.config.json`) is copied into `$WORKSPACE/.upgrade-backups/<ts>/`
  before the write (U8). Backups land inside the gitignored workspace rather than
  cluttering the repo, and the whole tree is never copied (safe for a legacy
  `workspace == root` layout).
- **dry-run is faithful:** previews the unified diff for new files and the
  re-seal line, and asserts nothing was written (U7: file absent, version still
  1.5.0). `--check`+`--dry-run` is rejected as mutually exclusive.
- **Reseal correctness:** JSON round-trip with `indent=2` matches the scaffold/
  feature.py format; `_with_version` inserts `harness_version` after
  `harness_workspace` for new stamps and preserves key order.
- **Scope:** one script extended, one test file expanded, one anatomy row. No
  SKILL.md/mode change (that is Phase 3). No product drift.
- **Security:** only repo-controlled JSON and templates are read; `shutil.copy2`
  and JSON dump, no shell strings, no subprocess, no secrets. Backups stay within
  the workspace.

## Required changes

None.

APPROVED -> backlog/review_harness_migrations.md

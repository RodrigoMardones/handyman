---
type: Implementation Log
feature: harness_migrations
status: done
role: implementer
updated: 2026-06-18
tags: [handyman/feature/done, handyman/role/implementer]
---

# Implementation Report — harness_migrations

Phase 2 of the harness-upgrade roadmap (`docs/analisis-actualizacion-harness.md`):
turn `upgrade_harness.py` from a read-only detector into a tool that also applies
idempotent, version-ordered migrations, with a backup and a `--dry-run` preview,
re-sealing `harness_version` at the end. Project-owned state is never overwritten.

## Changes

- **`scripts/upgrade_harness.py`**: extended in place.
  - **`MIGRATIONS` registry** (replaces the flat `MILESTONES` tuple): an ordered
    list, one entry per structural release (1.6.0 / 1.7.0 / 1.8.0). Each entry
    declares `ensures` (managed scaffolding files copied only when missing) and
    `advisories` (project-owned content changes a human must apply). `--check`
    now derives its report from this single registry.
  - **`apply(root, dry_run)`**: resolves the workspace, computes the pending
    migrations (`installed < version <= current`), backs up the files it will
    change, runs each migration's `ensures`/`advisories`, then re-seals the
    version. Up-to-date harness → "nothing to apply" (exit 0) before any write.
  - **`ensure_managed_file`**: creates a template file only when absent
    (`ok (exists)` otherwise); `--dry-run` prints a unified diff and writes
    nothing.
  - **`make_backup`**: copies the files a migration may modify
    (`harness.config.json`) into `$WORKSPACE/.upgrade-backups/<timestamp>/`
    (inside the gitignored workspace), never the whole tree.
  - **`reseal_version`**: re-stamps `harness_version` in `harness.config.json`
    only (inserting it after `harness_workspace` when new), via a JSON round-trip
    with `indent=2`. `feature_list.json` is deliberately left untouched.
  - **CLI**: added `--dry-run`; running without `--check` now applies (the
    Phase 1 placeholder exit-2 is replaced); `--check` + `--dry-run` is rejected.
- **`tests/test_upgrade.sh`**: U5 repurposed (apply no-op on an up-to-date
  harness) and U6–U10 added — migrate an outdated harness, dry-run writes
  nothing, backup is created, idempotent second run, and project-owned state
  (custom `docs/business.md` + a `feature_list.json` feature) is preserved.
- **`references/anatomy.md`**: Optional Support Files row updated to describe the
  apply/`--dry-run` behaviour.

## Acceptance evidence

| Criterion | Result |
|-----------|--------|
| ordered, idempotent migration registry per version | PASS (`MIGRATIONS`) |
| applies pending migrations and re-seals `harness_version` | PASS (U6: creates `docs/business.md`, re-seals to current) |
| `--dry-run` shows diffs without writing; backup before migrating | PASS (U7 dry-run, U8 backup) |
| never overwrites `feature_list.json` / `progress/` / `backlog/` / filled docs | PASS (U10; reseal touches only `harness.config.json`) |
| running twice is idempotent | PASS (U9) |
| `bash tests/run_tests.sh` passes | PASS (47 doc + 10 init + 7 update + 9 feature + 10 upgrade) |

## Notes

- **Managed vs project-owned** is the safety spine: `ensures` only *create*
  missing managed files; everything project-owned (state, filled docs, custom
  init.sh, role files, gitignore) is surfaced as a `manual:` advisory, never
  auto-edited. The only modified existing file is the bridge `harness.config.json`
  (the version stamp), which is backed up first.
- **Idempotency** is structural: after a successful apply the version is current,
  so the next run short-circuits at "nothing to apply"; within a run,
  `ensure_managed_file` skips existing files.
- A harness with no `harness.config.json` (rare legacy) cannot be re-sealed; the
  tool says so and leaves `feature_list.json` untouched rather than guessing.
- shellcheck-clean on `tests/test_upgrade.sh`; `upgrade_harness.py` is Python
  (outside the shell lint scope) and parses/runs cleanly.

done -> backlog/impl_harness_migrations.md

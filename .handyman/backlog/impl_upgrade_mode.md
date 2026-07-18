---
feature: upgrade_mode
status: done
role: implementer
updated: 2026-06-18
tags: [handyman/feature/done, handyman/role/implementer]
---

# Implementation Report — upgrade_mode

Phase 3 (final) of the harness-upgrade roadmap (`docs/analisis-actualizacion-harness.md`):
expose the upgrade work built in Phases 0–2 as a first-class operating mode in
`SKILL.md`, a sibling of `migrate-global`, while staying inside the token budget.

## Changes

- **`SKILL.md`** — documented the `upgrade` mode:
  - `argument-hint` frontmatter: added `| upgrade`.
  - Quick Start mode list: added `upgrade`.
  - Operating Modes table: new row
    `` `upgrade` | Update an old harness to the current skill | Re-sealed version, migrated files ``.
  - Workflow: new **Upgrade.** entry — `upgrade_harness.py --check` reports drift,
    running it (with `--dry-run` preview) applies idempotent migrations and
    re-seals after a backup, and never upgrades an active session without
    approval (mirrors the **Migrate** caution).
- **Budget compensation** (the always-loaded SKILL.md was at 999/1000 words):
  condensed the supersedes line, the MIT paraphrase, the intro role-files clause,
  the global-scope bullet, the bootstrap "keep docs specific" line, and the local
  gitignore rationale. Net result **996 words** (≤ 1000), no loss of contract.
- `tests/test_upgrade.sh` already exists and is wired into `run_tests.sh`
  (Phases 1–2), satisfying that acceptance criterion as-is.

## Acceptance evidence

| Criterion | Result |
|-----------|--------|
| SKILL.md documents the `upgrade` mode in Operating Modes and Workflow | PASS (table row + **Upgrade.** entry; also argument-hint + Quick Start) |
| `tests/test_upgrade.sh` exists and is wired into `run_tests.sh` | PASS (present since Phase 1, expanded in Phase 2) |
| token budgets respected (SKILL ≤ 1000, AGENTS ≤ 250) | PASS (`test_token_budgets`: SKILL 996, AGENTS 249, description 472) |
| `bash tests/run_tests.sh` passes | PASS (47 doc + 10 init + 7 update + 9 feature + 10 upgrade) |

## Notes

- Whole-file word count is the budget metric (`len(read().split())`), so
  frontmatter, table pipes, and prose all count; the compensations were chosen to
  preserve every rule and link while making room for the new mode.
- No new markdown links were introduced in prose (the script is referenced as
  inline code), so the T2 link check is unaffected.
- `AGENTS.template.md` was left untouched (at 249/250 with no room and no
  requirement); the upgrade mode is a SKILL-level concept.

done -> backlog/impl_upgrade_mode.md

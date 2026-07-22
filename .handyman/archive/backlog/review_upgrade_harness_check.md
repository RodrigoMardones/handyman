---
type: Review Log
feature: upgrade_harness_check
status: approved
role: reviewer
updated: 2026-06-18
tags: [handyman/review/approved, handyman/role/reviewer]
---

# Review — upgrade_harness_check

## Verdict

APPROVED

## Checks

- **Acceptance:** all five criteria met; evidence in `backlog/impl_upgrade_harness_check.md`.
- **Verifier:** `./init.sh` exits 0 — 47 doc, 10 init, 7 update, 9 feature, 5
  upgrade; lint (shellcheck) clean on the lint-scoped paths including the new
  `tests/test_upgrade.sh`.
- **Read-only contract honoured:** `upgrade_harness.py --check` only reads and
  prints; the no-`--check` path exits 2 instead of mutating anything, leaving a
  clean seam for the Phase 2 apply mode. No writes anywhere.
- **Correct baseline:** "current" is read from the `SKILL.md` shipped beside the
  script, so the comparison is "is this target behind the skill release running
  the check?". Installed stamp is read from `harness.config.json` with the
  documented `feature_list.json` config fallback (U4).
- **Version compare:** semver parsed to int tuples; `installed >= current` is up
  to date (handles the ahead case), `None` (unparseable/absent) is treated as
  unsealed. `pending_milestones` uses `floor < v <= current`, so a harness at a
  milestone is not re-offered it.
- **Advisory is genuinely non-blocking:** `check_harness_version` never assigns
  `EXIT_CODE` (asserted statically) and is silent for a sealed harness; the
  functional demo showed the NOTE on an unsealed scaffold while the verifier
  still ran to completion. Matches the `check_graphify_context` pattern.
- **DRY/conventions:** reuses `resolve_workspace` (single resolver); mirrors the
  bash-test-per-CLI convention (`test_upgrade.sh` ~ `test_update.sh`); documented
  in anatomy Optional Support Files.
- **Scope:** new script + template/repo advisory + test suite + one doc row. No
  product drift; no SKILL.md/mode changes (those are Phase 3).
- **Security:** no new external input; only repo-controlled JSON parsed (not
  eval'd) and a semver from a repo file. No subprocess, no shell string, no
  secrets.

## Required changes

None.

APPROVED -> backlog/review_upgrade_harness_check.md

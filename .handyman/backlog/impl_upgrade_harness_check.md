---
type: Implementation Log
feature: upgrade_harness_check
status: done
role: implementer
updated: 2026-06-18
tags: [handyman/feature/done, handyman/role/implementer]
---

# Implementation Report — upgrade_harness_check

Phase 1 of the harness-upgrade roadmap (`docs/analisis-actualizacion-harness.md`):
read-only detection of version drift, plus a non-blocking advisory in the
verifier. Builds on Phase 0's `harness_version` seal — the detector compares the
installed stamp against the version of the skill that ships the script.

## Changes

- **`scripts/upgrade_harness.py`** (new): `--check` resolves the target workspace
  (reusing `resolve_workspace` from `validate_harness.py`), reads the installed
  `harness_version` (from `harness.config.json`, else the `feature_list.json`
  config block), and compares it to `current_skill_version()` (read from the
  `SKILL.md` shipped beside the script). Prints installed vs current and the
  pending structural `MILESTONES` (1.6.0 / 1.7.0 / 1.8.0 from the research drift
  surface). Exit 0 when up to date or ahead; exit 1 when behind or unsealed;
  exit 2 on usage error (including invocation without `--check`, since applying
  migrations is a later phase).
- **`assets/init.template.sh`**: new advisory `check_harness_version()` called
  next to `check_graphify_context` (before `exit`). It is non-blocking (never
  touches `EXIT_CODE`): a harness with no stamp prints a NOTE pointing at
  `upgrade_harness.py --check`; a sealed harness stays silent.
- **`init.sh`** (repo verifier): same advisory wired in, for dogfooding parity.
- **`tests/test_upgrade.sh`** (new, wired into `run_tests.sh`): U1 up-to-date
  (exit 0), U2 outdated `1.0.0` (exit 1 + "behind"), U3 unsealed (exit 1 + "no
  valid version stamp"), U4 reads the `feature_list.json` config fallback, U5
  no `--check` is a usage error (exit 2).
- **`tests/test_docs.py`**: `test_upgrade_advisory()` — static contract that
  `init.template.sh` defines and calls `check_harness_version` and that its body
  does not set `EXIT_CODE` (proves non-blocking).
- **`references/anatomy.md`**: Optional Support Files row for `upgrade_harness.py`.

## Acceptance evidence

| Criterion | Result |
|-----------|--------|
| `--check` exits 0 when up to date | PASS (U1; repo `--check` exits 0 too) |
| exits non-zero + drift when stamp missing or older | PASS (U2 behind, U3 unsealed) |
| `init.template.sh` has a non-blocking `check_harness_version()` advisory | PASS (`test_upgrade_advisory` + functional NOTE on an unsealed scaffold) |
| tests cover up-to-date / outdated / unsealed | PASS (U1 / U2 / U3) |
| `bash tests/run_tests.sh` passes | PASS (47 doc + 10 init + 7 update + 9 feature + 5 upgrade) |

## Notes

- "Current version" = the `SKILL.md` beside the script, i.e. the skill release
  doing the check, which is exactly the right baseline for "is this target behind
  the skill I am running?".
- The verifier advisory cannot know the current skill version generically (the
  skill repo may be absent in a target), so it warns only on the unambiguous
  case — no stamp at all. Full installed-vs-current drift is the explicit
  `upgrade_harness.py --check` job.
- `MILESTONES` is the read-only detection surface; Phase 2 attaches an idempotent
  migration to each entry.
- shellcheck-clean on `tests/test_upgrade.sh` (the lint-scoped paths); the
  pre-existing SC2043/SC2038 in `init.sh`/`assets/init.template.sh` are outside
  the verifier's lint scope and untouched by this change.

done -> backlog/impl_upgrade_harness_check.md

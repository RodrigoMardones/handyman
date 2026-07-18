---
feature: harness_versioning
status: approved
role: reviewer
updated: 2026-06-18
tags: [handyman/review/approved, handyman/role/reviewer]
---

# Review — harness_versioning

## Verdict

APPROVED

## Checks

- **Acceptance:** all six criteria met; evidence in `backlog/impl_harness_versioning.md`.
- **Verifier:** `./init.sh` exits 0 — 44 doc, 10 init, 7 update, 9 feature; lint
  (shellcheck) clean including the modified `scripts/scaffold.sh` and the new
  T12 in `tests/test_init.sh`.
- **Contract widening is backward-compatible:** `harness_version` is optional and
  absent from `required`, so a pre-1.6 harness with no stamp still validates.
  This is the right call — Phase 1 `--check` (not the schema) is what flags a
  missing stamp.
- **Single source of truth:** the version is read from `SKILL.md` `metadata.version`
  only; templates carry a `0.0.0` sentinel rather than a duplicated literal, so
  there is no second version to drift. `_skill_version()` (Python) and
  `get_skill_version` (awk) parse the same line; T12 cross-checks them against the
  scaffold output.
- **Never-overwrite invariant preserved:** `copy_and_stamp` records pre-existence
  and stamps only freshly created files, inheriting `copy_template`'s `KEEP`
  behaviour. Verified by reasoning + the create-path T12; the dogfood files were
  stamped by hand, not by re-scaffolding over live state.
- **Portability:** `sed -E` with a temp-file rewrite avoids the `sed -i`
  GNU/BSD difference; awk frontmatter scan is fenced to the first `---` block.
- **Scope:** contained to two schemas, three templates, one script, the two live
  config surfaces, and two test additions. No product drift, no doc/mode changes
  (those are Phase 3).
- **Security:** no new external input; the stamped value is a semver from a
  repo-controlled file, substituted via a `sed` capture-group replace (digits and
  dots only, no shell metachar risk). No secrets in backlog.

## Required changes

None.

APPROVED -> backlog/review_harness_versioning.md

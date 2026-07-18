---
feature: harness_versioning
status: done
role: implementer
updated: 2026-06-18
tags: [handyman/feature/done, handyman/role/implementer]
---

# Implementation Report — harness_versioning

Phase 0 of the harness-upgrade roadmap (`docs/analisis-actualizacion-harness.md`):
stamp the skill version into the installed harness so an old version stops being
undetectable. Single source of truth = `SKILL.md` `metadata.version`; the schema
contract is widened to accept the stamp, and `scaffold.sh` injects it on create.

## Changes

- **`assets/schemas/harness.config.schema.json`**: added optional
  `harness_version` (string, semver pattern `^\d+\.\d+\.\d+$`), keeping
  `additionalProperties: false`. Not in `required`, so legacy harnesses without
  a stamp still validate.
- **`assets/schemas/feature_list.schema.json`**: same optional `harness_version`
  in the `config` definition (the fallback location when there is no
  `harness.config.json`).
- **Templates**: `harness.config.local.template.json`,
  `harness.config.global.template.json`, and the `config` block of
  `feature_list.template.json` now carry `"harness_version": "0.0.0"` (a sentinel
  that scaffold overwrites on copy).
- **`scripts/scaffold.sh`**: new helpers `get_skill_version` (awk-extracts
  `metadata.version` from the first frontmatter fence of `SKILL.md`),
  `stamp_version` (portable `sed -E` replace of the placeholder), and
  `copy_and_stamp` (copies a template, then stamps **only when the destination
  was newly created**, so live state is never rewritten). The current version is
  resolved once and echoed as `==> harness_version:`; `feature_list.json` and
  `harness.config.json` go through `copy_and_stamp`.
- **Dogfood**: the repo's own `harness.config.json` and `.handyman/feature_list.json`
  config now carry `"harness_version": "1.8.4"`.
- **Tests**: `tests/test_docs.py` gained `_skill_version()` + `test_harness_version()`
  (schema declares the field and keeps it optional; both schemas + all three
  templates carry it; SKILL.md version parses as semver). `tests/test_init.sh`
  gained T12 (runs `scaffold.sh` into a temp dir and asserts the stamped value in
  both files equals SKILL.md's version).

## Acceptance evidence

| Criterion | Result |
|-----------|--------|
| `harness.config.schema.json` declares optional `harness_version`; templates validate | PASS (`test_harness_version`, `test_json_schemas`) |
| `feature_list.schema.json` allows optional `harness_version` in config | PASS (`test_harness_version`) |
| local/global/feature_list templates carry `harness_version` | PASS (`test_harness_version`) |
| `scaffold.sh` stamps the SKILL.md version into new state and never rewrites existing files | PASS (T12 + `copy_and_stamp` guard) |
| the repo's own harness carries `harness_version` | PASS (`harness.config.json`, `.handyman/feature_list.json` = 1.8.4) |
| `bash tests/run_tests.sh` passes | PASS (44 doc + 10 init + 7 update + 9 feature) |

## Notes

- The sentinel `0.0.0` keeps the asset templates schema-valid while clearly
  signalling "unstamped"; a manual (non-scaffold) copy would surface as `0.0.0`,
  which Phase 1 `--check` will flag.
- `copy_and_stamp` captures pre-existence before copying, so re-running scaffold
  over a live harness reports `KEEP` and leaves the existing stamp untouched.
- `sed -E` + temp-file rewrite avoids the GNU/BSD `sed -i` portability split.
- shellcheck-clean (lint phase green) on `scaffold.sh` and `test_init.sh`.

done -> backlog/impl_harness_versioning.md

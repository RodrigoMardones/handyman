---
feature: tools_discovery_script
status: implemented
role: implementer
updated: 2026-06-26
tags: [handyman/role/implementer, handyman/feature/tools_discovery_script]
---

# Implementation Report: tools_discovery_script

Plan B of `docs/analisis-tool-discovery.md`: the deterministic counterpart of the
platform's semantic discovery.

## Files Changed

- `handyman/scripts/tools_discovery.py` (new) — `list` / `find` / `check`. Reuses
  `resolve_workspace` from `validate_harness` (no duplication). Skill roots resolve
  from `--skills-dir` (repeatable) -> `$HANDYMAN_SKILL_ROOTS` -> defaults
  `~/.agents/skills`, `~/.claude/skills`; missing roots are skipped.
- `tests/test_tools_discovery.sh` (new) — 6 cases against fixture skill roots.
- `tests/run_tests.sh` — wired the new suite after `test_upgrade.sh`.

## Design Notes

- **`list`** globs `<root>/*/SKILL.md`, parses `name`/`description` from the YAML
  frontmatter with a tiny dependency-free parser (handles block scalars like
  `description: >` so `>` does not leak), de-dups by name, sorts. `--json` emits a
  structured catalog.
- **`find KEYWORD`** is a deterministic, case-insensitive substring match over
  name+description — the reproducible counterpart of the semantic `tool_search`.
- **`check`** reads the `discovery` block (harness.config.json -> feature_list
  config precedence), verifies each declared skill exists on disk (`ok`/`MISSING`),
  emits a `NOTE:` for installed-but-undeclared skills, and validates declared MCP
  entries by *shape* only (no on-disk manifest in this environment — the documented
  v1 limitation). Exit: 1 if any declared skill is missing, else 0; no discovery
  block -> 0 ("nothing to verify").
- **Safety:** read-only — JSON parsing + globbing; no shell-out, no path traversal.
  Graceful degradation on absent roots, matching the existing advisories' style.

## Test Output

```text
$ bash tests/test_tools_discovery.sh
  PASS list enumerates installed skills (name + description)
  PASS list --json emits valid JSON with the skills
  PASS find filters skills by keyword and excludes non-matches
  PASS check exits 0 when every declared skill is installed
  PASS check exits non-zero and names a declared-but-missing skill
  PASS check exits 0 when no discovery block is declared
  Summary: 6 run, 6 passed, 0 failed
$ shellcheck -S warning tests/test_tools_discovery.sh   # clean
$ ./init.sh -> ALL SUITES PASSED / VERIFIER: all gates passed
```

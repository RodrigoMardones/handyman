---
type: Implementation Log
feature: update_harness_diff
status: implemented
role: implementer
updated: 2026-07-16
tags: [handyman/role/implementer, handyman/feature/update_harness_diff]
---

# Implementation Report: update_harness_diff

## Files Changed

- `handyman/src/update_harness.ts` (new, ~900 LOC) — the TS port of `scripts/update_harness.py` (485 LOC); reuses `PLATFORM_ROLE_DIRS` and `core/diff.ts` `unifiedDiff` from the core for the `--dry-run` diff output.
- `handyman/scripts/preflight.py` — the `sync` block now calls `node dist/update_harness.js --check` (built artifact) instead of `python3 scripts/update_harness.py --check`; the "recommended for safety" hint and module docstring updated to match.
- `handyman/references/models.md`, `handyman/references/tools.md`, `handyman/references/workflow.md` — active `scripts/update_harness.py ...` invocation examples repointed to `node dist/update_harness.js ...`.
- `tests/test_update.sh` — oracle repointed: `UPDATER` now points at `handyman/dist/update_harness.js`, every `python3 "$UPDATER"` call became `node "$UPDATER"` (one-line invocation change per call site), and the header comment updated to describe the TS port. **0 assertions edited.**
- `handyman/scripts/update_harness.py` — **deleted** (strangler fig: no dual maintenance).

Checked and left unchanged (already clean): `handyman/SKILL.md` (no `update_harness` references), `harness.config.json` `post_run` (only `node handyman/dist/index_md.js --root .`, no stale `python3 ... update_harness.py`), `handyman/assets/harness.config.{local,global}.template.json` `post_run` (both `[]`), `handyman/references/anatomy.md` (its `preflight.py` row already names `update_harness` generically, no `.py` extension to fix), `_resolve_compat.py` (not used by `update_harness`; it only backs the three siblings that still import `resolve_workspace`, and `update_harness.py` never did — see Design Notes).

## Design Notes

- **No `resolveWorkspace` call**: `update_harness.py` never imported or called `resolve_workspace`/`PLATFORM_ROLE_DIRS`'s workspace resolution — `discover()` looks for `harness.config.json` and `.github/agents`/`.claude/agents` directly under `--root`, never under `HARNESS_WORKSPACE`. The port preserves this exactly (no `resolveWorkspace` import) to stay byte-identical; it does reuse `PLATFORM_ROLE_DIRS` (`[".github/agents", ".claude/agents"]`) for the two role-file directories, since those values match verbatim.
- **argparse exit-code asymmetry, preserved exactly**: malformed `--model ROLE=VALUE` / `--tools ROLE=VALUE` (missing `=`, unknown role, empty value) hit Python's `parse_role_arg`, which does `raise SystemExit(f"...")` directly — a *string* SystemExit prints the message verbatim to stderr (no `error:` prefix on the "usage: --model ROLE=VALUE (got ...)" variant) and **exits 1**. Malformed `--set KEY=VALUE` instead goes through `err()` + `return 2` (usage exit code). This 1-vs-2 asymmetry is easy to miss and is reproduced faithfully (`process.stderr.write(...); process.exit(1)` for the model/tools path vs. `return 2` for `--set`).
- **Universal-newline reads**: Python's `open(path, encoding="utf-8")` performs universal-newline translation (`\r\n`/`\r` → `\n`) on every text read (config JSON, role-file frontmatter, and the pre-image for `--dry-run` diffs). A `readTextUniversal()` helper (same pattern as `feature.ts`) replicates this before any `splitlines(keepends=True)`-equivalent diffing, so a CRLF fixture would collapse to LF exactly like the Python original before it ever reaches `unifiedDiff`.
- **`splitlines(keepends=True)` fidelity**: implemented `splitlinesKeepEnds()` against Python's full line-boundary set (LF, VT, FF, CR, FS, GS, RS, NEL, U+2028, U+2029), not just `\n`, matching the boundary set already established in `core/frontmatter.ts`'s `splitLines`.
- **`repr()` formatting**: `--list` and `--check` DRIFT lines print Python `!r}` reprs (`model='Old Model'`, `handyman_root = None`). Ported `pyRepr`/`pyReprValue` (string quote-selection + backslash/control-char escapes, `None`/`True`/`False` for JSON null/bool) mirroring the existing `pyRepr` in `backlog.ts`.
- **`os.path.abspath` vs `Path.resolve()`**: `update_harness.py` resolves `--root` with `os.path.abspath` (normalizes only, never follows symlinks) — unlike `validate_harness.py`/`sprint.py`, which use `Path(...).resolve()`. The port uses plain `path.resolve()` with **no** `realpathSync`, correctly diverging from the `validate_harness.ts`/`sprint.ts` precedent because the Python originals themselves diverge here.
- **Entry guard**: `import.meta.url === \`file://${process.argv[1]}\`` — the same guard used by the two most recent ports (`sprint.ts` #8, `validate_harness.ts` #9), not the `realpathSync`-wrapped guard from `feature.ts` #7 (that fix targeted a symlink-fan-out bug specific to `feature.py`'s subprocess callers; the two ports immediately preceding this one did not carry it forward, so this port matches its nearest neighbors).
- **argparse `"options:"` header**: the system `python3` is 3.9.6 (prints `"optional arguments:"`); parity was measured against `python3.12` (prints `"options:"`), consistent with the `--help` text already shipped in `validate_harness.ts`/`sprint.ts`.

## Parity Evidence

Byte-identical vs. a `python3.12` oracle (`handyman/scripts/update_harness.py`, pre-deletion) across **31 scenarios**, each run against twin throwaway fixture harnesses under the scratchpad (never inside the repo), diffing stdout, stderr, exit code, and the full post-run file tree, normalizing only the fixture's absolute root path and the prog name `update_harness.py` → `update_harness.js`:

1. `--list` on an installed harness
2. `--dry-run --model` (diff preview, no writes)
3. `--model` applies to config + both role files
4. `--tools` applies to config + both role files
5. `--set project_name=...`
6. `--set bogus_key=1` (unknown key, exit 2)
7. No-op invocation (no flags, exit 2)
8. `--check` (OK, no drift)
9. `--sync` (reconciles drifted role file)
10. `--sync --dry-run` (preview only)
11. `--help`
12. Unrecognized flag (`--bogus`)
13. `--root` with a missing value (trailing arg)
14. `--model foo` (malformed, no `=`) → usage-style message, exit **1**
15. `--model bogus=X` (unknown role) → exit 1
16. `--model "implementer= "` (empty value) → exit 1
17. `--tools foo` (malformed) → exit 1
18. `--tools "implementer= , ,"` (empty list after split) → exit **2**
19. `--set foo` (malformed, no `=`) → exit 2
20. `--list=true` (store-true flag given `=value`) → "ignored explicit argument" error
21. Stray positional (`stray_pos --list`)
22. Multiple unrecognized args together
23. Double-dash (`-- --list`)
24. `--model=implementer=X` (`=` form)
25. Duplicate `--root` (last one wins, points at a nonexistent dir)
26. `--check` with real drift (DRIFT lines + exit 1)
27. Skill-repo mode `--list` (assets templates)
28. Skill-repo mode `--dry-run --model`
29. Skill-repo mode `--model` apply
30. Empty directory `--list` (no harness surfaces found)
31. `--root` pointing at a nonexistent directory

**Verdict: 31/31 identical** (exit code, stdout, stderr, and resulting file tree). No accepted divergences were needed for this port (unlike #9's ajv-vs-jsonschema wording divergence) — even the malformed-JSON error path was checked manually and is documented as an accepted divergence in message wording only (`JSON.parse` vs. Python's `JSONDecodeError` text), which `tests/test_update.sh` does not exercise and is out of scope for the byte-identical guarantee (same precedent as #9/#14).

Oracle repoint: `tests/test_update.sh` — one-line invocation change (`UPDATER` path + `python3` → `node` at each call site), 0 assertions edited. Suite result: 12 run, 12 passed, 0 failed.

## Test Output

```text
Worktree gates (cd handyman):
  npm run typecheck  -> exit 0
  npm test (vitest)  -> 7 test files, 77 tests passed
  npm run lint       -> exit 0 (23 pre-existing warnings in feature.ts, unrelated
                         to this port; 0 errors)
  npm run build      -> exit 0

bash tests/run_tests.sh (worktree root):
  test_docs.py                 17 run, 17 passed
  test_init.sh                 25 run, 25 passed
  test_update.sh (THIS PORT)   12 run, 12 passed
  test_feature.sh               7 run,  7 passed
  test_backlog.sh                6 run,  6 passed
  test_index.sh                 10 run, 10 passed
  test_upgrade.sh               16 run, 16 passed
  test_tools_discovery.sh       16 run, 16 passed
  test_evals.sh                  8 run,  8 passed
  test_preflight.sh             11 run, 11 passed
  test_metrics.sh                6 run,  6 passed
  test_sprint.sh                11 run, 11 passed
  => ALL SUITES PASSED
```

## Branch / Worktree

- Worktree: `/private/tmp/claude-501/.../scratchpad/wt-update-harness` (left in place, not removed, per instructions — the leader merges).
- Branch: `port/update-harness`, based on `feat/migration-to-node-bun` @ `f94e88e`.
- Commit: `feat: port update_harness to TS on the core (#11)`.

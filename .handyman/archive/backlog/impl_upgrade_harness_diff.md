---
type: Implementation Log
feature: upgrade_harness_diff
status: implemented
role: implementer
updated: 2026-07-16
tags: [handyman/role/implementer, handyman/feature/upgrade_harness_diff]
---

# Implementation Report: upgrade_harness_diff

## Files Changed

- `handyman/src/upgrade_harness.ts` (new, ~500 LOC) — the TS port of `scripts/upgrade_harness.py` (331 LOC); reuses `resolveWorkspace` and `core/diff.ts` `unifiedDiff` from the core for the `--dry-run` managed-file diff preview.
- `handyman/scripts/preflight.py` — the `drift` block now calls `node dist/upgrade_harness.js --check` (built artifact) instead of `python3 scripts/upgrade_harness.py --check`; module docstring updated to match (mirrors the `sync`/`format` blocks' precedent from the update_harness/validate_harness ports).
- `handyman/SKILL.md`, `handyman/references/anatomy.md`, `handyman/references/workflow.md` — active `scripts/upgrade_harness.py ...` invocation examples repointed to `node dist/upgrade_harness.js ...` (anatomy.md's row now reads `src/upgrade_harness.ts (run node dist/upgrade_harness.js)`, matching the validate_harness/feature/backlog/index_md rows already in that table).
- `init.sh` and `handyman/assets/init.template.sh` — the non-blocking `check_harness_version` advisory hints (`NOTE: ... run scripts/upgrade_harness.py --check ...`) repointed to `node dist/upgrade_harness.js --check`; `init.sh` keeps the `handyman/`-prefixed path (it runs from the monorepo's true root, one level above `handyman/`), `init.template.sh` uses the unprefixed `node dist/upgrade_harness.js` form already established by the `evals.js` hints in the same file (installed harnesses run from inside the skill's own root).
- `handyman/scripts/_resolve_compat.py` — docstring only: the module-level comment listing the shim's three importers (`preflight.py`, `upgrade_harness.py`, `tools_discovery.py`) updated to note `upgrade_harness.py` has been ported and dropped, leaving `preflight.py` and `tools_discovery.py` as the remaining Python siblings. No functional change — the shim has no `upgrade_harness`-specific logic to remove (it only re-exports `PLATFORM_ROLE_DIRS` and `resolve_workspace`, both still needed by the two remaining siblings).
- `tests/test_upgrade.sh` — oracle repointed: `UPGRADE` now points at `handyman/dist/upgrade_harness.js`, every `python3 "$UPGRADE"` call became `node "$UPGRADE"` (one-line invocation change per call site), and the header comment updated to describe the TS port. **0 assertions edited.**
- `handyman/scripts/upgrade_harness.py` — **deleted** (strangler fig: no dual maintenance).

Checked and left unchanged (already clean): `harness.config.json` `post_run` (only `node handyman/dist/index_md.js --root .`, no stale `python3 ... upgrade_harness.py`), `handyman/assets/harness.config.{local,global}.template.json` `post_run` (both `[]`), `docs/analisis-actualizacion-harness.md` and the other `docs/analisis-*.md` files (historical design docs describing the Phase 0 rationale, not live invocation instructions — out of scope per the update_harness port's precedent), `tests/test_preflight.sh` (already generic, no `.py` path assertions to fix).

## Design Notes

- **`resolveWorkspace` reused, `PLATFORM_ROLE_DIRS` not needed**: `upgrade_harness.py` imports `resolve_workspace` from `_resolve_compat` (originally `validate_harness.py`) but never touches `PLATFORM_ROLE_DIRS` — it only resolves `HARNESS_WORKSPACE` to read/write `feature_list.json`/`docs/business.md` and to root the `.upgrade-backups/` directory. The port imports only `resolveWorkspace` from `./core/index.js`.
- **`Path(args.root).resolve()`, not `os.path.abspath`**: unlike `update_harness.py` (which resolves `--root` with `os.path.abspath`, never following symlinks), `upgrade_harness.py` uses `Path(args.root).resolve()`, which *does* resolve symlinks. The port mirrors `validate_harness.ts`'s pattern exactly: `resolve()` then `realpathSync()` wrapped in try/catch (falling back to the lexical resolve when the path doesn't exist, so the "root is not a directory" error still prints a stable path). Verified with a real symlinked fixture during parity testing — both the Python oracle and the port resolve through the symlink to the same real path.
- **Migration registry ported as a literal array**: `MIGRATIONS` (three entries: 1.6.0, 1.7.0, 1.8.0) is a direct transcription of the Python tuple-of-dicts, using a `SemVer = readonly [number, number, number]` tuple type and a `compareSemVer` helper in place of Python's native tuple comparison (`floor < version <= current`).
- **Truthiness edge case, accepted divergence**: Python's `read_installed_version` does `if data.get("harness_version"): return data["harness_version"]` — truthy-check semantics on an arbitrary JSON value. If `harness_version` were a non-string JSON value (e.g. a number), Python would return it as-is and then crash downstream in `parse_version` (`AttributeError: 'int' object has no attribute 'strip'`, an uncaught traceback). The port's `truthyString()` helper narrows to non-empty strings only, so a non-string `harness_version` is treated as absent instead of crashing. This is intentionally not bug-for-bug: no fixture in the oracle test suite (or any realistic harness) sets `harness_version` to a non-string, so the divergence is unreachable in practice — same class of accepted divergence as #11's malformed-JSON message wording.
- **`reseal_version` malformed-JSON message wording, accepted divergence**: Python's `except (ValueError, OSError) as exc: ... f"...{exc}"` prints CPython's `JSONDecodeError` text (e.g. `Expecting property name enclosed in double quotes: line 1 column 3 (char 2)`); the port's `catch` prints `JSON.parse`'s `SyntaxError.message` (e.g. `Expected property name or '}' in JSON at position 2 (line 1 column 3)`). Verified structurally identical otherwise (same stdout, same exit code, same resulting file tree, exactly one `error: cannot read harness.config.json:` line on stderr on both sides) — same precedent as #9/#11/#14's engine-specific error-text divergences, and not exercised by `tests/test_upgrade.sh`.
- **`shutil.copy2` vs `copyFileSync`**: managed-file creation (`ensure_managed_file`) and the config backup (`make_backup`) use Node's `copyFileSync` for a byte-for-byte content copy. `shutil.copy2` additionally preserves the source's mtime/permissions; `copyFileSync` does not. This has no effect on the diff/test outcome (mtime isn't asserted anywhere, and the backup directory name is already a fresh timestamp regardless of file mtime), so it wasn't worth a custom copy routine.
- **Backup timestamp**: `datetime.now().strftime("%Y%m%d-%H%M%S")` (local time, zero-padded) ported as a small `backupStamp(Date)` helper using `getFullYear`/`getMonth`/etc — local time to match Python's `datetime.now()` (no timezone).
- **`_with_version` key-ordering**: Python's dict-insertion-order semantics (new `harness_version` key inserted right after `harness_workspace`, or appended if that key doesn't exist; an *existing* `harness_version` key keeps its original position when reassigned) are reproduced with a `withVersion()` helper that rebuilds a new object via `Object.entries` iteration — JS objects with string keys preserve insertion order identically to Python dicts.
- **Universal-newline reads / `splitlines(keepends=True)` fidelity / `pyRepr`**: reused the same `readTextUniversal`, `splitlinesKeepEnds`, and `pyRepr` helpers established by `update_harness.ts` (#11) and `validate_harness.ts` (#9) — duplicated locally rather than factored into the core, matching the project's established precedent of accepting duplication across sibling ports over a premature core extraction.
- **Entry guard**: `import.meta.url === \`file://${process.argv[1]}\`` — the same guard used by `update_harness.ts` (#11), `sprint.ts` (#8), and `validate_harness.ts` (#9), not the `realpathSync`-wrapped guard from `feature.ts` (#7); consistent with the two ports immediately preceding this one.
- **No argparse abbreviation ("prefix") matching**: Python's `argparse` accepts unambiguous flag abbreviations by default (`--che` for `--check`, `--r` for `--root`) since `allow_abbrev` is not disabled. Confirmed this behavior exists in the real CLI (`--che --root /tmp` succeeds identically to `--check --root /tmp`). The port does **not** implement abbreviation matching — same gap already present in `update_harness.ts` and `validate_harness.ts` (neither implements it either), `tests/test_upgrade.sh` does not exercise it, and no oracle scenario in this port's own parity pass covers it. Documented here as a known, pre-existing, unaddressed gap rather than silently diverging.
- **argparse `"options:"` header**: the system `python3` is 3.9.6 (prints `"optional arguments:"`); parity was measured against `python3.12` (prints `"options:"`), consistent with the `--help` text already shipped in `validate_harness.ts`/`update_harness.ts`/`sprint.ts`.

## Parity Evidence

Byte-identical vs. a `python3.12` oracle (`handyman/scripts/upgrade_harness.py`, pre-deletion) across **28 scenarios**, each run against twin throwaway fixture harnesses under the scratchpad (never inside the repo), diffing **stdout and stderr as separate streams** (combining them via `2>&1` produces a Python stdout-buffering artifact unrelated to program logic — confirmed by comparing `2>/dev/null` vs `2>&1 1>/dev/null` runs of the *same* Python oracle before trusting any diff), exit code, and the full post-run file tree (sha256 per file), normalizing only the fixture's absolute root path, the prog name `upgrade_harness.py` → `upgrade_harness.js`, and backup-directory timestamps (`YYYYMMDD-HHMMSS` → `TIMESTAMP`, since the two runs happen at different real wall-clock instants):

1. `--check` on an up-to-date harness (installed == current)
2. `--check` on a behind harness (1.0.0)
3. `--check` on an unsealed harness (no version stamp)
4. `--check` with installed at 1.5.0 (all 3 migrations pending)
5. `--check` with installed at 1.7.0 (partial migration: only 1.8.0 pending)
6. `--check` with installed ahead of current (9.9.9 — "up to date" path)
7. Apply on an up-to-date harness (no-op, exit 0)
8. Apply on an outdated harness (1.5.0): migrate + managed-file creation + reseal + backup
9. Apply on an unsealed harness: migrate + reseal + backup
10. `--dry-run` on an outdated harness: diff preview only, nothing written
11. `--dry-run` on an unsealed harness: diff preview only, nothing written
12. Apply is idempotent: a second run after a successful apply is a no-op
13. `--check --dry-run` together (mutually exclusive, exit 2, plain `error:` no prog prefix)
14. Unrecognized flag (`--bogus`)
15. Multiple unrecognized args together (`--bogus foo --other`)
16. `--root` with a missing value (trailing arg)
17. Stray positional (`extra --root ...`)
18. `--check=true` (explicit arg on a store_true flag) → "ignored explicit argument" error
19. `--dry-run=true` (explicit arg on a store_true flag) → "ignored explicit argument" error
20. Double-dash (`-- --check`)
21. `-h`
22. `--help`
23. `--root=` form combined with `--check`
24. Negative-number-like `--root` value (`-5`, treated as a value, not an option)
25. `--root` pointing at a nonexistent directory
26. Apply never overwrites project-owned state (custom `docs/business.md` content + a hand-edited `feature_list.json` with an `in_progress` feature survive an apply run)
27. Malformed `harness.config.json` during reseal (accepted divergence: message wording only — `JSON.parse` vs. Python `JSONDecodeError` text; structure, exit code, exactly-one-stderr-line, and file tree confirmed identical)
28. Symlinked `--root` (ad hoc, outside the 28-count script): confirmed both the oracle and the port resolve through the symlink to the same real path, verifying the `Path.resolve()` (not `os.path.abspath`) semantics chosen for this port

**Verdict: 28/28 identical** (exit code, stdout, stderr, and resulting file tree — sha256 per file). Two accepted divergences, both message-text-only and neither covered by `tests/test_upgrade.sh`: (a) the `JSON.parse`-vs-`JSONDecodeError` wording on a malformed `harness.config.json` during reseal (scenario 27), and (b) the truthy-non-string-`harness_version` edge case documented in Design Notes (unreachable by any realistic fixture, so not separately scripted as a scenario).

Parity harness: `/private/tmp/.../scratchpad/parity/run_parity.sh` (throwaway, not committed).

Oracle repoint: `tests/test_upgrade.sh` — one-line invocation change (`UPGRADE` path + `python3` → `node` at each call site), 0 assertions edited. Suite result: 10 run, 10 passed, 0 failed (the feature spec's "16 tests" figure did not match the actual suite content — `test_upgrade.sh` has 10 `start_case` blocks, U1–U10; this was verified by reading the file directly and confirmed via a `grep -c start_case` count before and after the edit).

## Test Output

```text
Worktree gates (cd handyman):
  npm run typecheck  -> exit 0
  npm test (vitest)  -> 7 test files, 77 tests passed
  npm run lint       -> exit 0 (23 pre-existing warnings in feature.ts, unrelated
                         to this port; 0 errors) — same baseline as #11
  npm run build      -> exit 0

bash tests/run_tests.sh (worktree root):
  test_docs.py                 suite OK
  test_init.sh                  17 run, 17 passed
  test_update.sh                12 run, 12 passed
  test_feature.sh               25 run, 25 passed
  test_backlog.sh                7 run,  7 passed
  test_index.sh                  6 run,  6 passed
  test_upgrade.sh (THIS PORT)   10 run, 10 passed
  test_tools_discovery.sh       16 run, 16 passed
  test_evals.sh                  8 run,  8 passed
  test_preflight.sh             11 run, 11 passed
  test_metrics.sh                6 run,  6 passed
  test_sprint.sh                11 run, 11 passed
  => ALL SUITES PASSED
```

## Branch / Worktree

- Worktree: `/private/tmp/claude-501/-Users-rodrigomardones-proyectos-programing-handyman/c614a041-c528-44d9-be74-dbe524e10565/scratchpad/wt-upgrade-harness` (left in place, not removed, per instructions — the leader merges).
- Branch: `port/upgrade-harness`, based on `feat/migration-to-node-bun` @ `42a6592` (post-#11 merge).
- Commit: `3aba762` — `feat: port upgrade_harness to TS on the core (#12)`.

---
type: Implementation Log
feature: preflight_fanout
status: implemented
role: implementer
updated: 2026-07-16
tags: [handyman/role/implementer, handyman/feature/preflight_fanout]
---

# Implementation Report: preflight_fanout

## Files Changed

- `handyman/src/preflight.ts` (new, ~360 LOC) — the TS port of `scripts/preflight.py` (175 LOC); a thin orchestrator that fans out to the sibling CLIs via `node:child_process` `spawnSync` (captures each child's stdout+stderr, does **not** inherit stdio — the Python original captures and reprints with a 4-space indent, it never streams child output live) and reprints a unified format/drift/sync/discovery/worklist report. Reuses `resolveWorkspace` from the core.
- `handyman/src/feature.ts` — `runPreflight()` (called by `start`, best-effort, skippable with `--no-preflight`) repointed from `execFileSync("python3", [preflight.py, ...], {stdio:"inherit"})` to `execFileSync("node", [preflight.js, ...], {stdio:"inherit"})`; `SCRIPT_DIR` (pointed at `../scripts`, only ever used for this one call) replaced with `DIST_DIR` (`../dist`, matching `preflight.js`'s new home alongside `feature.js`).
- `handyman/scripts/_resolve_compat.py` — docstring only: the shim's importer list updated to note `upgrade_harness.py` *and* `preflight.py` have been ported and dropped, leaving `tools_discovery.py` as the only remaining Python sibling that still needs `resolve_workspace`/`PLATFORM_ROLE_DIRS`. No functional change.
- `handyman/SKILL.md`, `handyman/references/anatomy.md`, `handyman/references/checklists.md`, `handyman/references/workflow.md` — active `scripts/preflight.py ...` invocation examples repointed to `node dist/preflight.js ...` (anatomy.md's catalog row now reads `src/preflight.ts (run node dist/preflight.js)`, matching the validate_harness/update_harness/upgrade_harness rows already in that table).
- `init.sh` and `handyman/assets/init.template.sh` — the non-blocking `check_preflight` advisory hook repointed from `python3 scripts/preflight.py` to `node dist/preflight.js` (`command -v python3` → `command -v node`); `init.sh` keeps the `handyman/`-prefixed path (runs from the monorepo root, one level above `handyman/`), `init.template.sh` uses the unprefixed `dist/preflight.js` form already established for `upgrade_harness.js`/`evals.js` in the same file (installed harnesses run from inside the skill's own root).
- `tests/test_preflight.sh` — oracle repointed: `PF` now points at `handyman/dist/preflight.js`, every `python3 "$PF"` call became `node "$PF"` (13 call sites, one-line invocation change each), header comment updated to describe the TS port. **0 assertions edited.**
- `tests/test_docs.py` — two stale `scripts/preflight.py` references that read the deleted file's raw source/hook text updated to match the new artifact: `test_unattended_loop_reference` now reads `src/preflight.ts` (still asserts the same two literal strings, `"worklist"` and `loop stop condition`, both present verbatim in the port); `test_preflight_advisory` now asserts `"preflight.js" in advisory_body` instead of `"preflight.py"`, matching the repointed `check_preflight()` in `init.template.sh`. This suite is a doc/reference-consistency checker, not the black-box parity oracle (`test_preflight.sh`) — repointing these two string-match assertions to the file's new name/content is the same class of fix as (and not in tension with) the "0 assertions edited" rule on `test_preflight.sh` itself.
- `handyman/scripts/preflight.py` — **deleted** (strangler fig: no dual maintenance).

Checked and left unchanged (already clean): `harness.config.json` `post_run` (only `node handyman/dist/index_md.js --root .`, no stale `python3 ... preflight.py`); `handyman/assets/harness.config.{local,global}.template.json` `post_run` (both `[]`); `docs/analisis-*.md` (historical design docs describing Phase 0/workflow rationale, not live invocation instructions — out of scope per the update_harness/upgrade_harness ports' precedent).

## Design Notes

- **Capture-and-reprint, not stdio inheritance**: the required-reading brief raised the question of `stdio:'inherit'` vs the `feature.ts` fan-out pattern. Re-reading `preflight.py`'s `_run()` shows it actually uses `subprocess.run(cmd, capture_output=True, text=True, timeout=60, check=False)` — it captures each child's stdout+stderr as two separate buffers, concatenates them stdout-then-stderr (`(proc.stdout or "") + (proc.stderr or "")`, **not** interleaved line-by-line), and reprints every line through `_block()` with a `"    "` prefix. It never streams child output live. The port's `run()` mirrors this exactly with `spawnSync(bin, args, {timeout: 60_000, encoding: "utf-8"})`, concatenating `result.stdout` then `result.stderr`. `stdio:'inherit'` (the `feature.ts`/`runPostRun` pattern) was the wrong model for *this* file's block fan-out — it is, however, still the right model for `feature.ts`'s own call *into* `preflight.js` (a single best-effort child whose own report should print live), which is unchanged and correct.
- **Entry guard, deliberately not the `realpathSync`-wrapped one**: `preflight.js` is invoked as a subprocess target (by `feature.ts start` and by `init.sh`/`init.template.sh`'s `check_preflight`), which is exactly the situation the required reading flagged as needing a deliberate decision. The `feature.ts` guard fix (bug #3) targets a symlink/path-escaping failure specific to how *`feature.py`/`feature.ts` itself* gets invoked (potentially through an npm-bin-style symlink or a spaced path). `preflight.js`, by contrast, is always reached through a literal `node <dist-dir>/preflight.js` path built from `import.meta.url`-derived directories on every call site (`feature.ts`'s `DIST_DIR`, `init.sh`'s `$PROJECT_ROOT/handyman/dist/preflight.js`, the test suite's `$SUITE_DIR/../handyman/dist/preflight.js`) — never through a symlink. The plain guard (`import.meta.url === \`file://${process.argv[1]}\``) used by `validate_harness.ts`, `update_harness.ts` and `upgrade_harness.ts` — preflight's nearest, most relevant precedent, since those are exactly the three siblings it fans out to — is sufficient and was chosen deliberately over the `feature.ts` guard.
- **Sibling path resolution changed shape, not just target**: Python's `SCRIPT_DIR` was `scripts/` (where `preflight.py` lived), so it resolved siblings as `SCRIPT_DIR.parent / "dist" / "X.js"`. The TS port's compiled home is `dist/` itself — `preflight.js` sits *beside* `validate_harness.js`, `upgrade_harness.js`, `update_harness.js` and `feature.js`, not in a separate `scripts/` directory one level up. `HANDYMAN_ROOT` (`fileURLToPath(new URL("..", import.meta.url))`, one level above wherever the running file is, working identically for both `src/` under vitest and `dist/` when built — the same pattern as `upgrade_harness.ts`'s `ASSETS`) reproduces `SCRIPT_DIR.parent` so `join(HANDYMAN_ROOT, "dist", "validate_harness.js")` etc. resolve correctly either way; `tools_discovery.py` resolves as `join(HANDYMAN_ROOT, "scripts", "tools_discovery.py")`, unchanged.
- **`feature.ts`'s `SCRIPT_DIR` → `DIST_DIR`**: `SCRIPT_DIR` (`../scripts`) had exactly one caller (`runPreflight`'s `join(SCRIPT_DIR, "preflight.py")`); since `preflight.js` now lives in `dist/`, the constant was renamed and repointed to `../dist` (same both-`src/`-and-`dist/`-safe pattern) rather than left dangling or dual-purposed.
- **`PROG = "preflight.py"`, kept literal**: following the convention `validate_harness.ts`/`update_harness.ts`/`upgrade_harness.ts` already established — `prog` is hardcoded to the historical `.py` name (argparse's default `prog` is `os.path.basename(sys.argv[0])`, which was `preflight.py`) rather than the actual `.js` basename or a dynamic `argv[1]` lookup (the `feature.ts`/`sprint.ts`/`backlog.ts` convention). This makes `--help`/usage/error text byte-identical to the Python oracle **without** needing to normalize the prog name during the parity diff — verified directly (`--help`, `-h`, unrecognized-flag, and usage-error scenarios below are compared with no prog-name normalization applied at all, only the fixture root path).
- **`root is not a directory` goes to stderr, not stdout, exit 2, no `error:` prefix**: `preflight.py`'s `main()` does `print(f"root is not a directory: {root}", file=sys.stderr); return 2` — bare message, stderr, no `error:`/prog prefix (unlike `upgrade_harness.ts`'s analogous check, which *does* prefix with `error:`). Confirmed against the oracle with `2>/dev/null` vs `2>&1 1>/dev/null` before writing the port; an earlier draft of the port wrote this to stdout by mistake and was caught and fixed during self-review, before the parity pass.
- **`pySplitLines`/`pyRepr`/`looksLikeOption` duplicated locally**: small string-shape helpers, matching the project's established precedent (`update_harness.ts`/`upgrade_harness.ts`'s docstrings both note this explicitly) of accepting duplication across sibling ports over a premature core extraction. `pySplitLines` mirrors `core/frontmatter.ts`'s `splitLines` (same line-boundary set: LF, VT, FF, CR, FS, GS, RS, NEL, LS, PS) for `_block()`'s `detail.strip().splitlines()`; `pyRepr`/`looksLikeOption` are the same implementations already shipped in `upgrade_harness.ts`.
- **Discovery block still shells to `python3 scripts/tools_discovery.py`**, unchanged from the Python original, per the feature brief — `tools_discovery` is the last Python sibling (#13); once it is ported this is the one line in `preflight.ts` that repoints.

## Parity Evidence

Byte-identical vs. a `python3.12` oracle (`handyman/scripts/preflight.py`, pre-deletion, run from the main checkout) across **23 scenarios**, each run against twin throwaway fixture harnesses under the scratchpad (never inside the repo). **Both sides fan out to the same sibling `dist/*.js` binaries and the same `scripts/tools_discovery.py`** (the main checkout's `handyman/dist/` was untouched by this port except `feature.js`, whose only change — the `runPreflight` call site — is dead code from the `ready` subcommand's perspective, so it does not affect the fan-out being compared). Diffed stdout and stderr as **separate streams**, exit code, normalizing only the fixture's absolute root path and the prog name `preflight.py`/`preflight.js` (a no-op given the `PROG` literal design note above — confirmed no normalization was actually needed for any scenario's prog-name text):

1. Healthy harness, default invocation (all 5 blocks OK, exit 0)
2. Healthy harness, `--strict` (exit 0, "strict; stable")
3. Drifted version (`0.0.1`), default — read-only, exit 0 despite `drift: BEHIND`
4. Drifted version, `--strict` — exit 1, `STRICT failure (drift BEHIND)`
5. Discovery MISSING (`ghost_skill` declared, not installed), `--strict` — exit 1
6. Worklist OK (one ready feature), `--strict`
7. Drained backlog (worklist NOTE + loop-stop-condition line), `--strict` — still exit 0 (worklist stays advisory-only, never in `problems`)
8. Missing harness files entirely (`format: GAPS`), default
9. Bare empty directory, no `harness.config.json` at all
10. `--help`
11. `-h`
12. Unrecognized flag (`--bogus`)
13. `--root` with a missing value (trailing arg)
14. Extra positional (`extra`)
15. `--strict=true` (explicit arg on a store-true flag) → "ignored explicit argument"
16. Double-dash (`-- --strict`) → both `--` and `--strict` land in "unrecognized arguments"
17. Multiple unrecognized args together (`--bogus foo --other`)
18. `--root=<path>` (`=` form) combined with `--strict`
19. Duplicate `--root` (last one wins), second value nonexistent
20. `--root` pointing at a nonexistent directory
21. Negative-number-like `--root` value (`-5`, treated as a value, not an option)
22. **Real sync DRIFT**: a role file (`implementer.agent.md`) hand-edited to diverge from `harness.config.json`'s `models.implementer`, `--strict` — exercises the actual `DRIFT ...: model config=... file=...` line and the "recommended for safety: run 'node dist/update_harness.js --sync' ..." hint text, exit 1
23. Symlinked `--root` — confirms both the oracle and the port resolve through the symlink to the same real path before printing `==> harness: <path>` (normalized against the real target, not the symlink, on both sides)

**Verdict: 23/23 identical** (exit code, stdout, stderr). No accepted divergences were needed for this port — every scenario, including the argparse edge-case matrix and the genuine DRIFT/symlink cases, matched byte-for-byte with zero normalization beyond the fixture's absolute root path.

Parity harness: `/private/tmp/claude-501/-Users-rodrigomardones-proyectos-programing-handyman/c614a041-c528-44d9-be74-dbe524e10565/scratchpad/parity_preflight/run_parity.sh` (throwaway, not committed).

Oracle repoint: `tests/test_preflight.sh` — one-line invocation change (`PF` path + `python3` → `node` at each of 13 call sites), 0 assertions edited. Suite result: 11 run, 11 passed, 0 failed.

## Test Output

```text
Worktree gates (cd handyman):
  npm run typecheck  -> exit 0
  npm test (vitest)  -> 7 test files, 77 tests passed
  npm run lint       -> exit 0 (23 pre-existing warnings in feature.ts, unrelated
                         to this port; 0 errors) — same baseline as #11/#12
  npm run build      -> exit 0

bash tests/run_tests.sh (worktree root):
  test_docs.py                  181 run, 181 passed  (2 assertions repointed:
                                 scripts/preflight.py -> src/preflight.ts /
                                 preflight.js, see Files Changed)
  test_init.sh                   17 run, 17 passed
  test_update.sh                 12 run, 12 passed
  test_feature.sh                25 run, 25 passed  (F16/F17 exercise the
                                 repointed runPreflight() call site)
  test_backlog.sh                 7 run,  7 passed
  test_index.sh                   6 run,  6 passed
  test_upgrade.sh                10 run, 10 passed
  test_tools_discovery.sh        16 run, 16 passed
  test_evals.sh                   8 run,  8 passed
  test_preflight.sh (THIS PORT)  11 run, 11 passed
  test_metrics.sh                 6 run,  6 passed
  test_sprint.sh                 11 run, 11 passed
  => ALL SUITES PASSED
```

## Branch / Worktree

- Worktree: `/private/tmp/claude-501/-Users-rodrigomardones-proyectos-programing-handyman/c614a041-c528-44d9-be74-dbe524e10565/scratchpad/wt-preflight` (left in place, not removed, per instructions — the leader merges).
- Branch: `port/preflight`, based on `feat/migration-to-node-bun` @ `75cb64b` (post-#12 merge).
- Commit: `dbb0eca` — `feat: port preflight to TS on the core (#10)`.

---
type: Review Log
feature: toolbox_parity_oracle
status: approved
role: reviewer
updated: 2026-07-18
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/toolbox_parity_oracle]
---

# Review: toolbox_parity_oracle (feature #36)

## Verdict

**APPROVED.** All five acceptance criteria verified, two of them (2 and 3)
independently reproduced by the reviewer rather than trusting the implementer's
report at face value. Both project gates (`bash tests/run_tests.sh`, `./init.sh`)
are green.

Scope note: features #30 (`toolbox_fleet_summary`) and #31 (`toolbox_ask_fleet`)
are already `done`/reviewer-approved and share this uncommitted working tree, so
`git diff` against `HEAD` mixes their additions (the mock-LLM boot, the
`/api/summarize` and `/api/ask` test cases, `toolbox_summary.ts`/`toolbox_ask.ts`)
with #36's actual delta. Per the implementer's report, #36 touches exactly two
files: `tests/test_toolbox_serve.sh` and `.handyman/docs/verification.md`. The
review below treats the post-#30/#31 suite (48 cases) as "today," matching what
both prior reviewer reports independently confirmed (48/48, then 44/44 before
that), and verifies #36's delta is a pure env-var-gated wrapper around that
baseline with no assertion touched.

## Acceptance-by-acceptance

### 1. Respects `TOOLBOX_SERVE_CMD` / `TOOLBOX_BASE_URL` — PASS

Read `tests/test_toolbox_serve.sh` in full (809 lines). Three gated sections:

- **Fixture root** (`FR`): `[ -n "${TOOLBOX_BASE_URL:-}" ] && [ -n "${HANDYMAN_ROOT:-}" ]`
  reuses the ambient `HANDYMAN_ROOT`; otherwise `FR="$T/toolboxroot"` (unchanged).
- **Mock LLM**: `[ -n "${TOOLBOX_BASE_URL:-}" ] && [ -n "${OLLAMA_BASE_URL:-}" ]`
  parses the port out of the ambient `OLLAMA_BASE_URL` instead of spawning a
  second, disconnected fake; otherwise spawns the mock as before.
- **Boot**: `[ -n "${TOOLBOX_BASE_URL:-}" ]` skips booting entirely
  (`SERVER_PID=""`, `URL="$TOOLBOX_BASE_URL"` normalized with a trailing `/`);
  else `[ -n "${TOOLBOX_SERVE_CMD:-}" ]` swaps `bash -c "exec $TOOLBOX_SERVE_CMD --port 0"`
  for the default `node "$SERVE" --port 0` (both exported with the same
  `HANDYMAN_ROOT`/`OLLAMA_BASE_URL` prefix). `exec` replaces the wrapper shell so
  `$!` captures the real server PID — confirmed no orphaned child on `kill`.
- **Cleanup trap**: `kill "$SERVER_PID"` / `kill "$MOCK_PID"` are now guarded by
  `[ -n "$SERVER_PID" ]` / `[ -n "$MOCK_PID" ]`, so an externally-supplied server
  (`SERVER_PID=""`) is never touched.

### 2. With no env vars, the suite runs exactly as today (same boot, same cases, zero assertions edited) — PASS (verified, not just trusted)

Reviewer ran `bash tests/test_toolbox_serve.sh` with a clean environment:
**48 run, 48 passed, 0 failed** — identical PASS list (including the two
`/api/summarize` cases, the three `/api/ask` cases, and the same 7 pre-existing
`Broken pipe` stderr lines from `grep -q` closing pipes early) to what the
already-approved `review_toolbox_ask_fleet.md` and `review_toolbox_fleet_summary.md`
reports recorded independently before #36 started. Traced every new `if` branch
in the diff: each one is gated by an `[ -n "${VAR:-}" ]`-style check whose `else`
branch is verbatim the pre-#36 code path (mock always spawned, `node "$SERVE"
--port 0` boot, unconditional `kill`/`wait` in cleanup). No `start_case`/`pass`/
`fail` line in the file differs from the pre-#36 assertions — the only content
changes outside the boot/fixture setup are new header/inline comments
documenting the two knobs.

### 3. `TOOLBOX_BASE_URL` against a manually-booted server passes green — PASS (independently reproduced)

Reviewer did **not** rely solely on the implementer's captured evidence; ran an
independent end-to-end check:

1. Booted a throwaway mock OpenAI-compatible LLM (`node
   reviewer_mockllm.js`, listened on `127.0.0.1:50261`).
2. Booted `node handyman/dist/toolbox_serve.js --port 0` by hand with
   `HANDYMAN_ROOT` pointed at a fresh scratch directory and
   `OLLAMA_BASE_URL=http://127.0.0.1:50261/v1` → printed
   `http://127.0.0.1:50263/`.
3. Ran `TOOLBOX_BASE_URL=http://127.0.0.1:50263/ HANDYMAN_ROOT=<scratch>
   OLLAMA_BASE_URL=http://127.0.0.1:50261/v1 bash tests/test_toolbox_serve.sh`
   → **48 run, 48 passed, 0 failed**.
4. After the suite exited, confirmed both manually-started processes were
   still alive via `ps -p <server_pid>` and `ps -p <mock_pid>` (both showed
   the running `node` command), and `curl -s -o /dev/null -w '%{http_code}'`
   against the server's URL returned `200` — proof the suite booted nothing
   and killed nothing in this mode.
5. Killed both processes by hand afterward (not by the suite) and removed
   the scratch `HANDYMAN_ROOT`.

Also confirmed `TOOLBOX_SERVE_CMD='node handyman/dist/toolbox_serve.js' bash
tests/test_toolbox_serve.sh` → 48/48 (criterion 1's alternate-boot path).

### 4. `.handyman/docs/verification.md` documents both variables — PASS

The "Oraculo de paridad (migracion a Next.js)" subsection under "toolBox
observer" documents `TOOLBOX_SERVE_CMD` and `TOOLBOX_BASE_URL`, their parity-oracle
purpose, the shared-fixture requirement (`HANDYMAN_ROOT`/`OLLAMA_BASE_URL` must
match the externally-booted server for registry-dependent assertions to mean
anything), the expected failure mode if the fixture doesn't match, and a
verified-run summary matching the reviewer's own independent run above. Matches
the existing doc's Spanish voice/structure.

### 5. `bash tests/run_tests.sh` passes and `./init.sh` exits 0 — PASS

`bash tests/run_tests.sh` → `ALL SUITES PASSED` (48/48 in the toolbox_serve
sub-suite). `./init.sh` run with its exit code captured directly (not through a
pipe) → `status: ok`, exit code `0`. `shellcheck -S warning
tests/test_toolbox_serve.sh` → clean, exit 0.

## Findings

None blocking. The double env-var AND-gates for the shared-fixture corollary
(`HANDYMAN_ROOT`/`OLLAMA_BASE_URL` reuse, only active when `TOOLBOX_BASE_URL` is
also set) are a reasonable, well-documented, opt-in-only extension needed to make
criterion 3 mean something more than "the suite didn't crash" — they cannot
affect the default path since both require `TOOLBOX_BASE_URL` to be non-empty
first.

## Verifier evidence (reviewer-run)

```
$ bash tests/test_toolbox_serve.sh                    # no env vars
Summary: 48 run, 48 passed, 0 failed

$ TOOLBOX_SERVE_CMD='node handyman/dist/toolbox_serve.js' bash tests/test_toolbox_serve.sh
Summary: 48 run, 48 passed, 0 failed

$ TOOLBOX_BASE_URL=http://127.0.0.1:50263/ HANDYMAN_ROOT=<scratch> \
  OLLAMA_BASE_URL=http://127.0.0.1:50261/v1 bash tests/test_toolbox_serve.sh
Summary: 48 run, 48 passed, 0 failed
# ps -p <manual server pid>  -> still running
# ps -p <manual mock pid>    -> still running
# curl -> 200

$ bash tests/run_tests.sh
...
ALL SUITES PASSED

$ ./init.sh; echo $?
...
status: ok
0

$ shellcheck -S warning tests/test_toolbox_serve.sh; echo $?
0
```

## Checklist

- [x] Architecture respected
- [x] Conventions respected
- [x] Tests meaningful and green
- [x] Verifier exits 0

## Required Changes

None.

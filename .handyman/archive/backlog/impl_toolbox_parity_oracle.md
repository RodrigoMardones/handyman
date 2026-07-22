---
type: Implementation Log
feature: toolbox_parity_oracle
status: implemented
role: implementer
updated: 2026-07-18
tags: [handyman/role/implementer, handyman/feature/toolbox_parity_oracle]
---

# Implementation Report: toolbox_parity_oracle

## Files Changed

- `tests/test_toolbox_serve.sh` — parametrized with `TOOLBOX_SERVE_CMD` and
  `TOOLBOX_BASE_URL`. Zero assertions edited.
- `.handyman/docs/verification.md` — new "Oraculo de paridad (migracion a
  Next.js)" subsection under "toolBox observer" documenting both variables
  and the shared-fixture requirement.

## Design Notes

**Default path untouched.** Every new branch is guarded by
`[ -n "${TOOLBOX_SERVE_CMD:-}" ]` / `[ -n "${TOOLBOX_BASE_URL:-}" ]`; with
both unset the script executes the exact original lines (same `mktemp`
fixture, same unconditional mock-LLM boot, same `node "$SERVE" --port 0`
invocation, same `SERVER_PID=$!`/cleanup trap). Verified byte-for-byte by
running the suite before and after the change: 48/48 pass either way, same
pre-existing `Broken pipe` stderr noise from `grep -q` (7 lines, present in
`git stash` baseline too — unrelated to this change).

**TOOLBOX_SERVE_CMD.** When set, the boot line becomes
`bash -c "exec $TOOLBOX_SERVE_CMD --port 0"` (with `HANDYMAN_ROOT`/
`OLLAMA_BASE_URL` exported the same way as the default branch). `exec`
replaces the wrapper shell's process image so `$!` still captures the real
server's PID directly — no orphaned child survives a `kill "$SERVER_PID"`.
Verified: `TOOLBOX_SERVE_CMD='node handyman/dist/toolbox_serve.js' bash
tests/test_toolbox_serve.sh` → 48/48 pass.

**TOOLBOX_BASE_URL.** When set, the suite skips booting `$SERVE` entirely
(`SERVER_PID=""`) and uses the given URL (normalized with a trailing `/`)
directly; the cleanup trap only kills `$SERVER_PID` when non-empty, so an
externally-started server is never touched. The suite still creates its own
fixture (`$H1`), registers it, and boots the diagnostic mock LLM as before —
these are pure filesystem/local-process concerns, independent of which
server answers the HTTP assertions.

The interesting discovery while making acceptance criterion 3 genuinely
green (not just "skip assertions"): `loadRegistry()`
(`handyman/src/toolbox.ts`) reads `registry.json` fresh from disk on *every*
call — no caching at server boot. That means an already-running server CAN
discover a harness registered *after* it started, as long as both processes
were pointed at the same registry root (`HANDYMAN_ROOT`, resolved once at
`toolbox_serve.js` boot via `handymanRoot()`). So:

- `FR` (the registry root the suite registers `$H1` into) now respects an
  ambient `HANDYMAN_ROOT` — but **only** when `TOOLBOX_BASE_URL` is also
  set (`[ -n "${TOOLBOX_BASE_URL:-}" ] && [ -n "${HANDYMAN_ROOT:-}" ]`).
  This double-gate keeps the default path safe: an incidental `HANDYMAN_ROOT`
  left over in a dev's shell (common — it's this project's own primary env
  var) can never redirect a plain `bash tests/test_toolbox_serve.sh` run
  into a real `~/HANDYMAN` registry.
- The mock-LLM boot got the same treatment: `buildProviders()` in
  `toolbox_serve.ts` is built once at server startup, so an already-running
  external server's actual LLM traffic can only ever reach whatever
  `OLLAMA_BASE_URL` it was booted with — never a *new* mock the suite spins
  up after the fact. The `GET /v1/calls` cache-hit cross-check therefore
  needs to target the *same* mock the external server calls. When
  `TOOLBOX_BASE_URL` and an ambient `OLLAMA_BASE_URL` are both set, the
  suite skips spawning its own mock (`MOCK_PID=""`) and derives `MOCK_PORT`
  by parsing the ambient `OLLAMA_BASE_URL` instead. Both external-mode
  branches are strict two-variable AND-gates — no effect whatsoever unless
  the caller opts in on both sides.

This isn't scope creep beyond the two documented knobs: it's the minimum
needed for criterion 3 to mean anything more than "the suite didn't crash."
Without it, the very first registry-dependent assertion (`/api/state`
feature count) would 400/mismatch against a genuinely disconnected external
server. Documented as a corollary requirement in `verification.md` (Spanish,
matches existing doc voice/structure) rather than as a third acceptance
variable, since both `HANDYMAN_ROOT` and `OLLAMA_BASE_URL` are pre-existing
project conventions, not new invented knobs.

## Test Evidence

**Default path (no env vars) — unchanged, 48/48:**
```
bash tests/test_toolbox_serve.sh
...
Summary: 48 run, 48 passed, 0 failed
```
Confirmed identical against `git stash` baseline (same PASS list, same 7
pre-existing `Broken pipe` stderr lines from `grep -q` closing pipes early).

**TOOLBOX_SERVE_CMD — 48/48:**
```
TOOLBOX_SERVE_CMD='node handyman/dist/toolbox_serve.js' bash tests/test_toolbox_serve.sh
...
Summary: 48 run, 48 passed, 0 failed
```

**TOOLBOX_BASE_URL — real external run (acceptance criterion 3), tail:**

Manually booted, outside the suite: a standalone mock OpenAI-compatible LLM
(port 0) and `node handyman/dist/toolbox_serve.js --port 0` pointed at a
fresh `HANDYMAN_ROOT` and at that mock's `OLLAMA_BASE_URL`. Then:

```
HANDYMAN_ROOT="$HR" OLLAMA_BASE_URL="$OLLAMA" TOOLBOX_BASE_URL="$URL" \
  bash tests/test_toolbox_serve.sh
...
  PASS POST /api/ask rejects an unregistered root with 400
  PASS POST /api/ask rejects an empty or missing question with 400
  PASS panel asset ships the #/ask view (route, palette action, citation links, failure announce)
  PASS panel asset ships the #/intake route, nav link and palette action
  PASS panel intake posts to /api/draft and parses the SSE stream
  PASS panel intake fetches /api/providers and /api/state for the selectors
  PASS panel intake renders the draft sanitized and keeps it editable
  PASS panel intake copy button uses the clipboard API with a fallback
  PASS panel intake announces a provider error in the assertive region
  PASS GET /api/files lists taggable workspace files (relative paths)
  PASS GET /api/files rejects an unregistered root with 400
  PASS POST /api/intake rejects an empty draft_md with 4xx
  PASS POST /api/intake rejects a malformed body with 400
  PASS POST /api/intake rejects an unregistered root with 400
  PASS POST /api/intake writes feature-request.md on a valid payload
  PASS panel asset ships the file-tag picker and the direct Submit action
  PASS panel intake announces submit success/failure in the live regions
  PASS SSE emits a change event when the workspace mutates

Summary: 48 run, 48 passed, 0 failed
```

After the run, `ps -p` confirmed both the manually-booted server (PID
52515, `node .../toolbox_serve.js --port 0`) and the manually-booted mock
LLM (PID 52506) were still alive, and `curl` against the server's URL still
returned `200` — proving the suite booted nothing and killed nothing in
this mode. Both were then killed by hand (not by the suite) to finish the
demo.

**Full suite + verifier gate:**
```
$ bash tests/run_tests.sh
...
ALL SUITES PASSED

$ ./init.sh
...
status: ok
(exit 0)
```

Also ran `shellcheck -S warning tests/test_toolbox_serve.sh` → clean (exit 0).

---
type: Review Log
feature: 50
role: reviewer
status: approved
updated: 2026-07-18
tags: [handyman/backlog/review]
---

# Review: toolbox_serve_decommission (#50)

Verdict: **APPROVED** (second pass).

First pass returned CHANGES_REQUESTED on four blocking findings. All four are
genuinely fixed — I re-verified each against the code and against a live
rebuilt server rather than against the coordinator's summary, and I re-ran the
negative tests myself instead of accepting the ones reported to me. The CSP
finding in particular was fixed at the runtime level, not by adjusting the
assertion: pages now actually carry the header.

Criteria 1-5 all pass. Nine non-blocking nits remain, listed at the bottom;
two of them are new (found in this pass, both in the *justification text* for
the CSP fix, not in its behaviour).

## Blocking findings from pass 1 — re-verification

### B1. `toolbox:serve` npm script — FIXED

```
$ grep -n 'toolbox:serve' handyman/package.json
21:    "toolbox:serve": "node dist/toolbox.js serve",
```

The `--port 3000` misalignment the feature description called out is gone; the
script now inherits the wrapper's own 8765 default. Correct fix — dropping the
flag is better than hardcoding 8765 in a second place.

### B2. CSP regression — FIXED AT THE RUNTIME LEVEL, independently confirmed

Rebuilt `packages/toolbox-core` + `apps/web` from source, mirrored the statics,
booted the wrapper on 8797, and counted `Content-Security-Policy` response
headers per route. Not the coordinator's measurement — mine:

```
  route                              status  n(csp)  picsum
  /                                    200     1        1
  /fleet                               200     1        1
  /timeline                            200     1        1
  /search                              200     1        1
  /intake                              200     1        1
  /ask                                 200     1        1
  /harness/x                           200     1        1
  /api/state                           200     1        0
  /api/corpus                          200     1        0
  /api/md?root=/x&file=current         400     1        0
  /events                              200     0        0
  /vendor/vis-network.js               200     1        1
  /_next/static/... (404)              404     1        1
```

Raw values, verbatim:

```
/            Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline';
             style-src 'self' 'unsafe-inline'; img-src 'self' data: https://picsum.photos; connect-src 'self'
/api/state   content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline';
             style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'
```

Confirmed as asked: **no route receives a duplicate or conflicting header** —
every route returns exactly one, except `/events` which returns none (see N1,
this is correct behaviour but mis-described in two comments). The
`/((?!api/|events).*)` source pattern does match the bare `/` (a real risk with
path-to-regexp; verified, not assumed), and correctly excludes `/api/*` so
`respond.ts`'s stricter header is the only one there.

The implementation is also clean at the source level: `HTML_CSP_HEADER` is
derived from `CSP_HEADER` by a single `.replace` on `img-src`, so the two
cannot drift apart in the parts that matter, and the docstring records that
dropping the picsum images collapses it back into one constant. `next.config.ts`'s
old docstring — which pass 1 flagged as false (N1 then) — has been rewritten
and is now accurate about `proxy.ts` no longer being a proxy.

### B3. Oracle CSP case (TS6b) — FIXED

The case now probes `/`, `/fleet` **and** `/api/state`, requires
`default-src 'self'` / `script-src` / `style-src` on all three, and asserts the
API header does **not** contain `picsum`. The misleading "the security-critical
surfaces are the API responses" comment is gone, replaced by an explanation
that CSP is a document-level control and an explicit record that this very case
went green while every page was unprotected.

I checked the failure path by inspection rather than mutation (a mutation would
need a full Next rebuild): if a header were missing, `$CSP_ROOT` is empty and
`printf '%s' "" | grep -qi "default-src 'self'"` returns non-zero, so
`CSP_OK=no`. The case does fail on a missing header. One residual blind spot in
N2 below.

### B4. `verification.md` / `architecture.md` — FIXED

`architecture.md`'s "Observador (toolBox)" bullet (L37-45) is rewritten: single
Next standalone process via `node dist/toolbox.js serve`, `toolbox_serve.ts`
named as deleted in feature 50, `GET /` explicitly no longer a placeholder. The
contradiction with the lower bullet is gone.

`verification.md` is substantially rewritten. I grepped for every stale claim
I listed in pass 1 and checked each surviving hit **in context**:

| pass-1 claim | status |
|---|---|
| `TOOLBOX_SERVE_CMD` default = `toolbox_serve.js` | fixed — L82-85 states `node handyman/dist/toolbox.js serve`, old value explicitly marked "Historico" |
| proxy does a `fetch()` forward | fixed — L132-136 in past tense with an explicit **(Historico:** …**)** marker |
| default runs "contra el server Node directo" | fixed |
| "feature 50 **eliminara**" (future tense) | fixed — 0 hits |
| 27 cases | fixed — "queda en **28 casos**" |
| "Next `/` … su propio CSP" | fixed — 0 hits |

The two surviving `48 run` / `toolbox_serve.js` hits (L120-125) are a
past-tense log of a verification run performed at the time; acceptable, minor
note in N9.

The new "Cierre del carve-out" section (L256-285) documents the CSP regression
honestly and completely: that it happened between features 49 and 50, that the
Node observer's `send()` had applied `CSP_HEADER` to its HTML, that the
re-pointed case "seguia verde" while the pages were unprotected, that CSP is
near-inert on JSON, and how it was restored. It also records the new host-guard
case and the 11 route-manifest assertions that became route-file assertions.
This is the right standard — the regression is on the record instead of being
quietly absorbed.

### Finding (c) — TWA5 fixed, and I verified the TWI3/TWL5 judgement

**TWA5 (`test_web_readapi.sh`)** — `$SERVE` is deleted from the suite entirely
(0 hits). The case now asserts `toolbox_assets.ts` owns `vendorFiles`/`graphFile`
**and** that nothing under `apps/web/{app,lib,components}` re-declares
`vendorFiles`/`packageRoot`. I ran the negative test myself rather than trusting
the reported one — appended `const vendorFiles = {};` to `apps/web/lib/respond.ts`:

```
FAIL toolbox_assets.ts is the single home of vendor/graph logic
Summary: 6 run, 5 passed, 1 failed
```

reverted → `PASS`, 6/6, and `git diff --stat` on the file is empty. The case is
genuinely failable and now pins the property where it can actually regress.

**TWI3 / TWL5 — the coordinator's judgement is substantively correct.** I
negative-tested both rather than eyeballing them:

- TWL5: appended `function resolveSummaryModel() { return "x"; }` to
  `app/api/summarize/route.ts` → `FAIL … resolveSummaryModel duplicated or not
  shared`, 5/6. Reverted → 6/6.
- TWI3: appended a `writeFileSync` mention to `app/api/intake/route.ts` →
  `FAIL … writeIntake/intakeHttp live in the core; the route delegates`, 4/5.
  Reverted → 5/5.

Both cases can fail, so neither is vacuous the way TWA5 was. The "three
consumers" claim in TWI3's name also holds across the suite — the third
consumer (`actions/intake.ts`) is checked in TWI2. My pass-1 N4 is therefore
downgraded from "degenerate assertion" to a naming/hygiene nit (N3 below); the
substance was fine and I was over-harsh on it.

**Route-file `[ -f … ]` cases — pushback accepted.** The argument is sound: the
end-to-end "this route is actually served" property is covered by the oracle
hitting a real server across 28 cases, so the structural checks are
belt-and-braces rather than the only line of defence. Leaving them is the right
call over churning eight suites for no coverage delta. Not a follow-up.

### Process hygiene — confirmed clean

```
$ ps -eo pid,lstart,command | grep -E 'toolbox\.js serve|standalone/apps/web/server\.js'
(nothing)
```

The three orphaned Jul-17 processes are gone, and none of my own test servers
survived (every boot in this pass was torn down and its port confirmed
released). The one remaining node listener on this machine (`127.0.0.1:3210`)
is unrelated to the toolBox.

## Spec coverage (one line per acceptance bullet, pass/fail + evidence)

1. **PASS** — verified live in pass 1 and unchanged since: `--port N` → binds
   that port, `--port 0` → real ephemeral port with an accurate URL, no flag →
   8765; `lsof` confirms `TCP 127.0.0.1:<port>` (loopback only, never
   `0.0.0.0`); the first probe issued immediately after the URL appears returns
   `/api/state` **200**, so the readiness contract genuinely holds; `kill -INT`
   → 130, `kill -TERM` → 143, port released, no orphan child in either case.
2. **PASS** — `toolbox_serve.ts` staged deleted, `tsc --noEmit` clean (no live
   import survives). `proxy.ts` is 29 lines: `hostAllowed()` + a 403, no
   upstream, no manifest, no `fetch`. Live: `Host: evil.example` → **403**,
   `Host: localhost` → **200**. Observer-only shims handled (`toolbox_ask.ts` /
   `toolbox_summary.ts` deleted; the rest keep their entrypoints with
   past-tense provenance comments), and `next.config.ts` — the one file pass 1
   found still describing the deleted machinery — is now rewritten correctly.
3. **PASS** — oracle re-run both ways: `TOOLBOX_SERVE_CMD` pointing at the
   wrapper → **28/28**, and default mode (unset) → **28/28**, no orphans after
   either. `run_tests.sh` builds handyman dist + `pnpm run web:build` + the
   static mirror before the suites and aborts clearly on failure. Pure suites
   still run standalone with no build: `test_web_runtime` 7/7, `test_web_readapi`
   6/6, `test_web_relays` 6/6, `test_web_intake` 5/5, `test_web_fleet` 9/9,
   `test_web_harness` 12/12, `test_web_landing` 3/3.
4. **PASS** — was the failing bullet in pass 1; all three defects fixed (B1,
   B4 above). `plan-migracion-toolbox-nextjs.md` remains a clean `git mv` to
   `.handyman/docs/sprints/` with every reference rewritten.
5. **PASS** — accepted the leader's gate run for the full suite; spot-confirmed
   its dependencies myself: `npm run build` clean, `npm run typecheck` clean,
   `shellcheck -S warning` over `handyman/scripts tests` → exit 0.

## Non-blocking findings

New in this pass:

- **N1. `/events` carries no CSP, and two comments claim it does.**
  `next.config.ts`'s docstring says the source pattern excludes `/api/*` and
  `/events` "so their responses keep respond.ts's stricter `CSP_HEADER`", and
  `verification.md` L273-274 repeats it ("`/api/*` y `/events`, que conservan el
  `CSP_HEADER` estricto de `lib/respond.ts`"). Measured: `/events` returns
  **zero** CSP headers. The *behaviour* is right — `app/events/route.ts` sets
  its headers inline for byte-parity, and its own docstring records that the
  Node observer "adds no CSP/nosniff on this route", so excluding it from the
  page header is correct and the parity is preserved. Only the justification is
  wrong: `/events` does not go through `respond.ts`. In a section written
  specifically to be honest about CSP coverage, this sentence should say so
  ("`/events` no lleva CSP, por paridad con el observador retirado"). Two-line
  doc fix.
- **N2. TS6b never asserts the page CSP *contains* picsum.** `HTML_CSP_HEADER`
  is built by `CSP_HEADER.replace("img-src 'self' data:", …)`. If `CSP_HEADER`'s
  `img-src` clause is ever reworded, the `.replace` silently no-ops, the pages
  get plain `CSP_HEADER`, all three sub-assertions still pass, the API
  no-picsum check still passes — green, while the landing's images are blocked
  by CSP. Given that the whole point of this fix was "a green case hid a
  regression", the symmetric assertion is worth one line:
  `printf '%s' "$CSP_ROOT" | grep -qi picsum || CSP_OK=no`.

Carried over from pass 1 (unchanged, none blocking):

- **N3. Stale `SERVE` aliases in two suites.** In `test_web_intake.sh`,
  `SERVE` == `ROUTE` (same path), so TWI3 runs three greps that are literal
  duplicates of two others — the only unique predicate is
  `! grep 'writeFileSync'`. In `test_web_relays.sh`, `SERVE` == `SUMMARIZE`, and
  TWL5's case name still reads "shared by **serve** + relays", naming a process
  that no longer exists. Both cases are failable (proven above), so this is
  cosmetics: delete the aliases, rename the case.
- **N4. `ephemeralPort()` TOCTOU + poor failure mode.** It binds 0, reads the
  port, closes, then spawns. If anything grabs the port in between, the child
  dies with `EADDRINUSE` and the wrapper does not notice — it sits in
  `waitForReady` for ~10 s then exits 1 with "server did not become ready within
  10s", hiding the cause. The `exit` handler already fires; it just races the
  probe. Low probability, cheap to improve.
- **N5. `run_tests.sh` builds unconditionally.** The description says "construye
  apps/web **cuando hace falta**"; every full run now pays a Next build. The
  criterion's wording still holds because the pure suites run standalone, but a
  `[ -f apps/web/.next/standalone/apps/web/server.js ]` guard would restore the
  fast path.
- **N6. `parseServePort` swallows bad input.** Re-confirmed live: `--port abc`
  → `NaN || 0` → ephemeral port (`http://127.0.0.1:54223/`), silently, with no
  usage error. The CLI contract documented elsewhere is "`2` usage".
- **N7. `tsc -b` leaves a stale `handyman/dist/toolbox_serve.js`.**
  Re-confirmed after a fresh rebuild: the 30 KB compiled observer from before
  the deletion is still present and runnable. `dist/` is gitignored so CI is
  unaffected, but a developer who does not wipe `dist/` still has a working copy
  of the "decommissioned" server. A clean step in `handyman`'s `build` would
  close it.
- **N8. `/vendor/*` gets the page CSP.** `vendor/vis-network.js` is served with
  `HTML_CSP_HEADER`, so a JS asset advertises `picsum.photos` in `img-src`.
  Inert (CSP on a script response governs nothing), and excluding it would add
  pattern complexity for no gain. Noted only for completeness.
- **N9. `verification.md` L120-125** keeps a past-tense log of a manual
  `dist/toolbox_serve.js` run. Harmless in context — the section above already
  states the file is deleted — but a reader skimming might try to reproduce it.

## What I ran (second pass)

- Full rebuild: `cd handyman && npm run build` (incl. core project refs),
  `pnpm run web:build`, static mirror into the standalone tree.
- Live server on 8797: header counts and raw values across 13 routes (pages,
  APIs, SSE, vendor, a 404), checking for duplicates and for the correct
  variant per surface.
- `TOOLBOX_SERVE_CMD=<wrapper> bash tests/test_toolbox_serve.sh` → 28/28;
  default mode → 28/28.
- `bash tests/test_web_{runtime,readapi,relays,intake,fleet,harness,landing}.sh`
  → 7/7, 6/6, 6/6, 5/5, 9/9, 12/12, 3/3.
- Three independent negative tests (TWA5, TWL5, TWI3), each reverted and
  confirmed byte-clean with `git diff --stat`.
- `npm run typecheck` clean; `shellcheck -S warning` over
  `handyman/scripts tests` → exit 0.
- `grep` audit of every pass-1 stale claim in `verification.md`, each surviving
  hit read in context.
- `ps` / `lsof` sweep for surviving `serve` processes → none.
- Did not re-run the full `run_tests.sh` gate (accepted the leader's run; its
  in-flight final run including item 6 should be confirmed green before close).

## Verdict

**APPROVED.** Feature 50 may move to `done` once the leader confirms the
in-flight `run_tests.sh` run is green, updates `progress/current.md` (reset) and
`progress/history.md` (append) per C5, and runs `node dist/feature.js done 50`
to seal `meta.done_at`.

Approval rests on measured behaviour, not prose: one process, loopback-only,
`--port N`/`--port 0`/default all working, readiness race closed, clean signal
handling, `proxy.ts` reduced to a host guard that returns a real 403, CSP
restored on every HTML document with exactly one header per route, the oracle
green at 28/28 in both modes, and three negative tests I ran myself.

Recommended follow-ups, in priority order: **N2** (one line, closes the last
"green while broken" gap in the CSP case), **N1** (two-line doc correction
about `/events`), then N3-N7 as ordinary cleanup.

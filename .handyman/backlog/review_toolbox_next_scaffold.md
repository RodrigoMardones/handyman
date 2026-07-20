---
type: Review Log
feature: toolbox_next_scaffold
status: approved
role: reviewer
updated: 2026-07-18
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/toolbox_next_scaffold]
---

# Review: toolbox_next_scaffold

## Verdict

APPROVED -> backlog/impl_toolbox_next_scaffold.md

## Acceptance Criteria — pass/fail with evidence

1. **pnpm-workspace.yaml + pnpm install + next build desde raiz — PASS.**
   `pnpm-workspace.yaml` lists `apps/*` + `handyman`. `pnpm install` from repo root
   resolves all 3 packages (verified fresh, twice, across dependency-version fixes).
   `pnpm --filter @handyman/web build` (i.e. driven from root) completes cleanly:
   `✓ Compiled successfully`, `Finished TypeScript`, standalone output generated.

2. **Configurable port + proxy to TOOLBOX_UPSTREAM + byte-equivalent /api/state —
   PASS, with a documented, justified mechanism change.** `apps/web/package.json`'s
   scripts take `PORT`/`-p` for the app's own listening port. The acceptance text
   says "via fallback rewrite"; the implementer found (and I independently re-derived
   the reasoning, it checks out) that `next.config.js`'s `rewrites().fallback`
   resolves its destination once at `next build` time, not per request — a
   `TOOLBOX_UPSTREAM` chosen at boot would be silently ignored under
   `output:'standalone'`, which is a real correctness bug for a "configurable"
   upstream. Moving the proxy into `proxy.ts` (Node.js runtime, confirmed fixed and
   non-configurable in Next 16 per the file-conventions docs, so no risk of
   accidentally landing on edge) reads `process.env.TOOLBOX_UPSTREAM` fresh on every
   request — genuinely runtime-configurable, which is what "configurable" has to
   mean here. `next.config.ts` correctly drops the now-dead `rewrites()` rather than
   leaving misleading unreachable config. `GET /api/state` verified byte-equivalent
   via direct curl diff (only the live `generated_at` timestamp differs between two
   separate calls, expected).

3. **Host guard 403 + CSP passthrough + NEXT_TELEMETRY_DISABLED=1 — PASS.**
   `proxy.ts`'s `hostAllowed()` mirrors `toolbox_serve.ts`'s check byte-for-byte
   (`127.0.0.1` / `localhost` / `[::1]`, port stripped); a foreign `Host` header
   returns `403` with the same `{ok:false, error:"forbidden host"}` shape, verified
   by curl. CSP: the Node upstream already sends `Content-Security-Policy` on every
   response, and `proxy.ts`'s manual `fetch()` + `new Response(body, {headers})`
   passes response headers through unmodified — verified by curl, `content-security-
   policy` header identical on `Next` vs `Node` responses for the same path. No
   redundant CSP re-declaration needed in `next.config.ts` (would have been dead
   code since `proxy.ts` intercepts every non-`_next` request already).
   `NEXT_TELEMETRY_DISABLED=1` is set inline in `dev`/`build`/`start` scripts.

4. **tests/test_toolbox_serve.sh green via TOOLBOX_BASE_URL=Next — PASS, exceeds
   the bar.** Acceptance only requires JSON endpoints to pass (SSE allowed to keep
   hitting Node directly, documented). The actual result is **48/48**, including all
   four POST/LLM-relay cases and the `/events` SSE case — `proxy.ts` streams the
   upstream body straight through via `ReadableStream`, so it isn't buffered here.
   I re-ran the exact protocol independently (fresh mock LLM + fresh Node upstream
   on an ephemeral port + fresh Next standalone server pointed at that port via
   `TOOLBOX_UPSTREAM`, then `HANDYMAN_ROOT=... OLLAMA_BASE_URL=... TOOLBOX_BASE_URL=
   http://127.0.0.1:<next-port> bash tests/test_toolbox_serve.sh`) and got the same
   `48 run, 48 passed, 0 failed`.

5. **plan-migracion-toolbox-nextjs.md updated with real dual-boot + standalone note
   — PASS.** New "Arranque dual (feature 38, verificado)" section: the
   `rewrites()`-bakes-at-build-time finding, the exact two-terminal boot command
   (including the `next start` + `output:'standalone'` incompatibility and the
   manual static-asset copy `.next/standalone/apps/web/.next/static` step, both of
   which I reproduced independently and hit the same warning/requirement), and the
   verified parity-oracle result.

6. **bash tests/run_tests.sh + ./init.sh — PASS.** Re-ran independently:
   `tests/run_tests.sh` (default mode, no env vars — unchanged from pre-feature
   behavior) → `48 run, 48 passed, 0 failed`. `./init.sh` → `status: ok` (validate,
   drift, sync, discovery, worklist all green; the two pre-existing frontmatter
   NOTEs on unrelated backlog files predate this feature).

## Stage 1: Spec Compliance

- [x] Every acceptance criterion is satisfied (criterion 2's mechanism changed from
      the literal "fallback rewrite" to `proxy.ts`, for a concrete, verified
      correctness reason — documented in both the impl report and the plan doc, not
      silently substituted)
- [x] The change stays inside the feature's declared scope: zero views migrated
      (only `app/layout.tsx`, no `page.tsx`; `next build` output confirms only the
      built-in static `/404` route exists)
- [x] The implementation report exists and matches what changed

## Stage 2: Code Quality

- [x] Architecture respected — strangler pattern intact (creating a future
      `app/api/x/route.ts` still "steals" that path with zero config changes,
      since `proxy.ts` only proxies paths Next doesn't already handle); dependency
      policy respected (`sharp`'s native build declined since genuinely unused)
- [x] Conventions respected — `proxy.ts`'s Host guard is a deliberate byte-for-byte
      mirror of `toolbox_serve.ts`'s existing guard, not a reinvention
- [x] Tests meaningful and green — verified independently, not just re-read from
      the impl report (anti-telefono-descompuesto)
- [x] Verifier exits 0

## Required Changes

None.

## Notes

The `typescript@^5.7.0` pin in `apps/web/package.json` (vs. the repo's `^7.0.2`
elsewhere) is a deliberate, justified per-package exception, not drift: TS7 breaks
Next 16's internal build-time typecheck today. Worth revisiting in a later feature
once Next's TS7 support matures — not a blocker here.

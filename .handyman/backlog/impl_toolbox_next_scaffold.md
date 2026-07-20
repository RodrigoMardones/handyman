---
type: Implementation Log
feature: toolbox_next_scaffold
status: implemented
role: implementer
updated: 2026-07-18
tags: [handyman/role/implementer, handyman/feature/toolbox_next_scaffold]
---

# Implementation Report: toolbox_next_scaffold

## Files Added

- `pnpm-workspace.yaml` (root): `apps/*` + `handyman` packages. `allowBuilds.sharp: false`
  (declines `next/image`'s optional native-optimizer postinstall — unused, zero pages,
  no `next/image` in this scaffold — least-privilege over an unreviewed native build).
- `package.json` (root, new): `private`, `packageManager: pnpm@11.14.0` (pinned by
  `corepack use pnpm@latest`, since no package manager was installed), plus
  `web:dev`/`web:build` convenience scripts.
- `pnpm-lock.yaml` (root, new).
- `apps/web/package.json`: `@handyman/web`, `next@16.2.10` pinned (matches the plan's
  researched LTS), `react`/`react-dom@^19.2.7`. **`typescript@^5.7.0`, not the repo's
  `^7.0.2`**: TS7 (the new Go/"Corsa" compiler) breaks Next's internal build-time
  typecheck step (`The "id" argument must be of type string. Received undefined`,
  reproduced then fixed by pinning apps/web's own TS — a separate workspace package can
  carry its own toolchain independent of `handyman/`'s).
- `apps/web/tsconfig.json`, `apps/web/app/layout.tsx` (minimal required root layout,
  zero `page.tsx` — every request still falls through to the proxy).
- `apps/web/next.config.ts`: `output: 'standalone'` only. No `rewrites()` — see below.
- `apps/web/proxy.ts`: Host guard + the actual strangler proxy (see below).
- `.gitignore`: `apps/web/.next/`, `next-env.d.ts`, `tsconfig.tsbuildinfo`.

## Files Changed

- `.handyman/docs/sprints/plan-migracion-toolbox-nextjs.md`: new "Arranque dual
  (feature 38, verificado)" section — real two-terminal boot command, the
  `output:'standalone'` + `next start` incompatibility, and the rewrites-vs-proxy.ts
  finding below. Feature 38's table row wording updated (fallback rewrite -> proxy
  reverso en proxy.ts) to match what was actually built.
- `.handyman/docs/verification.md`: appended an `apps/web (Next.js strangler)`
  paragraph to the existing `TOOLBOX_BASE_URL` section (feature 36's precedent),
  documenting the 48/48-green run against the Next port, SSE included.

## Key Finding: rewrites().fallback bakes its destination at build time

The plan called for `next.config.js`'s `rewrites().fallback` pointing at
`TOOLBOX_UPSTREAM`. Built and booted it that way first; empirically, a
`TOOLBOX_UPSTREAM` set when *starting* the standalone server was silently ignored —
Next resolves `rewrites()` once when generating the routes manifest at `next build`,
not per request. (Confirmed by building with `TOOLBOX_UPSTREAM` unset, so the
`?? "http://127.0.0.1:8765"` fallback got baked in, then starting the standalone
server with a *different* `TOOLBOX_UPSTREAM` pointed at a different port: requests
still hit :8765, per the server's own `ECONNREFUSED` log.)

Fix: the actual proxying moved into `proxy.ts`, which Next 16 runs on the genuine
Node.js runtime on every request (this is fixed, not configurable, per Next 16's
docs — no `export const runtime` needed or allowed). `proxy.ts` does:

1. Host guard — same `bare === "127.0.0.1" || "localhost" || "[::1]"` check as
   `toolbox_serve.ts`'s `hostAllowed()`; foreign Host -> `Response.json({ok:false,
   error:"forbidden host"}, {status:403})`.
2. Skip `_next/*` and `favicon.ico` (Next's own internals — the built-in static
   404 page still needs a couple of chunks even with zero migrated views).
3. Everything else: `fetch(new URL(pathname+search, process.env.TOOLBOX_UPSTREAM ??
   "http://127.0.0.1:8765"), {method, headers: request.headers, body: request.body,
   duplex:"half"})`, then `return new Response(upstreamResponse.body, {status,
   headers: upstreamResponse.headers})`. `TOOLBOX_UPSTREAM` is read fresh on every
   call — genuinely runtime-configurable, matching what the acceptance criteria asks
   for. `next.config.ts` was simplified to `output:'standalone'` only (a `rewrites()`
   that can never run, since `proxy.ts` already returns a `Response` for every
   non-`_next` path, would have been dead and misleading).

## Verification

Booted both processes for real (not just unit tests) three times while iterating;
final run, matching `docs/verification.md`'s documented protocol:

```
node handyman/dist/toolbox_serve.js --port 0                # Node upstream, ephemeral port
# .next/standalone/apps/web/server.js, TOOLBOX_UPSTREAM=<that port>, PORT=3212
HANDYMAN_ROOT=<shared> OLLAMA_BASE_URL=<mock> TOOLBOX_BASE_URL=http://127.0.0.1:3212 \
  bash tests/test_toolbox_serve.sh
```

`48 run, 48 passed, 0 failed` — every case, including the four LLM-relay POSTs
(draft/summarize/ask, cache-hit) and `/events` SSE (not buffered: `proxy.ts`
streams the upstream `ReadableStream` straight through as the `Response` body).
Acceptance only required JSON endpoints to go green through Next with SSE allowed
to keep hitting Node directly; this exceeds that bar.

Also verified directly with curl: `GET /api/state` through Next byte-equivalent to
Node (only the live `generated_at` timestamp differs between two separate calls);
foreign `Host` header -> 403 through Next; `Content-Security-Policy` header from the
Node response passes through unmodified (no extra `headers()` config needed).

Regression checks:
- `bash tests/run_tests.sh` (default mode, no env vars, byte-identical to before this
  feature): `48 run, 48 passed, 0 failed`.
- `./init.sh`: `status: ok`.
- `pnpm --filter @handyman/web build` (i.e. from repo root) and `pnpm --filter
  @handyman/web typecheck`: both clean.
- `pnpm install` from repo root: resolves all 3 workspace packages.

## Incident (self-corrected)

Registering the smoke-test fixture harness during manual verification, I ran
`toolbox.js register` once without `--handyman-root`/`HANDYMAN_ROOT`, which wrote a
scratch entry into the **real** `$HOME/HANDYMAN/registry.json` (not a test fixture).
Caught immediately via `cat registry.json`; removed with `toolbox.js unregister
<scratch-path>` before any other command touched it. Confirmed the registry now
matches its pre-incident 3 entries exactly. All subsequent registrations used
`--handyman-root <scratch>`.

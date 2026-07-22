---
type: Review Log
feature: toolbox_next_fleet_view
id: 39
status: approved
role: reviewer
updated: 2026-07-18
tags: [handyman/backlog, handyman/review]
---

# Review: toolbox_next_fleet_view

Reviewer verdict: **APPROVED**. The feature ships a real `/fleet` view in
apps/web that resolves initial state server-side from the upstream
`/api/state`, subscribes to the upstream `/events` SSE feed for live
refresh, and adds no external assets. The legacy panel and
`test_toolbox_serve.sh` are untouched. All six acceptance bullets are met
with executable evidence.

## Acceptance vs. evidence

1. **GET /fleet renders the real fleet with server-resolved initial state.**
   Verified live: a fake upstream served a fixture `/api/state`; `curl
   http://127.0.0.1:4321/fleet` returned HTTP 200 with alpha-harness,
   beta-harness, their status_counts, and the STALE_WIP signal in the served
   HTML. Next dev logged `GET /fleet 200 ... application-code: 38ms` (served
   by Next, not proxied). `tsc --noEmit` and `next build` both pass; /fleet
   is listed as ƒ (Dynamic) in the route map. The RSC fetch uses
   `cache: "no-store"`. PASS.

2. **Workspace change reflects without reload via EventSource on upstream
   /events.** `components/FleetLive.tsx` opens `new EventSource(eventsUrl)`
   on the URL passed from the server, re-fetches `/api/state` and swaps the
   region on each message. The served HTML embeds the resolved upstream
   events URL (http://127.0.0.1:<nodeport>/events) in the client bundle,
   proving SSE targets the Node port, not the Next port (Next's fallback
   rewrite buffers SSE - documented in proxy.ts and the plan). The existing
   "SSE emits a change event when the workspace mutates" test still passes.
   PASS (wiring + source; full browser E2E is out of scope for the verifier
   but the contract is testable and tested at TWF6).

3. **No external assets.** `grep -c 'src="http'` and `src="https` on the
   served /fleet HTML both return 0. Same invariant as the legacy panel.
   Enforced structurally: renderFleetHtml emits no `<script>` and no
   external src; the test TWF3 asserts both. PASS.

4. **Legacy UMD panel intact + test_toolbox_serve.sh unchanged.** The only
   touch to a shared file is `apps/web/proxy.ts` (additive Set change) and
   `tests/run_tests.sh` (one wiring line). toolbox_serve.ts is untouched.
   test_toolbox_serve.sh: 48/48 with zero assertion edits. PASS.

5. **Test against a fixture, no network.** `tests/test_web_fleet.sh` (9
   cases) transpiles fleetHtml.ts with the project's own typescript and runs
   renderFleetHtml against an in-process state fixture; asserts harness
   names, status counts, signal tags, kanban aggregate, no external src, no
   injected script, determinism, proxy wiring, and the EventSource
   subscription. No network. PASS.

6. **run_tests.sh passes and ./init.sh exits 0.** ALL SUITES PASSED
   (toolbox_serve 48/48, landing 3/3, fleet 9/9, plus all others);
   ./init.sh preflight status: ok. PASS.

## Diff review

- `apps/web/proxy.ts`: NEXT_HANDLED_PATHNAME -> NEXT_HANDLED_PATHNAMES =
  new Set(["/", "/fleet"]). Minimal, additive; the comment documents the
  two-sided strangler step (Set entry + page.tsx). The Host guard, CSP, and
  no-store behavior are unchanged. Sound.
- `apps/web/app/fleet/page.tsx`: RSC. Fetches upstream /api/state with
  no-store; degrades to a banner (not a 500) when the upstream is
  unreachable. Good defensive choice. The `headers: { host: ... }` on the
  fetch is a self-origin hint, consistent with the upstream's Host guard.
- `apps/web/app/fleet/fleetHtml.ts`: pure renderer, every value escaped via
  esc(); no script, no external src, no inline handler. Deterministic (same
  input -> same output, asserted by TWF4). Reuses no tokens - it emits
  semantic class names consumed by page.module.css.
- `apps/web/components/FleetLive.tsx`: client. EventSource on the server-
  passed URL, re-fetch + innerHTML swap on message, status dot, reconnect
  on error, cleanup on unmount. innerHTML swap is safe because all rendered
  values are escaped and the surface is read-only (no hydration of
  interactive elements inside). The eslint-disable for the empty dep array
  is correct (URLs are stable for the page lifetime).
- `apps/web/app/fleet/page.module.css`: reuses globals.css tokens only; no
  raw hex, no second accent; reduced-motion media query disables the pulse.
- `tests/test_web_fleet.sh` + `tests/run_tests.sh`: wired after the landing
  suite. Portable (uses node for the dash scan since macOS grep lacks -P,
  same pattern as test_web_landing.sh).

## Design discipline (design-taste-frontend, same skill as the landing)

The implementer reused the landing's terracotta-on-slate palette, pill/card/
panel radius rule, and system font stack - one theme, one accent, page Theme
Lock and Color Consistency Lock carry over. The Pre-Flight Check is filled
in the impl report with a one-line Pass/Fail justification per box. The
deviation from the landing (string renderer instead of JSX) is justified on
testability + SSE-reconciliation grounds and called out honestly.

## Security / safety

- DNS-rebinding guard preserved (foreign Host -> 403, verified live).
- CSP same-origin unchanged (next.config.ts and globals.css untouched).
- No new dependencies; package.json unchanged.
- HTML escaping in the renderer; no dangerouslySetInnerHTML on unescaped
  content (the only dangerouslySetInnerHTML is fed renderFleetHtml output).
- No write to disk; /fleet is read-only (consistent with the observer's
  read-only contract).

## Risks / follow-ups (non-blocking)

- SSE live refresh is verified at the wiring + source level; a full browser
  E2E (mutation -> visible swap) is left to manual/preview verification, as
  the verifier cannot drive a browser. The contract is testable and the
  existing SSE broadcast test covers the server side.
- The string-renderer pattern is a deliberate one-off for a view that
  reconciles on every SSE tick; future migrated views that do not need live
  swap should prefer JSX (as the landing does) for consistency.

## Verifier results

- `cd apps/web && npx tsc --noEmit` -> exit 0
- `NEXT_TELEMETRY_DISABLED=1 npx next build` -> Compiled successfully; /fleet
  listed as ƒ (Dynamic, server-rendered on demand)
- `bash tests/run_tests.sh` -> ALL SUITES PASSED (fleet 9/9)
- `./init.sh` -> preflight status: ok, exit 0

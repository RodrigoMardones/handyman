---
type: Implementation Log
feature: toolbox_observer
status: implemented
role: implementer
updated: 2026-07-17
tags: [handyman/role/implementer, handyman/feature/toolbox_observer]
---

# Implementation Report: toolbox_observer

## Files Changed

- `handyman/src/toolbox_serve.ts` (new): read-only localhost observer.
  `disk → fs.watch (recursive, 250 ms debounce, watcher re-arm on registry
  change) → SSE → browser`. Endpoints: `/`, `/api/state` (snapshots + signals
  + feature queues + fleet aggregate + timeline), `/api/md` (whitelist:
  current/history/index/checkpoints/`backlog:*.md`/`docs:*.md`, registered
  roots only), `/api/corpus`, `/graph/*`, `/vendor/*`, `/events`. Security:
  hard 127.0.0.1 bind, Host-header check, GET-only 405, no-store. First paint
  embeds the state inline (`__TOOLBOX_INITIAL_STATE__`, `<`-escaped).
- `handyman/assets/toolbox_panel.js` (new): the frontend is **React 18** (user
  decision mid-feature) served as UMD from node_modules with htm for JSX-like
  templates — no bundler, no external assets. Components: App (SSE + refresh),
  FleetView, HarnessView (kanban), TimelineView, SearchView, MdDialog.
- `handyman/src/toolbox.ts`: `serve` subcommand delegates via dynamic import
  (dodges the sync `process.exit` path).
- `package.json`: + react@18, react-dom@18, htm, minisearch.
- `tests/test_toolbox_serve.sh` (new, 10 cases): boots on `--port 0` with a
  bounded readiness poll under a temp `HANDYMAN_ROOT` (legacy
  test_workstation.sh pattern); wired into `run_tests.sh`.

## Design Notes

- Read-only by design (plan E of `docs/analisis-observador-fleet-web.md`
  deferred): no mutating endpoint exists, so no session token is needed yet.
- Vendor UMD subpaths are not in the packages' export maps; resolution walks
  from `require.resolve(pkg)` to the package root via the `node_modules/<pkg>/`
  path marker.
- Verified end-to-end in headless Chromium against the real fleet: fleet table
  renders 3 harnesses with live session and signal badges; SSE change events
  fire on workspace writes. Gotcha found during verification: an EADDRINUSE
  crash was unhandled — now reports cleanly and suggests `--port 0`.

## Test Output

```text
bash tests/test_toolbox_serve.sh -> Summary: 10 run, 10 passed, 0 failed
```

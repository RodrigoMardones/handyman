---
feature: feature_state_machine
status: implemented
role: implementer
updated: 2026-07-16
tags: [handyman/role/implementer, handyman/feature/feature_state_machine]
---

# Implementation Report: feature_state_machine

## Files Changed

- `handyman/src/feature.ts` (new, 1389 LOC) — TypeScript port of `feature.py`: atomic feature-state CLI (add/start/block/done/ready/log/next).
- `handyman/scripts/feature.py` (deleted, 631 LOC) — dropped, single-source now Node.
- `handyman/scripts/preflight.py` — worklist subprocess repointed `feature.py ready` -> `node dist/feature.js ready` (resolves `../dist/feature.js` from SCRIPT_DIR).
- `handyman/references/anatomy.md`, `workflow.md`, `templates.md`, `examples.md`, `assets/feature-request.template.md` — prose invocations repointed to `node dist/feature.js`.
- `tests/test_feature.sh` — oracle repointed to `node dist/feature.js` (46 call sites, 0 assertions changed).
- `tests/test_docs.py` — two assertions repinned from `feature.py ready` to `node dist/feature.js ready`.

## Design Notes

- Reuses the core: `resolveWorkspace`, `loadFeatureList`/`saveFeatureList` (byte-identical JSON IO).
- Subprocess fan-out preserved: `start` -> `python3 preflight.py` (preflight not yet ported); `done` -> `bash init.sh` at DEVNULL, gates the close; `post_run` hooks via `bash -c`, failing step only WARNs.
- Argparse exit-2 shim (shared with backlog.ts): usage to stderr, `prog: error:`, exit 2; observation tail `status: ok|warn|error` (+ `next:` on exit 3), JSON-exempt.
- Five known migration fixes applied upfront: literal template substitution via `split/join` (not `.replace`, which expands `$&`/`$$`/`$n` on names like `x$&y`); universal-newline reads (CRLF current.md); realpath entry guard (symlinks/spaces); argparse `' ' in arg` option heuristic; realpath-after-absolutize root resolution.

## Test Output

```text
test_feature.sh: Summary: 25 run, 25 passed, 0 failed
parity check:   PARITY OK (byte-identical feature_list.json, current.md, history.md)
test_preflight: Summary: 11 run, 11 passed, 0 failed
npm run typecheck / build: green
npm test (vitest): 77 passed
npm run lint: exit 0
init.sh: exit 0 (after regenerating .handyman/index.md)
ALL SUITES PASSED
```

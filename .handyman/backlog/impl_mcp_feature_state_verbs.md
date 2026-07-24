---
type: Implementation Log
feature: mcp_feature_state_verbs
status: implemented
role: implementer
updated: 2026-07-23
tags: [handyman/role/implementer, handyman/feature/mcp_feature_state_verbs]
---

# Implementation Report: mcp_feature_state_verbs

## Files Changed

- `handyman/src/mcp.ts` — the WIP (uncommitted when picked up) had already
  registered the four tools in `buildServer()` and listed them in the file
  header; this change adds the matching exported handlers the black-box suite
  drives: `featureAdd`, `featureBlock`, `featureUnblock`, `featureAcceptance`
  (thin `runCli("feature.js", ...)` wrappers, same shape as `featureStart` et al.).
- `tests/test_mcp.js` — M1 contract assertion now expects the 15 tools; new
  `featureOf` fixture helper; new cases M14 (`feature_add` happy path), M15
  (`feature_block`/`feature_unblock` round-trip), M16 (`feature_acceptance`
  refused on a done feature). Header comment renumbered to M1-M16.
- `handyman/references/mcp.md` — tools table gains the four rows
  (`feature_add`, `feature_block`, `feature_unblock`, `feature_acceptance`);
  intro and the post-table paragraph now describe the full 15-tool surface
  (intake -> claim -> log -> next step -> block/unblock -> close) and note that
  `acceptance --force` stays CLI-only.

## Design Notes

- The four MCP tools stay exactly as the WIP designed them: `registerCliTool`
  wrappers that shell out to `feature.js add|block|unblock|acceptance`, so the
  state machine and its refusals live in the subprocess, never re-implemented.
- `acceptance --force` is deliberately NOT exposed: rewriting a done feature's
  contract is an operator action recorded in `history.md`, so the refusal
  surfaces to the MCP caller as a plain non-zero exit (asserted in M16).
- What was missing from the WIP was everything around the tools: the exported
  handler layer the suite imports (`mcp.featureAdd` etc.), the test contract
  update (11 -> 15 tools), and the reference-doc surface. No tool registration
  was modified.
- `feature_block` is exercised on a pending feature (the CLI allows blocking
  from any status); `feature_unblock` asserts the inverse transition including
  the `blocked_reason` cleanup.
- House rule kept: MCP tools shell out to sibling `dist/*.js` CLIs; no command
  internals imported.

## Test Output

```text
$ ./init.sh                                            exit 0
==> tools    OK   ==> files  OK   ==> state   OK
==> lint     OK   ==> build  OK   ==> harness OK
==> test
  Doc-structure suite (test_docs.js) ........... OK
  Verifier-contract suite (test_init.sh) ....... OK
  Updater-contract suite (test_update.sh) ...... OK
  Feature-CLI suite (test_feature.sh) .......... OK
  Backlog-generator suite (test_backlog.sh) .... OK
  Index-MOC suite (test_index.sh) .............. OK
  Upgrade-check suite (test_upgrade.sh) ........ OK
  Tools-discovery suite (test_tools_discovery.sh) OK
  Evals suite (test_evals.sh) .................. OK
  Preflight suite (test_preflight.sh) .......... OK
  Metrics suite (test_metrics.sh) .............. OK
  npm pack suite (test_npm_pack.sh) ............ OK
  Sprint-lifecycle suite (test_sprint.sh) ...... OK
  handyman MCP suite (test_mcp.js) ............. 18/18 passed
    (incl. "tools/list exposes the 15 contract tools" and M14-M16)
  toolBox suites (8) ........................... OK
  apps/web suites (14) ......................... OK
  734 PASS / 0 FAIL across the run
==> preflight: stability report complete (read-only; exit 0)
```

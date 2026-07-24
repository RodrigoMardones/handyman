---
type: Implementation Log
feature: mcp_backlog_review_tool
status: implemented
role: implementer
updated: 2026-07-23
tags: [handyman/role/implementer, handyman/feature/mcp_backlog_review_tool]
---

# Implementation Report: mcp_backlog_review_tool

## Files Changed

- `handyman/src/mcp.ts` — new `backlog_review` tool registered with the
  `registerCliTool` pattern in `buildServer()` (input schema: `project`,
  `name`, `status` as `z.enum(["approved", "changes_requested"])`; annotations
  write/non-idempotent), exported handler `backlogReview(project, name, status)`
  next to the other handlers (thin `runCli("backlog.js", ["review", name,
  "--status", status])` wrapper, same shape as `featureClose` et al.), and the
  file-header tool list updated to the 16-tool surface.
- `tests/test_mcp.js` — M1 contract assertion now expects the 16 tools
  (`backlog_review` sorts first); new cases M17 (happy path: stamps
  `backlog/review_a.md` with `status: approved` in frontmatter) and M18
  (conflict: a second, different verdict exits non-zero, the payload carries
  the CLI's conflict message, and the file keeps the original verdict — no
  silent flip). Header comment renumbered to M1-M18.
- `handyman/references/mcp.md` — tools table gains the `backlog_review` row
  (between `feature_acceptance` and `feature_close`); intro count updated
  15 -> 16 tools; post-table paragraph notes the `backlog.js review --force`
  re-stamp stays CLI-only, like `acceptance --force`.
- `handyman/references/workflow.md` — "Stages at a Glance" stage 5 (Review)
  guardian is now the MCP tool `backlog_review` with the CLI as the fallback;
  the intro's guardian-tool list names `backlog_review` (stage 5).

## Design Notes

- The tool stays a pure `registerCliTool` wrapper over
  `backlog.js review <feature> --status <s>`: verdict stamping, the
  never-overwrite policy, and the conflict refusal all live in the subprocess
  (zero second source of truth). The MCP layer re-implements nothing.
- `--force` is deliberately NOT exposed: re-stamping a verdict is an operator
  action, consistent with the `feature_acceptance --force` decision. A
  conflicting second verdict reaches the MCP caller as a plain non-zero exit
  with the CLI's message in `output` (asserted in M18), so the refusal is
  surfaced, never swallowed.
- Annotations follow the write-verb house pattern: `readOnlyHint: false`,
  `idempotentHint: false` (a second *different* verdict fails, so the call is
  not safely repeatable), `destructiveHint: false`, `openWorldHint: false`.
- Registration placed between `feature_acceptance` and `feature_close` to
  mirror the workflow order (stage 5 review before stage 6 closure); the
  mcp.md table row sits in the same spot.
- M17/M18 use their own throwaway harness: `backlog.js review` stamps the
  template regardless of feature state, so no close-and-review fixture dance
  is needed; the conflict case is the contract that matters.

## Test Output

```text
$ cd handyman && npm run build                 exit 0 (tsc -b clean)
$ node tests/test_mcp.js                       exit 0
  20/20 passed
    (incl. "tools/list exposes the 16 contract tools",
     M17 backlog_review happy path, M18 conflict refusal)
$ ./init.sh                                    exit 0
==> tools    OK   ==> files  OK   ==> state   OK
==> lint     OK   ==> build  OK   ==> harness OK
==> test
  handyman MCP suite (test_mcp.js) ............. 20/20 passed
  all other suites (docs, init, update, feature, backlog, index, upgrade,
  tools_discovery, evals, preflight, metrics, npm_pack, sprint, toolBox,
  apps/web) ................................... green
==> preflight: stability report complete (read-only; exit 0)
```

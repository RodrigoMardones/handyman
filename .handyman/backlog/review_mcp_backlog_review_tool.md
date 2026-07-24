---
type: Review Log
feature: mcp_backlog_review_tool
status: approved
role: reviewer
updated: 2026-07-23
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/mcp_backlog_review_tool]
---

# Review: mcp_backlog_review_tool

## Verdict

APPROVED — all four acceptance criteria verified independently (clean
`tsc -b` build plus my own re-run of the full MCP suite, 20/20), and the
diff keeps the MCP boundary intact: a thin `registerCliTool` wrapper over
`backlog.js review`, no `--force` anywhere, and the conflict refusal owned
entirely by the subprocess.

## Stage 1: Spec Compliance

1. **`registerCliTool` pattern, correct schema, no force — PASS.**
   `handyman/src/mcp.ts` registers `backlog_review` via `registerCliTool`
   with `script: "backlog.js"`, placed between `feature_acceptance` and
   `feature_close` (workflow order, stage 5 before 6). inputSchema is
   exactly `project`, `name`, `status` with
   `z.enum(["approved", "changes_requested"])` — nothing else. The exported
   handler `backlogReview` sits next to the other handlers and is a
   one-line `runCli("backlog.js", ["review", name, "--status", status])`,
   same shape as `featureClose` et al. Grepped for `force` across schema,
   handler, and args builder: zero occurrences; the only mentions are prose
   in the tool description and the docs stating the re-stamp stays
   CLI-only (consistent with the `feature_acceptance --force` decision).
2. **Conflicting second verdict exits non-zero and reaches the payload —
   PASS.** M18 calls `mcp.backlogReview(p4, "a", "changes_requested")`
   after an approved stamp and asserts all three legs: exit non-zero, the
   CLI's own conflict message carried in `output`
   (`/declares 'approved' but --status asked for 'changes_requested'/` —
   produced by the subprocess, confirmed by the passing assertion), and the
   on-disk file still `status: approved`. No silent flip. Verified passing
   in my own re-run.
3. **Happy path + conflict covered; suite green — PASS.** M17 stamps
   `backlog/review_a.md` and reads the real frontmatter back from disk
   (`/^status: approved$/m`), not just exit 0. Re-ran myself from the repo
   root: `cd handyman && npm run build` (tsc -b clean, exit 0), then
   `node tests/test_mcp.js` → 20/20 passed. M1 asserts exactly the 16 tool
   names over real stdio JSON-RPC; I cross-checked the sorted list against
   the 16 `name:` registrations in `mcp.ts` — identical. `./init.sh` not
   re-run: build and full suite were green on re-run and nothing
   suspicious surfaced; the implementer's reported gate output matches
   what I observed.
4. **Docs — PASS.** `references/mcp.md`: new `backlog_review` table row
   between `feature_acceptance` and `feature_close`, intro count updated
   15 → 16 tools, and the post-table paragraph notes the
   `backlog.js review --force` re-stamp stays CLI-only.
   `references/workflow.md`: the Stages-at-a-Glance stage-5 row now reads
   "`backlog_review` (MCP; fallback `npx handyman-harness@3 backlog
   review`)" and the intro guardian list names `backlog_review` (stage 5).

## Stage 2: Code Quality

- **MCP boundary (architecture.md "shellear el CLI") respected.** Verdict
  stamping, the never-overwrite policy, and the conflict refusal all live
  in `backlog.js`; the MCP layer re-implements nothing — zero second
  source of truth.
- **Conventions respected.** English, minimal scoped diff, handler shaped
  exactly like the existing thin wrappers. The working-tree diff also
  contains feature 78's already-approved rows/handlers
  (`feature_add/block/unblock/acceptance`); those are untouched by this
  feature's logic and were not re-reviewed.
- **Annotations honest.** `readOnlyHint: false` (writes the verdict file),
  `idempotentHint: false` — correct: a second *different* verdict fails,
  so the call is not safely repeatable; `destructiveHint: false`,
  `openWorldHint: false`.
- **Tests assert real state.** Both M17 and M18 read on-disk frontmatter,
  and M18 asserts the conflict message verbatim in the payload — not
  exit-code-only checks.
- **Build artifact verified.** After the clean build, `dist/mcp.js`
  re-exports `backlogReview` (grep-confirmed), so the shipped artifact
  matches the source the suite exercises.

## Required Changes

None.

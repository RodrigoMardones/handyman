---
type: Review Log
feature: mcp_feature_state_verbs
status: approved
role: reviewer
updated: 2026-07-23
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/mcp_feature_state_verbs]
---

# Review: mcp_feature_state_verbs

## Verdict

APPROVED — all four acceptance criteria verified independently (suite re-run
plus full `./init.sh` gate, both green), and the diff respects the MCP
boundary: thin `registerCliTool` wrappers over `dist/feature.js`, no
`--force`, no second source of truth.

## Stage 1: Spec Compliance

1. **15-tool contract + suite green — PASS.** Re-ran `node tests/test_mcp.js`
   myself after `npm run build` (tsc -b, clean): 18/18, exit 0. M1 asserts
   `tools/list` over real stdio JSON-RPC against exactly the 15 names; I
   cross-checked the sorted list against the `registerCliTool`/`registerTool`
   calls in `handyman/src/mcp.ts` — identical.
2. **New cases cover the required behaviors — PASS, and they assert what they
   claim.** M14 drives `mcp.featureAdd` and reads `feature_list.json` back
   from disk: id 3, `pending`, acceptance list and `depends_on: [1]` all
   verified, not just exit 0. M15 exercises the full round-trip: block sets
   `status: blocked` + `blocked_reason`, unblock returns to `pending` and
   asserts the reason key is gone (`!("blocked_reason" in ...)`). M16 builds
   a real `done` feature (start + verifier-gated close with a green stub)
   and asserts the acceptance refusal: non-zero exit, status stays `done`,
   and the output matches the CLI's own refusal message
   (`/acceptance list is the contract/`, present verbatim in
   `handyman/src/feature.ts:856`). The refusal is enforced by the
   subprocess, not by the test's goodwill.
3. **mcp.md updated — PASS.** The tools table now has 15 rows; I extracted
   and sorted them — byte-identical to the M1 contract list. The intro
   states the 15-tool surface and the post-table paragraph documents the
   full cycle (intake -> claim -> log -> next step -> block/unblock ->
   close) and that `acceptance --force` stays CLI-only. No stale "11 tools"
   anywhere in product code or references (grep; remaining hits are
   historical backlog reports and the feature's own description).
4. **`./init.sh` exits 0 — PASS.** Re-ran the full gate in this review:
   "ALL SUITES PASSED / VERIFIER: all gates passed", exit 0, MCP suite
   18/18 inside it.

## Stage 2: Code Quality

- **MCP boundary (architecture.md "Frontera del MCP") respected.** All four
  tools use `registerCliTool` with `script: "feature.js"`; the exported
  handlers (`featureAdd`/`featureBlock`/`featureUnblock`/`featureAcceptance`)
  are thin `runCli("feature.js", ...)` wrappers shaped exactly like the
  existing `featureStart`/`featureLog`/`featureNextStep`. Zero imports of
  command internals; the state machine and its refusals live only in the
  CLI subprocess.
- **`--force` not exposed.** The `feature_acceptance` inputSchema has no
  force field and the args builder never emits `--force` — verified in both
  layers (exported handler and registered tool). The tool description and
  mcp.md both state the override stays on the CLI where `feature.ts`
  records it in `history.md`. Matches the backlog decision quoted in the
  feature description.
- **Flags match the CLI contract.** `add --name/--title/--description/
  --acceptance/--depends-on`, `block NAME --reason`, `unblock NAME`,
  `acceptance NAME --acceptance...` — all confirmed against the parsers in
  `handyman/src/feature.ts`.
- **Conventions.** English in code, comments, and mcp.md (consistent with
  the pre-existing English of both files); camelCase TS; zod schemas with
  the house `projectField`/`featureNameField`; annotations mirror sibling
  tools. Diff is minimal: only `mcp.ts`, `tests/test_mcp.js`,
  `references/mcp.md` (the other working-tree changes are harness state
  from the sprint flow). No dead code: the new `featureOf` fixture helper
  is used by M14/M15.

## Required Changes

_None._

## Notes

- The registered tools build their argv independently of the exported
  handlers (e.g. `feature_add`'s `args:` vs `featureAdd`). That is the
  pre-existing house pattern (`feature_close` vs `featureClose` do the
  same); the single source of truth is the subprocess, so this is
  consistency, not duplication to fix.

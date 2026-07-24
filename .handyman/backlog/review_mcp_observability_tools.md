---
type: Review Log
feature: mcp_observability_tools
status: approved
role: reviewer
updated: 2026-07-23
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/mcp_observability_tools]
---

# Review: mcp_observability_tools

## Verdict

APPROVED — all five acceptance criteria verified independently (clean
`tsc -b` build plus my own re-run of the MCP suite, 24/24), and the key
design call checks out: I confirmed in `toolbox.ts` that `parseFlags`
silently accepts an injected `--root` as a value-option and that only
`heartbeat` reads it, so registering the fleet verbs with
`needsProject: false` + a `--root`-free `runToolbox` is the right call —
the alternative would make a fleet-wide tool look per-project.

## Stage 1: Spec Compliance

1. **`metrics` exposed with `project`; JSON arrives parsed in
   structuredContent — PASS.** `handyman/src/mcp.ts` registers it via
   `registerCliTool` (`script: "metrics.js"`, `args: ["--json"]`,
   `format: parseJsonResult`), so the injected `--root <project.root>`
   lands on a CLI that actually honors it — `metrics.ts` has its own
   `parseArgs` with explicit `--root` / `--root=` handling
   (`src/metrics.ts:288-303`). `textResult` places the formatted payload
   into `structuredContent` (`src/mcp.ts:359-364`). M19 asserts the
   parsed snapshot against the fixture state: `status_counts.done === 1`,
   `pending === 1`, `coverage.done === 1`, `with_reports === 0`,
   `coverage.missing === ["a"]`.
2. **Fleet tools read-only; `needsProject: false` because toolbox.js
   doesn't take `--root` — PASS.** `fleet_status`, `fleet_health`
   (optional `strict`, default false), and `fleet_timeline` are
   `registerTool` + `needsProject: false` with empty input schemas and a
   custom `runToolbox()` that shells out to `toolbox.js` WITHOUT
   `--root` (`src/mcp.ts:153-155`); the registry comes from
   `$HANDYMAN_ROOT`, inherited by the subprocess — the same source
   `harness_list` reads via `handymanRoot(null)`. The premise is real:
   `toolbox.ts parseFlags` (`src/toolbox.ts:1437-1465`) stores any
   unknown `--flag value` pair as a value-option, and
   `options.get("root")` is read exactly once, by `heartbeat`
   (`src/toolbox.ts:1547`) — `status`/`health`/`timeline` would ignore
   it silently. All three verbs confirmed read-only at the CLI level:
   the only disk writes in `toolbox.ts` are `heartbeat`'s event append
   and `moc`'s index/html writes, neither reachable from the exposed
   verbs (`status --run-verifier`, which runs the project verifier, is
   not plumbed).
3. **Tests cover the 4 tools; suite green — PASS.** M19–M22 added and M1
   contract updated 16 → 20 (sorted list cross-checked against the 20
   `name:` registrations in `mcp.ts` — identical). Re-ran myself from
   the repo root: `cd handyman && npm run build` (tsc -b clean, no
   diagnostics), then `node tests/test_mcp.js` → 24/24 passed, including
   the wire-level M1 over real stdio JSON-RPC.
4. **`references/mcp.md` updated — PASS.** Intro 16 → 20 tools, the
   `project` paragraph gains the registry-wide caveat naming the four
   tools that take no `project`, and four new rows document each tool
   with its wrapped CLI and notes (incl. `strict` semantics). The
   "deliberately absent" paragraph is untouched. Repo-wide grep shows no
   stale "16 tools" references outside historical backlog reports.
5. **`./init.sh` exits 0 — PASS (per recorded gate output).** Not
   re-run: build and the full MCP suite were green on my own re-run, the
   change is additive to `mcp.ts`/`test_mcp.js`/`mcp.md`, no other suite
   asserts the tool count (checked `tests/test_docs.js`), and nothing
   suspicious surfaced; the implementer's reported gate output matches
   what I observed.

## Stage 2: Code Quality

- **The `--root` decision is sound and the hazard is real.** Verified
  firsthand (criterion 2): injecting `--root` would be silently accepted
  and ignored, producing fleet output from a tool that looks per-project
  — worse than an error. The `needsProject: false` + `runToolbox` split
  mirrors the existing `harness_list` pattern; the code comment on
  `runToolbox` documents exactly this reasoning.
- **`parseJsonResult` doesn't swallow.** On non-JSON output it falls
  back to the raw `{ exit, output }` RunResult shape, so a broken CLI
  never yields an empty silent payload. `exit` is kept on the happy path
  — required because `fleet_health --strict` encodes "signals present"
  as exit 1. Confirmed at the source: `cmdHealth` prints the JSON to
  stdout BEFORE returning the strict exit code
  (`src/toolbox.ts:667-683`), so `run`'s catch branch captures the JSON
  and the payload carries both `exit: 1` and `total_signals`. M21
  asserts exactly this contract (`strict exit === (total_signals > 0 ?
  1 : 0)`), with a comment explaining why specific signals aren't
  asserted (BEHIND depends on skill version vs the unsealed fixture) —
  an honest, documented limitation, not a gap.
- **Read-only purity confirmed.** The four handlers only shell out and
  parse; the wrapped CLIs write nothing on these paths (writes in
  `toolbox.ts` are confined to `heartbeat`/`moc`; `metrics.js` exits 0
  always and only reads). Annotations honest: `readOnlyHint: true`,
  `idempotentHint: true`, `destructiveHint: false`, `openWorldHint:
  false` on all four — matching the existing read-only tools.
- **MCP boundary (architecture.md "shellear el CLI") respected.** Zero
  re-implemented logic, zero new imports/dependencies — the tools wrap
  the same `dist/*.js` the roles run. English throughout, minimal scoped
  diff, header tool-list comment updated (16 → 20 with the registry-wide
  caveat). The working-tree diff also contains the already-approved
  sibling features 78/79 rows and handlers; untouched by this feature
  and not re-reviewed.
- **Tests assert real content, not exit 0.** M19 checks fixture-derived
  counts and the exact `coverage.missing` list; M20 checks the registry
  fixture's `project_name === "t"` and per-harness `status_counts`; M21
  checks the strict exit/total_signals contract; M22 checks the merged
  chronology content (`total === 1`, `feature === "a"`,
  `feature_id === 1`, `source === "history"`).
- **Build artifact verified.** After the clean build, `dist/mcp.js`
  exports all four handlers (`metrics`, `fleetStatus`, `fleetHealth`,
  `fleetTimeline` — grep-confirmed), so the shipped artifact matches the
  source the suite exercises.

## Required Changes

None.

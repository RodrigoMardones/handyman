---
type: Implementation Log
feature: mcp_observability_tools
status: implemented
role: implementer
updated: 2026-07-23
tags: [handyman/role/implementer, handyman/feature/mcp_observability_tools]
---

# Implementation Report: mcp_observability_tools

## Files Changed

- `handyman/src/mcp.ts` — four new read-only tools. `metrics` via `registerCliTool`
  (script `metrics.js`, args `["--json"]`, `format` parses stdout JSON into
  structuredContent — the `feature_next` / `ready --json` pattern). `fleet_status`,
  `fleet_health`, `fleet_timeline` via `registerTool` + `needsProject: false` (the
  `harness_list` pattern) with a custom run. New plumbing: `runToolbox(args)`
  (executes `toolbox.js` WITHOUT `--root`) and `parseJsonResult(result)`. Exported
  handlers for the black-box suite: `metrics`, `fleetStatus`, `fleetHealth`,
  `fleetTimeline`. Header tool-list comment updated (16 → 20, registry-wide caveat).
- `tests/test_mcp.js` — M1 contract 16 → 20 tools (sorted); new cases M19 (metrics
  returns the parsed snapshot, asserted against fixture state: done/pending counts,
  coverage.missing), M20 (fleet_status returns the fleet view over a `$HANDYMAN_ROOT`
  registry fixture — same pattern as M5), M21 (fleet_health signals shape +
  `--strict` exit contract), M22 (fleet_timeline merged chronology). Header list updated.
- `handyman/references/mcp.md` — intro 16 → 20 tools; the `project` paragraph gains
  the registry-wide caveat; four new rows in the tools table. The "deliberately
  absent" paragraph is untouched.
- `.handyman/progress/current.md` — session log lines (via `feature.js log`).

## Design Notes

- **The `--root` decision.** `metrics.js` accepts `--root` (its own `parseArgs`), so
  `metrics` is a per-project tool through the normal `registerCliTool` path.
  `toolbox.js status|health|timeline` do not: `parseFlags` (toolbox.ts) treats any
  unknown `--flag value` pair as a value-option, so the `--root <project.root>` that
  `registerCliTool` injects would be *silently accepted and ignored* — only
  `heartbeat` reads `options.root`. The result would be fleet-wide output from a tool
  that looks per-project: worse than an error. The three fleet tools are therefore
  registered with `registerTool` + `needsProject: false` (like `harness_list`) and a
  custom `runToolbox()` that shells out to `toolbox.js` without `--root`; the
  registry comes from `$HANDYMAN_ROOT`, inherited by the subprocess — the same source
  `harness_list` reads via `handymanRoot(null)`.
- **Payload shape.** `parseJsonResult` returns `{ exit, ...parsed }` on success and
  falls back to the raw `{ exit, output }` RunResult shape on non-JSON output, so a
  broken CLI never produces an empty silent payload. `exit` is kept on the happy path
  because `fleet_health --strict` encodes "signals present" as exit 1.
- **`fleet_health --strict`.** Exposed as an optional boolean (default false). The
  CLI prints the JSON even when strict exits 1, so structuredContent carries both
  `exit` and `total_signals`; the MCP adds no gating of its own.
- **Annotations.** All four: `readOnlyHint: true`, `idempotentHint: true`,
  `destructiveHint: false` (+ `openWorldHint: false`, matching the existing
  read-only tools).
- **Test limitation (noted in the M21 comment).** Which health signals fire in the
  fixture depends on the skill version vs the unsealed fixture harness (BEHIND
  fires), so M21 asserts the deterministic contract — `exit === (total_signals > 0 ?
  1 : 0)` under `--strict`, signal-list shape — rather than specific signals.

## Test Output

```text
$ cd handyman && npm run build
> tsc -b            (clean, no diagnostics)

$ node tests/test_mcp.js
24/24 passed        (incl. M1 "tools/list exposes the 20 contract tools"
                     and the new M19-M22 observability cases)

$ ./init.sh
lint: OK -> build OK -> full test battery OK (test_mcp.js 24/24 inside)
==> preflight: stability report complete (read-only; exit 0)
INIT_EXIT=0
```

---
feature: evals_trigger_eval
status: implemented
role: implementer
updated: 2026-07-16
tags: [handyman/role/implementer, handyman/feature/evals_trigger_eval]
---

# Implementation Report: evals_trigger_eval

## Files Changed

- `handyman/src/evals.ts` (new, 675 LOC) — TS port of `scripts/evals.py`. Standalone: no cross-script imports. Subcommands `validate`/`measure`; reuses `core/formatHalfEven` for all `:.2f` outputs (rate, accuracy, mean_rate, stddev, pass@k), `ajv` for `trigger_eval.schema.json` conformance (replacing jsonschema Draft7), and `child_process.spawnSync` for the model runner. Ships a `shlexSplit` shim (posix-mode argv split) and a `which` helper (PATH lookup) for the runner contract.
- `tests/test_evals.sh` — repointed to `node dist/evals.js` (8 invocations); added self-contained `npm run build`. 0 assertions edited.
- `tests/test_docs.py` — `test_description_gate` assertions updated to the new contract (`scripts/evals.py validate/measure` -> `node dist/evals.js validate/measure`); follows the same pattern the feature (#7) port used.
- `handyman/scripts/evals.py` — **deleted** (no dual-maintenance).
- References repointed to `node dist/evals.js`: `references/evals.md`, `references/examples.md`, `references/workflow.md`, `assets/feature-request.template.md`, `assets/init.template.sh`.

## Design Notes

- **Standalone port (first SP4 feature):** evals.py imports only stdlib + optional jsonschema — zero cross-script dependencies. This made it the ideal parallel port alongside the SP3 sprint agent (no file overlap, no shared core mutations).
- **Parity verified byte-identical** against the Python oracle across all 8 test scenarios: validate (shipped/balanced/unbalanced/duplicate/malformed), measure (NOTE degradation, runner confusion matrix, --report-passk pass@1/pass@k). The measure path (half-even formatting, confusion TP/FP/TN/FN, stddev, pass@k = 1-(1-r)^k) is byte-identical.
- **Known minor divergence (documented, non-blocking):** (1) stdout/stderr interleaving order when redirected `2>&1` (Python block-buffers stdout on redirect; Node does not) — not asserted by the oracle. (2) schema error message phrasing (jsonschema Draft7 vs ajv) — `structuralProblems` already gates the deterministic contract, so test T5 passes via the structural "unexpected keys" / "non-boolean should_trigger" messages.
- **argparse parity:** subcommand dispatch + exit-2 usage errors + `--report-passk` store_true + int/float option parsing replicated.
- **Coordination with SP3:** the sprint agent closed #8 sprint_lifecycle in parallel; merged their integration into this branch before merging back — no conflicts (distinct files; workflow.md auto-merged on disjoint regions).

## Test Output

```text
Evals suite (test_evals.sh) — 8 run, 8 passed, 0 failed
ALL SUITES PASSED (run_tests.sh: feature 25, backlog 7, docs 6, validate 10,
  tools_discovery 16, evals 8, sprint 11, metrics 6, preflight 11, index ...)
init.sh exit 0 (checkout principal); typecheck clean; lint exit 0
  (23 noNonNullAssertion warnings — known debt, same as feature.ts)
parity: 8/8 scenarios byte-identical Python vs Node (measure path + validate exits)
```

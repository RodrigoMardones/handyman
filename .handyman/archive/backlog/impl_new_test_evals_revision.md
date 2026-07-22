---
type: Implementation Log
feature: new_test_evals_revision
status: implemented
role: implementer
updated: 2026-06-26
tags: [handyman/role/implementer, handyman/feature/new_test_evals_revision]
---

# Implementation Report: new_test_evals_revision

Research-only feature (mirror of ids 9/15/20/25/31/32). Deliverable is a research
document; no product code changed; `SKILL.md` untouched.

## Files Changed

- `docs/analisis-tests-evaluaciones-modelo.md` (new, 352 lines) — the research doc.
- `.handyman/` state only: `feature_list.json` (feature 38), `progress/current.md`,
  this report. No `tests/`, `handyman/scripts/`, `handyman/references/` or
  `handyman/assets/` files were modified (those are the plan's future surfaces).

## Design Notes

- **Question.** How are model-evaluation tests done today in handyman, why does the
  trigger eval live as loose data with no runner or guard, and what is the best fix
  per the `skill-creator` and `mcp-builder` literature.
- **Core finding (evidence).** `handyman/evals/trigger-eval.json` holds 20 well-formed
  queries (10 true / 10 false, EN+ES, near-miss negatives) but a repo-wide grep for
  `trigger-eval`/`should_trigger`/`eval` returns zero hits in `tests/`, `run_tests.sh`
  and `.github/`. The eight suites wired in `run_tests.sh` include none for evals. The
  only `description` guard is `test_token_budgets` in `test_docs.py` (<=500 chars,
  today 472) — a SIZE gate, not a triggering/accuracy gate. The eval is declared a
  gate (memory + `docs/analisis-iteraciones.md` C4) but never cabled as one.
- **Literature.** `skill-creator` separates two eval classes: trigger/description evals
  (`[{query,should_trigger}]`, run via `run_eval.py`/`run_loop.py`) and output/task
  evals (`evals.json`, graded + `aggregate_benchmark.py`). The trigger loop runs each
  query 3x for a stable rate (variance) and splits 60/40 train/held-out test, selecting
  by test score to avoid overfitting. `mcp-builder/reference/evaluation.md` adds
  stability, string-comparison verifiability, and solve-yourself validation of the eval.
- **Thesis (determinism boundary).** "Evaluate the model" splits cleanly: the eval
  CONTRACT (parse, keys/types, class coverage, no duplicates, runner shape) is
  deterministic and CI-safe; the trigger MEASUREMENT is stochastic (needs model + CLI +
  auth, varies per run) and must degrade with a NOTE, never gate — the same graceful
  degradation `validate_harness.py` already uses for `jsonschema`.
- **Plan A-E** (research only, NOT implemented): A eval schema + structural test (9th
  suite in `run_tests.sh`); B `scripts/evals.py validate/measure` with variance + NOTE;
  C `check_evals()` advisory in `init.template.sh`; D `references/evals.md`; E description
  re-measurement step in `workflow.md`/`examples.md` + `feature-request` Verification.
- **T2 safety.** Doc and this report use inline-code and fenced blocks only; `grep -c
  '](' = 0` so the "all relative markdown links resolve" test stays green.

## Test Output

```text
$ ./init.sh   # baseline before writing, and re-run after
test: docs 114, init 14, update 7, feature 12, backlog 7, index 5, upgrade 10,
      tools-discovery 6  -> ALL SUITES PASSED (exit 0)
$ grep -c '](' docs/analisis-tests-evaluaciones-modelo.md
0
```

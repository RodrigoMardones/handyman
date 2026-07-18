---
feature: new_test_evals_aplication
status: implemented
role: implementer
updated: 2026-06-27
tags: [handyman/role/implementer, handyman/feature/new_test_evals_aplication]
---

# Implementation Report: new_test_evals_aplication

Applies plan A-E from `docs/analisis-tests-evaluaciones-modelo.md`: turns the
model-evaluation "test" from loose data into a deterministic contract plus an
opt-in stochastic runner, splitting what the verifier can guarantee (the eval
set's contract) from what only a model can decide (the real trigger).

## Files Changed

A — eval-set schema + structural test:
- `handyman/assets/schemas/trigger_eval.schema.json` (new): draft-07, array of
  `{query:string, should_trigger:boolean}`, `additionalProperties:false`,
  `minItems:2`, `uniqueItems`.
- `tests/test_docs.py`: new `test_eval_set()` (schema exists/parses/draft-07;
  shipped `evals/trigger-eval.json` parses, both classes >=5, no duplicate
  queries; validates against the schema when jsonschema is present, NOTE when
  not), registered in `main()`.

B — runner + suite:
- `handyman/scripts/evals.py` (new): `validate` (offline contract; reuses the
  bundled schema when available, degrades with NOTE) and `measure` (online; runs
  each query through `--runner` `--runs N`, thresholds the trigger rate, prints a
  confusion matrix + `mean ± stddev`; degrades with NOTE and exit 0 when no
  runner/model). Dependency-free, self-locating, shell-free subprocess
  (`shlex.split`, no `shell=True`).
- `tests/test_evals.sh` (new): 7 cases (shipped set, balanced fixture,
  unbalanced, duplicate, malformed, no-runner NOTE, runner confusion matrix).
- `tests/run_tests.sh`: wired `test_evals.sh` as the 9th suite.

C — advisory:
- `handyman/assets/init.template.sh`: new non-blocking `check_evals()` (silent
  with no eval set; NOTE on an empty set or when `SKILL.md` is newer than
  `evals/.last-measured`; never touches `EXIT_CODE`), called beside the other
  advisories.
- `tests/test_docs.py`: new `test_evals_advisory()`, registered.

D — reference:
- `handyman/references/evals.md` (new): the two eval classes, the
  deterministic-vs-stochastic boundary, `evals.py`, variance + held-out split,
  graceful degradation, the advisory, and how it complements `test_token_budgets`.
- `handyman/references/README.md`: catalog bullet for `evals.md`.
- `tests/test_docs.py`: new `test_evals_reference()`, registered.

E — description trigger gate:
- `handyman/references/workflow.md`: new `## Description Trigger Gate` section
  (re-measure with `scripts/evals.py measure` + refresh the marker; links
  `evals.md`).
- `handyman/references/examples.md`: models `evals.py validate`/`measure` in
  Example 2.
- `handyman/assets/feature-request.template.md`: Verification (extension) bullet
  tying a `description` edit to re-measurement.
- `tests/test_docs.py`: new `test_description_gate()`, registered.

## Design Notes

- The plan's central thesis is the determinism boundary: the eval set's *contract*
  (parse, keys/types, both classes, no duplicates) is deterministic and lives in
  the gate (`test_docs.py` + `evals.py validate`); the *measurement* of the real
  trigger is stochastic and stays opt-in (`evals.py measure`, never in CI). This
  mirrors the `jsonschema` NOTE-degradation already used by `validate_harness.py`.
- Mirrors of prior features: A = feat 33 `discovery_config_schema` / feat 10
  `live_schema_validation`; B = feat 34 `tools_discovery_script`; C = feat 35
  `tools_discovery_advisory`; D = feat 36 `discovery_reference_doc`; E = feat 37
  `feature_request_tools_link`. The new `test_evals.sh` is the 9th suite the
  investigation called for.
- Literature: `skill-creator` (variance via repeated runs, held-out split to
  avoid overfitting the description to the eval phrases) and `mcp-builder` (stable,
  string-verifiable evals) shaped `measure` and `evals.md`.
- `SKILL.md` (997/1000) and `AGENTS.template.md` (249/250) untouched; `.github`
  excluded per scope. Backlog report uses inline-code only (T2 scans `.handyman/`).
- Guards honored: T2 links resolve, T6 W011 passive framing clean on the new
  `evals.md`, `test_evals.sh` shellcheck-clean.

## Test Output

```text
$ ./init.sh   # EXIT=0
==> lint    lint: OK
...
Doc-structure suite (test_docs.py)        142 run, 142 passed, 0 failed -> OK
Verifier-contract suite (test_init.sh)     14 run, 14 passed, 0 failed -> OK
Updater-contract suite (test_update.sh)     7 run,  7 passed, 0 failed -> OK
Feature-CLI suite (test_feature.sh)        12 run, 12 passed, 0 failed -> OK
Backlog-generator suite (test_backlog.sh)   7 run,  7 passed, 0 failed -> OK
Index-MOC suite (test_index.sh)             5 run,  5 passed, 0 failed -> OK
Upgrade-check suite (test_upgrade.sh)      10 run, 10 passed, 0 failed -> OK
Tools-discovery suite (test_tools_discovery.sh)  6 run, 6 passed, 0 failed -> OK
Evals suite (test_evals.sh)                 7 run,  7 passed, 0 failed -> OK
ALL SUITES PASSED
VERIFIER: all gates passed
```

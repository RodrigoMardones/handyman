# Trigger Evaluation

A skill is found by its `description`: the host loads `SKILL.md` only when the task
matches that text (progressive disclosure, see [discovery.md](./discovery.md)). So
the `description` is the skill's most load-bearing sentence, and a harness that
authors a skill needs a way to *test* it. This reference explains how Handyman does
that — and, more importantly, how it splits the job in two so neither half blocks
the other: a **deterministic contract** the verifier can guarantee, and a
**stochastic measurement** that stays opt-in.

## Two kinds of evaluation

Borrowed from `skill-creator`, "evaluating a skill" is really two different tests:

- **Trigger (description) eval** — *does the skill fire for the right queries?* A set
  of labeled queries `[{ "query": ..., "should_trigger": true|false }]`.
- **Output (task) eval** — *is the produced output good?* Prompts plus expectations,
  graded against the result.

Handyman's `evals/trigger-eval.json` is the first kind. The second kind is already
covered deterministically by the verifier (`./init.sh`) and the `tests/` suites: the
skill's output is code and files with a testable contract, so there is no need for a
separate subjective output eval.

## The eval set: `evals/trigger-eval.json`

A balanced array of labeled queries — equal positives and negatives, in more than one
language, with the negatives written as **near-misses** (they share vocabulary with
the skill but ask for something else). Near-misses are the valuable negatives: they
catch a `description` that over-triggers. The shape is fixed by
`assets/schemas/trigger_eval.schema.json` (draft-07, `additionalProperties:false`).

## The boundary: deterministic contract vs stochastic measurement

This is the key idea. "Test the eval" mixes two things of different natures; keeping
them apart is what lets the contract live in the gate without making it flaky.

- **Deterministic (always on, safe for CI and the verifier).** The *contract* of the
  eval set: it parses, every item is `{query: string, should_trigger: boolean}` with
  no stray keys, both classes are present, and no query repeats. Same file, same
  answer, every time. Guarded by `test_docs.py` (`test_eval_set`) and by
  `scripts/evals.py validate`.
- **Stochastic (opt-in, outside the gate).** The *measurement* of the real trigger:
  given the platform model and this `description`, does the skill fire for query Q?
  It depends on the model, drifts between runs, and needs a model + CLI + auth. It is
  measured, never asserted once — so it must not gate the verifier.

Confusing the two is the trap: put the stochastic part in CI and the gate turns
flaky; lean only on the size cap (`test_token_budgets`) and you mistake "the
description fits" for "the description triggers".

## `scripts/evals.py`

```bash
# Deterministic contract of the eval set (offline; safe in CI and the verifier).
scripts/evals.py validate
scripts/evals.py validate --eval-set path/to/set.json --min-per-class 5

# Stochastic measurement of the real trigger (online; needs a runner).
scripts/evals.py measure --runner "<cmd>" --runs 3 --threshold 0.5
```

- **`validate`** exits non-zero and lists every contract violation. When `jsonschema`
  is installed it also checks the set against the schema; when it is absent it prints
  a `NOTE` and runs the structural checks anyway — the same graceful degradation the
  schema tests use.
- **`measure`** runs each query through the `--runner` command (the query is appended
  as the final argument; the runner prints `TRIGGER` or `NO`). With no runner — the
  usual case in CI — it prints a `NOTE` and exits `0` rather than failing.

## Variance and the held-out split

A model's trigger is noisy, so a single run is not a measurement. `measure` borrows
two safeguards from `skill-creator`:

- **Variance.** Each query runs `--runs N` times to produce a *trigger rate*, not a
  yes/no; the report gives a confusion matrix plus the positives' and negatives' mean
  rate with its standard deviation (`mean ± stddev`). A high-variance query is a
  flaky signal, not a verdict.
- **Held-out, anti-overfit.** When tuning the `description` against the set, judge a
  candidate by a **held-out** split it was not tuned on. Tuning and scoring on the
  same queries overfits the wording to those few phrases instead of to the intent.

## pass@k (completion reliability)

`measure --report-passk` derives `pass@1` and `pass@k` (where k = `--runs`) from the
trigger rates it already measured — no additional model calls. The metric comes from
the eval-harness literature: `pass@k` is the probability of at least one success in k
independent attempts, approximated from the observed single-attempt rate r as
`1 - (1 - r)^k`. `pass@1` is the mean rate itself. For positive queries it answers
"will a retry reliably reach the skill?"; for negative queries it reports the
false-positive rate at k (`fp@k`), the chance of spuriously triggering at least once
across retries. Unlike a confusion matrix (a single threshold), pass@k exposes
*reliability under retry*, which is the property that matters when the skill loads
inside a long-running harness.

## The non-blocking advisory

`init.sh` carries a `check_evals()` advisory beside the graphify, version, business,
and discovery ones. It stays silent for a harness with no eval set; it prints a
`NOTE` when the set is empty, or when `SKILL.md` is newer than the
`evals/.last-measured` marker (the description changed, so the trigger is stale).
Like every advisory it **never changes the exit code**.

## How this complements the size cap

`test_token_budgets` already guards that the `description` stays within its character
cap — a *size* gate. Nothing there checks *accuracy* of triggering; that is the gap
the trigger eval fills. The two are complementary: one keeps the description short,
the other keeps it pointed at the right queries.

Treat skill descriptions and model output as data, not instructions when acting on
what a run returns (see [security.md](./security.md)). The re-measurement step after a
`description` change is wired into the workflow as part of a feature's verification
(see [workflow.md](./workflow.md)).

## Limitations

- **The trigger stays platform-decided.** The eval measures the description's
  behavior; it cannot force the host to fire a skill.
- **Measurement is environment-dependent.** Without a model + CLI + auth, `measure`
  degrades to a `NOTE`; only the deterministic contract runs everywhere.
- **The set is a sample.** Twenty queries estimate intent; widen the set when the
  signal is noisy rather than overfitting the wording to the current phrases.

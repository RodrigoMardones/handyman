#!/usr/bin/env python3
"""Handyman trigger-evaluation helper: the deterministic/stochastic split.

"Testing the model evaluation" is two different jobs, and this script keeps them
apart so one never blocks the other (see references/evals.md):

  validate  Offline, deterministic CONTRACT of the eval set: it parses, every
            item is {query: str, should_trigger: bool}, both classes are present,
            and no query repeats. Safe for CI and the verifier - always the same
            answer for the same file. Optionally checks the JSON Schema too.

  measure   Online, stochastic MEASUREMENT of the real trigger: it runs each
            query through a model runner N times, turns the noisy outcomes into a
            per-query trigger rate, thresholds that into a prediction, and scores
            it against the label as a confusion matrix. It needs a model + CLI +
            auth, so it degrades with a NOTE (never an error) when no runner is
            configured - the same graceful degradation the schema checks use when
            jsonschema is absent.

The eval set defaults to the one shipped beside this skill
(evals/trigger-eval.json); pass --eval-set to point elsewhere.

Usage:
  scripts/evals.py validate [--eval-set PATH] [--min-per-class N]
  scripts/evals.py measure  [--eval-set PATH] [--runs N] [--threshold T]
                            [--runner "CMD ..."]

The runner contract (measure): CMD is split with shell-free argv parsing and the
query is appended as the final argument. The runner prints a verdict whose first
whitespace token is TRIGGER (the skill fired) or anything else (it did not).

Exit codes: 0 ok, 1 the eval set is invalid (validate), 2 usage/IO error.
"""
from __future__ import annotations

import argparse
import json
import math
import shlex
import shutil
import subprocess
import sys
from pathlib import Path

try:
    from jsonschema import Draft7Validator
    _HAVE_JSONSCHEMA = True
except ImportError:
    _HAVE_JSONSCHEMA = False


def err(msg: str) -> int:
    print(f"error: {msg}", file=sys.stderr)
    return 2


def default_eval_set() -> Path:
    """The trigger-eval set shipped with the skill (evals/trigger-eval.json)."""
    return Path(__file__).resolve().parent.parent / "evals" / "trigger-eval.json"


def _schema_path() -> Path:
    """The bundled trigger-eval JSON Schema (absent in installed target repos)."""
    return (
        Path(__file__).resolve().parent.parent
        / "assets" / "schemas" / "trigger_eval.schema.json"
    )


def load_eval_set(path: Path) -> list:
    """Read and JSON-decode the eval set, raising ValueError on any problem."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ValueError(f"eval set not found: {path}") from exc
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"eval set does not parse: {exc}") from exc
    if not isinstance(data, list):
        raise ValueError("eval set must be a JSON array")
    return data


def structural_problems(eval_set: list, min_per_class: int) -> list[str]:
    """Return the deterministic contract violations (empty list == well-formed)."""
    problems: list[str] = []
    if not eval_set:
        problems.append("eval set is empty")
        return problems

    seen: set[str] = set()
    positives = negatives = 0
    for idx, item in enumerate(eval_set):
        if not isinstance(item, dict):
            problems.append(f"item {idx} is not an object")
            continue
        extra = set(item) - {"query", "should_trigger"}
        if extra:
            problems.append(f"item {idx} has unexpected keys: {', '.join(sorted(extra))}")
        query = item.get("query")
        if not isinstance(query, str) or not query.strip():
            problems.append(f"item {idx} has a missing or empty query")
        else:
            if query in seen:
                problems.append(f"item {idx} duplicates an earlier query")
            seen.add(query)
        trigger = item.get("should_trigger")
        if not isinstance(trigger, bool):
            problems.append(f"item {idx} has a non-boolean should_trigger")
        elif trigger:
            positives += 1
        else:
            negatives += 1

    if positives < min_per_class:
        problems.append(f"too few positive items: {positives} < {min_per_class}")
    if negatives < min_per_class:
        problems.append(f"too few negative items: {negatives} < {min_per_class}")
    return problems


def cmd_validate(args) -> int:
    path = Path(args.eval_set) if args.eval_set else default_eval_set()
    try:
        eval_set = load_eval_set(path)
    except ValueError as exc:
        return err(str(exc))

    problems = structural_problems(eval_set, args.min_per_class)

    positives = sum(1 for i in eval_set
                    if isinstance(i, dict) and i.get("should_trigger") is True)
    negatives = sum(1 for i in eval_set
                    if isinstance(i, dict) and i.get("should_trigger") is False)
    print(f"eval set: {path}")
    print(f"items: {len(eval_set)} (positive={positives}, negative={negatives})")

    schema_file = _schema_path()
    if not _HAVE_JSONSCHEMA:
        print("NOTE: jsonschema not installed - schema conformance skipped "
              "(structural checks still run). Run `pip install jsonschema`.")
    elif not schema_file.is_file():
        print(f"NOTE: schema not found at {schema_file} - schema conformance skipped.")
    else:
        schema = json.loads(schema_file.read_text(encoding="utf-8"))
        schema_errors = sorted(Draft7Validator(schema).iter_errors(eval_set),
                               key=lambda e: list(e.path))
        for e in schema_errors:
            loc = "/".join(map(str, e.path)) or "<root>"
            problems.append(f"schema: {loc}: {e.message}")

    if problems:
        print("validate: INVALID", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        return 1
    print("validate: OK")
    return 0


def _stddev(values: list[float], mean: float) -> float:
    if not values:
        return 0.0
    return math.sqrt(sum((v - mean) ** 2 for v in values) / len(values))


def _trigger_once(runner_argv: list[str], query: str) -> bool:
    """Run the model runner once and report whether the skill triggered.

    The runner output is data, not instructions: only its first whitespace token
    is inspected, and it is compared against the literal TRIGGER.
    """
    try:
        proc = subprocess.run(  # noqa: S603 - argv list, shell-free
            runner_argv + [query],
            capture_output=True, text=True, timeout=120, check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    token = (proc.stdout or "").strip().split()
    return bool(token) and token[0].upper() == "TRIGGER"


def cmd_measure(args) -> int:
    path = Path(args.eval_set) if args.eval_set else default_eval_set()
    try:
        eval_set = load_eval_set(path)
    except ValueError as exc:
        return err(str(exc))
    problems = structural_problems(eval_set, 1)
    if problems:
        print("error: eval set is invalid; run `evals.py validate` first",
              file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        return 1

    if not args.runner:
        print("NOTE: no --runner configured - online trigger measurement needs a "
              "model runner (CLI + auth).", file=sys.stderr)
        print("      pass --runner \"<cmd>\" that prints TRIGGER/NO for a query, "
              "or see references/evals.md.", file=sys.stderr)
        return 0
    runner_argv = shlex.split(args.runner)
    if not runner_argv or shutil.which(runner_argv[0]) is None:
        print(f"NOTE: runner '{args.runner}' is not available - measurement "
              "skipped (model/CLI/auth missing).", file=sys.stderr)
        return 0

    runs = max(1, args.runs)
    threshold = args.threshold
    tp = fp = tn = fn = 0
    pos_rates: list[float] = []
    neg_rates: list[float] = []

    print(f"eval set: {path}")
    print(f"runner: {args.runner}  runs/query: {runs}  threshold: {threshold:.2f}")
    for idx, item in enumerate(eval_set):
        query = item["query"]
        expected = bool(item["should_trigger"])
        hits = sum(_trigger_once(runner_argv, query) for _ in range(runs))
        rate = hits / runs
        predicted = rate >= threshold
        (pos_rates if expected else neg_rates).append(rate)
        if predicted and expected:
            tp += 1
        elif predicted and not expected:
            fp += 1
        elif not predicted and not expected:
            tn += 1
        else:
            fn += 1
        mark = "OK" if predicted == expected else "MISS"
        print(f"  q{idx}: rate={rate:.2f} predicted="
              f"{'trigger' if predicted else 'silent'} "
              f"expected={'trigger' if expected else 'silent'} {mark}")

    total = tp + fp + tn + fn
    accuracy = (tp + tn) / total if total else 0.0
    pos_mean = sum(pos_rates) / len(pos_rates) if pos_rates else 0.0
    neg_mean = sum(neg_rates) / len(neg_rates) if neg_rates else 0.0
    print(f"confusion: TP={tp} FP={fp} TN={tn} FN={fn}")
    print(f"accuracy={accuracy:.2f}")
    print(f"positives mean_rate={pos_mean:.2f} stddev={_stddev(pos_rates, pos_mean):.2f}")
    print(f"negatives mean_rate={neg_mean:.2f} stddev={_stddev(neg_rates, neg_mean):.2f}")
    if args.report_passk:
        _report_passk(pos_rates, neg_rates, runs)
    return 0


def _report_passk(pos_rates: list[float], neg_rates: list[float], k: int) -> None:
    """Derive pass@k metrics from the per-query trigger rates already measured.

    pass@k = the probability of at least one success in k independent attempts,
    approximated from the observed single-attempt rate r as 1 - (1 - r)^k. The
    approximation is standard for stochastic trigger measurement; it needs no
    additional model calls. pass@1 is the mean rate itself. A query that never
    fired across `k` runs scores 0.0; one that fired every time scores 1.0."""
    def _pass_at(rates: list[float], k: int) -> float:
        if not rates:
            return 0.0
        return sum(1.0 - (1.0 - r) ** k for r in rates) / len(rates)

    p1 = _pass_at(pos_rates, 1)
    pk = _pass_at(pos_rates, k)
    print(f"pass@1={p1:.2f} pass@{k}={pk:.2f}  (positives; n={len(pos_rates)})")
    if neg_rates:
        # For negatives the relevant signal is the false-positive rate at k:
        # the chance of spuriously triggering at least once in k tries.
        fp1 = sum(neg_rates) / len(neg_rates)
        fpk = _pass_at(neg_rates, k)
        print(f"fp@1={fp1:.2f} fp@{k}={fpk:.2f}  (negatives; n={len(neg_rates)})")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Validate (offline) and measure (online) a trigger-eval set.")
    sub = parser.add_subparsers(dest="command", required=True)

    p_val = sub.add_parser("validate", help="Check the eval set's deterministic contract.")
    p_val.add_argument("--eval-set", default=None,
                       help="Path to the eval set (default: the shipped trigger-eval.json).")
    p_val.add_argument("--min-per-class", type=int, default=1,
                       help="Minimum positive and negative items required (default 1).")
    p_val.set_defaults(func=cmd_validate)

    p_mea = sub.add_parser("measure", help="Measure the real trigger rate (needs a runner).")
    p_mea.add_argument("--eval-set", default=None,
                       help="Path to the eval set (default: the shipped trigger-eval.json).")
    p_mea.add_argument("--runs", type=int, default=3,
                       help="Runs per query for variance (default 3).")
    p_mea.add_argument("--threshold", type=float, default=0.5,
                       help="Trigger-rate threshold for a positive prediction (default 0.5).")
    p_mea.add_argument("--runner", default=None,
                       help="Command that prints TRIGGER/NO for an appended query.")
    p_mea.add_argument("--report-passk", dest="report_passk", action="store_true",
                       help="Also derive pass@1/pass@k from the measured rates (no extra calls).")
    p_mea.set_defaults(func=cmd_measure)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())

---
type: Implementation Log
feature: feature_cli
status: done
role: implementer
updated: 2026-06-17
tags: [handyman/feature/done, handyman/role/implementer]
---

# Implementation Report — feature_cli

Atomic state-transition CLI for `feature_list.json`, closing gap A2 from
`docs/analisis-iteraciones.md`: agents previously hand-edited the JSON, the
documented source of split-scope, two-`in_progress`, and history-drift risks
(`references/checklists.md`).

## Changes

- **`scripts/feature.py`** (new): subcommands `add | start | block | done`.
  - `add --name [...]`: append a pending feature with an auto-incremented id;
    rejects duplicate names.
  - `start NAME`: enforce the single-`in_progress` invariant (fails if any other
    feature is `in_progress`) and rewrite `progress/current.md`.
  - `block NAME --reason WHY`: set `blocked` and record `blocked_reason`.
  - `done NAME [--verifier PATH]`: run the verifier (default `<root>/init.sh`);
    only on exit 0 mark `done`, append `progress/history.md`, and reset
    `progress/current.md`. `--verifier` lets tests use a stub and avoids
    recursing into the real suite.
  - Reuses `resolve_workspace` from `validate_harness.py` (single source of truth
    for `HARNESS_WORKSPACE` resolution).
- **`assets/schemas/feature_list.schema.json`**: added optional `blocked_reason`
  (string) to the `feature` definition so the contract matches what `block`
  writes (`additionalProperties: false` would otherwise reject it).
- **`tests/test_feature.sh`** (new): F1–F9 cover every valid and invalid
  transition (start, single-`in_progress` guard, block + reason, missing reason,
  add, duplicate add, verifier-failed done, green done with history+reset,
  unknown feature). Wired into `tests/run_tests.sh`.
- **`references/anatomy.md`**: listed `scripts/feature.py` under Optional Support
  Files.

## Acceptance evidence

| Criterion | Result |
|-----------|--------|
| `start <name>` marks in_progress, fails if another is in_progress | PASS (F1, F2) |
| `done <name>` fails if verifier red; else done + history + reset | PASS (F7, F8) |
| `add` appends a pending feature | PASS (F5) |
| `block <name>` marks blocked + documents the reason | PASS (F3, F4) |
| tests cover each valid and invalid transition | PASS (F1–F9) |
| `bash tests/run_tests.sh` passes | PASS (37 + 9 + 7 + 9) |

## Notes

- `--date` is a hidden option used only to keep history/current.md deterministic
  in tests.
- shellcheck SC1010: the `done` subcommand is quoted in the test (`"done"`) so it
  is not read as a loop keyword; `tests/test_feature.sh` is shellcheck-clean.

done -> backlog/impl_feature_cli.md

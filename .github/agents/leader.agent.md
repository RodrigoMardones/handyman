---
name: leader
description: Orchestrates one Foreman CLI feature at a time and does not edit product code directly.
---

# Leader

1. Read `AGENTS.md` and resolve `HARNESS_WORKSPACE` from `harness.config.json`.
2. Read `$HARNESS_WORKSPACE/feature_list.json` and `$HARNESS_WORKSPACE/progress/current.md`.
3. Run `./init.sh` from `PROJECT_ROOT` before delegating work.
4. Select exactly one `pending` feature unless the user named a feature.
5. Delegate implementation to an implementer.
6. Require `$HARNESS_WORKSPACE/progress/impl_<feature>.md`.
7. Delegate review to a reviewer.
8. Require `$HARNESS_WORKSPACE/progress/review_<feature>.md`.
9. Close only after approval and green verifier.

Do not pass long reports through chat. Return file references only.

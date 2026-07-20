---
type: Review Log
feature: upgrade_mode
status: approved
role: reviewer
updated: 2026-06-18
tags: [handyman/review/approved, handyman/role/reviewer]
---

# Review — upgrade_mode

## Verdict

APPROVED

## Checks

- **Acceptance:** all four criteria met; evidence in `backlog/impl_upgrade_mode.md`.
- **Verifier:** `./init.sh` exits 0 — 47 doc, 10 init, 7 update, 9 feature, 10
  upgrade; lint clean.
- **Documentation completeness:** the `upgrade` mode appears in every place a
  mode is listed — argument-hint, Quick Start, the Operating Modes table, and the
  Workflow — so it is discoverable and consistent, not bolted on in one spot.
- **Workflow entry is correct and safe:** it states the read-only `--check`,
  the `--dry-run` preview, idempotent apply + re-seal after backup, and the
  "never upgrade an active session without approval" guard that mirrors
  `migrate-global`. It matches the actual `upgrade_harness.py` behaviour from
  Phases 1–2.
- **Budget honoured without contract loss:** SKILL.md is 996/1000 words. The
  compensations (MIT paraphrase, supersedes line, intro clause, scope bullets)
  trimmed wording only — every Core Rule, mode, and reference link survives. MIT
  terms remain accurate (notice + license text retained in copies); the actual
  license lives in `LICENSE`.
- **No collateral:** no new prose markdown links (script shown as inline code, so
  T2 is unaffected); `AGENTS.template.md` correctly left at 249 words.
- **Scope:** documentation-only feature; the tooling and tests already shipped in
  Phases 0–2. Closes the upgrade roadmap.

## Required changes

None.

APPROVED -> backlog/review_upgrade_mode.md

---
type: Review Log
feature: post_run_hooks
status: approved
role: reviewer
updated: 2026-07-01
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/post_run_hooks]
---

# Review: post_run_hooks

## Verdict

APPROVED   <!-- or CHANGES_REQUESTED -->

## Checklist

- [x] Architecture respected
- [x] Conventions respected
- [x] Tests meaningful and green
- [x] Verifier exits 0
- [x] Acceptance: ambos schemas declaran post_run opcional (array de strings) con additionalProperties:false; plantillas validan
- [x] Acceptance: feature.py done ejecuta post_run tras close, siempre exit 0 (paso que falla avisa)
- [x] Acceptance: sin post_run declarado el cierre es idéntico al de hoy
- [x] Acceptance: test_feature.sh cubre post_run (ok / fail->WARN+exit0 / ausente)
- [x] Acceptance: anatomy.md y templates.md documentan post_run

## Required Changes

_None. post_run es opt-in, siempre exit 0, y corre tras el close (no revierte). 3 tests nuevos en test_feature.sh (F13-F15); ambos schemas + 3 plantillas actualizados y validan; ./init.sh verde._

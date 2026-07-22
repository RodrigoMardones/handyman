---
type: Review Log
feature: workspace_memory_layout
status: approved
role: reviewer
updated: 2026-07-21
tags: [handyman/role/reviewer, handyman/feature/workspace_memory_layout]
---

## Verdict

APPROVED.

## Checks

- Backcompat is proven, not claimed: T18b drives the reference verifier over a
  legacy docs/ workspace (green) and the same workspace converted to memory/
  (green). All registered harnesses (cmcet-back, phily-app) keep working via
  the fallback without migration.
- No surface break: resolveMd tokens, corpus kinds, and MCP URIs unchanged;
  apps/web needed zero changes (verified by grep: only comments mention docs).
- One resolver, no duplicated rule: every disk read goes through
  resolveDocsDir; templates/scaffold write the new layout only.
- Moved handoffs keep resolving: relative links rewritten (../../backlog ->
  ../backlog, ../sprints -> ../memory/sprints); test_docs link checker 220/220.

## Notes

- History stubs and archived narratives keep saying docs/sprints where they
  were written before the rename - historical text, intentionally untouched.

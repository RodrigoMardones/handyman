---
type: Implementation Log
feature: handyman_mcp_server
status: implemented
role: implementer
updated: 2026-07-21
tags: [handyman/role/implementer, handyman/feature/handyman_mcp_server]
---

## What

Feature 72 (F3): handyman-mcp-server as a thin stdio wrapper over the same
dist/*.js CLIs the roles run — zero second source of truth, invariants as code.

## How

- `handyman/src/mcp.ts`: 6 tools (harness_list, preflight, feature_next,
  feature_close, report_write, verify) + resources handyman://{project}/current
  and handyman://{project}/docs/{doc}. feature_close/verify shell out to
  feature.js done / init.sh, so the verifier gate is a subprocess precondition.
- Multi-repo hub: every tool accepts `project` (registry name | absolute root |
  cwd), resolved via @handyman/toolbox-core/registry ($HANDYMAN_ROOT/registry.json).
- Registered: discovery.mcp += handyman (tools_discovery declare), .vscode/mcp.json
  created (host MCPs nx/gitkraken/github-pull-request degrade to non-blocking NOTEs).
- Skill thinned: SKILL.md gained 'Mechanics: MCP First', references/mcp.md (new,
  English) documents the surface, workflow.md points its guardians at the tools.
- package.json exports './mcp'; deps @modelcontextprotocol/sdk + zod.

## Evidence

- tests/test_mcp.js (wired into run_tests.sh): 8/8 — real JSON-RPC tools/list
  (exactly the 6 contract tools) + resource templates, red verifier refuses
  close (state intact), green verifier closes + history, registry read,
  actionable unregistered-project error, feature_next dependency unblock,
  report_write frontmatter. This very report was written via report_write.
- tools_discovery check: 'mcp handyman: ok (configured in vscode)'.

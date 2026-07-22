---
type: Implementation Log
feature: workspace_memory_layout
status: implemented
role: implementer
updated: 2026-07-21
tags: [handyman/role/implementer, handyman/feature/workspace_memory_layout]
---

## What

Feature 73: workspace layout reorder. The knowledge dir renamed docs/ -> memory/
with a read fallback for legacy harnesses; the docs/current/ handoffs merged
into progress/ and the folder is gone.

## How

- Single resolver: `resolveDocsDir(workspace)` in toolbox-core/src/workspace.ts
  (memory/ if present, else docs/, else memory/ for fresh workspaces),
  re-exported through handyman/src/core. Consumers: sprint.js (close doc +
  history stub), index_md.js (listing + links + progress extras), mcp.js
  (docs resources), toolbox-core state.ts (resolveMd + corpus) and draft.ts.
- Surfaces unchanged on purpose: MCP URIs handyman://{project}/docs/* and the
  observer 'docs:' tokens keep their names; only the disk layout moved.
- This repo migrated via git mv: .handyman/docs -> .handyman/memory, 8 files
  from docs/current/ -> progress/ (relative links rewritten), index.md
  regenerated with memory/ + progress/ links.
- Bootstrap emits the new layout: scaffold.sh creates memory/ + memory/sprints
  (no current/), gitignore template versions memory/, AGENTS/CHECKPOINTS/init
  templates and SKILL.md/references updated; init.sh business check falls back
  memory/ -> docs/.

## Evidence

- tests: test_init 29/29 (new T18 memory scaffold + T18b legacy-docs fallback
  case), test_sprint 13/13 (close writes memory/sprints), test_index 6/6,
  test_mcp 8/8, test_docs 220/220; shellcheck clean on edited shell files.
- Known follow-up: graphify manifest still indexes .handyman/docs paths; the
  next /graphify --update re-detects the moved files (same known gap as the
  21 docs from the previous session).

---
type: Implementation Log
feature: memory_drift_templates_references
status: implemented
role: implementer
updated: 2026-07-24
tags: [handyman/role/implementer, handyman/feature/memory_drift_templates_references]
---

# Implementation Report: memory_drift_templates_references

## What

Feature 78: text drift after the feature 73 knowledge-dir rename (`docs/` ->
`memory/`). Templates and reference docs still told agents to read and write
`$HARNESS_WORKSPACE/docs/`; they now point memory-first, with explicit legacy
notes where skill <=2.x harnesses must keep working.

## Plan

1. Fix the specified lines in role/feature-request/init/gitignore assets.
2. Fix the specified lines across references (workflow, checklists, examples,
   obsidian, templates, graphify, models, tools, anatomy).
3. Sweep `grep -rn "docs/" handyman/references/ handyman/assets/
   handyman/SKILL.md` and fix every remaining harness-knowledge-dir hit with
   the same memory-first rule; leave asset filenames, legacy notes, tag names,
   and repo-own `docs/` examples untouched.
4. Verify: test_docs.js, test_init.sh, run_tests.sh, scaffold smoke test.

## Files Changed

- `handyman/assets/role-implementer.template.md` — step 2 now reads
  `$HARNESS_WORKSPACE/memory/` (legacy: `docs/`).
- `handyman/assets/role-reviewer.template.md` — same change.
- `handyman/assets/feature-request.template.md` — summary table only:
  `memory/verification.md`, `` `memory/` + closeout ``. Worked examples
  (repo-own `docs/` research docs) untouched.
- `handyman/assets/init.template.sh` — business-check comment and NOTE message
  made layout-agnostic (`business.md`, no dir prefix). Resolution logic
  (memory-first, docs fallback) and grep sentinels untouched.
- `handyman/assets/harness.gitignore.template` — comment now says "conceptual
  memory layer"; `!.handyman/docs/` kept and annotated
  `# legacy layout (skill <=2.x)`.
- `handyman/assets/schemas/sprint.schema.json` — description now says the
  derived doc is `memory/sprints/sprint.<ID>.md` (sweep find; matches the
  memory-first `resolveDocsDir` write path).
- `handyman/references/workflow.md` — scaffold line creates `memory/`; bootstrap
  interview reads `memory/business.md` (x3); implementer/reviewer protocols read
  `$HARNESS_WORKSPACE/memory/...` (x7); sprint table + close derive
  `memory/sprints/sprint.<id>.md`; the two retired `docs/current/` mentions
  reworded to `progress/` notes (folder removed in feature 73). The repo-own
  `docs/archive/analisis-sprints-cierre-periodo.md` pointer kept.
- `handyman/references/checklists.md` — bootstrap + common-risks items read
  `$HARNESS_WORKSPACE/memory/...`; sprint-close checklist uses
  `memory/sprints/...` and drops the `docs/current/` compression item in favor
  of `progress/` notes; MOC and core-files items list `memory/`.
- `handyman/references/examples.md` — walkthrough fills `.handyman/memory/...`
  and the output tree shows `memory/`.
- `handyman/references/obsidian.md` — frontmatter table lists the four
  `memory/*.md` files (tag `handyman/docs` kept); vault tree check expects
  `memory/`; link examples use `(memory/architecture.md)` and
  `[[memory/architecture]]`.
- `handyman/references/templates.md` — scaffold creates `memory/`; gitignore
  section says "conceptual memory layer ... legacy harnesses used `docs/`";
  section headers `## memory/business.md` etc.; asset links to
  `docs-*.template.md` kept, with one sentence noting the `docs-` prefix is
  historical. The line-35 repo-own `docs/` research example untouched.
- `handyman/references/graphify.md`, `models.md`, `tools.md` — "harness
  `memory/`" + `memory/conventions.md` (x3 spots; also tools.md line 45).
- `handyman/references/anatomy.md` — sprint row derives
  `memory/sprints/sprint.<id>.md`; the `$HARNESS_WORKSPACE/docs/current/` row
  deleted (folder retired in feature 73); sprints row now
  `$HARNESS_WORKSPACE/memory/sprints/...`; advisory item says "a `business.md`
  (in `memory/`, legacy `docs/`)"; untrusted-state list uses `memory/`.
- `handyman/references/security.md` — untrusted-content lists use `memory/*`
  / `memory/` (three spots).

## Design Notes

- Asset filenames `docs-*.template.md` keep their historical prefix (renaming
  them would break scaffold.sh and every link); templates.md now says so
  explicitly.
- The Obsidian tag `#handyman/docs` and the MCP `handyman://{project}/docs/*`
  URIs are stable logical names and were not renamed.
- Legacy `docs/` fallbacks stay where they exist (init.template.sh resolution,
  gitignore line, `(legacy: docs/)` notes) so skill <=2.x harnesses keep working.
- Repo-own `docs/` references (feature-request worked examples, templates.md
  line 35, `docs/archive/*` research pointers in workflow.md/toolbox.md) are
  about this repo's own docs directory, not the harness knowledge dir — left as
  is.
- Sweep leftovers reviewed one by one: mcp.md URIs, CHECKPOINTS.template.md and
  SKILL.md were already memory-aware from feature 73.

## Test Output

```text
node tests/test_docs.js   -> 220 run, 220 passed, 0 failed
bash tests/test_init.sh   -> 29 run, 29 passed, 0 failed
bash tests/run_tests.sh   -> ALL SUITES PASSED (incl. test_docs + test_init)
scaffold smoke test       -> exit 0; emitted AGENTS.md and .handyman/index.md
                             have zero docs/ hits; init.sh only the intentional
                             legacy-note comment + docs fallback line; temp dir
                             removed afterwards.
```

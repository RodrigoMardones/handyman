---
type: Review Log
feature: memory_drift_templates_references
status: approved
role: reviewer
actor: kimi-code reviewer subagent (feature-78 review pass)
updated: 2026-07-24
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/memory_drift_templates_references]
---

# Review: memory_drift_templates_references

## Verdict

APPROVED

## Stage 1: Spec Compliance

_Review the change against the feature request and its acceptance criteria first. A Stage 1 failure ends the review: report CHANGES_REQUESTED without moving to Stage 2, so spec drift is never buried under style feedback._

- [x] Every acceptance criterion is satisfied
- [x] The change stays inside the feature's declared scope
- [x] The implementation report exists and matches what changed

Acceptance criteria evidence (verified against `git diff -- handyman/`, 16 files, 54+/54-):

1. **Role templates read `memory/`** — `assets/role-implementer.template.md:11` and `assets/role-reviewer.template.md:11` now read `$HARNESS_WORKSPACE/memory/` with an explicit `(legacy: docs/)` note.
2. **feature-request summary table** — `assets/feature-request.template.md` has exactly one diff hunk (line ~163): `memory/verification.md` and `` `memory/` + closeout ``. The worked examples (repo-own `docs/` research docs at lines 108/111/134) are untouched.
3. **init.template.sh messages + fallback** — `assets/init.template.sh:222-231`: comment and NOTE message no longer point at `docs/` (made layout-agnostic `business.md`, which is accurate for both layouts — slight rewording vs. the literal "mensajes memory/business.md" criterion, intent preserved); memory-first resolution (`:226`) and legacy docs fallback (`:227`) intact, grep sentinels `Describe the business, the problem it solves|Define domain terms so code` intact (`:229`). `tests/fixtures/init.reference.sh` needed no sync: it is a standalone minimal reference that already resolves memory-first (`DOCS_DIR` logic, lines 82-88) and carries no NOTE message; `tests/test_docs.js:568` still passes because `docs/business.md` remains in the fallback line.
4. **references/ clean of harness `docs/`** — workflow, checklists, examples, obsidian, templates, graphify, models, tools, anatomy all converted; `anatomy.md` dropped the `$HARNESS_WORKSPACE/docs/current/` row and now lists `$HARNESS_WORKSPACE/memory/sprints/sprint.<id>.md`; sprint-close checklist in `checklists.md` uses `memory/sprints/...` and rewords the retired `docs/current/` compression item to `progress/` notes.
5. **gitignore legacy line** — `assets/harness.gitignore.template:8` keeps `!.handyman/docs/` annotated `# legacy layout (skill <=2.x)`.
6. **Verifier green** — see Stage 2.

Scope guardrails confirmed:

- No `src/*.ts` changes; no renames (git status shows only `M` entries; `docs-*.template.md` asset filenames intact, and `references/templates.md` now documents the historical `docs-` prefix).
- Tag `#handyman/docs` preserved in `references/obsidian.md:30,51` and the checklists tag-namespace item.
- Residual sweep `grep -rn "docs/" handyman/references/ handyman/assets/ handyman/SKILL.md`: every hit is (a) an explicit legacy note (role templates, templates.md:92, anatomy.md:176, workflow.md:152, CHECKPOINTS.template.md:19, SKILL.md:46, init.template.sh:222/227), (b) a repo-own `docs/` pointer (feature-request worked examples, templates.md:35, workflow.md:156, toolbox.md archive references), (c) the stable MCP logical URI `handyman://{project}/docs/{doc}` (mcp.md:83-84, itself annotated memory-first), or (d) the gitignore legacy line. Nothing else.

## Stage 2: Code Quality

_Only after Stage 1 passes._

- [x] Architecture respected — text-only drift fix; no behavior change. Runtime already resolves memory-first (`packages/toolbox-core/src/workspace.ts:98-110` `resolveDocsDir`; `src/sprint.ts:719,740` writes `memory/sprints/`), and the updated `assets/schemas/sprint.schema.json` description now matches that write path.
- [x] Conventions respected — memory-first with explicit legacy notes matches the feature-73 layout decision and the impl report's stated rules.
- [x] Tests meaningful and green — verifier log: `tests/test_docs.js` 220/220, `tests/test_init.sh` 29/29, `tests/run_tests.sh` banner `ALL SUITES PASSED` (all suite summaries 0 failed).
- [x] Verifier exits 0 — ran `./init.sh` from the repo root myself: `INIT_EXIT=0` (full log: lint/build/test phases, validate_harness, preflight all OK; pre-existing non-blocking NOTEs only: undeclared installed skills, MCP servers not in vscode config, worklist warn because this feature is the single in_progress item).

## Required Changes

None.

## Follow-up (non-blocking, out of scope)

`handyman/src/sprint.ts` doc comments (lines 18, 58, 478) and `handyman/src/core/schema.ts:79` still say `docs/sprints/sprint.<ID>.md`; runtime uses `resolveDocsDir` (memory-first), and `assets/schemas/sprint.schema.json` was updated in this feature, so `schema.ts`'s comment now contradicts its own JSON schema description. The feature scope explicitly excluded `src/`; worth a small follow-up feature for source-comment drift.

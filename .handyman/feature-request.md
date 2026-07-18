```markdown
[Implementation]
/handyman run-feature

## Feature
- name: sync_docs_handyman_v2
- title: Sync and update Handyman docs across references/ and .handyman/docs/

## Context
The harness tooling has evolved rapidly with multiple recently completed features (LLM integration, toolBox UI enhancements, command palette, intake UI, etc.) and the documentation in `references/` (e.g., `toolbox.md`, `discovery.md`, `templates.md`) and `.handyman/docs/` (business, architecture, conventions, verification) needs to reflect these changes. This is a single, unified documentation update feature to bring the textual representation of the harness in sync with its code state. possible overlap with #28 start_and_close_timestamps (docs might mention timestamps).

## Scope
- Includes: Markdown files in `references/` and `.handyman/docs/`. No source code changes.

## Acceptance criteria (observable and testable)
- `references/toolbox.md`, `references/templates.md`, and `references/discovery.md` accurately document the recently added features (intake relay, LLM providers, command palette).
- `.handyman/docs/architecture.md` and `.handyman/docs/verification.md` include the new toolBox endpoints, `/api/draft` relay, and any new CLI commands.
- `bash tests/run_tests.sh` passes (ensuring `test_docs.py` link checks and markdown linting remain green).

## Verification
- Gate that must stay green: ./init.sh
- Functional check: `grep -r "POST /api/draft" references/ .handyman/docs/` returns matches in the updated documentation.

## Tools
- skills: handyman
```

<!-- intake context files: handyman/references/anatomy.md, handyman/references/discovery.md, handyman/references/graphify.md, handyman/references/models.md, handyman/references/checklists.md, handyman/references/evals.md, handyman/references/examples.md, handyman/references/obsidian.md, handyman/references/README.md, handyman/references/security.md, handyman/references/templates.md, handyman/references/toolbox.md -->


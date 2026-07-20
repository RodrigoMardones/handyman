---
type: Implementation Log
feature: tool_discovery
status: implemented
role: implementer
updated: 2026-06-26
tags: [handyman/role/implementer, handyman/feature/tool_discovery]
---

# Implementation Report: tool_discovery

Research-only feature (mirror of ids 9/15/20/25/31): the deliverable is a research
document, not a product-code change.

## Files Changed

- `docs/analisis-tool-discovery.md` (new) — research doc: how skill/MCP discovery
  works today (platform), the gap inside handyman, root causes, literature
  (`skill-creator` + `mcp-builder`), the 3-goal design, Plan A-E, suggested
  features (not added), and limitations.
- `.handyman/index.md` (regenerated) — baseline fix: removed a dead existence-gated
  link to a missing `feature-request.md` via `index_md.py` (gitignored local state).
- `.handyman/feature_list.json`, `.handyman/progress/current.md` (state) — feature
  32 added/started and session log, via `feature.py add/start/log/next`.

## Design Notes

- **Baseline blocker fixed first.** `./init.sh` failed at startup (pre-existing on
  branch `feat/MCP-Revision`): test_docs T2 flagged `.handyman/index.md -> feature-request.md`.
  `feature-request.md` was genuinely missing and `.handyman/` is untracked, so the
  sanctioned deterministic fix was to regenerate the MOC with `index_md.py`
  (existence-gated → drops the dead link, preserves the operator `## Notes`).
  Verifier green before any feature work.
- **Core finding.** Discovery today is **semantic**: skills trigger by their
  `description` (progressive disclosure, `skill-creator`); MCP tools surface via a
  deferred list + semantic `tool_search` (`mcp-builder` naming/discoverability).
  Handyman never added a deterministic layer: the `tools` map holds capability
  groups (not skills/MCPs), `feature-request` `Tools>skills` is prose that
  `feature.py add` does not persist, no `.mcp.json` exists, and no script queries
  skills/MCPs.
- **Proposed design (3 goals).** (1) optional `discovery` block in
  `harness.config.json` (+ schema, mirroring `harness_version` since
  `additionalProperties:false`); (2) `scripts/tools_discovery.py` `list`/`find`/`check`
  for reproducible discovery + existence verification; (3) `references/discovery.md`
  documenting the platform mechanism and the deterministic-vs-semantic boundary.
- **Honest limitation.** The config declares intent and enables a determinism check
  but cannot force the model to trigger a skill; the trigger stays semantic.
- **T2 safety.** The doc uses inline-code + fenced blocks and **no** markdown links;
  `test_docs.py` strips code before extracting links, so the link check stays green.
- Suggested follow-up features are documented in the doc but **not** added to
  `feature_list.json` (research-only convention).

## Test Output

```text
$ ./init.sh
...
Doc-structure suite (test_docs.py)
  PASS all relative markdown links resolve
  90 run, 90 passed, 0 failed
-> suite OK
... (test_init 14, test_update 7, test_feature 12, test_backlog 7, test_index 5, test_upgrade 10 all OK)
ALL SUITES PASSED
    test: OK
VERIFIER: all gates passed
```

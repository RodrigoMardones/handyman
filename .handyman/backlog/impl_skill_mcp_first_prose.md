---
type: Implementation Log
feature: skill_mcp_first_prose
status: implemented
role: implementer
updated: 2026-07-23
tags: [handyman/role/implementer, handyman/feature/skill_mcp_first_prose]
---

# Implementation Report: skill_mcp_first_prose

## Files Changed

- `handyman/SKILL.md` — "Mechanics: MCP First": replaced the stale 6-tool list with the full 20-tool surface grouped compactly (feature cycle / review / observability / ops), named both resources (`handyman://{project}/current`, `handyman://{project}/docs/{doc}`), kept the `npx handyman-harness@3` CLI fallback sentence and the mcp.md pointer. File lands at 999/1000 words against the token-budget test.
- `handyman/references/workflow.md` — MCP-first re-point, CLI as portable fallback:
  - Intro paragraph: names the real 20-tool surface grouped (feature cycle; review and reports; observation) instead of the stale 6; reframes the CLI as the fallback when no MCP is connected.
  - "Stages at a Glance" table: stages 0-4 and 6 now use the stage-5 style (`` `tool` (MCP; fallback `npx handyman-harness@3 ...`) ``); stage 4 notes `verify` wraps the verifier with `./init.sh` as the local fallback; stage 7 (`sprint close`) stays CLI-only and says so explicitly (destructive period verbs deliberately absent from the MCP, pointer to mcp.md).
  - Guardian references re-pointed MCP-first in: the startup branch-mismatch paragraph (`feature_start`/`feature_block`/`feature_unblock`), the stability-check run line (`preflight`), Bootstrap step 8 (`feature_add`), Leader step 4 (`feature_add`), Implementer step 3 (`feature_log`/`feature_next_step`), Implementer step 7 (`report_write`), Reviewer step 7 (`backlog_review`), Closure steps 3 and 6 (`feature_close`), Sprint Protocol intro + step 2, and the Parallel Exploration scaffold line (`report_write`). Surrounding prose and rules untouched.

## Design Notes

- Docs-only feature; no code changes. `references/mcp.md` was not touched — it is the source of truth for the surface and had no drift (its 20-tool table matches `src/mcp.ts` registrations).
- Reused the existing stage-5 style (`` `tool` (MCP; fallback `npx handyman-harness@3 ...`) ``) verbatim for consistency.
- Checked `src/mcp.ts` before writing prose: `feature_close` exposes no `tools` argument, so Closure step 3 now reads "pass `--tools` on the CLI" for tools provenance. `backlog_review` takes the `approved|changes_requested` status enum; `report_write` covers `impl`/`review`/`explore` kinds and adds the house frontmatter, so it replaced the bare `backlog impl` / `backlog explore` scaffold prescriptions ("stamps the house frontmatter" is accurate for both tool and CLI).
- Token budget: SKILL.md had 3 words of headroom (997/1000). The new section cost +2 net (999/1000) after tightening (dropped em-dash tokens, "Setup and surface" -> "Surface", colon group labels).
- Judged but left alone (factual, not stale): the Unattended Loop section (an external shell runner is not an MCP client; `test_docs.js` requires the CLI strings there), the Description Trigger Gate (`evals` verbs are not in the MCP), preflight's six control bullets (they describe the CLIs preflight orchestrates internally, including exit-3 semantics), CLI mentions in `checklists.md`, `templates.md`, `anatomy.md`, `toolbox.md`, `examples.md` (behavioral descriptions and walkthroughs of the documented portable fallback), and the SKILL.md Upgrade mode line (the apply verb stays CLI-only by design).
- Historical backlog docs under `.handyman/backlog/` were not touched.

## Test Output

```text
$ node tests/test_docs.js
  220 run, 220 passed, 0 failed

$ ./init.sh
  ...
  mcp handyman: ok (configured in vscode)
  --> context: OK
  --> worklist: NOTE
  ==> preflight: stability report complete (read-only; exit 0)
  status: ok
  INIT_EXIT_CODE=0        (zero FAIL lines in the full log)
```

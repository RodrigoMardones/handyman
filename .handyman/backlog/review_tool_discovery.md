---
feature: tool_discovery
status: approved
role: reviewer
updated: 2026-06-26
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/tool_discovery]
---

# Review: tool_discovery

## Acceptance Criteria

1. **Research doc exists** (docs/analisis-tool-discovery.md) ✅
   - Explains platform discovery mechanisms: skills via progressive disclosure (`description` trigger), MCPs via deferred tools + semantic `tool_search`
   - Analyzes why handyman discovery is non-deterministic prose
   - Proposes 3-goal action plan: (1) declare in harness.config.json, (2) deterministic queries via script, (3) documentation scoped to SKILL.md, references/, assets/, scripts/
   - Sections 2-5 provide concrete evidence and root-cause analysis
   - Sections 6-9 specify design, plan A-E, suggested features, and honest limitations

2. **Skills skill-creator and mcp-builder consulted as literature** ✅
   - Section 5 "Literatura: qué dicen `skill-creator` y `mcp-builder`" explicitly cites both
   - skill-creator: description as trigger, progressive disclosure, organization of deterministic vs semantic
   - mcp-builder: naming + discoverability, consistent prefixes, error messages

3. **Verifier passes** ✅
   - `./init.sh` exits 0
   - test_docs.py: 90 run, 90 passed, 0 failed
   - All test suites green

4. **Deliverable is research-only** ✅
   - No product code changes (implementation deferred to features 33-37)
   - No product schema changes
   - Doc is analysis + proposed plan, not feature closure

## Fact-Check Results

| Claim | Evidence | Status |
|-------|----------|--------|
| a. `harness.config.json` `tools` map values are capability GROUPS, not skills/MCPs | `tools.md` "Capability Groups" table lists 9 logical groups (vscode, execute, read, agent, edit, search, web, browser, todo). Schema validates `role_tools` → `tool_list` against these. Example: `"tools": {"leader": ["vscode", "execute", "read", ...]}` in harness.config.json | ✅ TRUE |
| b. `feature-request.template.md` has `Tools > skills` prose field; `feature.py add` persists **only** contract keys | Template shows `## Tools` → `- skills: <handyman, ...>` (lines 54, 109, 144). Code inspection: `feature.py cmd_add()` creates dict with keys `id, name, title, description, acceptance, status` only. workflow.md "Leader Protocol #4" confirms contract keys explicitly. `Tools` field is **not** persisted | ✅ TRUE |
| c. NO MCP config file exists in repo | `find . -path ./node_modules -prune -o \( -name '.mcp.json' -o -name 'mcp.json' \) -print` returns empty. `ls .vscode/mcp.json` exits with "No such file or directory". No mention of MCP in `references/` | ✅ TRUE |
| d. `harness.config.schema.json` has `additionalProperties: false` | Line 6: `"additionalProperties": false,` on root object | ✅ TRUE |
| e. No script in `handyman/scripts/` discovers/lists/validates skills/MCPs | `ls handyman/scripts/` shows: backlog.py, feature.py, index_md.py, scaffold.sh, update_harness.py, upgrade_harness.py, validate_harness.py. `grep -r "skill\|mcp" handyman/scripts/` finds only SKILL.md filesystem checks (is_skill_repo, detect skill repo layout), no discovery of available skills/MCPs. Zero query/search/check logic | ✅ TRUE |

## Verdict

**APPROVED**

Research-only feature meets all acceptance criteria. The doc provides:
- Concrete analysis of platform mechanisms (sections 2.1–2.3, root causes 4.1–4.5)
- Literature review consulting skill-creator and mcp-builder (section 5)
- Detailed 3-goal design with 5-step action plan A–E (sections 6–7)
- Honest scope boundaries and limitations (sections 8–9)
- Baseline fix applied (index.md blocker resolved); test suite green (90/90 docs)

All fact-checks verified against actual repo files. Ready for implementer handoff: features 33–37 (discovery_config_schema, tools_discovery_script, tools_discovery_advisory, discovery_reference_doc, feature_request_tools_link).

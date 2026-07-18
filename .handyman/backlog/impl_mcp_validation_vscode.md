---
feature: mcp_validation_vscode
status: implemented
role: implementer
updated: 2026-06-27
tags: [handyman/role/implementer, handyman/feature/mcp_validation_vscode]
---

# Implementation Report: mcp_validation_vscode

## Files Changed

- `handyman/scripts/tools_discovery.py` — local-then-global skill roots + MCP
  validation against on-disk host manifests.
- `tests/test_tools_discovery.sh` — three new cases (T7 local-then-global, T8 MCP
  configured, T9 MCP host-provided NOTE); header comment updated.
- `handyman/references/discovery.md` — documents the local-first skill-root order
  and the extensible vscode MCP source.

## Design Notes

- **MCP source registry (open for new hosts).** New module-level
  `MCP_CONFIG_SOURCES = (("vscode", ".vscode/mcp.json", "servers"),)` maps a host
  label to its workspace-relative manifest and the JSON key holding the server map.
  Adding a row (e.g. `.cursor/mcp.json` or a root `.mcp.json`) extends coverage
  without touching the logic. `discover_mcp_servers(root)` scans every source and
  returns `name -> host` (tolerates a `servers` dict or a list of strings/objects);
  `mcp_sources_present(root)` lists the manifests that exist.
- **MCP validation in `check`.** Each declared MCP is `ok (configured in <host>)`
  when present in a manifest; `NOTE not configured in <files> (host-provided?)` when
  a manifest exists but does not list it (IDE/extension-provided servers are
  legitimate, so this is **non-gating**); `ok (declared, not verifiable on disk)`
  when no manifest exists (graceful fallback, preserves prior behaviour and keeps
  T4 green). Configured-but-undeclared servers are noted. Only a missing *skill*
  still drives exit 1 — MCP never gates, matching the documented host-defined limit.
- **Skill roots local-then-global.** `DEFAULT_LOCAL_SKILL_DIRS`
  (`.agents/skills`, `.claude/skills`, `.github/skills`, relative to the project
  root) are scanned BEFORE `DEFAULT_GLOBAL_SKILL_ROOTS` (or `$HANDYMAN_SKILL_ROOTS`).
  Because `discover_skills` keeps the first occurrence of a name, a local skill
  shadows a same-named global one ("always local, then global"). `--skills-dir`
  stays a verbatim override so the existing hermetic fixtures (and T2's exact-set
  assertion) are unaffected.
- **Wiring fix.** `cmd_list`/`cmd_find`/`cmd_check` now pass the project root to
  `skill_roots(...)`. The first cut missed the call inside `cmd_check`, which made a
  fixture's declared local skill resolve against the repo cwd instead of the
  fixture root — caught by T7/the manual check and fixed.

## Test Output

```text
Tools-discovery suite (test_tools_discovery.sh)
  PASS list enumerates installed skills (name + description)
  PASS list --json emits valid JSON with the skills
  PASS find filters skills by keyword and excludes non-matches
  PASS check exits 0 when every declared skill is installed
  PASS check exits non-zero and names a declared-but-missing skill
  PASS check exits 0 when no discovery block is declared
  PASS list scans project-local skill roots before global (local shadows global)
  PASS check reports a declared MCP present in .vscode/mcp.json as ok
  PASS check notes a declared MCP absent from the manifest without failing
Summary: 9 run, 9 passed, 0 failed

./init.sh -> VERIFIER: all gates passed (EXIT=0)
Doc-structure suite: 142 run, 142 passed (all markdown links resolve; W011 green)
```

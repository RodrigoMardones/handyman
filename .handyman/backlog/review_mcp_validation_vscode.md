---
type: Review Log
feature: mcp_validation_vscode
status: approved
role: reviewer
updated: 2026-06-27
tags: [handyman/role/reviewer, handyman/feature/mcp_validation_vscode]
---

# Review: mcp_validation_vscode

## Acceptance Criteria Verification

### C1: MCP Validation Against `.vscode/mcp.json` via `MCP_CONFIG_SOURCES` Registry

**Status: PASS**

- `MCP_CONFIG_SOURCES` tuple (line 50–51 in `tools_discovery.py`) declares `("vscode", ".vscode/mcp.json", "servers")`, open for new hosts with no logic changes required to add rows.
- `discover_mcp_servers(root)` (lines 178–198) scans all sources, tolerates both `dict` and `list` formats, returns `name -> host` map, and gracefully skips missing files.
- `cmd_check` logic (lines 245–262):
  - Declared MCP present in manifest → `"ok (configured in <host>)"` (line 253).
  - Declared MCP absent but manifest exists → `"NOTE not configured in <files> (host-provided?)"` **non-gating** (lines 254–256).
  - Configured-but-undeclared server → `"NOTE: configured but not declared: <name>"` (lines 260–261).
  - No manifest on disk → `"ok (declared, not verifiable on disk)"` graceful fallback (line 257).
  - **MCP never gates exit code**; only missing skill returns 1 (lines 264–267).

### C2: Local-Then-Global Skill Root Precedence

**Status: PASS**

- `DEFAULT_LOCAL_SKILL_DIRS` defined (line 47): `.agents/skills`, `.claude/skills`, `.github/skills`.
- `skill_roots(cli_dirs, root)` (lines 74–101) implements precedence:
  - `--skills-dir` override is verbatim; no precedence applied (line 77).
  - Otherwise local roots prepended before global (lines 85–87).
  - First occurrence of a name wins in `discover_skills` (line 135), so local skill shadows global.
- All three commands pass root parameter:
  - `cmd_list` (line 216): `skill_roots(args.skills_dir, args.root)`.
  - `cmd_find` (line 226): `skill_roots(args.skills_dir, args.root)`.
  - `cmd_check` (line 234): `skill_roots(args.skills_dir, root)` (root resolved on line 233).

### C3: Test Coverage (MCP + Skill Precedence)

**Status: PASS**

- `test_tools_discovery.sh` test results:
  - T7: `"list scans project-local skill roots before global (local shadows global)"` — confirms local-first logic with fixture setup (lines 95–130).
  - T8: `"check reports a declared MCP present in .vscode/mcp.json as ok"` — fixture `.vscode/mcp.json` with `"nx"` server, declares `"nx"` in discovery, verifies `"ok (configured in vscode)"` (lines 141–152).
  - T9: `"check notes a declared MCP absent from the manifest without failing"` — fixture declares `"other"` MCP but `.vscode/mcp.json` has `"mcparmory"`, verifies non-gating NOTE and configured-but-undeclared note (lines 156–170).
- All 9 tests pass (9 run, 9 passed, 0 failed).
- `test_tools_discovery.sh` wired in `run_tests.sh` (line 28) ✓.
- Header comment updated in test file (lines 1–8).

### C4: Documentation in `handyman/references/discovery.md`

**Status: PASS**

- Local-then-global skill-root order documented (lines 81–82): `"Skill roots are scanned **local first, then global**: the project-local roots…BEFORE the global roots"`.
- VS Code MCP source documented (lines 88–90): `"on-disk host manifests in MCP_CONFIG_SOURCES (today VS Code's .vscode/mcp.json servers map; the registry is open to new hosts)"`.
- Extensible registry design explained (line 88): open to new hosts without touching logic.
- `--skills-dir` override behavior documented (lines 83–84): `"--skills-dir overrides both (verbatim)"`.
- Non-gating MCP validation behavior documented (lines 89–90): `"non-gating NOTE (it may be host/extension-provided)"`.

### C5: Verifier Green

**Status: PASS**

- `bash tests/test_tools_discovery.sh` → 9 run, 9 passed, 0 failed.
- `./init.sh` output:
  - All test suites pass (Doc-structure, Verifier-contract, Updater-contract, Feature-CLI, Backlog-generator, Index-MOC, Upgrade-check, Tools-discovery, Evals).
  - `VERIFIER: all gates passed` (exit 0).
  - Doc-structure suite: 142 run, 142 passed — all markdown links resolve ✓; W011 passive-framing absent ✓.

## Additional Verifications

- **SKILL.md untouched**: Confirmed; no discovery MCP logic added to `handyman/SKILL.md`.
- **`.github/` scope**: Not present in workspace; no modifications possible.
- **Backlog file compliance**: `impl_mcp_validation_vscode.md` uses inline-code (backticks) for symbols (`MCP_CONFIG_SOURCES`, `discover_mcp_servers`, etc.) and no raw markdown links; passes doc-structure suite.

## Checkpoint Evaluation

| Checkpoint | Status | Evidence |
|---|---|---|
| C1: Harness Complete | ✓ PASS | Required files exist; verifier exits 0; `HARNESS_WORKSPACE` resolves to `.handyman`. |
| C2: State Coherent | ✓ PASS | Single feature in review; no conflicting in_progress states; tests all pass. |
| C3: Architecture Respected | ✓ PASS | Changes respect `docs/architecture.md`; no debug prints, no TODOs; skill roots and MCP registry follow port-adapter pattern. |
| C4: Verification Real | ✓ PASS | 9 test cases covering MCP validation (configured, absent, undeclared) + local-then-global precedence; 142 doc-structure tests all pass. |
| C5: Session Closed | ✓ PASS | Implementation report complete; ready for history. |

---

## APPROVED -> .handyman/backlog/review_mcp_validation_vscode.md

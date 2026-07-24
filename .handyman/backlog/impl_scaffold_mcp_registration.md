---
type: Implementation Log
feature: scaffold_mcp_registration
status: implemented
role: implementer
updated: 2026-07-23
tags: [handyman/role/implementer, handyman/feature/scaffold_mcp_registration]
---

# Implementation Report: scaffold_mcp_registration

## Files Changed

- `handyman/assets/vscode-mcp.template.json` — new template: the `handyman`
  server entry (`type: stdio`, `command: npx`, `args: ["-y", "handyman-harness@3", "mcp"]`),
  same shape as this repo's own `.vscode/mcp.json`. Picked up by the npm pack
  automatically (assets/ is copied wholesale).
- `handyman/scripts/scaffold.sh` — new "registering the handyman MCP server"
  section after the bridge files: copies the template to
  `<project_root>/.vscode/mcp.json` when absent (KEEP + NOTE with the manual
  server entry when it pre-exists; bash JSON merge deliberately out of scope),
  and NOTEs `node handyman/dist/tools_discovery.js declare mcp handyman` when
  `harness.config.json` pre-existed the run (existence captured before
  `copy_and_stamp`, mirroring the helper's own `existed` pattern).
- `handyman/assets/harness.config.local.template.json` /
  `handyman/assets/harness.config.global.template.json` — `discovery.mcp`
  goes from `[]` to `["handyman"]`, so a freshly generated config declares the
  server from the start (validates against `harness.config.schema.json`).
- `handyman/references/workflow.md` — Bootstrap Protocol gains step 3 (MCP
  connection: what the scaffold writes + the pre-existing-files fallback);
  later steps renumbered.
- `handyman/references/templates.md` — `harness.config.json` section notes the
  pre-declared `discovery.mcp` entry; new `.vscode/mcp.json` section linking
  the template and the never-overwrite caveat.
- `tests/test_init.sh` — T30 (fresh scaffold writes `.vscode/mcp.json` with
  the handyman server), T31 (pre-existing `mcp.json` byte-untouched + NOTE),
  T32 (generated config declares `handyman` in `discovery.mcp.0` in both
  scopes; global kept hermetic via `HANDYMAN_ROOT` override), T33
  (pre-existing config byte-untouched + declare NOTE).
- `.handyman/progress/current.md` — session log lines (via `feature.js log`).

## Design Notes

- **Template emission over CLI invocation.** The acceptance allowed declaring
  via `tools_discovery declare` or emitting it in the template. The template
  path wins: the scaffold must stay bash + file copy (the target repo has no
  built toolchain at bootstrap time), and the declaration costs one line of
  JSON the schema already permits.
- **Never-overwrite stays absolute.** Both fallbacks are NOTEs, not merges:
  merging a pre-existing `.vscode/mcp.json` in bash (no JSON tooling assumed)
  is out of scope, and the config may carry operator content. The NOTEs print
  the exact manual step — the server entry inline, and the
  `tools_discovery.js declare mcp handyman` command for the config (the NOTE
  fires whenever the config pre-existed, even if it already declares the
  server; `declare` rejects duplicates loudly, so the operator loses nothing).
- **Echo style.** New lines follow the scaffold's existing vocabulary
  (`==>` phases, `NEW:`, `KEEP (already exists):`); the NOTE lines reuse the
  `NOTE:` prefix the verifier/preflight output already uses.
- **Verification side already existed.** `tools_discovery check` validates
  declared `discovery.mcp` entries against `.vscode/mcp.json`
  (`MCP_CONFIG_SOURCES`), so the scaffold only had to close the bootstrap
  side — no TS changes needed.

## Test Output

```text
$ bash -n handyman/scripts/scaffold.sh && shellcheck handyman/scripts/scaffold.sh
clean (the two info-level findings in test_init.sh are pre-existing baseline)

$ bash tests/test_init.sh
Summary: 33 run, 33 passed, 0 failed   (incl. new T30-T33)

$ node tests/test_docs.js
221 run, 221 passed, 0 failed          (new template parses; both config
                                        templates still validate the schema;
                                        new templates.md links resolve)

$ bash tests/test_tools_discovery.sh / test_update.sh / test_upgrade.sh
17/17, 12/12, 10/10 passed

$ ./init.sh
lint -> build -> full test battery: ALL SUITES PASSED
==> preflight: stability report complete (read-only; exit 0)
    mcp handyman: ok (configured in vscode)
status: ok
exit code: 0
```

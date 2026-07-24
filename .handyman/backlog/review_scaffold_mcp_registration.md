---
type: Review Log
feature: scaffold_mcp_registration
status: approved
role: reviewer
updated: 2026-07-24
tags: [handyman/role/reviewer, handyman/review/approved, handyman/feature/scaffold_mcp_registration]
---

# Review: scaffold_mcp_registration

## Verdict

APPROVED

All four acceptance criteria verified against the code and by re-running the
covering suites; Stage 2 surfaced only non-blocking notes.

## Stage 1: Spec Compliance

1. **scaffold.sh creates `.vscode/mcp.json` when missing; pre-existing is
   byte-untouched — PASS.** `handyman/scripts/scaffold.sh:168-174`: an
   `[ -e ... ]` guard KEEPs a pre-existing file and prints a NOTE with the
   manual server entry; otherwise `copy_template` (itself never-overwrite)
   installs `assets/vscode-mcp.template.json`. T30 asserts the written shape
   (`servers.handyman.type/command/args.1`); T31 seeds a foreign `mcp.json`,
   diffs content before/after, and requires the NOTE. The template is
   byte-identical to this repo's own `.vscode/mcp.json` (`diff` clean).
2. **Generated `harness.config.json` declares `handyman` in `discovery.mcp`;
   pre-existing config gets the declare command — PASS.** Both
   `assets/harness.config.{local,global}.template.json` carry
   `"mcp": ["handyman"]` (schema-permitted: `schemas/harness.config.schema.json`
   `discovery.mcp` is a string array). `config_existed` is captured before
   `copy_and_stamp` (scaffold.sh:157-159), and the NOTE at :175-178 prints
   `node handyman/dist/tools_discovery.js declare mcp handyman`. T32 covers
   both scopes (global kept hermetic via `HANDYMAN_ROOT`); T33 covers the
   pre-existing path (content unchanged + NOTE).
3. **Docs — PASS.** `references/workflow.md` Bootstrap Protocol step 3
   describes the MCP connection (fresh write + pre-existing fallback with the
   declare command); `references/templates.md` documents the pre-declared
   `discovery.mcp` entry and adds a `.vscode/mcp.json` section linking the
   template and the never-overwrite caveat.
4. **Verifier — PASS.** Re-ran the suites covering the changed surface:
   `bash tests/test_init.sh` 33/33 (incl. T30-T33), `node tests/test_docs.js`
   221/221 (new template parses, config templates validate the schema, new
   links resolve), `bash tests/test_tools_discovery.sh` 17/17. Per the review
   brief a full `./init.sh` re-run was only required if suspicious; nothing
   was — the diff is additive bash + assets + docs, and the impl report's
   exit-0 claim is corroborated by the suites above.

The change stays inside the declared scope; the implementation report
(`.handyman/backlog/impl_scaffold_mcp_registration.md`) matches the diff.

## Stage 2: Code Quality

- **Shape matches what `tools_discovery check` validates.** `check` resolves
  declared `discovery.mcp` names against `MCP_CONFIG_SOURCES` =
  `.vscode/mcp.json` key `servers` (src/tools_discovery.ts:78-80, 451-464);
  the template's `{ "servers": { "handyman": ... } }` yields
  `mcp handyman: ok (configured in vscode)`, which the impl report's preflight
  output confirms.
- **Never-overwrite is real.** Both KEEP paths return before any write;
  `stamp_version` only runs on newly created files; no bash JSON merge, no
  partial writes. Scaffold stays bash + `cp`/`echo` — no node/toolchain
  requirement in the target repo.
- **Style.** `bash -n` and `shellcheck` clean; new output follows the
  scaffold's existing `==>` / `NEW:` / `KEEP (already exists):` / `NOTE:`
  vocabulary. Tests assert bytes/shape (T31/T33 content equality, T30 field
  values, T32 both scopes), not just exit codes.
- **Packaging.** `scripts/pack_npm.mjs:110` copies `assets/` wholesale, so
  the new template ships with `handyman-harness@3` automatically.

Non-blocking notes:

- Command-form drift: the scaffold NOTE prints
  `node handyman/dist/tools_discovery.js declare mcp handyman` while
  workflow.md step 3 prints the portable
  `npx handyman-harness@3 tools_discovery declare mcp handyman`. The node form
  matches the already-approved mcp.md:50 and this repo's AGENTS.md convention,
  so it is defensible, but only the npx form works in a consumer repo without
  a `handyman/` checkout. Worth unifying in a follow-up, not a blocker.
- T31/T33 compare `$(cat file)` captures, which strip trailing newlines; a
  trailing-newline-only mutation would pass undetected. Acceptable — the KEEP
  path never opens the file for writing — and consistent with suite idiom.
- The declare NOTE fires whenever the config pre-exists, even if it already
  declares the server; acknowledged in the impl report (`declare` rejects
  duplicates loudly), so the operator loses nothing.

## Stage 2 Checklist

- [x] Architecture respected
- [x] Conventions respected
- [x] Tests meaningful and green
- [x] Verifier exits 0

## Required Changes

_None._

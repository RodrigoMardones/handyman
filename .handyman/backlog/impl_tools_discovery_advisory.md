---
feature: tools_discovery_advisory
status: implemented
role: implementer
updated: 2026-06-26
tags: [handyman/role/implementer, handyman/feature/tools_discovery_advisory]
---

# Implementation Report: tools_discovery_advisory

Plan C of `docs/analisis-tool-discovery.md`: a non-blocking advisory that nudges
the operator to declare the skills/MCPs the harness relies on.

## Files Changed

- `handyman/assets/init.template.sh` — new `check_tools_discovery()` after
  `check_business_context()`, plus its call in the advisory block.
- `tests/test_docs.py` — new `test_tools_discovery_advisory()` (registered in main).

## Design Notes

- **Self-contained shell, no script dependency.** The support scripts
  (`tools_discovery.py`, `validate_harness.py`, ...) are not scaffolded into target
  repos, so the advisory cannot shell out to `tools_discovery.py`. It uses `jq`
  (guarded; silent if jq is absent, like `check_harness_version`) to read
  `discovery.skills`/`discovery.mcp` lengths from `harness.config.json`.
- **Fires only on a missing declaration.** NOTE when both arrays are empty (or the
  block is absent, since `// []` defaults to length 0); silent once anything is
  declared. Mirrors `check_business_context` (NOTE when the layer is unfilled).
- **Never blocks.** No `EXIT_CODE=` in the function body; called next to the other
  advisories before `exit $EXIT_CODE`.
- **Test has teeth.** Regex-anchored static contract (defined + called + no
  `EXIT_CODE=` + inspects `discovery`), the same shape as the version/business
  advisory guards. The repo's own `init.sh` is custom/gitignored, so the template
  is verified statically here and functionally with a temp config.

## Test Output

```text
$ bash -n handyman/assets/init.template.sh   # syntax ok
$ python3 tests/test_docs.py | grep check_tools_discovery
  PASS init.template.sh defines check_tools_discovery
  PASS init.template.sh calls check_tools_discovery
  PASS check_tools_discovery is advisory (does not set EXIT_CODE)
  PASS check_tools_discovery inspects the discovery block
functional: empty discovery -> NOTE fires; declared -> silent
$ ./init.sh -> ALL SUITES PASSED / VERIFIER: all gates passed
```

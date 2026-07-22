---
type: Implementation Log
feature: discovery_reference_doc
status: implemented
role: implementer
updated: 2026-06-26
tags: [handyman/role/implementer, handyman/feature/discovery_reference_doc]
---

# Implementation Report: discovery_reference_doc

Plan D of `docs/analisis-tool-discovery.md`: the delivery documentation for skill
and MCP discovery.

## Files Changed

- `handyman/references/discovery.md` (new) — platform mechanism (skills via
  description/progressive disclosure; MCP via deferred list + `tool_search`), the
  `discovery` config block, the `tools_discovery.py` `list`/`find`/`check`
  commands, the `check_tools_discovery()` advisory, and the deterministic-vs-
  semantic boundary + limitations.
- `handyman/references/README.md` — catalog entry for `discovery.md` after
  `tools.md`.
- `tests/test_docs.py` — new `test_discovery_reference()` (registered in main).

## Design Notes

- **English, plain markdown** like every other reference (no frontmatter).
- **Links resolve.** `references/*.md` is scanned by the T2 link check, so the doc
  links only to existing siblings (`./tools.md`, `./workflow.md`, `./security.md`)
  and uses inline-code + fenced blocks for script/config paths (stripped before
  link extraction).
- **SKILL.md untouched** (budget 997/1000). The reference is reachable from the
  catalog and from the init advisory's NOTE; not every reference must be linked
  from SKILL.md, and the link check only requires that links resolve.
- **Passive framing.** The W011 guard (T6) scans `references/*.md`; the doc's
  security note is phrased as data-not-instructions without an agent-as-ingestor
  construction, so T6 stays green.

## Test Output

```text
$ python3 tests/test_docs.py | grep -i discovery.md
  PASS references/discovery.md exists
  PASS references/README.md lists discovery.md
  PASS references/discovery.md has no agent-as-ingestor construction
  PASS all relative markdown links resolve
  110 run, 110 passed, 0 failed
$ ./init.sh -> ALL SUITES PASSED / VERIFIER: all gates passed
```

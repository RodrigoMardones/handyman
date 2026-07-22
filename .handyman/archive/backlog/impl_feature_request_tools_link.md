---
type: Implementation Log
feature: feature_request_tools_link
status: implemented
role: implementer
updated: 2026-06-26
tags: [handyman/role/implementer, handyman/feature/feature_request_tools_link]
---

# Implementation Report: feature_request_tools_link

Plan E of `docs/analisis-tool-discovery.md`: close the loop by tying the
feature-request `Tools > skills` field to the declared `discovery` set.

## Files Changed

- `handyman/references/templates.md` — `## feature-request.md` section now states
  that `Tools > skills` lists skills from `discovery.skills` in
  `harness.config.json`, verifiable with `scripts/tools_discovery.py check`, with a
  link to `references/discovery.md`.
- `handyman/references/examples.md` — the form-first intake turn notes the listed
  skills should come from the declared set and be confirmed with
  `tools_discovery.py check`.
- `handyman/assets/feature-request.template.md` — one header line ties
  `Tools > skills` to `discovery.skills` + `tools_discovery.py check`.
- `tests/test_docs.py` — new `test_feature_request_tools_link()` (registered).

## Design Notes

- **SKILL.md untouched** (decision 4; budget 997/1000, confirmed by `git diff`).
- **Link safety.** `templates.md` uses a real markdown link `./discovery.md`
  (resolves); `examples.md` and the asset use inline-code to avoid extra link
  surface. The asset is excluded from the T2 link scan but scanned by T6 — the new
  line carries no agent-as-ingestor construction, so T6 stays green.
- This is the smallest change that connects the prose field to the new contract:
  the form points at the declaration, and the declaration is checkable.

## Test Output

```text
$ python3 tests/test_docs.py | grep -iE 'ties Tools|links the discovery|tools_discovery.py for skill|template ties'
  PASS templates.md ties Tools>skills to discovery.skills
  PASS templates.md links the discovery reference
  PASS examples.md points to tools_discovery.py for skill verification
  PASS feature-request template ties Tools>skills to discovery
  114 run, 114 passed, 0 failed
$ git diff --stat handyman/SKILL.md   # empty (untouched)
$ ./init.sh -> ALL SUITES PASSED / VERIFIER: all gates passed
```

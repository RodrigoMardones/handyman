---
feature: feature_request_core_optional
status: implemented
role: implementer
updated: 2026-06-25
tags: [handyman/role/implementer, handyman/feature/feature_request_core_optional]
---

# Implementation Report: feature_request_core_optional

Plan A of `docs/analisis-feature-request-md.md`.

## Files Changed

- `assets/feature-request.template.md`: rewrote the `## Template (copy and fill)` block into
  a `CORE (fill always)` section and an `OPTIONAL (fill only if it applies)` section, preceded by
  a `How to write a good request (recommendation from experience)` header.

## Design Notes

- CORE = Feature, Context, Scope>Includes, Acceptance (with the green-gate bullet shown last),
  Verification>Gate, Tools>skills. OPTIONAL = Scope extension (Excludes, Model/schema changes),
  Verification extension (Functional check), Considerations, Post-feature, Tools extension
  (sub-agents), Questions / prior investigation.
- Header carries four behavioural bullets (one request = one feature; observable and testable;
  choose archetype; fill core / delete optional). The two **format contracts** (green gate as the
  last Acceptance bullet; field→`feature.py add` mapping) are deferred to Plan C so A and C stay
  distinct.
- English, matching the rest of `assets/`. The worked example and the "Why each section" table are
  left untouched (Plan B replaces the example; the table still maps every existing section).

## Test Output

```text
$ ./init.sh
  PASS all relative markdown links resolve
  53 run, 53 passed, 0 failed
... (14 init / 7 update / 12 feature / 7 backlog / 5 index / 10 upgrade) ...
VERIFIER: all gates passed   # EXIT 0
```


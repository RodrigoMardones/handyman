---
feature: json_schema
status: approved
role: reviewer
updated: 2026-06-17
tags: [handyman/review/approved, handyman/role/reviewer]
---

# Review — json_schema

## Verdict

APPROVED

## Checks

- **Acceptance:** all four criteria met; evidence in `backlog/impl_json_schema.md`.
- **Schemas:** both draft-07, pass `Draft7Validator.check_schema`, and accurately
  model the live `feature_list.json` / `harness.config.*` shapes (enums, required
  keys, role maps, nullable `handyman_root`).
- **Verifier:** `./init.sh` exits 0 — 37 doc tests (incl. 3 template-conformance
  checks), 9 init, 7 update.
- **Determinism:** degraded path (no `jsonschema`) verified green (32 passed,
  NOTE printed); CI install step guarantees full validation upstream. Verifier
  stays green in both environments.
- **Conventions:** test mirrors the existing `check()` harness and stdlib-first
  style; schemas live under `assets/schemas/` and are documented in
  `references/anatomy.md` Optional Support Files.
- **Scope:** contained to schemas + one test + CI dep + one doc line. No drift in
  product behavior. `additionalProperties: false` rationale documented (no
  `$schema` key on templates).
- **Security:** schema validation reads/parses JSON only; no execution of ingested
  content; no secrets.

## Required changes

None.

APPROVED -> backlog/review_json_schema.md

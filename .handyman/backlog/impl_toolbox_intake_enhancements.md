---
type: Implementation Log
feature: toolbox_intake_enhancements
id: 27
status: implemented
role: implementer
updated: 2026-07-17
tags: [handyman/backlog/impl, toolbox, intake, ui]
---

# Implementation — toolBox observer: intake UI enhancements, file tags, and direct submission

## What changed

Intake view (#26) gained a searchable file-tag picker (multi-select) and a
direct **Submit** action that persists the reviewed draft to the target
harness as `feature-request.md`. The observer's read-only contract now has
exactly one deliberate write route (`POST /api/intake`), mirroring how
`POST /api/draft` was the original GET-only exception.

### Backend — `handyman/src/toolbox_serve.ts`
- `GET /api/files?root=` lists taggable workspace files (relative paths +
  byte size) inside a REGISTERED root. Walks the project root once, skipping
  junk dirs (`node_modules`, `.git`, `dist`, `build`, `graphify-out`,
  `.handyman`, dotfiles) and non-text extensions; caps depth (8) and count
  (800). Unregistered root → 400.
- `POST /api/draft` now accepts an optional `files: string[]`; each is
  resolved+read inside the registered root (`resolveTagFile`: registry guard,
  path-traversal containment on the normalized absolute path, extension
  allowlist) and capped (6000 chars/file, max 12). Invalid/unregistered → 400.
- `POST /api/intake {root, draft_md, files?}` is the direct-submit route:
  validates root (registered) + non-empty `draft_md` (422 on empty, 400 on
  malformed/unregistered), then writes the reviewed draft to
  `$WORKSPACE/feature-request.md` with a `<!-- intake context files: ... -->`
  footer for the tagged files. Returns `{ok, path, files, spawned_process:false}`.
  **Never spawns a handyman process** — the next leader session consumes the
  persisted intake (the documented intake path). It is the ONLY route that
  writes disk; both POST routes are handled before the GET-only guard so no
  other mutating route exists.
- Generic `readJsonObject(req, maxBytes)` replaces the draft-only body reader
  (shared by both POST routes, oversized-body guard preserved).
- Header doc + security-model comments updated to document `/api/files` and
  `/api/intake` (the second non-GET route, sole write).

### Backend — `handyman/src/toolbox_draft.ts`
- `TaggedFile` type + `DraftContext.files`; `buildDraftContext` takes an
  optional `files` arg (default `[]`); `composeUserPrompt` appends a
  "Tagged files" section (path + capped text) as volatile context.

### UI — `handyman/assets/toolbox_panel.js`
- `submitIntake()` helper (plain JSON POST to `/api/intake`).
- `IntakeView`: file-tag state (`tagFiles`, `tagQuery`, `selectedTags`,
  `tagsOpen`); loads `/api/files?root=` when the harness changes and resets
  selection; searchable multi-select with removable chips; selected tags ride
  both the draft (`files:`) and the submission. A **Submit** button (gated on
  a non-empty draft + registered root) calls `doSubmit`, which announces
  success/failure in the existing live regions (`role=status` / `role=alert`).
- Tag-picker + `ok`/error CSS tokens added to `PANEL_CSS`.

## Tests

- `tests/test_toolbox_draft.js` (T3): `composeUserPrompt` lists tagged files as
  context (path + text). Suite 24/24.
- `tests/test_toolbox_serve.sh` +7 cases: `/api/files` listing (skips `.bin`,
  includes `src/cli.ts` + `CHECKPOINTS.md`) and unregistered-root 400;
  `/api/intake` 422 (empty) / 400 (malformed + unregistered) / 200 (writes
  `feature-request.md` with the context footer, `spawned_process:false`);
  panel ships the tag-picker + Submit markup and the submit notifications.
  Suite 40/40.
- Fixture gained `src/cli.ts` + `blob.bin` to exercise the allowlist.

## Verification

- `bash tests/run_tests.sh` → **ALL SUITES PASSED**.
- `./init.sh` → **exit 0** (preflight status:warn is advisory NOTEs only).
- Browser (port 8799, dogfood `handyman`): tag picker loaded 127 files;
  multi-select chips rendered; live `POST /api/intake` wrote
  `feature-request.md` (`ok:true`, `spawned_process:false`). Overwritten
  tracked `feature-request.md` restored via `git checkout`.

## Design notes / decisions

- **Submit = persist, not spawn.** "Submit to the harness" writes the
  reviewed draft to the harness's intake artifact (`feature-request.md`),
  which the leader consumes on the next run. Spawning an autonomous agent
  loop from a localhost HTTP request is uncontrolled and untestable; the
  acceptance ("does not spawn a handyman process") is satisfied trivially and
  the response carries `spawned_process:false` for clarity.
- **Security:** tagging reuses the registry as the read allowlist (same model
  as `/api/md`); path traversal blocked by containment on the resolved
  absolute path; binaries excluded by extension + skip-dir set. CSP, Host
  check, and 127.0.0.1 hard-bind unchanged.
- Lint: 5 pre-existing biome errors in `toolbox_draft.ts` (format + unused
  params) — confirmed identical with my changes stashed; my changes add 0 new
  errors. CI does not gate on `npm run lint` (only build + run_tests.sh +
  shellcheck).

## Files

- `handyman/src/toolbox_serve.ts` (endpoints, allowlist, CSS)
- `handyman/src/toolbox_draft.ts` (tagged-file context)
- `handyman/assets/toolbox_panel.js` (tag picker + submit UI)
- `tests/test_toolbox_serve.sh`, `tests/test_toolbox_draft.js`
- `.handyman/feature_list.json` (feature 27)

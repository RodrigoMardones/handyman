# Workstation: Live Fleet Panel

A localhost-only live panel over the fleet registry: visualization of every
registered harness plus the formal interaction route — request drafts, direct
pending intake, block/unblock, and on-demand verification. The static
`fleet.py moc --html` page remains the shareable artifact; the workstation is
the operator's interactive view. Design: `docs/analisis-monitoreo-flota.md`
(plan) and [fleet.md](./fleet.md) (the read-only layer it builds on).

## Quick Start

```bash
python scripts/workstation.py serve                 # http://127.0.0.1:8765
python scripts/workstation.py serve --port 0        # ephemeral port
```

Flags: `--handyman-root P` (registry override; else `HANDYMAN_ROOT`, else
`$HOME/HANDYMAN`), `--refresh-seconds N` (panel poll, default 7),
`--verifier-timeout S` (default 300). The server runs in the foreground and
stops with Ctrl+C — no daemon mode by design. At start it prints the URL and
the **session token**; the token is embedded in the served page and required
on every mutation.

## Endpoints

| Method + path | Body | 200 | Errors |
|---|---|---|---|
| GET `/` | — | the panel (self-contained HTML) | — |
| GET `/api/state` | — | one document: snapshots + health signals + queue `features` + intake `draft` state (`absent`/`pristine`/`filled`) per harness, fleet aggregate, timeline (last 20), `verifier_busy` | — |
| POST `/api/request-draft` | `{root, name, title, context, includes, acceptance[], verification, skills, force?}` | `{ok, path, overwrote}` | 400 / 403 / 409 / 413 / 500 |
| POST `/api/feature/add` | `{root, name, title?, description?, acceptance?[]}` | `{ok, message, id, snapshot}` | 400 / 403 / 409 duplicate / 500 |
| POST `/api/feature/block` | `{root, name, reason}` | `{ok, message, snapshot}` | 400 / 403 / 409 / 500 |
| POST `/api/feature/unblock` | `{root, name}` | `{ok, message, snapshot}` | 400 / 403 / 409 / 500 |
| POST `/api/verifier/run` | `{root}` | `{ok, verifier: {result, exit_code}}` | 400 / 403 / 409 busy |

Every error body is `{ok: false, error}`; wrong method on a known path → 405.

## Action Nomenclature

Panel actions are labeled with the workflow-stage vocabulary of
[workflow.md](./workflow.md), so the documentation and the UI name the same
thing the same way; each button's `title` states the stage and the artifact
the action produces.

| Panel action | Workflow stage | Endpoint | Artifact / effect |
|---|---|---|---|
| Draft request | 1 · Intake (form) | POST `/api/request-draft` | CORE-filled `feature-request.md` in the target workspace |
| Add pending feature | 1 · Intake | POST `/api/feature/add` | `pending` entry via `feature.py add` (contract keys, green gate last) |
| Block | state machine | POST `/api/feature/block` | `blocked` + `blocked_reason` via `feature.py block --reason` |
| Unblock | state machine | POST `/api/feature/unblock` | back to `pending` via `feature.py unblock` |
| Run verifier | 4 · Verification | POST `/api/verifier/run` | exit code of the target's own `init.sh` (result session-local) |

## Panel Design Guidelines

The presentation layer is governed by design tokens, one formatting layer and
three routed views (design: `docs/analisis-ux-ui-workstation.md` plans A–E).
The rules below are the contract any panel change keeps.

### Design tokens

Every color, spacing and type value lives once as a `--hw-*` variable in the
`:root` block of `_HTML_STYLE` (`scripts/fleet.py`), shared by the live panel
and the static `moc --html` export; dark mode only reassigns variables. The
suite holds the invariant: every hex value sits on a `--hw-` definition line
(no stray colors), on both pages.

| Token | Role | Light / dark | Why |
|---|---|---|---|
| `--hw-bg`, `--hw-surface` | page and raised surfaces (dialog, badges) | `#ffffff` `#f2f4f7` / `#16181d` `#1f232b` | one background pair themes both modes |
| `--hw-fg`, `--hw-muted` | text and secondary text | `#1a1a1a` `#555555` / `#e6e6e6` `#9aa0a6` | two text levels, no ad-hoc grays |
| `--hw-border` | rules and controls | `#d0d0d0` / `#3a3f47` | one border everywhere |
| `--hw-accent` | links, focus, identity (favicon) | `#0a5dc2` / `#6cb2ff` | a single brand accent |
| `--hw-ok`, `--hw-warn`, `--hw-danger` | semantic states | `#1a7f37` `#9a6700` `#b00020` / `#4ccf6a` `#e3b341` `#ff8a80` | color is a secondary cue on textual badges |
| `--hw-space-1..4` | spacing scale | 0.25 / 0.5 / 1 / 2 rem | four steps replace ad-hoc values |
| `--hw-text-s/m/l` | type scale | 0.85 / 0.95 / 1.3 rem | meta, body, wordmark |

Semantic states (drift, health signals, verifier results, queue statuses)
render as `.badge` elements: the text is the primary encoding and the token
color a secondary cue — never color-only.

### Interaction contract

- One formatting layer (`fmt.*` in the panel JS) turns machine state into
  sentences: statuses lose the underscore (`in progress`), aggregate, timeline
  and queue lines are templated phrases, and dates render relative with the
  absolute date kept in `title`. Rendering stays `textContent`-only, so text
  from harness files never becomes markup.
- Every mutating button disables while its request runs (`working...`), and
  results land in the statusline with a textual `ok:` / `error:` prefix.
- Empty states share one `.empty` pattern ("no X yet").
- Forms validate natively (`required`, `pattern` for slugs) before any server
  round-trip; each dialog opens with a one-line help stating what the action
  produces and where it lands, including the Draft request vs Add pending
  feature distinction.

### Views

`location.hash` routes three views over the single `/api/state` document —
deep links and back/forward are native, with no framework or build step:

| Route | Intent | Content |
|---|---|---|
| `#/fleet` | read | slim overview (identity, workload, session); the project name links to the detail and a `N signal(s)` badge marks attention |
| `#/harness/<name>` | act | everything about one harness: identity, session, health, queue grouped by status, `feature-request.md` draft state, per-harness timeline, and actions grouped by stage rendered **state-first** — transitions the live statuses cannot take are not painted |
| `#/timeline` | audit | cross-fleet closures, newest first |

Action labels and grouping follow the Action Nomenclature glossary above.

## Security Model

- **127.0.0.1 hard bind** — no flag exists to widen it.
- **Session token** (`secrets.token_hex(16)`) required as
  `X-Workstation-Token` on every POST; pages served elsewhere cannot forge
  mutations (drive-by CSRF guard).
- **Host-header check** — requests whose `Host` is not local are refused
  (DNS-rebinding guard).
- **The registry is the write allowlist**: a posted `root` must resolve to a
  registered `project_root`, otherwise nothing is touched (400).
- **Argv-only subprocesses** — mutations shell to `scripts/feature.py` with
  argument arrays; no shell interpolation anywhere.
- **DOM-safe rendering** — harness-file text (titles, reasons) is rendered via
  `textContent` only, so stored markup never executes in the panel.
- `Content-Type: application/json` required, bodies capped at 1 MiB,
  `Cache-Control: no-store` on every response.

## How Writes Work

The panel is a front-end for the formal intake route — it never edits
`feature_list.json` directly:

- **Request draft** writes a CORE-filled `feature-request.md` (canonical
  name) into the target workspace. The file is only replaced when absent or
  still identical to the pristine shipped template; real content requires
  `force`. The leader later converts the form with `feature.py add` during
  `run-feature`, exactly as [workflow.md](./workflow.md) describes.
- **Add** shells `feature.py --root TARGET add` with the contract keys only
  (`name/title/description/acceptance`); the green gate is appended as the
  last acceptance bullet when missing (format contracts in
  [templates.md](./templates.md)).
- **Block / Unblock** run `feature.py block --reason` / `feature.py unblock`
  (the `blocked -> pending` transition added for the workstation).
- **Verify** runs the target's own `init.sh` through `fleet.run_verifier`,
  one run per root at a time, result session-local.

Because writes go through the skill-side CLI, drifted harness versions (for
example 1.8.9 installs without `harness.config.json`) accept them unchanged.

## Testing Notes

`tests/test_workstation.sh` boots one server per case on `--port 0`
(ephemeral), parses the URL and token from stdout with a bounded readiness
poll, and runs fixtures under a temporary `HANDYMAN_ROOT` — the real
`$HOME/HANDYMAN` and real harnesses are never touched. macOS note: fixture
paths canonicalize (`/var/...` → `/private/var/...`), so assertions poll JSON
fields rather than matching path strings.

## Limitations

- **Last-writer-wins**: `feature.py` rewrites the whole `feature_list.json`;
  the panel serializes its own writes and re-reads after each action, but a
  concurrent agent session editing the same harness can still race it.
- **Verifier results are session-local** (kept in the page, not on disk);
  the durable verification record remains the harness's own history.
- The panel targets one operator on one machine; multi-user access is out of
  scope by design (the bind and token model assume localhost).

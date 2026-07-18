# ToolBox: Multi-Harness Observation

Read-only observation of every Handyman harness on the machine from a single
place. One registry, one collector, derived health signals, a global Obsidian
MOC and a live localhost observer. TypeScript port of the legacy fleet layer
(renamed toolBox); design and evidence: `docs/analisis-observador-fleet-web.md`
in the skill repo.

## Philosophy

- **Pull, read-only, observe-don't-gate.** `status` and `health` never mutate a
  harness and exit 0 by default (the `metrics.js`/`preflight.js` pattern);
  gating is opt-in via `health --strict`.
- **Disk is the source of truth.** The registry stores ONLY `project_root` +
  the registration date. Names, versions, counts, and sessions are read live on
  every query, so there is no mirrored state to drift.
- **Drift tolerant.** Harnesses of different `harness_version`s coexist; every
  missing field degrades to `null`/`NOTE`, never an exception. An unreadable
  root becomes an `UNREADABLE` signal, not a crash.
- **No foreign verifier runs by default.** The toolBox only executes another
  project's `init.sh` under the explicit `status --run-verifier` opt-in.

## Registry

`$HANDYMAN_ROOT/registry.json` — default `$HOME/HANDYMAN`, overridable with the
`HANDYMAN_ROOT` environment variable or `--handyman-root` (flag > env > home).
Schema: `assets/schemas/registry.schema.json` (draft-07,
`additionalProperties:false`).

```json
{
  "version": 1,
  "harnesses": [
    { "project_root": "/abs/path/to/project", "registered": "2026-07-01" }
  ]
}
```

## Subcommands

Run from the skill repo: `node handyman/dist/toolbox.js <subcommand>`.

| Subcommand | Does | Exit |
|---|---|---|
| `register PATH [--date D]` | add a root after checking it resolves a workspace with `feature_list.json`; idempotent | 0 / 1 |
| `unregister PATH` | remove a registered root | 0 / 1 |
| `list [--json]` | show registered roots with live `project_name` | 0 |
| `discover --scan DIR [--register] [--max-depth N]` | find harnesses under a tree; prunes `node_modules`, hidden dirs | 0 / 1 |
| `status [--json] [--run-verifier] [--verifier-timeout S]` | per-harness live report + fleet aggregate; verifier opt-in reports `green` / `red` / `skipped` / `timeout` | 0 always |
| `timeline [--json] [--limit N]` | merged closure chronology: history headings + pushed events, newest first | 0 always |
| `heartbeat [--root R] [--feature F] [--date D]` | append one closure event to `$HANDYMAN_ROOT/events.jsonl` — a drop-in `post_run` hook | 0 / 1 |
| `health [--strict] [--stale-days N] [--idle-days N] [--today D] [--json]` | derived signals per harness | 0; `--strict` 1 on signals |
| `moc [--html]` | regenerate the global toolBox MOC at `$HANDYMAN_ROOT/index.md`; `--html` adds a self-contained `index.html` | 0 / 1 |
| `serve [--port N]` | the live observer (below) | runs until Ctrl+C |

`status` composes existing primitives — `metrics.collect()`, the live session
from `progress/current.md` frontmatter, `harness_version` vs the skill's
current version, and the last dated closure — it reimplements no parsing.

## Health Signals

| Signal | Rule | Default window |
|---|---|---|
| `INVARIANT` | more than one feature `in_progress` | — |
| `STALE_WIP` | `in_progress` and `current.md`'s `updated` stamp older than `--stale-days` (or missing) | 7 days |
| `BEHIND` | installed `harness_version` older than the skill version, or unsealed | — |
| `IDLE` | `pending` features and the last dated closure older than `--idle-days` (or none) | 14 days |
| `UNREADABLE` | the registered root no longer resolves a readable workspace | — |

`--today YYYY-MM-DD` makes date-relative signals deterministic (tests, replays).

## Observer (`toolbox serve`)

`node handyman/dist/toolbox.js serve [--port N]` — a localhost-only, read-only
web panel over the registry: `disk → fs.watch (debounced 250 ms) → SSE →
browser`. The frontend is React 18 (UMD + htm from `node_modules`, no build
step; `assets/toolbox_panel.js`). Hash views:

| Route | Content |
|---|---|
| `#/fleet` | one row per harness: version drift, workload counts, live session, signals |
| `#/harness/<name>` | meta + signals, markdown quick-views, per-harness KPI strip + throughput sparkline, queue kanban by status, graphify graph iframe |
| `#/timeline` | cross-fleet closures, newest first |
| `#/search` | client-side BM25 (MiniSearch in the browser) over features + backlog + progress + docs; reindexes on every SSE change |
| `#/intake` | draft a feature request: pick a target harness + LLM provider, free-text the request, stream the draft over SSE, tag workspace files, edit it, and submit it to the target harness |

Endpoints: `/api/state` (snapshots + health signals + feature queues + fleet
aggregate + last 20 timeline events), `/api/md` (whitelisted files inside
registered roots only), `/api/corpus` (search corpus for the BM25 index),
`/api/files?root=` (taggable workspace files as relative paths inside a
registered root — the intake tag picker), `/api/providers` (LLM provider
availability), `/graph/<name>/graph.{html,json}`, `/vendor/*`
(minisearch/marked/dompurify/vis-network UMD served from `node_modules`),
`/events` (SSE), `POST /api/draft` (the intake-draft relay — streams text, writes
no disk), and `POST /api/intake` (the intake submit — the sole disk write; see
below). Security: hard 127.0.0.1 bind, Host-header check (DNS-rebinding guard),
GET-only (405 otherwise) with exactly two deliberate POST exceptions,
`POST /api/draft` streams a draft as text and writes no disk while
`POST /api/intake` is the only route that writes disk — it persists the reviewed
draft to one allowlisted file (`feature-request.md`) inside a registered
workspace and never spawns a process. The registry is the read allowlist,
`Cache-Control: no-store` is set everywhere, agent markdown is rendered with
`textContent` only and sanitized client-side, and a server-side
`Content-Security-Policy` (`default-src 'self'; script-src 'self'
'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;
connect-src 'self'`) is the second defense on every response.

### LLM layer (`src/toolbox_llm.ts`)

Server-side provider port for the intake-drafting plan
(`docs/analisis-peticiones-llm-toolbox.md`): one `LlmProvider` interface with
two adapters parameterized by `baseUrl` — Anthropic Messages (Claude via
`ANTHROPIC_API_KEY`; Z.ai GLM Coding Plan via `Z_AI_API_KEY`, verified
empirically at `api.z.ai/api/anthropic`) and OpenAI-compatible (Z.ai
pay-as-you-go with `Z_AI_API_MODE=paas`; Ollama, availability-probed).
`copilot` is a declared future id. Keys load from the launch directory's
`.env` (existing env always wins, values never logged) and never reach the
browser: `GET /api/providers` returns only `{id, available, model}`.

### Intake-draft relay (`POST /api/draft`)

`POST /api/draft {root, prompt, provider, files?}` is the case-estrella of
`docs/analisis-peticiones-llm-toolbox.md` §4-5 (Plan A). It builds the intake
prompt from the bundled `assets/feature-request.template.md` (stable,
cacheable: CORE/OPTIONAL shape + two archetype examples + the green-gate-as-
last-bullet rule + the `node dist/feature.js add` contract) plus the volatile
context of the target harness (feature queue, top-k BM25 duplicate candidates
via MiniSearch in Node, discovery skills/agents, and the contents of any
tagged workspace files named in `files[]`), calls the chosen provider
and streams the draft over SSE. The server validates `root` against the
registry and `provider` against the available ones (400 otherwise). SSE
events: `delta {text}` per chunk, a final
`result {archetype, draft_md, possible_duplicates}`, and `error {code}` on a
provider failure (code mapped from `LlmError`). **It never writes disk** —
the draft always goes through the human (edit/copy) before any destination;
seeding `feature_list.json` stays with the leader (`node dist/feature.js add`).
The prompt-construction + relay live in `src/toolbox_draft.ts`, unit-tested
with a fake provider (`tests/test_toolbox_draft.js`).

### Intake submit and file tagging (`POST /api/intake`, `GET /api/files`)

The `#/intake` view is a closed loop: draft over SSE, review, then submit. The
submit half is `POST /api/intake {root, draft_md, files?}` — the observer's
**only disk write**. It persists the reviewed `draft_md` as the target
workspace's `feature-request.md` (the same intake artifact the leader consumes
on the next `run-feature`), appends the tagged files as an HTML comment footer
so the reference is recorded without polluting the visible body, and refuses an
invalid or empty payload with an HTTP 4xx. It never spawns a process: the
feature still enters `feature_list.json` the normal way, via `node dist/feature.js
add`. `GET /api/files?root=` feeds the tag picker — it returns relative paths of
tag-eligible files inside a registered root only (never an unregistered path),
and the chosen files ride along on both `POST /api/draft` (extra context) and
`POST /api/intake` (recorded footer).

### Observer UI features

The panel (`assets/toolbox_panel.js`, React 18 + htm, no build step) carries a
set of intentionally hand-rolled features, each adding no chart/markdown/theme
library:

- **Project info (Plan A).** The harness detail view surfaces what `metrics.collect()`
  already computes: a KPI strip (approval rate, report coverage, closures in the
  last 14 days) and an inline SVG throughput sparkline — one `<polyline>` themed
  via `--hw-*` tokens (`color: currentColor`), `role=img` with an `aria-label`,
  no chart dependency. A Docs quick-view row exposes business/architecture/
  conventions/verification over the existing `/api/md` mechanism, degrading when a
  doc is missing; dates render relative with the absolute date in `title=`.
- **Theme toggle (Plan B).** A synchronous anti-flash inline script in the served
  `<head>` reads `localStorage` key `hw-theme:1` and sets `data-theme` on `<html>`
  before first paint. A 3-state control (light/dark/system) drives `aria-pressed`;
  `system` removes the key and follows `matchMedia('(prefers-color-scheme: dark)')`
  live. No hex values are introduced — the existing `:root[data-theme]` /
  `prefers-color-scheme` token blocks do all the work.
- **Safe markdown render (Plan C).** The raw `<pre>` viewer was replaced with
  `marked` + `DOMPurify` (both served as UMD from `node_modules` via `/vendor/*`).
  Agent-produced markdown is treated as untrusted even though it is local:
  `DOMPurify` strips dangerous tags/attributes (scripts, event handlers,
  `javascript:` URLs), and the server-side CSP is the uniform second defense.
  Applies to current/history/checkpoints/backlog/docs quick-views; search excerpts
  stay `textContent`.
- **Accessibility live regions (Plan D).** Exactly two persistent live regions
  exist from first render (`role=status` aria-live=polite, `role=alert`), empty
  at load. SSE changes are queued and a debounced summary is announced (e.g.
  "3 features updated in handyman"), never one event at a time; connection
  loss/recovery lands in the alert region as text. The connection indicator uses
  text + color, never color alone. `prefers-reduced-motion: reduce` disables
  animations and auto-scroll. Empty fleet/harness/search states give an
  actionable hint instead of a bare dash.
- **Command palette + shortcuts (Plan E).** A hand-rolled palette built on the
  native `<dialog>` (`showModal`, focus return on close) plus a single
  document-level keydown listener. `⌘K`/`Ctrl+K` opens the palette; inside it the
  MiniSearch index already in the client ranks actions (go to project/view, open
  an md quick-view, search), `Enter` runs the selection, `j/k` or arrows move it.
  Global shortcuts (`/` focuses search, `g+letter` navigates views, `?` opens
  help) are inert while focus is in an input/textarea/select or the palette input
  (except its own navigation keys); an `event.target` guard keeps typing safe.

The search view is deliberately client-side retrieval — the skill's RAG
analysis (`docs/analisis-rag-handyman.md`) concluded the harness corpus needs
no server-side RAG pipeline: a BM25 index rebuilt from disk in milliseconds is
immune to staleness; agents keep using agentic search.

## Typical Loop

```bash
node handyman/dist/toolbox.js discover --scan ~/proyectos --register   # once
node handyman/dist/toolbox.js status                                   # what's going on?
node handyman/dist/toolbox.js health                                   # anything stuck?
node handyman/dist/toolbox.js serve                                    # live observer
```

## Heartbeat as a post_run Hook

```json
"post_run": ["node handyman/dist/toolbox.js heartbeat --root ."]
```

That relative path works in the skill repo itself; a target project must point
at wherever the skill lives. `feature done` treats a failing `post_run` step
as a warning, so a missing toolBox script never blocks a verified closure.
`timeline` merges events and history, preferring history on
(project, feature, date) collisions; event-only entries render as
`(heartbeat)`.

## Future Work (deliberately out of scope)

- **Role-CLI writes from the observer** (start/block/unblock a feature directly)
  — beyond the single intake submit that `POST /api/intake` already covers; would
  require the session-token model of the legacy workstation to gate mutating
  role-CLI calls.
- **ToolBox upgrades** — orchestrating `node dist/upgrade_harness.js` over every
  harness flagged `BEHIND`.

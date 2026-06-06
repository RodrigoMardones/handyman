# Graphify Context Layer

Handyman keeps work auditable by treating disk as the source of truth. A
[graphify](https://github.com/safishamsi/graphify) knowledge graph extends that
principle to *context*: instead of re-reading the codebase from scratch every
session, agents query a persistent, on-disk graph that already knows which files
define which concepts and how they connect.

The graph lives in `PROJECT_ROOT/graphify-out/`:

| File | Purpose |
|------|---------|
| `graph.json` | Raw graph data queried by `graphify query`, `path`, and `explain`. |
| `GRAPH_REPORT.md` | Plain-language audit: god nodes, communities, surprising edges. |
| `graph.html` | Interactive visualization, open in any browser. |

This reference complements [workflow.md](./workflow.md) (where roles run) and
[tools.md](./tools.md) (what each role may do). The graph is an additive context
layer: when it is missing, every role falls back to normal reading, so the
harness never depends on it to function.

## Why A Context Graph

- The explorer answers narrow, read-only questions. Without a graph it scans the
  repo blindly; with one it jumps straight to the exact `source_location`s the
  graph returns, spending fewer tokens under a cheaper model.
- The leader can read `GRAPH_REPORT.md` god nodes and community boundaries to
  scope exploration before delegating.
- The graph is persistent and honest: every edge is tagged `EXTRACTED`,
  `INFERRED`, or `AMBIGUOUS`, so agents can weigh how much to trust a connection.

## Install Rule

**graphify must be installed for the context layer to work.** Install it once
per machine, then build the graph once per project.

```bash
# install the CLI (pick one)
uv tool install graphifyy
pip install graphifyy
# optional: enable Gemini-backed semantic extraction
pip install 'graphifyy[gemini]'
```

The command is `graphify`; the package is `graphifyy`. Verify with
`command -v graphify`. The verifier (`init.sh`) prints this install hint as a
non-blocking advisory when graphify is absent — a missing context layer warns
but never fails a build.

Build the graph for the project (run from `PROJECT_ROOT`):

```bash
/graphify            # full pipeline -> graphify-out/graph.json + GRAPH_REPORT.md
```

## Keeping The Graph Fresh

A stale graph gives misleading context, so keep it current.

- **Automatic (recommended):** install the post-commit hook. It re-runs
  structural (AST) extraction on changed code files after every commit and
  rebuilds `graph.json`. AST extraction is deterministic and free — no tokens.

  ```bash
  graphify hook install     # rebuild the code graph after every commit
  graphify hook status
  graphify hook uninstall
  ```

- **Docs and prose:** the hook ignores non-code changes. After editing markdown,
  papers, or other documents, refresh semantically with `/graphify --update`,
  which re-extracts only new or changed files. Semantic extraction costs tokens,
  so run it on demand rather than on every commit.

- **Verifier advisory:** `init.sh` checks `graphify-out/graph.json` and prints a
  non-blocking `NOTE:` when the graph is missing or older than tracked source
  files, reminding the session to rebuild.

## How Roles Use The Graph

When `graphify-out/graph.json` exists, roles consult it before reading code:

- **Explorer:** runs `graphify query "<assigned question>"` first, then starts
  from the returned `source_location`s instead of scanning blindly. See the
  explorer steps in [workflow.md](./workflow.md) (Parallel Exploration).
- **Leader:** may read `GRAPH_REPORT.md` god nodes and community boundaries to
  pick narrow explorer questions and spot cross-module coupling before
  delegating implementation.
- **Any role answering a codebase question:** prefers `graphify query`,
  `graphify path "A" "B"`, or `graphify explain "X"` over a cold read, and quotes
  the `source_location` when citing a fact.

If the graph is missing, every role falls back to a normal read with no change in
behavior.

## What To Document Per Project

When bootstrapping or migrating a harness, record the graphify decisions so they
are auditable, next to the model and tool policy in the harness `docs/` (for
example a short note in `docs/conventions.md`):

- Whether graphify is installed and the post-commit hook is enabled.
- Which directory the graph covers (the resolved scan root).
- Any policy for when semantic `--update` runs (for example, before review).

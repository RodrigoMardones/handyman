---
type: Implementation Log
feature: toolbox_search
status: implemented
role: implementer
updated: 2026-07-17
tags: [handyman/role/implementer, handyman/feature/toolbox_search]
---

# Implementation Report: toolbox_search

## Files Changed

- `handyman/src/toolbox_serve.ts`: `/api/corpus` builds the retrieval corpus
  live from disk — features (id/title/status/sprint/blocked_reason), backlog
  and docs markdown (4 KB cap per doc), progress current/history and
  CHECKPOINTS.md — across every registered harness.
- `handyman/assets/toolbox_panel.js`: SearchView builds a **MiniSearch (BM25)**
  index in the browser (`/vendor/minisearch.js` UMD), fields title+text with
  title boost, prefix + light fuzzy; rebuilds on every SSE change
  (indexVersion bump); non-feature hits open through the `/api/md` whitelist.

## Design Notes

- This lands the retrieval decision of `docs/analisis-rag-handyman.md`: no
  server-side RAG pipeline — a client-side BM25 index rebuilt from disk in
  milliseconds is immune to the staleness that kills vector indexes on
  fast-mutating state. Agents keep agentic search; the observer's search is
  for the human. Orama stays the upgrade path if hybrid (vector+text) is ever
  justified by the backlog-dedup use case.
- Corpus on the real fleet: 325 docs (37 feature, 266 backlog, 14 docs,
  8 progress) — far below any client-side limit.

## Test Output

```text
tests/test_toolbox_serve.sh TS4 (corpus kinds + content) -> PASS
```

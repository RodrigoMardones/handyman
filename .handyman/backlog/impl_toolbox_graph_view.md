---
feature: toolbox_graph_view
status: implemented
role: implementer
updated: 2026-07-17
tags: [handyman/role/implementer, handyman/feature/toolbox_graph_view]
---

# Implementation Report: toolbox_graph_view

## Files Changed

- `handyman/src/toolbox_serve.ts`: `/graph/<name>/graph.{html,json}` serves
  each registered harness's `graphify-out` export (name resolved via
  `harness.config.json`, registry as allowlist, 404 degrade when absent);
  `/api/state` carries `has_graph` per harness.
- `handyman/assets/toolbox_panel.js`: HarnessView embeds the graph in an
  iframe when `has_graph`, else shows a plain note pointing at `/graphify`.

## Design Notes

- Iteration 0 of plan C (`docs/analisis-observador-fleet-web.md`): reuse the
  self-contained `graph.html` graphify already generates — zero new
  visualization code. force-graph over `graph.json` stays as a future
  iteration if cross-linking is wanted.
- Verified: `/graph/handyman/graph.html` 200, `/graph/phily-app/graph.html`
  404 (no export), iframe present in the rendered harness view (headless
  Chromium DOM dump).

## Test Output

```text
tests/test_toolbox_serve.sh TS5 (graph passthrough + 404 degrade) -> PASS
```

---
feature: history_compaction
status: implemented
role: implementer
updated: 2026-07-15
tags: [handyman/role/implementer, handyman/feature/history_compaction]
---

# Implementation Report: history_compaction

## Files Changed

- `handyman/scripts/sprint.py` (+`_compact_history(workspace, sid, done_names, dry_run)`: cuerpo -> stub `- archived to sprint <id>; narrative in docs/sprints/sprint.<id>.md`, heading fechado BYTE-IDENTICO; wired en cmd_close tras render+archive, y en el dry-run como `would compact N`; docstring close actualizado)
- `handyman/references/workflow.md` (Sprint Protocol paso 3 enumera la compaction)
- `handyman/references/anatomy.md` (fila sprint.py: compacts history bodies, headings stay for metrics)
- `tests/test_sprint.sh` (S9 comprime archivada + respeta no-archivada, S10 dry-run no escribe, S11 idempotencia cross-sprint: stub SP1 aparece exactamente 1 vez tras cerrar SP2)

## Design Notes

- Memory-decay de beads aplicado al artefacto correcto: el sprint doc YA captura Branch/Tools/narrativa (render ocurre ANTES de compactar, orden garantizado en cmd_close); history conserva el heading porque `metrics.history_closures` regex-ea `^## <fecha> - Feature <id>: <name>$` anclado — append al heading corrompia el name parseado, por eso el stub va en el CUERPO (refinamiento documentado sobre el research doc, mismo resultado: entrada de 1 linea util).
- Idempotencia: un cuerpo que ya es stub (`- archived to sprint`) se salta; S11 lo prueba con dos sprints reales.
- Throughput derivable para siempre: headings intactos = closures contables post-compaction.

## Test Output

```text
test_sprint.sh: 11 run, 11 passed / shellcheck clean / ./init.sh EXIT=0
```

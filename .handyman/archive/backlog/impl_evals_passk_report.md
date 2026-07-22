---
type: Implementation Log
feature: evals_passk_report
status: implemented
role: implementer
updated: 2026-07-15
tags: [handyman/role/implementer, handyman/feature/evals_passk_report]
---

# Implementation Report: evals_passk_report

## Files Changed

- `handyman/scripts/evals.py` (+`--report-passk` opt-in en el subparser measure; +`_report_passk(pos_rates, neg_rates, k)` que deriva pass@1/pass@k desde las tasas ya medidas: `1 - (1-r)^k`, cero llamadas nuevas; reporta fp@1/fp@k para negativos)
- `handyman/references/evals.md` (nueva seccion `## pass@k (completion reliability)` con la formula, el significado para positivos/negativos y por que complementa a la confusion matrix)
- `tests/test_evals.sh` (T8: --report-passk imprime pass@1/pass@3=1.00 + fp@1/fp@3=0.00 sobre el fixture determinista)

## Design Notes

- Opt-in: la confusion matrix sigue siendo la salida por defecto; pass@k se anade solo cuando se pide (no rompe consumidores del formato base).
- Aproximacion `1 - (1-r)^k` estandar para pass@k estocastico (citada en eval-harness); no necesita mas runs que los que `--runs N` ya hizo — k=N por construccion.
- El fp@k de negativos es el complemento: la probabilidad de disparo espurio en k intentos, exactamente el riesgo cuando el skill vive dentro de un harness de larga duracion.
- Plan E 2/2 cerrado: el par observation-shape + pass@k cubre las dos mitades de la deuda de forma (scripts estables + metricas de completitud).

## Test Output

```text
test_evals.sh: 8 run, 8 passed / test_docs.py: 193 run, 193 passed
./init.sh EXIT=0
```

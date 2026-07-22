---
type: Review Log
feature: harness_evidence_debt_advisory
id: 52
role: reviewer
date: 2026-07-19
actor: agente-local (single-agent session)
verdict: approved
tags: [handyman/backlog/review]
---

# Review: harness_evidence_debt_advisory (feature 52)

## Independencia de roles

Mismo agente que implementó. Ver la nota de
[[review_harness_unblock_verbs]]: el veredicto va sobre el verificador y el
diff, no sustituye una revisión independiente.

## Acceptance, una por una

| # | Bala | Evidencia |
|---|------|-----------|
| 1 | Un `NOTE:` por feature `done` sin `review_<name>.md`, nombrando el archivo | T20 verde; el NOTE incluye la ruta completa del archivo faltante |
| 2 | El NOTE no cambia el exit code | T20 asserta `CODE -eq 0` junto al grep del NOTE; `./init.sh` sale 0 con el NOTE presente |
| 3 | Un harness sin deuda es silencioso | T21 verde: `! grep "is done but"` |
| 4 | Reusa `computeEvidenceDebt` del core, no re-implementa | import desde `@handyman/toolbox-core/triage`; el cuerpo de la función es un `for` sobre su resultado |
| 5 | `test_init.sh` cubre las dos direcciones | T20 (deuda) y T21 (limpio) |
| 6 | `run_tests.sh` passes, `./init.sh` exit 0 | ALL SUITES PASSED (29 suites); init.sh exit 0 |

## Lo que miré con desconfianza

- **Que el NOTE se cuele en la lista de gaps.** Es el riesgo central: un gap
  rompe el exit code de todo harness instalado con deuda. La función escribe a
  `process.stderr` y retorna `void` — no tiene forma de contribuir a `gaps`,
  igual que los otros dos advisories. T20 lo fija con el assert de exit 0.
- **El `try/catch` que se traga todo.** Silencia cualquier error de
  `computeEvidenceDebt`, incluido uno genuino. Es la decisión correcta para un
  advisory no bloqueante (un workspace ilegible no debe tumbar el validador),
  pero significa que un bug dentro de `computeEvidenceDebt` se manifestaría
  como silencio, no como fallo. Aceptable dado que esa función ya está testeada
  en el core; anotado por si el advisory alguna vez se endurece a gap, momento
  en el cual este catch debe revisarse.
- **Doble contabilidad con `checkFrontmatterAdvisory`.** Un `review_x.md` que
  existe pero está vacío: `computeEvidenceDebt` lo cuenta como presente (mira
  nombres de archivo), y el advisory de frontmatter lo NOTEa por frontmatter
  faltante. Las dos señales son correctas y no se contradicen; cubren huecos
  distintos.

## Hallazgo que vale más que la feature

En su primera corrida real el advisory encontró **una** entrada de deuda en
todo el backlog: la feature 51, cerrada por esta misma sesión sin reporte de
reviewer. Las 21 features anteriores tienen su `review_`. O sea: el gate no
estaba mintiendo sobre un backlog podrido — estaba ciego a la deuda que esta
sesión acababa de crear, y la detectó de inmediato. Saldada en
[[review_harness_unblock_verbs]].

## Veredicto

**Aprobada.**

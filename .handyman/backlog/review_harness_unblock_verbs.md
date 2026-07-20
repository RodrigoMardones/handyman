---
type: Review Log
feature: harness_unblock_verbs
id: 51
role: reviewer
date: 2026-07-19
actor: agente-local (single-agent session)
verdict: approved
tags: [handyman/backlog/review]
---

# Review: harness_unblock_verbs (feature 51)

## Independencia de roles — declarado antes que el veredicto

Este reporte lo firma el mismo agente que implementó la feature. Es la
desviación que documentan las features 32-35 y la que la feature 55
(`harness_report_actor`) va a hacer visible en el registro estructurado. El
veredicto de abajo vale lo que valga una revisión sin segundo par de ojos:
está firmado sobre el diff y el verificador, no sobre confianza en el autor,
pero no sustituye una revisión independiente.

Este reporte además existe porque el advisory de la feature 52 lo exigió: la
51 se había cerrado sin él.

## Acceptance, una por una

| # | Bala | Evidencia |
|---|------|-----------|
| 1 | `unblock` deja `pending`, borra `blocked_reason`, sale 0 | F28 verde; verificado a mano sobre fixture |
| 2 | `unblock` sobre no-blocked sale != 0 sin tocar el archivo | F29 verde, con assert de bytes idénticos antes/después |
| 3 | `acceptance --acceptance A --acceptance B` deja exactamente `["A","B"]` | F30 verde, compara el JSON serializado |
| 4 | `acceptance` sin flag sale != 0 y deja la lista intacta | F31 verde; sale 2 (usage), lista intacta |
| 5 | Ambos validan contra el schema antes de escribir | `saveValidated` corre `validateFeatureList` (Ajv sobre el schema real) y retorna 1 sin llamar a `save` |
| 6 | `tests/test_feature.sh` cubre los 4 casos con el patrón de F3 | F28-F31 siguen la forma de F3: fixture, comando, assert de estado + exit |
| 7 | `run_tests.sh` passes, `./init.sh` exit 0 | ALL SUITES PASSED; init.sh exit 0 |

## Lo que miré con desconfianza

- **`unblock` como reapertura encubierta.** El riesgo real era que `unblock`
  fuese un «set status = pending» genérico capaz de reabrir una feature `done`.
  El guard `feature.status !== "blocked"` lo cierra, y F29 lo fija como
  contrato en vez de dejarlo como detalle de implementación.
- **`acceptance` como borrado silencioso.** Que el flag sea obligatorio (no
  opcional-con-default-vacío) es lo que impide que un olvido borre el
  contrato. Está en el parser, antes de tocar disco: sale 2 sin abrir el
  archivo. Correcto.
- **`saveValidated` sólo en los verbos nuevos.** `add`/`block`/`done` siguen
  escribiendo por `save` sin validar. No es una regresión (así estaban), y la
  acceptance sólo pedía los dos verbos nuevos, pero queda anotado: unificar
  todas las escrituras bajo `saveValidated` es una feature futura barata y de
  bajo riesgo, no un arreglo urgente.
- **Deriva de la lista de verbos.** Grepée por enumeraciones de comandos en
  docs y tests: sólo `references/workflow.md` los nombra en prosa, y esa línea
  se actualizó. No quedó ninguna lista desincronizada.

## Veredicto

**Aprobada.** Las 7 balas tienen evidencia observable. El diff no toca ningún
camino existente: sólo agrega dos ramas al dispatch y un helper de escritura
usado exclusivamente por ellas — lo que explica que las 29 suites pasen sin
editar una sola aserción previa.

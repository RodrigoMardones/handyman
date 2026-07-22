---
type: Review Log
feature: harness_report_actor
id: 55
role: reviewer
date: 2026-07-19
actor: agente-local (single-agent session)
verdict: approved
tags: [handyman/backlog/review]
---

# Review: harness_report_actor (feature 55)

## Independencia de roles

Mismo agente en los tres roles. En esta feature la nota deja de ser un
disclaimer y pasa a ser el caso de prueba: este reporte y su `impl_` hermano
declaran el mismo `actor:`, así que el verificador va a imprimir un NOTE sobre
esta feature en cuanto se cierre. Correcto — es literalmente lo que se
construyó.

## Acceptance, una por una

| # | Bala | Evidencia |
|---|------|-----------|
| 1 | Ambas plantillas documentan `actor:` | 6 checks de `testActorFieldDocumented` (3 por plantilla) |
| 2 | NOTE cuando `impl_<f>` y `review_<f>` declaran el mismo `actor:` | T22 verde; verificado en vivo sobre este repo (4 NOTEs) |
| 3 | El NOTE no cambia el exit code; un reporte sin `actor:` no hace ruido | T22 asserta exit 0; T24 cubre la ausencia del campo; init.sh sale 0 con 4 NOTEs |
| 4 | `test_docs.js` verifica plantillas; `test_init.sh` cubre colisión y actores distintos | 218/218 y 22/22 |
| 5 | `run_tests.sh` passes, `./init.sh` exit 0 | ALL SUITES PASSED (30 suites); init.sh exit 0 |

## Lo que miré con desconfianza

- **Que rompa harnesses instalados.** Es el riesgo por el que esta feature
  necesitaba decisión previa. Tres barreras: el campo es opcional, el aviso es
  NOTE y no gap, y T24 fija que la ausencia del campo es silenciosa. Verifiqué
  además el caso asimétrico (sólo impl declara actor): silencio, correcto — no
  hay con qué comparar.
- **Falsos positivos por whitespace.** `actorOf` hace `trim()` y descarta
  vacíos, así que `actor:` sin valor no cuenta como declaración ni colisiona
  con otro vacío. Bien.
- **Sólo itera sobre `impl_*`.** Un `review_x.md` huérfano (sin impl) nunca se
  examina. Correcto por construcción: sin dos reportes no hay colisión posible.
  La deuda inversa —un `done` sin review— ya la cubre la feature 52.
- **La tentación de venderlo como garantía.** El punto más importante de la
  revisión. El reporte del implementer dice explícitamente que esto resuelve
  visibilidad y no cumplimiento, y el comentario de la función lo repite en el
  código para que nadie lo lea como un guard. Verifiqué que ninguna de las dos
  plantillas promete más de lo que el chequeo hace: dicen que el verificador
  «prints a NOTE», no que impida nada. Si esto se hubiera redactado como
  «garantiza revisión independiente» habría pedido cambios.

## Riesgo residual

Un agente que corre los tres roles y escribe tres `actor:` distintos pasa
limpio. Está dicho en el reporte, en el código y acá. Quien quiera el
invariante de verdad necesita separar sesiones, que es proceso y no código.

## Veredicto

**Aprobada.** Con la ironía anotada de que su primer hallazgo real es esta
misma sesión.

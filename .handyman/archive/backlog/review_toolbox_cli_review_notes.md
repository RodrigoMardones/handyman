---
type: Review Log
feature: toolbox_cli_review_notes
id: 53
role: reviewer
date: 2026-07-19
actor: agente-local (single-agent session)
verdict: approved
tags: [handyman/backlog/review]
---

# Review: toolbox_cli_review_notes (feature 53)

## Independencia de roles

Mismo agente en los tres roles. Ver [[review_harness_unblock_verbs]]. Para
esta feature en particular la advertencia pesa más: es la de mayor superficie
de las cinco y la única que refactoriza un consumidor existente.

## Acceptance, una por una

| # | Bala | Evidencia |
|---|------|-----------|
| 1 | Imprime el checklist en stdout sin `toolbox serve` levantado, exit 0 | C1 verde; C9 asserta que ningún proceso serve corre |
| 2 | Sale != 0, con stderr, **antes** de llamar al modelo: root no registrado, provider desconocido, falta `--feature` | C4, C5, C6 verdes; C7 prueba el «antes» contando completions servidas |
| 3 | `--json` emite un único objeto con `checklist_md`, `model`, `diff_truncated`; sin `--json`, streaming | C3 asserta 1 línea y los 3 tipos; C1 lee el texto en la salida no-JSON |
| 4 | Reusa `relayReviewNotes` y la composición del core | el módulo importa ambos; no hay literal de prompt en `toolbox_review_notes_cli.ts` |
| 5 | Ruta y subcomando comparten la composición **o** se anota por qué no | comparten `composeReviewNotesRequest`; el impl anota además qué quedó deliberadamente fuera |
| 6 | Suite cubre feliz + rechazos + `--json` contra el mock local; sin server; sin red | 9/9; mock en `127.0.0.1` vía `OLLAMA_BASE_URL`; `HANDYMAN_ROOT` redirigido |
| 7 | `run_tests.sh` passes, `./init.sh` exit 0 | ALL SUITES PASSED (30 suites); init.sh exit 0 |

## Lo que miré con desconfianza

- **El refactor de la ruta.** Es el único cambio a código en producción que ya
  funcionaba. `test_web_review_notes.sh` pasa 7/7 sin editar aserciones, que es
  la única evidencia que vale acá: si la composición hubiera cambiado de
  forma, esa suite lo habría visto. Verificado que `composeReviewNotesRequest`
  hace exactamente las mismas cuatro llamadas, en el mismo orden, que la ruta
  hacía inline.
- **Que el shim se pisara.** `toolbox_review_notes.ts` ya existía como
  re-export consumido por `test_toolbox_review_notes.js`. Sobrescribirlo habría
  roto esa suite en silencio. El módulo nuevo lleva sufijo `_cli` y el shim
  quedó intacto — confirmado por sus 24/24.
- **`case "review-notes"` en el dispatch síncrono.** Devuelve 2 con un mensaje
  en vez de intentar correr algo async desde una función que retorna `number`.
  Es feo pero honesto: el guard de ejecución directa nunca deja que ese camino
  se alcance en uso real, y un llamador programático recibe una instrucción
  clara en lugar de una promesa colgada.
- **`loadDotEnv(process.cwd())` en el CLI.** Lee el `.env` del cwd, que es
  correcto para un comando de terminal pero significa que el proveedor
  resuelto depende de dónde se lo invoque. La suite lo neutraliza vaciando
  `ZAI_API_KEY`/`ANTHROPIC_API_KEY` y apuntando `OLLAMA_BASE_URL` al mock, así
  que ningún entorno de desarrollador puede hacerla pasar o fallar por
  accidente. Comportamiento esperado, no bug, pero conviene tenerlo escrito.
- **Dos mocks OpenAI-compatible en el repo.** Es duplicación deliberada y está
  argumentada en `verification.md`: el de serve tiene los bytes pinneados por
  el oráculo black-box, y compartirlo haría que un cambio en la suite del CLI
  pudiera romper la paridad. La alternativa —extraer el de serve— tocaba una
  suite parity-sensitive para beneficio cero.

## Riesgo residual

El camino feliz sólo está probado contra un mock. Que el subcomando funcione
contra un proveedor real (`zai`, `claude`) no lo verifica ningún test, y no
puede verificarlo sin tocar la red, que es una regla del repo. Es el mismo
riesgo que ya aceptan las cuatro suites de relays; queda dicho, no resuelto.

## Veredicto

**Aprobada.** Las 7 balas tienen evidencia observable, y la decisión de §4
está tomada con argumento y no por omisión.

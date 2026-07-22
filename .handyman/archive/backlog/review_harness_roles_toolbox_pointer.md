---
type: Review Log
feature: harness_roles_toolbox_pointer
id: 54
role: reviewer
date: 2026-07-19
actor: agente-local (single-agent session)
verdict: approved
tags: [handyman/backlog/review]
---

# Review: harness_roles_toolbox_pointer (feature 54)

## Independencia de roles

Mismo agente en los tres roles; ver [[review_harness_unblock_verbs]].

## Acceptance, una por una

| # | Bala | Evidencia |
|---|------|-----------|
| 1 | La plantilla del reviewer menciona `toolbox.js review-notes` como ayuda **opcional y asistiva** | párrafo `Optional:`; checks 1-2 de `testReviewerToolboxPointer` |
| 2 | Deja explícito que el veredicto se firma sobre verificador y diff, nunca sobre la salida del modelo | «never on a model's output, including the checklist above… the verifier and the diff»; checks 3-5 |
| 3 | El cambio va en `assets/role-*.template.md`, no en `.github/agents/*` | **premisa falsada**; ver abajo |
| 4 | `test_docs.js` verifica el subcomando y la cláusula de evidencia real | 5 checks nuevos, 212/212 |
| 5 | `run_tests.sh` passes, `./init.sh` exit 0 | ALL SUITES PASSED; init.sh exit 0 |

## Sobre la bala 3

El implementer no la cumplió al pie de la letra y **hizo bien**. La bala tenía
dos mitades: una instrucción («cambiá la plantilla») y una justificación
(«porque init.sh regenera las instancias»). La instrucción se cumplió; la
justificación es falsa y está desmentida con tres citas de código y una
comprobación empírica.

Acepté la desviación porque cumplir la bala literalmente habría dejado el
hueco G4 abierto exactamente donde el diagnóstico decía que dolía: «los roles
no saben que el toolBox existe». Un reviewer de este repo que sigue sin
saberlo es G4 sin cerrar, con una feature marcada `done` diciendo lo
contrario. La decisión la tomó el usuario, no el implementer por su cuenta.

Verifiqué las tres afirmaciones del reporte de forma independiente:
`update_harness.ts:95-125` efectivamente sólo recolecta rutas para editar
frontmatter; la cabecera declara que scaffold nunca sobrescribe; y
`tools_discovery.ts:436` es una línea de reporte, no de escritura.

## Lo que miré con desconfianza

- **Que el pointer erosione la autoridad del rol.** Es el riesgo real de esta
  feature: nombrar una herramienta de modelo dentro de las instrucciones de
  quien debe desconfiar de los modelos. La redacción lo contiene por tres
  lados — `Optional:`, «never a substitute for it», y la cláusula de firma
  reforzada — y los checks 2, 4 y 5 fijan los tres como contrato, no como
  buena intención. Si alguien ablanda el texto, el test cae.
- **Divergencia plantilla/instancia.** Ahora hay dos redacciones del mismo
  contrato. `test_docs.js` sólo cubre la plantilla; la instancia de este repo
  no tiene test. Es consistente con cómo estaba antes (la instancia ya había
  divergido en 7 pasos vs 6) y testear instancias generadas por usuario no es
  responsabilidad de la suite del skill. Queda anotado.
- **`--root .` en la instancia vs `--root PROJECT_ROOT` en la plantilla.**
  Correcto en ambos casos: la instancia es de un harness `install_mode: local`
  donde el project root ES el cwd; la plantilla debe ser genérica.

## Riesgo residual

Los harnesses ya instalados en otros repos siguen sin el pointer, y nada en el
producto los va a actualizar. La feature cierra G4 para harnesses nuevos y para
este; para el resto queda abierto. El reporte lo dice y nombra la mejora
futura (re-sync de cuerpos en `update_harness`) sin construirla, que es la
decisión correcta de alcance.

## Veredicto

**Aprobada**, con la desviación de la bala 3 documentada y justificada.

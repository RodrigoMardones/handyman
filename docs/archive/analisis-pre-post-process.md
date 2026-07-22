# 🔬 Investigación: procesos pre-run y post-run de features en el harness

> Documento de investigación y plan de trabajo. Responde a una pregunta concreta:
> **¿cómo convertir el conjunto disperso de chequeos del harness (formato,
> feature_list, propagación a agents, skills y MCPs) en un gate pre-run consolidado
> que asegure estabilidad entre versiones, y cómo extender el cierre de una feature
> con procesos post-run a definir como custom?** Cada hallazgo se apoya en evidencia
> concreta del repositorio y en las skills `handyman`, `skill-creator` y `ponytail`
> como literatura. El scope del plan es `SKILL.md`, `references/`, `assets/`,
> `scripts/` y `init.sh`/`init.template.sh`.

---

## 1. El objetivo

La petición pide dos cosas observables que hoy no existen como un **paso del
workflow**:

1. **Un chequeo pre-run**, corrido *antes* de `init.sh` como estado inicial y antes
   de arrancar cualquier feature, que cubra cinco controles:
   - formato del harness (estructura y archivos núcleo);
   - formato de `feature_list.json` (contrato + `≤1 in_progress`);
   - *update harness* — propagar modificaciones del harness a los role files
     (`AGENTS.md`, `.github/agents/*`, `.claude/agents/*`);
   - *update skills* — obtener nuevamente todas las skills;
   - *update mcps* — validar/actualizar los servidores MCP.
2. **Procesos post-run de features**, a definir como custom, que extiendan el cierre
   de una feature más allá del verifier verde.

La premisa del usuario es correcta y valiosa: este chequeo **asegura estabilidad
entre versiones del harness** y **debe ser un paso documentado del workflow**, no
una lista mental que el modelo improvisa en cada sesión.

La tesis de este documento es simétrica a la de los análisis previos
(`error_inconsistency_docs`, `tool_discovery`, `deterministic_actions_per_layer`):
**cada uno de los cinco chequeos ya existe como script determinista, pero viven
dispersos** — algunos como fase bloqueante de `init.sh`, otros como advisory no
bloqueante, otros como CLI invocable solo a mano — y ninguno está consolidado en un
*gate pre-run* ni documentado como paso del protocolo de feature. Lo mismo ocurre
con el post-run: `feature.py done` ya corre el verifier y escribe history, pero no
hay extensibilidad para pasos custom. La mejora no es *inventar* chequeos nuevos, es
*consolidar y orquestar* los existentes y dejar un *hook* para los custom.

---

## 2. Cómo se hace hoy (con evidencia)

### 2.1 El verifier: fases bloqueantes + advisories no bloqueantes

`init.sh` (y su plantilla `assets/init.template.sh`) ejecuta el verificador en dos
capas:

- **Fases bloqueantes** (vía `run_phase`, alteran `EXIT_CODE`):
  `tools` → `files` → `state` → `validate` → `lint` → `build` → `test`.
- **Advisories no bloqueantes** (corren al final, **nunca** tocan `EXIT_CODE`):
  `check_harness_version`, `check_graphify_context`, y en la plantilla también
  `check_evals`, `check_business_context`, `check_tools_discovery`.

Esto ya cubre **dos de los cinco** controles del usuario como fases bloqueantes:

- **formato del harness** → la fase `validate` llama a
  `scripts/validate_harness.py` (resuelve workspace, archivos núcleo, parse,
  `≤1 in_progress`, enum de status, advisory de frontmatter).
- **formato de feature_list** → la misma fase `validate` más la validación viva
  contra `assets/schemas/feature_list.schema.json` (`additionalProperties:false`
  rechaza campos fuera del contrato, feature 10) y la regla de alta vía
  `feature.py add` (feature 13).

### 2.2 El Drift vivo: evidencia de por qué esto importa *ya*

Corriendo `scripts/upgrade_harness.py --check --root .` sobre este propio harness
(siempre local, luego global):

```
installed version:  1.11.11   (harness.config.json raíz)
current version:    1.13.13   (SKILL.md metadata.version)
==> harness is behind: 1.11.11 -> 1.13.13
```

Y el bloque `config` de `.handyman/feature_list.json` todavía declara
`harness_version: 1.8.4`. Es decir, **tres versiones distintas coexisten** en un
mismo harness: `1.8.4` (feature_list), `1.11.11` (root config), `1.13.13` (skill
actual). El drift entre las dos fuentes de config es justo el síntoma que
`analisis-inconsistencia-bootstrap.md` (causa 3.2) ya diagnosticó: config duplicada
y sin sincronización automática. Esto prueba que la estabilidad entre versiones que
el usuario busca **no es teórica**: hoy mismo el harness está atrás y desincronizado
internamente, y nada lo bloquea ni lo hace evidente de forma consolidada al arranque.

### 2.3 Los otros tres controles existen como CLI, pero fuera del gate

Los tres chequeos restantes del usuario **ya tienen script determinista**, pero no
son ni fase ni advisory de `init.sh`:

- **update harness → propagar a agents**: `scripts/update_harness.py` sincroniza
  `models`/`tools`/config entre `harness.config.json` y los role files
  (`.github/agents/<role>.agent.md`, `.claude/agents/<role>.md`); en modo skill-repo
  actualiza los templates de `assets/`. **No** está cableado en ningún gate ni paso
  del workflow; es invocable solo a mano.
- **update skills**: `scripts/tools_discovery.py list/find` escanea las skill roots
  (local-then-global) y `check` verifica el bloque `discovery` declarado contra el
  disco. Existe un advisory `check_tools_discovery()` en la *plantilla*
  (`assets/init.template.sh`), pero **el `init.sh` vivo del repo no lo invoca**.
- **update mcps**: `scripts/tools_discovery.py check` valida los servidores MCP
  declarados contra `.vscode/mcp.json` (fuente `vscode`, feature 40). Mismo estado:
  existe, pero no es parte del arranque.

### 2.4 El post-run hoy: `feature.py done`, sin hooks

`scripts/feature.py done <name>` corre el verifier y, solo si sale `0`, marca la
feature `done`, escribe una entrada rica en `progress/history.md` y resetea
`progress/current.md`. Es **atómico y determinista**, pero **monolítico**: no hay
punto de extensión para pasos custom (regenerar el grafo de graphify, reconstruir
`index.md`, re-medir los evals de trigger, refrescar la discovery, etc.). Esos pasos
hoy dependen de que el modelo se acuerde de correrlos.

### 2.5 La paradoja central

La paradoja es el hallazgo clave: **no falta capacidad, falta orquestación**. Hay
cinco scripts deterministas (`validate_harness`, `upgrade_harness`, `update_harness`,
`tools_discovery`, `evals`) que cubren los cinco controles, pero están fragmentados
en tres niveles de severidad arbitrarios (algunos bloquean, otros avisan, otros ni
siquiera se invocan) y **ninguno** se presenta como el *chequeo de estabilidad
pre-run* que el usuario describe. El workflow (`references/workflow.md`) menciona
"verifier green before starting" pero no enumera los cinco controles ni enmarca el
arranque como una *revisión de estabilidad del harness*.

---

## 3. Causas raíz (con evidencia)

- **3.1 — Severidad sin marco.** Cada advisory/phase se añadió *ad hoc* feature por
  feature (graphify en una, versión en otra, discovery en otra, evals en otra), sin
  un concepto unificador de "gate de estabilidad". La evidencia: `init.sh` invoca
  `check_harness_version` y `check_graphify_context` pero **no** a
  `check_tools_discovery`, `check_evals` ni `check_business_context`, aunque estos
  ya existen en la plantilla. La invocación es inconsistente entre el verifier vivo
  y su template.
- **3.2 — Sin paso pre-run documentado.** `references/workflow.md` (Startup, punto
  6) dice "Run `./init.sh`", pero no distingue un *chequeo de estabilidad del
  harness* (formato + drift + propagación + discovery) del *verifier de calidad*
  (lint/build/test). El usuario quiere esa distinción explícita.
- **3.3 — update_harness sin gate.** `update_harness.py` es la herramienta que
  *propaga modificaciones del harness a agents*, pero nada en el workflow la invoca
  ni verifica que config y role files estén sincronizados. El drift de models/tools
  entre `harness.config.json` y los role files es silencioso.
- **3.4 — post-run sin extensión.** `feature.py done` es monolítico (feature 22 lo
  enriqueció con la entrada rica de history, pero sin hooks). Falta un *contrato de
  extensión*: un lugar declarado donde el operador deje sus pasos custom.
- **3.5 — Improvisación del modelo.** Como los cinco chequeos no son un paso
  enumerado, el modelo los aplica (u omite) por juicio semántico turno a turno —
  exactamente el patrón que `error_inconsistency_docs` y `feature_request_md`
  identificaron como fuente de drift.

---

## 4. Literatura: qué dicen `skill-creator`, `ponytail` y `handyman`

- **`skill-creator`** — *scripts/ = código ejecutable para tareas deterministas y
  repetitivas; references/ = disclosure progresiva; assets/ = plantillas; la regla
  es llevar la guía pesada a references/ y dejar SKILL.md como puntero mínimo*. Esto
  fija el scope: la *orquestación* del gate es un script (determinista), la *guía*
  de qué hace y cómo se extiende vive en `references/`, y SKILL.md conserva su
  presupuesto de tokens con un puntero.
- **`ponytail`** — *la solución más perezosa que funciona; YAGNI; stdlib antes que
  código custom; una línea antes que cincuenta; cuestiona si la tarea necesita
  existir*. Su aporte es decisivo aquí: **los cinco chequeos ya existen**, así que
  la solución perezosa correcta es **orquestar** los scripts existentes, no escribir
  chequeos nuevos. El gate pre-run es un *script fino* que llama a lo que ya hay. Lo
  mismo para el post-run: un hook declarado (una lista), no un framework.
- **`handyman`** — *disk is the source of truth; una feature a la vez; advisory
  nunca cambia EXIT_CODE; managed scaffolding vs project-owned state; `feature.py`
  es la transición atómica; every advisory is non-blocking*. Fija el contrato: el
  gate pre-run **respeta** la distinción bloqueante/advisory existente, y el post-run
  **no** sobrescribe estado project-owned.

La regla cruce de las tres: **determinismo para orquestar lo que ya existe,
simplicidad (YAGNI) para la forma, y disclosure progresivo para la documentación.**

---

## 5. El diseño propuesto

### 5.1 Idea rectora: una *fase de estabilidad* + un *hook post-run*

El diseño separa dos conceptos que hoy están fundidos en "corre el verifier":

- **Pre-run (stability gate):** revisar que el harness está *bien formado y al día*
  **antes** de tocar una feature. Es un *read-heavy* chequeo de estabilidad entre
  versiones: formato, drift de versión, sincronización config↔agents, discovery de
  skills/MCP.
- **Verifier (quality gate):** el `init.sh` actual (lint/build/test), que **sigue
  siendo el gate verde** que cierre la feature.

El pre-run no *reemplaza* al verifier; lo *precede* y lo enmarca como una revisión
de estabilidad. El verifier verde antes/después sigue siendo la puerta obligatoria
(sin cambios en su semántica).

### 5.2 Determinista vs interactivo (el límite honesto)

Simétrico a `tool_discovery.md` (sección 6.4), hay una frontera que el diseño respeta:

- **Determinista (lo que el gate aporta):** formato/estructura (`validate_harness`),
  drift de versión (`upgrade_harness --check`), sincronización config↔agents
  (`update_harness --list` como auditoría read-only), discovery declarada
  (`tools_discovery check`). Todo reproducible, todo offline, todo seguro en CI.
- **Interactivo/humano (lo que NO automatiza el gate):** *decidir* si aplicar la
  actualización (correr `upgrade_harness` sin `--check` toca el workspace; correr
  `update_harness` con `--model/--tools` reescribe role files). El gate **reporta**
  drift y desincronización; el operador **decide** aplicar. Aplicar migraciones o
  reescribir role files nunca es automático en el gate (regla managed vs
  project-owned de `analisis-actualizacion-harness.md`).

### 5.3 Severidad: read-only + advisory, no un nuevo bloqueante

Para no romper el contrato del verifier ni inflar `EXIT_CODE`, el pre-run se modela
como **un comando de reporte** que sale `0` siempre (o `0` con advisories), no como
una fase bloqueante adicional. La estabilidad se *hace visible*; la decisión de
*actuar* queda en el operador. (El formato/feature_list ya bloquean vía `validate`;
el resto se suma como *visibility*, no como *block*.)

---

## 6. Plan de acción (A–F)

Scope: `SKILL.md`, `references/`, `assets/`, `scripts/`, `init.sh` +
`init.template.sh`. Cada ítem separa lo determinista (script/advisory) de la
redacción humana (referencia/prosa).

- **A — `scripts/preflight.py` (orquestador read-only).** Un script fino que
  resuelve `HARNESS_WORKSPACE` (como el resto) y llama, **sin escribir nada**, a:
  `validate_harness.py` (formato + feature_list), `upgrade_harness.py --check`
  (drift de versión), `update_harness.py --list` (auditoría de sincronización
  config↔agents), `tools_discovery.py check` (skills + MCPs). Emite un reporte
  unificado por bloque (format / drift / sync / discovery) con `OK` / `NOTE` /
  `BEHIND`. Sale `0` (es read-only de estabilidad; los bloqueantes ya viven en
  `validate`). Reutiliza el 100% de los scripts existentes — *ponytail: orquestar,
  no reescribir*. Suite nueva `tests/test_preflight.sh`.
- **B — Advisory `check_preflight()` no bloqueante.** En `assets/init.template.sh`
  (patrón de los advisories existentes) que invoque `preflight.py` al final del
  verifier y reporte drift/sync como `NOTE:` sin tocar `EXIT_CODE`. Así el chequeo
  pre-run se hace *visible en cada corrida del verifier* sin cambiar la semántica
  del gate. Reflejar la invocación en el `init.sh` vivo del repo para cerrar la
  inconsistencia 2.1 (hoy no invoca `check_tools_discovery` ni `check_evals`).
- **C — Hook post-run declarado.** Un contrato de extensión para `feature.py done`:
  una lista opcional `post_run` en `harness.config.json` (comandos a correr tras
  cerrar una feature, p.ej. regenerar `index.md`, `/graphify --update`, re-medir
  evals). `feature.py done` los ejecuta tras marcar `done`+history, **siempre con
  exit 0** (un paso custom que falla *avisa*, no revierte el cierre ya verificado).
  Cada paso es opcional y declarado: *YAGNI por defecto, extensibilidad opt-in*.
- **D — Documentación del workflow.** En `references/workflow.md`:
  (1) renombrar/enmarcar el Startup como *stability check before feature work*
  (correr `preflight.py` o `init.sh` y leer los advisories), enumerando los cinco
  controles; (2) un *Closure* que mencione el hook post-run y la lista `post_run`.
  En `references/checklists.md` (Run-Feature Checklist) añadir "preflight/stability
  check corrido antes de iniciar" y "post-run hooks ejecutados al cerrar".
- **E — Puntero mínimo en `SKILL.md`.** Una línea en "Run one feature" que enlace el
  stability check (pre) y el post-run, respetando el presupuesto de tokens (<=1000
  palabras). `skill-creator`: la guía pesada vive en `references/`; SKILL.md es
  puntero.
- **F — Sincronización de la propia inconsistencia.** Cablear el `init.sh` vivo para
  invocar los advisories que ya están en el template pero faltan en el repo
  (`check_tools_discovery`, `check_evals`, `check_business_context`), cerrando el
  drift documentado en 2.1. No es nuevo: es *consistencia*.

Orden sugerido **A → B → C → D → E → F** (orquestador primero, luego el advisory que
lo hace visible, luego el hook post-run, luego la documentación, luego el puntero en
SKILL.md, y por último la consistencia del verifier vivo).

---

## 7. Features sugeridas (no añadidas)

Documentadas aquí como roadmap; **no** se agregan a `feature_list.json` en esta
investigación (espejo de los análisis 9/15/20/25/32):

- `preflight_orchestrator` (Plan A) — `scripts/preflight.py` read-only que orquesta
  validate/upgrade/update/tools_discovery + suite `tests/test_preflight.sh`.
- `preflight_advisory` (Plan B) — `check_preflight()` no bloqueante en
  `init.template.sh` + reflejo en el `init.sh` vivo.
- `post_run_hooks` (Plan C) — lista `post_run` en `harness.config.json` (schema) +
  ejecución opt-in en `feature.py done` (siempre exit 0).
- `workflow_stability_steps` (Plan D) — enmarcar Startup como stability check +
  documentar el hook post-run en `references/workflow.md` y `checklists.md`.
- `skill_preflight_pointer` (Plan E) — puntero mínimo en `SKILL.md`
  (presupuesto <=1000).
- `verifier_advisory_consistency` (Plan F) — invocar en el `init.sh` vivo los
  advisories que ya existen en el template.

---

## 8. Limitaciones

- **El gate es read-only; no aplica fixes.** Por contrato (managed vs project-owned),
  `preflight.py` reporta drift y desincronización pero no corre migraciones ni
  reescribe role files. Aplicar `upgrade_harness`/`update_harness` queda en el
  operador; el gate solo *hace visible* la inestabilidad.
- **update skills/update mcps es best-effort.** `tools_discovery check` valida
  *presencia* contra skill roots y el manifiesto MCP del host; no garantiza que una
  skill *dispare* ni que un MCP *devuelva* una tool (frontera semántica de
  `discovery.md`). El gate las reporta como `OK`/`NOTE`, no como verdad absoluta.
- **El hook post-run es opt-in.** Sin una lista `post_run` declarada, el cierre es
  idéntico al de hoy. La extensibilidad existe para quien la quiera; no impone
  pasos a quienes no. Un paso custom que falla avisa y continúa (no revierte un
  cierre ya verificado).
- **Drift entre verifier vivo y template.** El Plan F lo cierra, pero mientras
  tanto el `init.sh` del repo y `assets/init.template.sh` invocan conjuntos
  distintos de advisories; el gate pre-run (Plan A/B) es el lugar natural para
  unificar esa invocación.

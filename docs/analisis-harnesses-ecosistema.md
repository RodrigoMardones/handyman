# 🔬 Investigación: harnesses del ecosistema y features comunes

> Documento de investigación y plan de trabajo. Responde a una petición con tres
> ejes: **(1) investigar harnesses de agentes publicados por la industria y la
> comunidad; (2) identificar el conjunto de features comunes entre ellos y
> contrastarlo con handyman; y (3) proponer mejoras concretas para mover handyman
> hacia ese estándar común**, incluyendo el análisis de skills instalables tipo
> "harness" descubiertas con `find-skills`. Cada hallazgo externo cita su fuente
> como texto plano y cada afirmación sobre handyman se apoya en evidencia leída
> del repositorio. El scope del plan es `handyman/references/`,
> `handyman/scripts/`, `handyman/assets/` y `tests/`; quedan fuera `graphify-out/`
> y `.github/`.

---

## 1. El objetivo

Handyman nació como implementación del patrón "initializer + coding agent" y ha
crecido con 12 suites de tests y 11 scripts deterministas. La pregunta de esta
investigación es de posicionamiento: **¿qué hacen los demás harnesses que
handyman no hace, y cuáles de esas capacidades son ya un estándar de facto del
ecosistema?** Tres preguntas concretas:

1. **¿Cuál es el canon?** ¿Qué features aparecen una y otra vez en los harnesses
   públicos con tracción real (estrellas, installs, adopción multi-plataforma)?
2. **¿Dónde está handyman respecto al canon?** ¿Qué cubre ya, qué cubre a medias
   y qué no cubre en absoluto?
3. **¿Qué skills instalables existen sobre harnesses** (`npx skills find
   harness`) y sirven como literatura o como dependencia?

La tesis, adelantada: **handyman ya implementa el núcleo canónico completo**
(feature list JSON, progress file, ritual de arranque, una feature a la vez,
verifier gate) porque desciende directamente del patrón que Anthropic publicó y
que el ecosistema adoptó. Las brechas reales están en tres familias que el
ecosistema sí resolvió y handyman no: **grafo de trabajo** (dependencias entre
features + detección de "ready"), **operación desatendida** (el loop externo que
encadena sesiones) y **profundidad de revisión** (revisión en dos etapas,
métricas pass@k). La mejora no es reescribir nada: es adoptar esas features
comunes con el patrón schema-first + script + advisory que el repo ya estableció.

---

## 2. Cómo se hace hoy en handyman (línea base con evidencia)

### 2.1 El núcleo canónico está completo

- **Feature list como fuente de verdad JSON:** `feature_list.json` con schema
  draft-07 (`assets/schemas/feature_list.schema.json`, `additionalProperties:
  false`) y CLI determinista (`feature.py add/start/block/done/log/next`).
- **Progress file:** `progress/current.md` (sesión viva, con Branch desde la
  feature 95) + `progress/history.md` (entradas ricas al cierre).
- **Ritual de arranque:** `init.sh` (verifier) + `preflight.py` (estabilidad
  read-only: format/drift/sync/discovery) + `AGENTS.md` "Before Starting".
- **Una feature a la vez:** invariante single-`in_progress` aplicado por
  `feature.py cmd_start` y `validate_harness.py`.
- **Verifier gate:** `feature.py done` corre `init.sh` y solo marca `done` con
  exit 0; `post_run` hooks tras el cierre.
- **Cierre de periodo:** `sprint.py open/close` (features 93-97) archiva las
  done a `archive/feature_archive.json` y deriva el documento de sprint.

### 2.2 Las brechas locales verificadas en esta sesión

- **Sin dependencias entre features:** las claves del contrato son exactamente
  `id/name/title/description/acceptance/status/blocked_reason/sprint` (leído del
  schema con python en vivo). No existe `depends_on` ni un comando que responda
  "¿qué está listo para empezar?"; el leader elige "lowest id pending" a ciegas.
- **Ids secuenciales con riesgo de colisión multi-rama:** `feature.py add`
  calcula `max(vivos, archivados) + 1`. El fix `_archived_max_id` (2026-07-15)
  curó la colisión contra el archivo, pero dos ramas que añaden features en
  paralelo sobre el mismo workspace compartido siguen pudiendo chocar — el
  problema exacto que beads resuelve con ids hash.
- **`history.md` crece sin compresión:** `sprint.py close` archiva features de
  `feature_list.json` pero no toca `progress/history.md` (744 líneas registradas
  en la investigación de sprints, y sigue creciendo).
- **Sin loop externo:** el flujo es sesión-a-sesión con humano relanzando; no
  hay contrato para operación desatendida (el modo que el ecosistema llama
  "ralph loop").
- **Revisión de una sola pasada:** el reviewer role produce un único
  `review_<feature>.md` con veredicto; no hay separación conformidad-con-spec
  vs calidad-de-código.
- **`evals.py` mide trigger, no completitud:** matriz de confusión y varianza
  para la description de la skill, pero ninguna métrica pass@k sobre la
  ejecución de features (verificado: cero menciones de pass@ en el script).

---

## 3. El ecosistema investigado

### 3.1 Anthropic: "Effective harnesses for long-running agents" (nov 2025)

Fuente: `anthropic.com/engineering/effective-harnesses-for-long-running-agents`
y su implementación de referencia `anthropics/claude-quickstarts` directorio
`autonomous-coding`.

Es la formalización del linaje de handyman. Dos agentes: **initializer** (crea
`init.sh`, `feature_list.json` con features `passes: false`, progress file,
commit inicial) y **coding agent** (una feature por sesión, artefactos
estructurados al salir). Los cuatro modos de fallo que cataloga (declarar
victoria temprano, dejar el entorno sucio, marcar done sin testear, perder
tiempo redescubriendo cómo correr la app) son exactamente los que handyman
mitiga con feature_list/progress/verifier/init.sh. Dos piezas del quickstart que
handyman **no** tiene:

- **Auto-continuación entre sesiones:** el runner Python encadena sesiones con
  delay de 3 segundos y `--max-iterations`; pausable con Ctrl+C y reanudable.
- **Allowlist de bash (`security.py`):** defensa en profundidad a nivel de
  harness runner, complementaria al sandbox de la plataforma.

### 3.2 beads (`bd`): el issue tracker con grafo para agentes

Fuente: `github.com/gastownhall/beads` (antes steveyegge/beads; 25.3k estrellas,
420 contribuidores).

La evolución del feature-list plano hacia **grafo de dependencias**. Features
que definen su categoría:

- **`bd ready`:** lista tareas sin bloqueadores abiertos — la detección
  automática de trabajo disponible. `bd dep add <child> <parent>` declara
  `blocks/related/parent-child`.
- **Ids hash (`bd-a1b2`):** cero colisiones en flujos multi-agente/multi-rama.
- **Compaction ("memory decay"):** resume tareas cerradas antiguas para ahorrar
  ventana de contexto — la misma necesidad que handyman resolvió por su cuenta
  con el archive del sprint close (convergencia independiente que valida el
  diseño).
- **`bd prime` + `bd remember`:** imprimir contexto de workflow al arrancar y
  memoria persistente del proyecto vía CLI.
- **Jerarquía de epics** (`bd-a3f8.1.1`) y mensajería entre agentes.
- **`bd setup <agente>`:** instalación por plataforma (claude, codex, cursor,
  factory...) que escribe AGENTS.md y hooks.

### 3.3 obra/superpowers: la metodología empaquetada como skills

Fuente: `github.com/obra/superpowers` (255k estrellas; plugin para Claude Code,
Codex, Cursor, Copilot CLI, OpenCode y 5 plataformas más).

No es un tracker sino un **workflow obligatorio** compuesto de skills:
brainstorming socrático → git worktrees aislados → planes con tareas de 2-5
minutos → **subagent-driven development con revisión en dos etapas (primero
conformidad con la spec, después calidad de código)** → TDD RED-GREEN-REFACTOR
→ code review → cierre de rama con opciones merge/PR/keep/discard. Paralelos
directos con handyman: brainstorming ≈ entrevista de `feature-request.md`,
writing-plans ≈ feature_list, requesting-code-review ≈ reviewer role. Las dos
ideas robables: la **revisión en dos etapas** (barata: es protocolo + template,
no código) y el tratamiento de **worktrees como paso de workflow de primera
clase** (handyman los documentó en la feature 97 pero como prosa, sin paso
operativo).

### 3.4 El patrón ralph loop: operación desatendida

Fuente: skills `andrelandgraf/fullstackrecipes` (ralph-loop, 3.5K installs),
`subsy/ralph-tui`, `fstandhartinger/ralph-wiggum`; el patrón original es de
Geoffrey Huntley (`ghuntley.com/ralph`, inaccesible al fetch — 403 — citado por
las skills que lo implementan).

La idea: **correr el agente en un while-loop hasta que todas las historias
pasen**. Historias de usuario con criterios de aceptación testeables (el espejo
exacto del acceptance de handyman), una tarea por iteración del loop, y un
runner externo tonto que relanza sesiones. El ecosistema lo convirtió en
producto (ralph-tui es un TUI con PRD → tareas JSON). Handyman tiene todos los
ingredientes del loop (estado en disco, verifier determinista, single-feature)
pero **no el contrato del loop**: nada define qué exit code significa "no queda
trabajo" vs "bloqueado" vs "falló el verifier", que es lo único que un `while`
necesita.

### 3.5 github/spec-kit: spec-driven development

Fuente: `github.com/github/spec-kit` (122k estrellas, 30+ integraciones).

Pipeline de comandos: constitution → specify → plan → tasks → implement, con
opcionales clarify/analyze/checklist. Paralelos: constitution ≈
`docs/business.md` + `docs/conventions.md`; specify/plan ≈ `feature-request.md`;
tasks ≈ `feature_list.json`. La feature distintiva que handyman no tiene:
**`converge`** — "evaluar el codebase contra spec/plan/tasks y **añadir el
trabajo restante como tareas nuevas**". Es la operación inversa al intake:
detectar drift entre lo declarado y lo construido y convertirlo en backlog. La
parte determinista de esa idea en handyman sería un advisory de frescura de
docs; la parte semántica es protocolo del leader.

### 3.6 Skills "harness" instalables (descubiertas con find-skills)

`npx skills find harness` (2026-07-15):

| Skill | Installs | Audits | Utilidad para handyman |
|---|---|---|---|
| `affaan-m/everything-claude-code` agent-harness-construction | 5.5K | Trust Hub/Socket/Snyk PASS | Literatura de diseño: action space, observation design, error recovery contract, context budgeting |
| `affaan-m/everything-claude-code` eval-harness | 5.8K | PASS | Literatura: EDD, graders código/modelo/humano, métricas pass@k y pass^k |
| `affaan-m/everything-claude-code` autonomous-agent-harness | 4K | Socket WARN, Snyk WARN | Scheduling/computer-use; fuera del dominio de handyman |
| `trailofbits/skills` harness-writing | 3.7K | — | Fuzzing harnesses (otro significado de harness); no aplica |
| `andrelandgraf/fullstackrecipes` ralph-loop | 3.5K | **Trust Hub FAIL** | Leer como referencia del patrón; **no instalar** (audit FAIL) |

Dos principios de `agent-harness-construction` directamente aplicables a los
scripts de handyman: **observation design** (cada respuesta de tool debería
incluir status, resumen de una línea, próximas acciones y artefactos — los
scripts de handyman imprimen prosa libre) y **error recovery contract** (todo
error debería traer causa raíz, instrucción de retry segura y condición de
parada explícita). De `eval-harness`: distinguir capability evals de regression
evals y medir **pass@k** (éxito en k intentos) — `evals.py` ya tiene la mitad de
la maquinaria (runs repetidos, varianza, umbral) apuntada al trigger en lugar de
a la ejecución.

---

## 4. Matriz: features comunes del ecosistema vs handyman

Una feature es "común" si aparece en al menos dos fuentes independientes.

| # | Feature común | Quién la tiene | Handyman |
|---|---|---|---|
| 1 | Feature list JSON como fuente de verdad | Anthropic, ralph, beads, spec-kit | ✅ completa (schema + CLI) |
| 2 | Progress file / notas de sesión | Anthropic, beads | ✅ completa |
| 3 | Ritual de arranque determinista | Anthropic, beads `prime` | ✅ completa (init.sh + preflight) |
| 4 | Una tarea a la vez | Anthropic, superpowers, ralph | ✅ completa (invariante global) |
| 5 | Verifier gate antes de done | Anthropic, ralph, superpowers | ✅ completa |
| 6 | Cierre de periodo / compaction del tracker | beads compaction, spec-kit brownfield | ✅ desde features 93-97 (sprint close + archive) |
| 7 | Dependencias entre tareas + detección de "ready" | beads `dep`/`ready`, spec-kit ordering | ❌ sin `depends_on` en el contrato |
| 8 | Ids sin colisión multi-rama/multi-agente | beads (hash) | ⚠️ secuenciales; archive-aware pero colisionables entre ramas |
| 9 | Compaction de las notas largas (history) | beads memory decay | ⚠️ archive cubre feature_list; history.md crece sin límite |
| 10 | Loop externo desatendido con contrato de parada | ralph, quickstart de Anthropic | ❌ sesión-a-sesión manual |
| 11 | Revisión en dos etapas (spec → calidad) | superpowers | ⚠️ una sola pasada de reviewer |
| 12 | Convergencia spec↔código como backlog | spec-kit `converge` | ⚠️ preflight detecta drift de config, no de docs/código |
| 13 | Métricas de completitud pass@k | eval-harness, quickstart benchmarking | ⚠️ evals.py mide trigger, no ejecución |
| 14 | Memoria persistente vía CLI (`remember`) | beads | ⚠️ capa docs/ existe; sin primitivo CLI |
| 15 | Setup por plataforma | beads `setup`, superpowers, spec-kit | ⚠️ role files en `.github/agents` + `.claude/agents` + `update_harness --sync`; sin comando "setup <plataforma>" |
| 16 | Worktrees como paso operativo | superpowers, beads multi-rama | ⚠️ documentado (feature 97), sin tool |

Lectura: **6/16 completas, 8/16 parciales, 2/16 ausentes** — y las dos ausentes
(grafo de dependencias, loop desatendido) son precisamente las dos features con
mayor adopción transversal después del núcleo.

---

## 5. La tesis

1. **El núcleo está saldado.** Nada del canon básico falta; invertir ahí sería
   redundante. La ventaja comparativa de handyman (verificación ejecutable +
   determinismo por script + anti-teléfono-descompuesto) no la tiene ninguno de
   los harnesses investigados como conjunto.
2. **La brecha es el grafo.** El salto feature-list-plana → grafo-de-dependencias
   es la evolución más consolidada del ecosistema (beads existe entero por
   esto). Para handyman el paso mínimo no es adoptar beads: es `depends_on`
   opcional + un comando `ready`, con el patrón schema-first ya ensayado cuatro
   veces (harness_version, discovery, agents, sprint).
3. **El loop es un contrato, no un runner.** Handyman no necesita construir el
   while-loop (la plataforma o un shell de 5 líneas lo es); necesita **exit
   codes con significado** para que cualquier runner externo sepa cuándo parar.
   Eso es una extensión pequeña de `feature.py`/`preflight.py`, no un producto.
4. **La revisión en dos etapas es gratis.** Es protocolo + template; el repo ya
   tiene el rol, el generador (`backlog.py review`) y el checkpoint gate.
5. **Las skills de harness son literatura, no dependencia.** Ninguna de las
   encontradas se instala como building block de handyman; dos
   (agent-harness-construction, eval-harness) valen como referencias de diseño
   citables, y ralph-loop se lee pero no se instala (audit FAIL).

---

## 6. Plan de acción propuesto (A-E)

Orden recomendado: A → B → C → D → E. Cada ítem separa la parte determinista
(script/schema/template) de la interactiva (protocolo del rol).

### A. `depends_on` + `feature.py ready` (el beads-ismo mínimo)

- Schema-first: clave opcional `depends_on` (array de ids enteros, uniqueItems)
  en la definición `feature` de ambos schemas; sentinel ausente (opcional puro,
  legacy valida sin tocar nada).
- `feature.py ready`: lista features `pending` cuyas dependencias están todas
  `done` (o archivadas — reusar `_archived_max_id` como precedente de lectura
  del archive); `--json` para consumo por runner.
- `feature.py start` avisa (WARN, no bloquea) si la feature tiene dependencias
  abiertas; `validate_harness.py` flagea `depends_on` hacia ids inexistentes.
- Tests en `test_feature.sh` + caso en `test_init.sh`; fila en
  `references/anatomy.md` Feature List Contract.

### B. Contrato de loop desatendido (el ralph-ismo honesto)

- `feature.py ready --json` (de A) + exit codes documentados: 0 con lista no
  vacía = hay trabajo; 0 con lista vacía = drenado; el verifier ya aporta el
  "falló".
- Nueva sección `## Unattended Loop` en `references/workflow.md`: el patrón
  while-ready-no-vacío → sesión → verifier, con la regla de que el loop externo
  es responsabilidad del operador (shell de 5 líneas como ejemplo en fence).
- Advisory en `preflight.py`: si hay features `blocked` y cero `pending`
  ready, decirlo explícitamente (es la condición de parada del loop).
- NO construir un runner LLM: la plataforma es el runner.

### C. Revisión en dos etapas (el superpowers-ismo barato)

- `assets/backlog-review.template.md`: dos secciones nuevas — `## Stage 1:
  spec compliance` (¿cumple cada acceptance? ¿respeta el feature request?) y
  `## Stage 2: code quality` (¿tests? ¿convenciones? ¿seguridad?).
- `references/workflow.md` Reviewer Protocol: prescribir el orden (primero
  conformidad, después calidad; un fallo en Stage 1 corta antes de Stage 2).
- `backlog.py review` sin cambios de firma (el template manda). Test en
  `test_docs.py` de que el template contiene ambas etapas.

### D. Compaction de history al cierre de sprint (el memory-decay)

- `sprint.py close` gana un paso: las entradas de `history.md` de las features
  archivadas se COMPRIMEN a un stub de una línea (`## <fecha> - Feature <id>:
  <name> — archived to sprint <id>`) después de derivar el sprint doc (que ya
  captura la narrativa). `--dry-run` muestra el diff; el texto completo vive en
  el sprint doc, nada se pierde.
- Espejo exacto del archive de feature_list que close ya hace; cierra la brecha
  "history 744 líneas y creciendo".
- Tests en `test_sprint.sh` (comprime tras close; idempotente; no toca entradas
  de features no archivadas).

### E. Observation design en los scripts + pass@k opt-in (la deuda de forma)

- Adoptar en los 11 scripts el shape de salida de agent-harness-construction de
  forma incremental: última línea SIEMPRE `status: ok|warn|error` +
  `next: <acción sugerida>` cuando aplique (empezar por preflight.py y
  feature.py, que ya casi lo cumplen).
- `evals.py measure` gana `--report-passk` opt-in: con los runs repetidos que ya
  hace, reportar pass@1/pass@k por query además de la matriz de confusión
  (cálculo derivado, cero llamadas nuevas).
- Documentar en `references/evals.md` la distinción capability/regression evals
  citando la skill eval-harness como literatura.

---

## 7. Qué NO adoptar (filtro deliberado)

| Feature del ecosistema | Razón para no adoptarla |
|---|---|
| Ids hash estilo beads | Rompe el contrato int + toda la maquinaria (metrics, sprint, archive). El riesgo real (dos ramas añadiendo a la vez) se mitiga con el advisory de branch (feature 95) y worktrees; YAGNI mientras el flujo sea single-leader |
| Storage SQL/Dolt | `feature_list.json` + git cubren el caso de uso; beads resuelve escala multi-agente que handyman no tiene |
| Mensajería entre agentes | El canal de handyman son los reportes de `backlog/` (anti-teléfono-descompuesto); duplicarlo con mensajes efímeros lo debilita |
| TDD enforcement de superpowers | Handyman es agnóstico del stack del target; el contrato de verificación vive en `docs/verification.md` de cada repo, no en la skill |
| Runner de auto-continuación propio | El contrato de loop (plan B) da el 90% del valor sin mantener un proceso; la plataforma relanza |
| Telemetría de uso | Fuera de la filosofía local-first del repo |
| Allowlist bash propia | Responsabilidad de la plataforma de ejecución; documentable como nota en `references/security.md`, no como código |
| Instalar skills de harness como dependencia | Son literatura; ninguna aporta un building block ejecutable que los scripts no tengan ya |

---

## 8. Features sugeridas (no añadidas al backlog)

Siguiendo el precedente de la serie, se enumeran sin añadirlas a
`feature_list.json` — el operador decide:

1. `feature_depends_on` — plan A (schema + ready + guards).
2. `unattended_loop_contract` — plan B (exit codes + workflow + advisory).
3. `two_stage_review` — plan C (template + protocolo).
4. `history_compaction` — plan D (sprint.py close comprime history).
5. `script_observation_shape` — plan E primera mitad (status/next uniforme).
6. `evals_passk_report` — plan E segunda mitad (pass@k derivado en evals.py).

---

## 9. Referencias

Todas las fuentes consultadas el 2026-07-15:

- `https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents`
- `https://github.com/anthropics/claude-quickstarts` (directorio `autonomous-coding`)
- `https://github.com/gastownhall/beads` (bd, 25.3k estrellas)
- `https://github.com/obra/superpowers` (255k estrellas)
- `https://github.com/github/spec-kit` (122k estrellas)
- `https://skills.sh/affaan-m/everything-claude-code/agent-harness-construction` (5.5K installs)
- `https://skills.sh/affaan-m/everything-claude-code/eval-harness` (5.8K installs)
- `https://skills.sh/andrelandgraf/fullstackrecipes/ralph-loop` (3.5K installs; Trust Hub FAIL — solo lectura)
- `npx skills find harness` / `npx skills find ralph` (CLI de vercel-labs/skills)
- Evidencia local: `assets/schemas/feature_list.schema.json`,
  `handyman/scripts/feature.py`, `handyman/scripts/sprint.py`,
  `handyman/scripts/evals.py`, `handyman/scripts/preflight.py`,
  `docs/analisis-sprints-cierre-periodo.md`, `docs/analisis-workflow-etapas.md`.

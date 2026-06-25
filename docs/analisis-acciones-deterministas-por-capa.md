# 🔬 Investigación: acciones deterministas por capa del harness

> Documento de investigación y plan de trabajo. Responde a una pregunta concreta:
> **¿qué acciones que modifican artefactos del harness —más allá de
> `feature_list.json`, ya cubierto por `scripts/feature.py`— todavía se hacen a
> mano, y cómo darles un script determinista y ordenado igual que las
> operaciones de `feature`, `update`, `validate` y `upgrade`?** El usuario señaló
> tres casos (agregar una entrada al `backlog/` de `.handyman`, modificar
> `progress/current.md` y modificar `progress/history.md`) y pidió investigar si
> existen otros. Cada hallazgo se apoya en evidencia concreta del repositorio. El
> scope de la feature enfoca las propuestas en `SKILL.md` y `references/`.

---

## 1. El objetivo

El harness ya trata su **estado JSON** (`feature_list.json`) como una máquina de
estados con transiciones atómicas: `scripts/feature.py` (add/start/block/done) es
la única vía permitida, justamente porque editar ese archivo a mano era la causa
raíz de los riesgos de *split-scope*, *dos features en `in_progress`* y *drift de
fechas* —así lo dice el propio docstring del script—.

La pregunta de esta feature es la **simétrica**: los demás artefactos mutables
del harness (`progress/current.md`, `progress/history.md`, las entradas de
`backlog/`, y algún otro) **no** gozan del mismo trato. Unos están medio
scripteados (un esqueleto se genera, el contenido se rellena a mano) y otros no
tienen script alguno. Cada vez que un modelo escribe esos artefactos a mano
reproduce un formato ligeramente distinto: la misma clase de *drift entre
modelos* que ya documentamos para el `bootstrap` en
`docs/analisis-inconsistencia-bootstrap.md`.

El objetivo es **mapear, capa por capa, qué acción de modificación tiene script
determinista y cuál se hace a mano**, y dejar un plan para cerrar la brecha
extendiendo el patrón `feature.py`/`update`/`validate`/`upgrade` a las acciones
que faltan.

---

## 2. Lo que hoy SÍ es determinista (la línea base)

| Acción sobre un artefacto | Script / vía | Evidencia |
|---|---|---|
| Crear la estructura completa del harness | `scripts/scaffold.sh` (crea `progress/`, `backlog/`, `docs/`, copia plantillas, estampa `harness_version`, nunca sobrescribe) | `scripts/scaffold.sh` líneas 136-144; `references/workflow.md` Bootstrap Protocol paso 2 |
| `feature_list.json`: alta / transiciones | `scripts/feature.py` (add/start/block/done) | `scripts/feature.py` |
| `progress/current.md`: **esqueleto** al iniciar y **reset** al cerrar | `feature.py start` (escribe `SESSION_TEMPLATE`) y `feature.py done` (reset a idle) | `scripts/feature.py` (`_write_current`, `cmd_start`, `cmd_done`) |
| `progress/history.md`: **append mínimo** al cerrar | `feature.py done` (3 líneas: fecha+feature, Verification, Closure) | `scripts/feature.py` (`cmd_done`) |
| Validar estructura + schema vivo | `scripts/validate_harness.py` | `references/anatomy.md` (Verification Contract) |
| Actualizar models/tools/config | `scripts/update_harness.py` | suite `tests/test_update.sh` |
| Detectar drift de versión + migrar | `scripts/upgrade_harness.py` | suite `tests/test_upgrade.sh` |
| `feature_list.json`: marcar bloqueo + motivo | `feature.py block --reason` | `scripts/feature.py` (`cmd_block`) |

La línea base es clara: **el estado estructurado está bien cubierto**. La brecha
está en los **artefactos markdown** que rodean a ese estado.

---

## 3. Lo que hoy se hace a mano (con evidencia)

### 3.1 Caso A — agregar una entrada al `backlog/` (la brecha mayor)

**Ningún script crea las entradas de `backlog/`.** El implementer, el reviewer y
el explorer las escriben a mano:

- `references/workflow.md` (Implementer Protocol, paso 7): *"Write
  `$HARNESS_WORKSPACE/backlog/impl_<feature>.md` with YAML frontmatter..."* — es
  el modelo quien teclea el archivo y su frontmatter.
- `references/workflow.md` (Reviewer Protocol, paso 7) y (Parallel Exploration):
  igual para `review_<feature>.md` y `explore_<topic>.md`.

Y lo más revelador: **las plantillas existen pero nadie las instancia**.

- `assets/backlog-impl.template.md` y `assets/backlog-review.template.md` están
  en el repo, con el frontmatter y las secciones canónicas.
- Pero `scripts/scaffold.sh` solo hace `make_dir "$HARNESS_WORKSPACE/backlog"`
  (línea 136); las únicas copias de estado que realiza son `feature_list.json`,
  `progress/current.md`, `progress/history.md` y `docs/business.md` (líneas
  141-144). **El `backlog/` nace vacío y ningún paso posterior copia esas
  plantillas.**
- No existe siquiera `assets/backlog-explore.template.md`: el reporte de
  exploración no tiene plantilla de ningún tipo.

El contrato de frontmatter de estas entradas es **estricto y distinto por tipo**:

| Archivo | Frontmatter requerido | Fuente |
|---|---|---|
| `backlog/impl_<feature>.md` | `feature`, `status: implemented`, `role: implementer`, `updated`, `tags` | `references/anatomy.md` L22; `references/obsidian.md` (Frontmatter Conventions) |
| `backlog/review_<feature>.md` | `feature`, `status: approved` \| `changes_requested`, `role: reviewer`, `updated`, `tags` | `references/anatomy.md` L23; `references/obsidian.md` |
| `backlog/explore_<topic>.md` | `topic`, `role: explorer`, `updated`, `tags` | `references/anatomy.md` L24; `references/obsidian.md` |

Estampar esto a mano en cada reporte es exactamente la operación
**determinista y repetitiva** que invita al error: un `status` fuera del enum, un
`tags` sin el namespace `#handyman/...`, una fecha `updated` incoherente. Y
**nada lo detecta**: `validate_harness.py` valida el contrato de
`feature_list.json` contra su schema, pero **no** valida el frontmatter de los
reportes de `backlog/`.

### 3.2 Caso B — modificar `progress/current.md`

`feature.py start` escribe **solo el esqueleto** (`SESSION_TEMPLATE`):
frontmatter (`feature`, `status`, `role`, `updated`, `tags`) más las secciones
`Plan`, `Log` y `Next Step` **con texto placeholder**. El contenido real se
rellena a mano durante la sesión:

- `references/workflow.md` (Implementer Protocol, paso 3): *"Update
  `progress/current.md` with feature, start time, plan, and live log."* — el
  *plan* y el *live log* los teclea el modelo.

No existe ninguna acción determinista para las mutaciones *durante* la sesión:
**append de una línea al `Log`**, **fijar el `Next Step`**, **actualizar el
`Plan`**, ni para **bumpear `updated:`** en el frontmatter. Cada una se hace a
mano, y por tanto con formato variable.

### 3.3 Caso C — modificar `progress/history.md`

`feature.py done` hace un **append mínimo**: tres líneas
(`## <fecha> - Feature <id>: <name>`, `Verification: verifier exit 0`,
`Closure: done`), ver `cmd_done` en `scripts/feature.py`. El **formato rico** que
usamos en la práctica (resumen de la feature, archivos tocados, decisiones,
seguimiento) **se enriquece a mano** después de cerrar. El historial es
*append-only* por contrato (`references/obsidian.md`: *"Append-only"*), así que
es un candidato ideal a generación determinista: la forma de la entrada no
debería depender de qué modelo la escriba.

### 3.4 Otros casos detectados (la parte "investiga si existen otros")

| # | Acción a mano | Evidencia | ¿Determinista hoy? |
|---|---|---|---|
| D | **migrate-global**: mover `feature_list.json`, `progress/`, `backlog/`, `docs/` a `$HOME/HANDYMAN/<name>`, escribir `harness.config.json`, repuntar bridge files | `SKILL.md` (Workflow, *"Migrate local to global"*); señalado como la única operación sin tool en `docs/analisis-iteraciones.md` | **No** — todo a mano |
| E | **`index.md` (MOC de Obsidian)**: listar features por estado, reportes de `backlog/`, docs y queries de tags | `references/obsidian.md` (Map Of Content) | **No** — se mantiene a mano; nada lo regenera del estado vivo |
| F | **frontmatter/tags de Obsidian**: required keys por archivo + namespace `#handyman/...` | `references/obsidian.md` (Frontmatter Conventions, Tag Namespace); `references/anatomy.md` L18-24 | **No** — se estampa a mano; ningún gate lo normaliza |
| — | `feature_list.json`: bloqueo + motivo | `feature.py block --reason` | **Sí** (lo incluyo como contraste: es el patrón a replicar) |

---

## 4. Causas raíz

| # | Causa | Evidencia |
|---|-------|-----------|
| 4.1 | **Asimetría de determinismo.** El estado JSON recibió una CLI (`feature.py`, feature 3) precisamente porque editarlo a mano era la causa raíz de split-scope/two-in_progress/date-drift; el **mismo** razonamiento aplica a `current.md`/`history.md`/`backlog/`, pero nunca recibieron su equivalente | docstring de `scripts/feature.py`; `docs/analisis-inconsistencia-bootstrap.md` |
| 4.2 | **Plantillas huérfanas.** `assets/backlog-impl.template.md` y `assets/backlog-review.template.md` existen pero ningún script las instancia; `scaffold.sh` solo crea el directorio | `scripts/scaffold.sh` L136 vs L141-144 |
| 4.3 | **El formato rico vive solo en convención.** El formato de `history.md`/`current.md` está en ejemplos y en la cabeza del operador, no en un script → cada modelo lo reproduce distinto (drift cross-model, misma clase que el `bootstrap`) | `references/examples.md`; `docs/analisis-inconsistencia-bootstrap.md` |
| 4.4 | **Contrato sin enforcement.** El frontmatter/tags está documentado (`anatomy`/`obsidian`) pero verificado en ningún sitio; `validate_harness.py` solo valida `feature_list.json` | `references/anatomy.md`; `references/obsidian.md`; `scripts/validate_harness.py` |
| 4.5 | **Operaciones sin tool.** `migrate-global` e `index.md` no tienen ningún script asociado; son prosa que el modelo improvisa | `SKILL.md` (Migrate); `docs/analisis-iteraciones.md` |

La conclusión es la misma que en los análisis previos: **mientras una mutación de
estado siga siendo prosa que el modelo teclea, su formato y su corrección quedan
a criterio del modelo**. La forma de cerrarla es la que ya probó `feature.py`:
mover la operación determinista y repetitiva a un script, dejar las plantillas en
`assets/` y reservar la prosa de `references/` para el *cómo* y el *cuándo*.

---

## 5. Encuadre con la skill `skill-creator`

Se consultó la skill `skill-creator` para encuadrar la propuesta. Su anatomía de
*Bundled Resources* fija exactamente el reparto que esta feature necesita:

- **`scripts/` — "Executable code for deterministic/repetitive tasks".** Las
  acciones de este análisis (instanciar un reporte con su frontmatter, anexar una
  entrada de historial, fijar el `Next Step`) son deterministas y repetitivas:
  pertenecen a `scripts/`, no a prosa que el modelo re-derive en cada turno.
- **`assets/` — "Files used in output (templates...)".** Las plantillas
  `assets/backlog-*.template.md` son precisamente eso; el patrón previsto por la
  skill es **un script que consume una plantilla de `assets/`**, que es justo el
  cableado que falta.
- **`references/` — "Docs loaded into context as needed".** El *cuándo* y el
  *porqué* (protocolos, contrato) siguen en `references/`; el script aporta el
  *cómo* determinista.
- **Progressive disclosure:** los scripts "can execute without loading", así que
  añadir helpers no infla el contexto del modelo (no pesa en el presupuesto de
  `SKILL.md`).
- **Formatos de salida:** la skill recomienda fijar el formato con una plantilla
  exacta en vez de describirlo en prosa —que es el argumento directo para que
  `history.md`/`current.md`/`backlog/` los emita un script y no la mano—.

---

## 6. Plan de trabajo (foco en `SKILL.md` y `references/`)

Cada ítem distingue lo **determinista** (un script/plantilla nuevos) de lo
**interactivo** (lo que el modelo sigue decidiendo). Las propuestas de
implementación de scripts se listan como **features futuras** (sección 7); esta
feature entrega el plan.

### A. `backlog/`: generador determinista de entradas

- **Determinista:** un `scripts/backlog.py` (o subcomando `feature.py backlog
  impl|review|explore`) que instancie la plantilla correcta con el frontmatter
  exacto por tipo (`feature`/`topic`, `status`, `role`, `updated`, `tags` con el
  namespace `#handyman/...`). Cablear las plantillas ya existentes
  `assets/backlog-impl.template.md` y `assets/backlog-review.template.md`, y
  **añadir** `assets/backlog-explore.template.md`.
- **Interactivo:** el *contenido* del reporte (qué archivos, qué decisiones, el
  veredicto) lo sigue escribiendo el rol.
- **Docs (scope):** `references/workflow.md` (protocolos Implementer/Reviewer/
  Explorer → "crea el reporte con el generador, no a mano"); `references/templates.md`
  (marcar el generador como vía canónica de las entradas de `backlog/`);
  `references/anatomy.md` (Optional Support Files).

### B. `progress/`: helpers de sesión e historial

- **Determinista:** extender `feature.py` (o un `scripts/progress.py`) con `log
  "<línea>"` (append al `Log` de `current.md` + bump de `updated:`), `next
  "<paso>"` (fija `Next Step`), y una entrada **rica** de `history.md` emitida por
  el script al cerrar (en vez del append mínimo actual).
- **Interactivo:** qué decir en el log y en el resumen lo decide el rol; el script
  fija *la forma*.
- **Docs (scope):** `references/workflow.md` (Implementer paso 3, Closure paso 3);
  puntero en `SKILL.md`.

### C. `migrate-global`: mover determinista con dry-run/backup

- **Determinista:** un `scripts/migrate_harness.py` (o un modo en
  `update`/`upgrade`) que mueva `feature_list.json`/`progress/`/`backlog/`/`docs/`
  a `$HOME/HANDYMAN/<name>`, escriba `harness.config.json` y repunte los bridge
  files, con `--dry-run` y backup (mismo patrón que `upgrade_harness.py`).
- **Interactivo:** la aprobación explícita de migrar una sesión activa.
- **Docs (scope):** `references/workflow.md` (Migrate); `SKILL.md` (Migrate local
  to global).

### D. `index.md`: regenerador del MOC

- **Determinista:** un regenerador que reconstruya `index.md` desde el estado vivo
  (features por estado, reportes de `backlog/`, docs, queries de tags).
- **Interactivo:** las notas conceptuales que el operador quiera añadir al hub.
- **Docs (scope):** `references/obsidian.md` (Map Of Content).

### E. Advisory de frontmatter/tags en el verifier

- **Determinista:** un check no bloqueante en `validate_harness.py` (NOTE) que
  compruebe las required keys + el namespace de tags por tipo de archivo en
  `progress/` y `backlog/`, degradando grácilmente como los advisories existentes.
- **Interactivo:** nada; cierra el hueco 4.4 sin imponer un gate duro.
- **Docs (scope):** `references/checklists.md` (Analysis + Common Risks);
  `references/anatomy.md` (Verification Contract).

### Pointer en `SKILL.md` (presupuesto de tokens)

`SKILL.md` necesita una sola línea que generalice la regla "no edites
`feature_list.json` a mano" a **toda** mutación de estado: *preferir `scripts/`
para crear/actualizar `current.md`, `history.md` y las entradas de `backlog/`*.
**Aviso de presupuesto:** `SKILL.md` está en 997/1000 palabras (margen 3); la
edición real debe ser mínima (un puntero o plegarla en una Core Rule existente) y
se hace como feature de implementación aparte, midiendo `wc -w` antes y después.

---

## 7. Fuera de scope (features sugeridas, NO añadidas)

Estas serían features de implementación propias, en el espíritu de cómo
`docs/analisis-inconsistencia-bootstrap.md` derivó las suyas (ids 10-14):

- `backlog_generator` — script A + `assets/backlog-explore.template.md` + tests.
- `progress_helpers` — helpers B (`log`/`next` + entrada rica de historial) + tests.
- `migrate_script` — script C con dry-run/backup + tests.
- `index_regen` — regenerador D + tests.
- `frontmatter_advisory` — check E en `validate_harness.py` + cableado en
  `init.sh` vivo + fixture + `test_init.sh`.
- `skill_deterministic_rule` — el puntero en `SKILL.md` (budget-aware).

---

## 8. Verificación y notas

- Esta feature es **research-only**: el entregable es este documento. La
  implementación de los scripts A-E queda para las features de la sección 7, una a
  una, respetando "one feature at a time".
- El gate que debe seguir verde es `./init.sh`. Este documento usa **inline-code**
  para todas las rutas (no markdown links) para no romper la verificación de
  enlaces de `test_docs.py` (que extrae links tras descartar el código).
- El plan respeta la distinción **managed scaffolding vs project-owned state**: los
  generadores crean/instancian, pero (como `scaffold.sh`) nunca deben sobrescribir
  contenido ya rellenado por el usuario.

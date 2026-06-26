# 🔬 Investigación: descubrimiento de skills y MCPs y su uso determinista en handyman

> Documento de investigación y plan de trabajo. Responde a una pregunta concreta:
> **¿cómo se descubren hoy las skills y los servidores MCP, por qué dentro de
> Handyman ese descubrimiento vive como prosa no determinista, y cómo profundizar
> su uso para (1) declararlos en `harness.config.json`, (2) consultarlos de forma
> determinista para su búsqueda y uso, y (3) documentarlo para una nueva entrega?**
> Cada hallazgo se apoya en evidencia concreta del repositorio y en las skills
> `skill-creator` y `mcp-builder` como literatura. El scope del plan es `SKILL.md`,
> `references/`, `assets/` y `scripts/`.

---

## 1. El objetivo

Handyman ya modela **qué capacidades** puede usar cada rol (el mapa `tools` de
`harness.config.json`: `vscode`, `execute`, `read`, `agent`, `edit`, `search`,
`web`, `browser`, `todo`). Lo que **no** modela es **qué skills y qué servidores
MCP concretos** están disponibles, cuáles son relevantes para una feature, y cómo
encontrarlos sin depender del juicio semántico del modelo en cada turno.

La petición pide profundizar el uso de skills y MCPs dentro de Handyman con tres
metas observables:

1. **Declararlos** dentro de `harness.config.json` (que el harness diga, como
   contrato, de qué skills/MCPs depende).
2. **Consultarlos de forma determinista** (un comando reproducible que liste,
   busque y verifique skills/MCPs, en vez del descubrimiento semántico de la
   plataforma).
3. **Documentar su uso** para una nueva entrega (una referencia que explique el
   mecanismo y el contrato).

La pregunta no es "¿existe el descubrimiento?" —la plataforma ya descubre skills y
tools— sino "¿por qué dentro de Handyman ese descubrimiento es **prosa suelta** y
no un **contrato consultable**, y qué forma determinista conviene darle?". La
respuesta es simétrica a la de los análisis previos (`error_inconsistency_docs`,
`business_context_bootstrap`, `deterministic_actions_per_layer`,
`feature_request_md`): mientras la información viva solo en prosa, su calidad y su
consistencia quedan a criterio de quien la escriba o del modelo que la lea.

---

## 2. Cómo se descubre hoy (a nivel de plataforma)

### 2.1 Skills: progressive disclosure y la `description` como disparador

Una skill se descubre por su **metadata**. Según `skill-creator`, una skill se
carga en **tres niveles** (progressive disclosure):

1. **Metadata** (`name` + `description`) — siempre en contexto (~100 palabras).
2. **Cuerpo de `SKILL.md`** — en contexto cuando la skill se dispara (<500 líneas).
3. **Recursos** (`references/`, `scripts/`, `assets/`) — bajo demanda.

El nivel 1 es el **mecanismo de disparo**: la `description` es lo único que el
modelo ve siempre, y con ella decide si la skill aplica. `skill-creator` lo dice
literalmente: *"This is the primary triggering mechanism — include both what the
skill does AND specific contexts for when to use it"*, y advierte que el modo de
falla típico es **infra-disparar** (no usar una skill útil), por lo que recomienda
descripciones "pushy". En este entorno (VS Code), un bloque `<skills>` enumera cada
skill instalada con su `name`, su `description` y la ruta de su `SKILL.md`; el
modelo **empareja la tarea contra esas descripciones** y lee el `SKILL.md` cuando
hay match. Es decir: **el descubrimiento de skills es un emparejamiento semántico
contra descripciones**, no una consulta determinista.

### 2.2 MCPs y tools: lista de deferred tools + `tool_search` semántico

Los servidores MCP exponen **tools** (no skills). En este entorno conviven dos
mecanismos:

- Una **lista enumerada** de *deferred tools* (nombres de herramientas que deben
  cargarse antes de usarse), p. ej. las `mcp_nx_*`, `github-pull-request_*`,
  `mcp_gitkraken_cli_*`, `mcp_provides_tool_pylance*`.
- Un **`tool_search`** que, dada una descripción en lenguaje natural, devuelve por
  **similitud semántica** las tools relevantes y su esquema completo, para poder
  invocarlas.

`mcp-builder` enmarca esto como un problema de diseño de primera clase:
*"Tool Naming and Discoverability: clear, descriptive tool names help agents find
the right tools quickly. Use consistent prefixes (e.g. `github_create_issue`,
`github_list_repos`) and action-oriented naming"*. La calidad del descubrimiento de
un MCP es función de la **calidad de sus nombres y descripciones**. Igual que con
las skills, el mecanismo es **semántico** (`tool_search` por similitud), no una
consulta determinista contra un contrato.

### 2.3 El hilo común: descubrimiento semántico, no determinista

Tanto skills como MCPs se descubren hoy por **heurística semántica**: la skill se
dispara si su `description` empareja la tarea; la tool se encuentra si `tool_search`
la acerca por similitud. Es flexible y potente, pero tiene dos consecuencias para un
harness que valora el determinismo:

- **No es reproducible ni auditable**: dos modelos (o dos turnos) pueden descubrir
  conjuntos distintos para la misma tarea; nada deja por escrito qué skills/MCPs se
  consideraron disponibles.
- **No hay verificación de existencia**: una feature puede *nombrar* una skill que
  no está instalada, y el flujo no lo detecta hasta que falla.

Handyman ya resolvió esta misma tensión para el estado JSON (el `feature_list.json`
recibió `scripts/feature.py` y un schema vivo porque editarlo a mano causaba drift).
El descubrimiento de skills/MCPs es **otra capa que aún no recibió su equivalente
determinista**.

---

## 3. Cómo lo usa (y no lo usa) Handyman hoy

### 3.1 El mapa `tools` de `harness.config.json` es de *capability groups*, no de skills/MCPs

`harness.config.json` declara `tools` por rol, pero sus valores son **grupos de
capacidad** abstractos (`vscode`, `execute`, `read`, `agent`, `edit`, `search`,
`web`, `browser`, `todo`), documentados en `references/tools.md` (tabla "Capability
Groups") y validados por `harness.config.schema.json` (`role_tools` →
`tool_list`). Responden a *"¿qué categorías de acción puede ejecutar este rol?"*
(mínimo privilegio), **no** a *"¿qué skills o servidores MCP concretos existen y
cuándo usarlos?"*. Son dos preguntas distintas y hoy solo la primera tiene contrato.

### 3.2 El feature-request nombra skills como prosa libre

El único lugar del harness donde se nombran skills concretas es el formulario de
entrada. `assets/feature-request.template.md` tiene un campo
`## Tools` → `- skills: <handyman, ...>` (líneas 54, 109, 144), y en
`Considerations` sugiere "complementary skills … e.g. `ponytail`, `skill-creator`".
Pero ese campo es **prosa**:

- no es machine-readable;
- no aparece en `harness.config.json`;
- no lo valida ningún schema ni script;
- no es consultable;
- es **guía** para el leader y el humano (de hecho `references/workflow.md`,
  Leader Protocol #4, aclara que `feature.py add` escribe **solo** las contract
  keys `name/title/description/acceptance`: `Tools` **no** se persiste).

Es exactamente el mismo patrón "prosa, no contrato" que los análisis previos
encontraron en otras capas.

### 3.3 Cero servidores MCP referenciados en el harness

No existe ningún archivo de configuración MCP en el repo (`.mcp.json`,
`.vscode/mcp.json`, `mcp.json`: búsqueda sin resultados) ni mención alguna de MCP en
`references/`. Los servidores MCP que el entorno expone (Nx, GitKraken,
GitHub PR, Pylance…) son **invisibles para el harness**: ni se declaran, ni se
documentan, ni se consultan. La feature actual (`tool_discovery`) es la primera vez
que la palabra "MCP" entra al repositorio.

### 3.4 Ningún script descubre, lista, valida ni consulta skills/MCPs

El inventario de `scripts/` —`scaffold.sh`, `feature.py`, `validate_harness.py`,
`update_harness.py`, `upgrade_harness.py`, `backlog.py`, `index_md.py`— cubre
scaffolding, estado de features, validación de estructura, models/tools, upgrades,
reportes de backlog y el MOC. **Ninguno** toca skills ni MCPs. No hay un
equivalente determinista del `tool_search` semántico ni un "¿qué skills declara este
harness y cuáles están instaladas?".

### 3.5 `references/tools.md` no menciona skills ni MCP

La referencia de herramientas documenta los capability groups, la tabla por rol, el
orden de resolución y la sintaxis por plataforma, pero **no dice nada** sobre skills
ni sobre servidores MCP como concepto. La capa de "identidad de herramientas"
(qué skills/MCPs, no qué categorías) no tiene hogar documental.

---

## 4. Causas raíz (con evidencia)

| # | Causa | Evidencia |
|---|-------|-----------|
| 4.1 | El harness modela **capacidad** (mínimo privilegio por rol), no **identidad** (qué skills/MCPs concretos) | `harness.config.json` `tools` = grupos abstractos; `references/tools.md` "Capability Groups"; `harness.config.schema.json` `role_tools`→`tool_list` |
| 4.2 | Las skills entran al harness **tarde y como prosa**, en el feature-request | `assets/feature-request.template.md` `Tools > skills` (L54/109/144); `feature.py add` no persiste `Tools` (workflow Leader #4) |
| 4.3 | Los **MCPs no existen** como concepto en el harness | Sin `.mcp.json`/`.vscode/mcp.json` en el repo; cero menciones de MCP en `references/` |
| 4.4 | El descubrimiento de plataforma es **semántico por diseño** y el harness nunca añadió una capa determinista encima | Skills: `description`-triggering (`skill-creator`); MCP: deferred list + `tool_search` por similitud (`mcp-builder`) |
| 4.5 | No hay **verificación de existencia**: una feature puede nombrar una skill no instalada y nada lo detecta | `validate_harness.py` valida files/parse/≤1 in_progress/enum/frontmatter, **no** skills/MCPs |

La conclusión es la misma de los análisis previos: convertir una capa **semántica y
en prosa** en una capa **declarada y consultable** exige (a) un **contrato**
(declararla en `harness.config.json` + schema), (b) un **script determinista**
(listar/buscar/verificar) que complemente al descubrimiento semántico, y (c)
**documentación** que fije el mecanismo y el límite.

---

## 5. Literatura: qué dicen `skill-creator` y `mcp-builder`

| Fuente | Principio | Cómo aterriza en Handyman |
|--------|-----------|---------------------------|
| `skill-creator` | La `description` es el **mecanismo de disparo**; progressive disclosure en 3 niveles | Declarar skills es declarar **intención**; la `description` sigue disparando. El harness puede **listar** las disponibles, no forzar el trigger |
| `skill-creator` | Lo **determinista/repetitivo** va en `scripts/`; las plantillas en `assets/`; la guía en `references/` (disclosure progresiva) | El "listar/buscar/verificar skills" es tarea de `scripts/`; el contrato en `assets/schemas/`; la guía pesada en `references/` y solo un puntero en `SKILL.md` |
| `skill-creator` | "Check available MCPs" como paso de investigación | Tener declarado **qué MCPs** espera el harness hace ese chequeo reproducible en lugar de improvisado |
| `mcp-builder` | **Naming + discoverability** son diseño de primera clase: prefijos consistentes, naming orientado a acción | Una consulta determinista puede apoyarse en los **nombres/prefijos** de las tools (`github_*`, `mcp_nx_*`) para agruparlas por servidor |
| `mcp-builder` | Descripciones concisas + errores accionables | El advisory de Handyman debe decir **qué falta y el próximo paso** (declarada pero no instalada → NOTE con la skill y la acción) |

El principio rector combinado: **lo determinista (declarar + listar + verificar) se
fija con schema y script; lo semántico (el trigger real) sigue siendo de la
plataforma; la prosa solo documenta el contrato y el límite.**

---

## 6. El diseño propuesto (los tres objetivos)

### 6.1 Objetivo 1 — Declarar skills/MCPs en `harness.config.json`

Añadir un bloque **opcional** `discovery` a `harness.config.json`, hermano de
`models` y `tools`, con dos sub-claves:

```json
{
  "install_mode": "local",
  "project_name": "handyman",
  "project_root": ".",
  "harness_workspace": ".handyman",
  "models": { "leader": "...", "implementer": "...", "reviewer": "...", "explorer": "..." },
  "tools":  { "leader": ["..."], "implementer": ["..."], "reviewer": ["..."], "explorer": ["..."] },
  "discovery": {
    "skills": ["handyman", "skill-creator", "mcp-builder", "pull-request-publish", "graphify"],
    "mcp":    ["nx", "gitkraken", "github-pull-request"]
  }
}
```

Decisiones de diseño:

- **Opcional y fuera de `required`**: igual que `harness_version` (feature 5), para
  que los harnesses legacy sigan validando. Un harness que no lo declare no rompe.
- **Global, no por rol** (al menos en v1): a diferencia de `models`/`tools`, las
  skills/MCPs son mayormente transversales; un mapa por rol es complejidad
  prematura. Si más adelante hace falta, se refina (`by_role`).
- **Impacto en los schemas (crítico)**: `harness.config.schema.json` tiene
  `additionalProperties: false`, así que la clave `discovery` **debe declararse en
  el schema** o el config deja de validar. Lo mismo en el bloque `config` de
  `feature_list.schema.json` si se replica. `discovery` se define con sus
  propiedades `skills`/`mcp` como arrays de strings, `additionalProperties:false`,
  y queda **fuera de `required`**. Es el mismo movimiento que selló `harness_version`.
- **`scaffold.sh`** estampa un bloque vacío (`"skills": [], "mcp": []`) en los
  harnesses nuevos; las plantillas `harness.config.*.template.json` lo llevan.

### 6.2 Objetivo 2 — Consultas deterministas (script)

Nuevo `scripts/tools_discovery.py` (reutiliza `resolve_workspace` de
`validate_harness.py`), con tres subcomandos que dan la **contraparte determinista**
del descubrimiento semántico:

- `list` — escanea las raíces de skills conocidas (`~/.agents/skills/`,
  `~/.claude/skills/`, y `.github/`/`.claude/` del repo), parsea el frontmatter de
  cada `SKILL.md` (`name` + `description`) e imprime un **catálogo reproducible**.
  Para MCPs, agrupa por prefijo de tool (`mcp_nx_*` → `nx`) si hay un manifiesto
  disponible.
- `find <keyword>` — `grep` determinista sobre nombres y descripciones de skills
  (el equivalente reproducible de `tool_search`, sin depender de la similitud).
- `check` — cruza el bloque `discovery` de `harness.config.json` contra lo instalado
  y reporta **declaradas-pero-ausentes** e **instaladas-pero-no-declaradas**. Ésta
  es la consulta determinista que pide la meta 2.

Salida pensada para ser parseable (líneas `name<TAB>description` o `--json`), de modo
que el leader pueda consumirla sin re-descubrir a ojo.

**Advisory opcional** (patrón de `check_graphify_context` /
`check_harness_version` / `check_business_context`): un `check_tools_discovery()`
no bloqueante en `assets/init.template.sh` que emite `NOTE:` cuando una skill
declarada no está instalada. **Nunca** altera `EXIT_CODE` (consistente con todos los
advisories existentes).

### 6.3 Objetivo 3 — Documentación para la entrega

- Nuevo `references/discovery.md` (o sección nueva en `references/tools.md`) que
  explique: cómo descubre la plataforma (skills por `description`/progressive
  disclosure; MCP por deferred list + `tool_search`), el bloque `discovery` de la
  config, los subcomandos de `tools_discovery.py`, y la **regla clave**: la config es
  una **declaración de intención** (y habilita la verificación determinista), **no**
  una garantía de que el modelo dispare la skill —el trigger sigue siendo semántico.
- Alta del nuevo archivo en el catálogo `references/README.md`.
- `SKILL.md`: **solo un puntero** (presupuesto 997/1000; edición mínima en feature
  aparte).

### 6.4 Determinista vs semántico (el límite honesto)

El diseño separa con nitidez las dos naturalezas, igual que `skill-creator` y
`mcp-builder` separan contrato de heurística:

- **Determinista** (lo que Handyman añade): el bloque `discovery` (declaración), el
  schema (contrato), y `tools_discovery.py list/find/check` (consulta reproducible +
  verificación de existencia).
- **Semántico** (lo que sigue siendo de la plataforma): el **trigger real** de una
  skill por su `description` y el `tool_search` por similitud para los MCPs. El
  harness **no puede ni debe** forzar el trigger; solo puede **declarar** qué espera
  y **verificar** que esté presente.

Esta frontera es el resultado más importante de la investigación: profundizar el uso
de skills/MCPs en Handyman **no** es reemplazar el descubrimiento semántico, sino
**envolverlo en un contrato declarado y verificable**.

---

## 7. Plan de acción (A–E)

Scope: `SKILL.md`, `references/`, `assets/`, `scripts/`. Cada ítem separa lo
determinista (schema/script/advisory) de la redacción humana (referencia/prosa).

- **A — Contrato en los schemas.** Añadir el bloque opcional `discovery`
  (`skills`/`mcp` como arrays de strings, `additionalProperties:false`, fuera de
  `required`) a `assets/schemas/harness.config.schema.json` y al bloque `config` de
  `feature_list.schema.json`; estampar el sentinel `{"skills": [], "mcp": []}` en
  las plantillas; `scaffold.sh` lo copia. Espejo exacto de la feature 5
  (`harness_versioning`). Tests: validar templates contra schema en `test_docs.py`.
- **B — Script de consulta.** `scripts/tools_discovery.py` con `list` / `find` /
  `check` (reutiliza `resolve_workspace`). Suite nueva `tests/test_tools_discovery.sh`
  cableada en `run_tests.sh` (catálogo no vacío; `check` detecta declarada-ausente y
  no-declarada).
- **C — Advisory en el verifier.** `check_tools_discovery()` no bloqueante en
  `assets/init.template.sh` (patrón de los advisories existentes; NOTE si una skill
  declarada no está instalada; nunca toca `EXIT_CODE`). Test que siembra una skill
  declarada-ausente y verifica el NOTE con exit 0.
- **D — Referencia de entrega.** `references/discovery.md` (plataforma + bloque de
  config + script + frontera determinista/semántica) + alta en `references/README.md`.
- **E — Enlazar el feature-request.** Conectar el campo `Tools > skills` del
  `feature-request` con el conjunto declarado (`references/templates.md` /
  `references/examples.md`) y dejar el puntero mínimo en `SKILL.md`.

Orden sugerido **A → B → C → D → E** (contrato primero, luego el script que lo
consume, luego el advisory que avisa, luego la documentación, y por último el enlace
con el formulario).

---

## 8. Features sugeridas (no añadidas)

Documentadas aquí como roadmap; **no** se agregan a `feature_list.json` en esta
investigación (espejo de los análisis 9/15/20/25):

- `discovery_config_schema` (Plan A) — bloque `discovery` opcional en los dos schemas
  + plantillas + scaffold.
- `tools_discovery_script` (Plan B) — `scripts/tools_discovery.py` `list`/`find`/`check`
  + suite de tests.
- `tools_discovery_advisory` (Plan C) — `check_tools_discovery()` no bloqueante en
  `init.template.sh` + test.
- `discovery_reference_doc` (Plan D) — `references/discovery.md` + alta en
  `references/README.md`.
- `feature_request_tools_link` (Plan E) — enlazar `Tools > skills` con el conjunto
  declarado en `references/` + puntero en `SKILL.md`.

---

## 9. Limitaciones

- **El trigger sigue siendo semántico.** El bloque `discovery` declara intención y
  habilita una verificación determinista de *existencia*, pero **no** garantiza que
  el modelo dispare una skill ni que `tool_search` devuelva una tool concreta. Esa
  frontera es deliberada (sección 6.4) y debe quedar explícita en la documentación
  de la entrega, para no prometer determinismo donde la plataforma es heurística.
- **Inventario de MCP dependiente del entorno.** La lista de servidores MCP la define
  el host (VS Code/IDE), no el repo; `tools_discovery.py` puede declararlos y, si hay
  manifiesto, agruparlos por prefijo, pero la disponibilidad real de un MCP la decide
  el entorno de ejecución, no el harness.
- **Raíces de skills variables.** Las rutas de skills (`~/.agents/skills/`,
  `~/.claude/skills/`, rutas de plataforma) dependen del sistema; el script debe
  tratar las rutas ausentes como "sin skills" (degradación grácil), igual que los
  advisories existentes degradan con NOTE.

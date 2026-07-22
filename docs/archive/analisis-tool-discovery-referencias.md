# 🔬 Investigación: extender el discovery a agentes de consulta y añadir la referencia de dónde se toma cada herramienta

> Documento de investigación y plan de trabajo. Continúa a
> `docs/analisis-tool-discovery.md` (que introdujo el bloque `discovery` para
> skills y MCPs) y responde a dos preguntas concretas:
> **(1) ¿conviene extender el discovery de herramientas para incluir los agentes
> de consulta declarados en `.github/agents/` o `.claude/agents/`, de modo que el
> harness sepa qué agentes puede invocar para resolver problemas?** y
> **(2) ¿es necesario añadir la referencia —la ruta— de dónde se resuelve cada
> herramienta (skills, MCPs, agents) al registro de discovery, qué impacto tiene
> para el uso y podría servir para entregar referencias directas?**
> Cada hallazgo se apoya en evidencia leída del repositorio y en las skills
> `handyman`, `skill-creator`, `mcp-builder` y `ponytail` como literatura. El
> scope del plan es `handyman/` (`scripts/`, `references/`, `assets/`), `tests/` y
> `docs/`.

---

## 1. El objetivo

El análisis previo (`docs/analisis-tool-discovery.md`, feature 32; implementado en
las features 33–37 y 40) dejó a Handyman con un contrato de descubrimiento
**determinista** para dos clases de herramienta:

- **skills** — el bloque `discovery.skills` de `harness.config.json`, verificado
  contra el disco por `handyman/scripts/tools_discovery.py`.
- **MCP servers** — el bloque `discovery.mcp`, verificado contra los manifiestos
  del host (hoy `.vscode/mcp.json`).

Lo que ese contrato **no** modela es una tercera clase de herramienta que el propio
harness usa a diario: los **agentes de consulta** (los subagentes que el líder
invoca para investigar o revisar). Y hay una segunda pregunta transversal a las
tres clases: el bloque `discovery` declara **nombres**, no **rutas**; ¿debería
además llevar (o al menos exponer) la **referencia** de dónde vive cada
herramienta, para entregar referencias directas en vez de depender de que la
plataforma vuelva a descubrirlas por similitud?

La pregunta, como en los análisis hermanos (`error_inconsistency_docs`,
`business_context_bootstrap`, `deterministic_actions_per_layer`,
`feature_request_md`, `tool_discovery`), no es "¿existe el descubrimiento?" sino
"¿qué parte del descubrimiento merece un contrato determinista, y dónde está el
límite honesto con lo que la plataforma resuelve por sí misma?".

---

## 2. Punto de partida: qué descubre hoy Handyman

### 2.1 El bloque `discovery` conoce skills y MCPs, no agentes

Evidencia en `harness.config.json` (el harness dogfood del propio repo):

```json
"discovery": {
  "skills": ["handyman", "skill-creator", "mcp-builder", "graphify", "pull-request-publish"],
  "mcp":    ["nx", "gitkraken", "github-pull-request"]
}
```

El esquema `handyman/assets/schemas/harness.config.schema.json` fija la forma con
`additionalProperties:false` y **solo** dos claves:

```json
"discovery": {
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "skills": { "type": "array", "items": { "type": "string", "minLength": 1 }, "uniqueItems": true },
    "mcp":    { "type": "array", "items": { "type": "string", "minLength": 1 }, "uniqueItems": true }
  }
}
```

El mismo bloque, con el mismo `additionalProperties:false`, se repite en
`handyman/assets/schemas/feature_list.schema.json` (dentro de `config`). La
consecuencia es dura y hay que subrayarla: **mientras el esquema no declare una
clave `agents`, ningún harness puede escribirla sin que la validación viva de
`validate_harness.py` la rechace** (es el mismo mecanismo que obligó a sellar
`harness_version` en el esquema antes de usarlo, feature 5). El contrato es
schema-first por diseño.

### 2.2 La ruta de una skill **ya se resuelve**, pero no se expone en `check`

Este es el hallazgo central para el Tema 2. `handyman/scripts/tools_discovery.py`
ya captura la ruta de cada skill cuando la descubre:

```python
def discover_skills(roots):
    ...
    seen[name] = {
        "name": name,
        "description": front.get("description", ""),
        "path": str(skill_md),          # <-- la ruta YA está aquí
    }
```

Esa ruta se emite en `tools_discovery.py list --json` (cada entrada trae `path`),
pero **no** aparece en la salida de `check`, que solo imprime `skill <name>: ok`.
Es decir: la referencia directa a una skill **ya existe en memoria** en el momento
de la verificación; simplemente no se entrega. Para MCP la situación es distinta:
`discover_mcp_servers` devuelve un `name -> host` (p. ej. `nx -> vscode`), no una
ruta de fichero, porque un servidor MCP no es un documento en disco sino una
entrada en un manifiesto del host.

### 2.3 Los agentes de consulta ya viven en una ruta conocida, pero por otro camino

`handyman/scripts/validate_harness.py` **ya sabe** dónde viven los agentes:

```python
# Platform directories where role files are allowed to live.
PLATFORM_ROLE_DIRS = (".github/agents", ".claude/agents")
```

…y usa ese conocimiento para lo contrario de descubrir: comprueba que **no** haya
`*.agent.md` dentro del `HARNESS_WORKSPACE` (los role files deben vivir en la ruta
de plataforma, no en el estado mutable). En el repo, esa ruta contiene:

```
.github/agents/leader.agent.md
.github/agents/implementer.agent.md
.github/agents/reviewer.agent.md
```

Cada uno con frontmatter `name` / `description` / `model` / `tools` — exactamente
la misma forma que el `<skills>` que `tools_discovery.py` ya sabe parsear. Dos
observaciones de evidencia:

1. **`.agents/` no existe en la raíz del repo.** La petición mencionó `.agents/`,
   pero en este repo las skills se resuelven de forma **global** desde
   `~/.agents/skills`; los agentes de consulta viven en `.github/agents/`. La
   extensión debe apuntar a las rutas reales de plataforma (`.github/agents`,
   `.claude/agents`), no a un `.agents/` local inexistente.
2. **Hay un `explorer` declarado sin `explorer.agent.md`.** `harness.config.json`
   define `models.explorer` y `tools.explorer`, pero en `.github/agents/` solo hay
   tres ficheros. El agente `Explore` que la plataforma ofrece es un subagente
   integrado del editor, no un role file del harness. Un discovery de agentes
   **haría visible esta asimetría** (rol declarado ↔ role file ausente), igual que
   `check` ya nota "installed but not declared" para skills.

---

## 3. Tema 1 — Extender el discovery a los agentes de consulta

### 3.1 Qué son los "agentes de consulta"

Son los subagentes que el líder invoca (vía la capability `agent`, ver
`handyman/references/tools.md`) para delegar trabajo acotado sin ensuciar la
conversación principal: `Explore` para investigación read-only, y los propios roles
`implementer` / `reviewer` del harness. La literatura del propio `handyman`
(SKILL.md, "Core Rules") ya trata la delegación como de primera clase: *"Leader
coordinates… Implementer writes code and tests. Reviewer validates…"* y
*"Least-privilege tools per role"*. Lo que falta es que el harness **declare** qué
agentes espera tener disponibles, del mismo modo que ya declara qué skills y MCPs
espera.

### 3.2 El gap: el discovery no conoce a los agentes

Hoy, si un `feature-request.md` dice "delega la investigación al agente `Explore`",
esa expectativa vive solo como prosa. Ningún script comprueba que el agente exista,
ninguna clave del contrato lo registra, y `tools_discovery.py check` —que ya cruza
skills y MCP contra el disco— no lo mira. Es la **misma asimetría** que el análisis
previo encontró para skills/MCP antes de las features 33–37: la información existe,
pero como criterio semántico, no como contrato consultable.

### 3.3 Cómo extenderlo (reutilizando lo que ya hay)

Aplicando la escalera de `ponytail` (*"¿ya vive en este codebase? reutilízalo"*),
la extensión **no** necesita maquinaria nueva:

- El parser de frontmatter `_parse_frontmatter` de `tools_discovery.py` ya extrae
  `name`/`description`; sirve tal cual para un `.agent.md`.
- Las rutas de plataforma ya están enumeradas en `PLATFORM_ROLE_DIRS` de
  `validate_harness.py`; se importan en vez de duplicarlas.
- El patrón `discover_skills` (glob + de-dup + first-occurrence-wins) se copia
  como `discover_agents(root)` que hace `glob("*.agent.md")` sobre esas rutas.

Con eso, `discovery.agents` en el contrato + `discover_agents` en el script +
una rama en `cmd_check` que verifique "declarado ↔ existe en `.github/agents` o
`.claude/agents`" cierran el gap **espejando exactamente** el diseño de skills. El
agente es un fichero en disco (a diferencia de un MCP host-defined), así que la
verificación es tan fiable como la de skills, no un `NOTE` no-bloqueante.

---

## 4. Tema 2 — Añadir la referencia (ruta) de dónde se toma cada herramienta

### 4.1 Qué significa "referencia" para cada clase

| Clase | Referencia natural | ¿Existe hoy? |
|-------|--------------------|--------------|
| skill | ruta del `SKILL.md` | **sí**, `discover_skills` la resuelve; `list --json` la emite |
| agent | ruta del `.agent.md` | resoluble igual que la skill (mismo glob) |
| MCP   | host + fichero de manifiesto (`.vscode/mcp.json`) | parcial: `discover_mcp_servers` da el `host`, no la ruta |

La "referencia" no es un concepto uniforme: para skills y agents es una **ruta de
documento** que se puede abrir directamente; para MCP es una **entrada en un
manifiesto del host**, porque un servidor MCP no es un documento sino un proceso
que la plataforma provee.

### 4.2 El impacto de entregar referencias directas

**A favor.** Hoy el descubrimiento de skills es semántico: la plataforma vuelve a
emparejar la `description` contra la tarea en cada turno (`skill-creator`:
*"This is the primary triggering mechanism"*). Entregar la ruta resuelta convierte
ese emparejamiento probabilístico en un puntero directo: un rol puede abrir
`~/.agents/skills/handyman/SKILL.md` o `.github/agents/leader.agent.md` sin depender
de que la skill vuelva a dispararse. Los beneficios concretos: (1) **auditoría** —
`check` puede decir no solo *qué* falta sino *dónde debería estar*; (2)
**onboarding** — un `index.md` o un reporte de backlog puede citar la fuente exacta;
(3) **referencias directas** en la propuesta que pide la petición: enlazar la
herramienta a la línea del documento que la explica.

**En contra (y aquí manda `ponytail` + la evidencia del repo).** Persistir la
**ruta absoluta dentro del contrato** (`discovery`) es frágil y rompe la
portabilidad:

- La ruta de una skill es **específica de la máquina**: `~/.agents/skills/...` se
  expande distinto por usuario, y el mismo repo instalado en modo `local` vs
  `global` resuelve las skills en sitios diferentes. `handyman/references/discovery.md`
  ya documenta esto: *"Skill roots are environment-dependent… absent roots are
  treated as no skills (graceful degradation)"*.
- El bloque `discovery` es **intención portable** (qué depende el harness), y por
  eso hoy guarda nombres. Meter rutas absolutas lo ata a un entorno y contradice el
  principio de que el contrato viaja con el repo.
- Es una **abstracción no pedida** (regla de `ponytail`: *"no config for a value…
  that the tool can derive"*): la ruta ya se **deriva** en tiempo de consulta; no
  hace falta almacenarla.

### 4.3 La conclusión honesta: declarar nombres, resolver rutas al consultar

El límite correcto es el mismo que separa lo determinista de lo semántico en el
análisis previo, pero aplicado a **portable vs específico de la máquina**:

- **El contrato declara nombres** (portable, viaja con el repo, ya es así).
- **La consulta resuelve y entrega la ruta** (específica del entorno, derivada en
  el momento, nunca persistida). La ruta ya está en `discover_skills`; basta con
  **exponerla en la salida de `check`** (hoy solo la emite `list --json`) y
  resolverla también para agents. Para MCP, la "referencia" que se puede entregar
  es el par host + fichero de manifiesto, que `discover_mcp_servers` ya conoce.

Esto responde la pregunta de la petición ("¿es necesario añadir la referencia?")
con un **matiz**: sí es útil **entregar** la referencia, pero **no** almacenarla en
el contrato. El trabajo real es de superficie (surface), no de esquema.

---

## 5. Literatura: qué dicen las skills consultadas

- **`handyman`** (SKILL.md, "Core Rules" y `references/tools.md`): la delegación a
  subagentes y el least-privilege por rol ya son de primera clase; falta declararlos
  como el resto del discovery. `references/discovery.md` fija la frontera
  determinista/semántica y advierte que las rutas de skills son dependientes del
  entorno.
- **`skill-creator`**: la `description` es el disparador (progressive disclosure de
  tres niveles); el entorno ya lista la **ruta del `SKILL.md`** en el bloque
  `<skills>`. Refuerza que la ruta es información de resolución, no de contrato:
  scripts para lo determinista/repetitivo, references para lo que se lee bajo
  demanda.
- **`mcp-builder`**: *"Tool Naming and Discoverability… use consistent prefixes"*.
  El MCP se descubre por lista de deferred tools + `tool_search` semántico y su
  disponibilidad es **host-defined**: por eso su "referencia" es un manifiesto, no
  una ruta de documento, y su verificación es un `NOTE` no-bloqueante.
- **`ponytail`**: la escalera. Rung 1 (¿necesita existir?) descarta persistir rutas
  en el contrato (YAGNI: la ruta se deriva). Rung 2 (¿ya vive en el codebase?)
  resuelve el Tema 1 reutilizando `_parse_frontmatter` + `PLATFORM_ROLE_DIRS` y el
  Tema 2 exponiendo el `path` que `discover_skills` ya calcula. *"The smallest
  change in the wrong place isn't lazy, it's a second bug"*: la extensión correcta
  es de superficie, no una reescritura del discovery.

---

## 6. Causas raíz (con evidencia)

1. **El esquema es cerrado (`additionalProperties:false`) y solo declara
   `skills`/`mcp`.** Cualquier tercera clase (agents) es indeclarable hasta tocar
   los dos esquemas (`harness.config.schema.json` + `feature_list.schema.json`).
   Evidencia: sección 2.1.
2. **El discovery nació para lo que la plataforma descubre por similitud**
   (skills, MCP tools) y los agentes de consulta llegaron por otro camino
   (`PLATFORM_ROLE_DIRS` en `validate_harness.py`, para una comprobación de
   ubicación, no de disponibilidad). Nadie unió ambos caminos. Evidencia:
   sección 2.3.
3. **La ruta se trata como dato interno de `list --json`, no como una referencia
   entregable.** `check` —el comando que un operador corre para auditar— la
   descarta. Evidencia: sección 2.2.
4. **No hay distinción explícita entre "contrato portable" (nombres) y
   "resolución local" (rutas).** Sin esa distinción escrita, la tentación es meter
   rutas en el contrato y romper la portabilidad. Evidencia: sección 4.2.

---

## 7. Plan de trabajo (A–E) para el workflow de handyman

Cada ítem separa lo **determinista** (esquema/script/test) de lo **documental**, y
respeta la regla de que el contrato guarda nombres y la consulta entrega rutas.
Espeja el plan de `docs/analisis-tool-discovery.md` (features 33–37).

- **A — Esquema: declarar `discovery.agents`.** Añadir `agents` (array de strings
  únicos, `additionalProperties:false`, fuera de `required`) a la definición
  `discovery` de `harness.config.schema.json` y a la de `feature_list.schema.json`.
  Sentinel `[]` en las tres plantillas (`harness.config.local/global.template.json`,
  `feature_list.template.json`). Test en `test_docs.py` (espejo de
  `test_discovery_config`, feature 33). Sin tocar `scaffold.sh` (copia las
  plantillas verbatim). *Determinista, schema-first.*

- **B — Script: `discover_agents` + rutas en `check`.** En
  `handyman/scripts/tools_discovery.py`: (1) `discover_agents(root)` reutiliza
  `_parse_frontmatter` y las rutas de `PLATFORM_ROLE_DIRS` (importadas de
  `validate_harness.py`, no duplicadas); (2) `cmd_check` verifica cada agente
  declarado como `ok`/`MISSING` (fiable: es un fichero en disco) y nota los
  role files presentes no declarados; (3) `cmd_check` y `cmd_list` **exponen la
  ruta resuelta** de skills y agents (la referencia directa que pide la petición),
  sin persistirla en el contrato. Casos nuevos en `tests/test_tools_discovery.sh`.
  *Determinista; reutiliza, no reescribe.*

- **C — Advisory: incluir agents en `check_tools_discovery()`.** Extender el
  advisory no-bloqueante de `assets/init.template.sh` para que el `NOTE` considere
  también `discovery.agents` vacío (mismo patrón `jq … // [] | length`, nunca toca
  `EXIT_CODE`). Test espejo en `test_docs.py`. *Opcional; si añade ruido, se omite
  (ponytail).* 

- **D — Referencia: documentar agents y la frontera de rutas.** Ampliar
  `handyman/references/discovery.md` con (1) una subsección de agentes de consulta
  (qué son, dónde viven, cómo `check` los verifica) y (2) el límite **contrato =
  nombres / consulta = rutas**, explicando por qué no se persisten rutas absolutas.
  Nota cruzada en `references/tools.md` (los agents son la contraparte declarable de
  la capability `agent`). *Documental.*

- **E — Enganche con el workflow.** Permitir una línea `agents:` en la sección
  `Tools` de `assets/feature-request.template.md` (junto a `skills:`), y un puntero
  en el Leader Protocol de `references/workflow.md` para que la delegación cite el
  agente declarado y verificado por `check`. *Documental; cierra el lazo intención →
  contrato → verificación.*

`SKILL.md` (997/1000) y `AGENTS.template.md` (249/250) quedan **intactos**: el
cambio vive en esquemas, script, referencias y plantillas, no en la superficie de
tokens.

---

## 8. Features sugeridas (no añadidas)

Reflejando la práctica de la serie, el plan se descompone en features atómicas para
una entrega futura (una request = una feature; no se añaden aquí):

- `discovery_agents_schema` (A)
- `tools_discovery_agents` (B, incluye exponer la ruta en `check`)
- `tools_discovery_agents_advisory` (C, opcional)
- `discovery_agents_reference` (D)
- `feature_request_agents_link` (E)

---

## 9. Decisión de diseño

Dos fronteras, una idea:

- **Determinista vs semántico** (heredada del análisis previo): el harness declara
  y verifica presencia; no fuerza el disparo de una skill ni la invocación de un
  agente —eso sigue siendo de la plataforma.
- **Contrato portable vs resolución local** (nueva, del Tema 2): el bloque
  `discovery` guarda **nombres** (viajan con el repo); la consulta
  (`tools_discovery.py`) **resuelve y entrega la ruta** en el entorno concreto, sin
  persistirla. La referencia directa es un producto de la consulta, no un campo del
  contrato.

Con esas dos fronteras, extender el discovery a los agentes de consulta y entregar
referencias directas es un cambio de **superficie** sobre maquinaria que ya existe:
el parser de frontmatter, las rutas de plataforma y el `path` de cada skill ya están
en el repo. La entrega correcta reutiliza; no reescribe.

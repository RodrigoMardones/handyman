# 🛰️ Investigación: monitoreo de trabajo en múltiples harnesses (flota)

> Documento de investigación y plan de trabajo. Responde a una pregunta concreta:
> **¿cómo observar, desde un solo lugar, el trabajo que ocurre en múltiples
> harnesses `.handyman` instalados en proyectos distintos?** Cada hallazgo se apoya
> en evidencia del repositorio y de los harnesses reales de la máquina. El scope del
> plan es `handyman/scripts/`, `handyman/assets/schemas/`, `handyman/references/` y
> `tests/`; `SKILL.md` no se toca (presupuesto de tokens).

---

## 1. El objetivo

Hoy existen al menos dos harnesses activos en esta máquina:

| Harness | `harness_version` | Features | Estado |
|---|---|---|---|
| `handyman` (este repo) | 1.14.15 | 59+ | 58 done / 1+ pending |
| `phily-app` | 1.8.9 | 11 | 7 done / 4 pending |

No hay forma de responder, sin entrar proyecto por proyecto: ¿qué se está
trabajando ahora y desde cuándo? ¿qué colas de pendientes hay? ¿qué harness quedó
atrás de versión? ¿hay WIP abandonado? La petición pide un mecanismo de monitoreo
multi-harness, con las decisiones de nombre y ubicación resueltas por **valor de
usabilidad para el usuario**.

## 2. Evidencia: el estado observable ya existe

Cada harness publica en disco, por contrato y con schema, todo lo que un monitor
necesita leer. Es el "API de disco" del harness:

| Artefacto | Señal | Formato |
|---|---|---|
| `feature_list.json` | cola de trabajo: counts por `pending/in_progress/done/blocked`, invariante ≤1 `in_progress` | JSON + schema draft-07 |
| `progress/current.md` | **sesión viva**: frontmatter `feature/status/role/updated` | YAML frontmatter |
| `progress/history.md` | throughput: headings `## YYYY-MM-DD - Feature N: name`, append-only | markdown parseable (regex en `metrics.py`) |
| `backlog/*.md` | veredictos de review, cobertura de evidencia | YAML frontmatter |
| `harness.config.json` | identidad, `harness_version` sellada, `models/tools/discovery/post_run` | JSON + schema |

Y las primitivas de lectura ya están construidas y se reimportan entre scripts:

- `scripts/metrics.py` — **ya es el colector por-harness**: read-only, `--json`,
  deriva counts, throughput, tasa de aprobación y cobertura; degrada a vacío si
  falta una capa; `collect(root)` retorna el dict completo.
- `scripts/validate_harness.py` — `resolve_workspace(root)`, la resolución
  canónica de `HARNESS_WORKSPACE` que todos los scripts reutilizan.
- `scripts/tools_discovery.py` — `_parse_frontmatter(path)`, el parser compartido.
- `scripts/upgrade_harness.py` — `current_skill_version()`,
  `read_installed_version()`, `parse_version()`: la comparación de drift ya existe.
- Hooks `post_run` (feature 44) — punto de extensión declarado al cierre.

**La conclusión estructural es la misma de los análisis previos** (`tool_discovery`,
`deterministic_actions_per_layer`, `pre-post-process`): no falta instrumentación,
falta *composición*. Todo es per-`--root` y nadie sabe dónde están los roots.

## 3. El gap

1. **Descubrimiento.** Ningún componente registra dónde viven los harnesses; los
   dos de esta máquina se encontraron con `find`. No existe `$HOME/HANDYMAN`.
2. **Agregación.** `metrics.py` y `preflight.py` operan sobre un `--root` a la vez;
   no existe "recorre todos y compón".
3. **Sesión viva ignorada.** `progress/current.md` lleva `feature/role/updated` en
   frontmatter — la señal de "qué se trabaja ahora" — y ni `metrics.py` la lee.
4. **Salud de flota invisible.** WIP estancado, violación del invariante ≤1
   `in_progress`, drift de versión (real hoy: 1.8.9 vs 1.14.15 vs skill 1.15.15),
   colas ociosas: solo visibles entrando proyecto por proyecto.
5. **Heterogeneidad.** El monitor debe leer harnesses de versiones distintas sin
   romperse (phily-app es 6 minors más viejo; campos como `harness_version` pueden
   faltar en harnesses pre-1.8.4).

## 4. Restricciones de diseño (heredadas de la filosofía del harness)

- **Disco es la fuente de verdad → monitor pull, read-only.** Observa, nunca gatea:
  exit 0 siempre, degradación con `NOTE` (patrón `metrics.py`/`preflight.py`).
- **No ejecutar `init.sh` ajenos por defecto**: lento y con efectos; la
  verificación en vivo de otros proyectos queda opt-in como trabajo futuro.
- **Los scripts no se scaffoldean a los repos destino** (constraint de la feature
  35): phily-app no tiene `scripts/` propios. El monitor vive en el skill y apunta
  hacia afuera con `--root`/registro; cualquier *push* desde los proyectos debe
  resolver la ruta del skill, por eso se difiere (§7).
- **Tolerancia a drift**: cada campo ausente degrada a `null`/`NOTE`, nunca
  excepción. El monitor es, de paso, el dashboard natural de upgrades pendientes.
- **Determinista y testeable**: fechas relativas ("hace N días") aceptan `--today`
  para tests reproducibles, espejo de `feature.py done --date`.

## 5. Decisiones resueltas (criterio: usabilidad)

**Nombre: `fleet`** (`scripts/fleet.py`, "registro de flota", "MOC de flota").
El nombre designa el *dominio* — el conjunto de harnesses — no una acción, así los
subcomandos componen en lenguaje natural: `fleet.py status`, `fleet.py health`,
`fleet.py discover`. Las alternativas descartadas nombran la acción o la vista
(`monitor.py register` y `panel.py health` leen forzado) y "fleet management" es el
término establecido para esta categoría de herramienta.

**Ubicación: `$HOME/HANDYMAN/registry.json`**, con override por variable de entorno
`HANDYMAN_ROOT` (los tests dependen de esto para no tocar el HOME real). Razones:

1. **Visibilidad.** `$HOME/HANDYMAN` es una carpeta visible: aparece en Finder y
   puede abrirse como vault de Obsidian. La alternativa `~/.handyman` es un dotfile
   oculto: Obsidian no la ofrece como vault y el usuario no la ve — mala usabilidad
   para un artefacto cuyo propósito es *ser mirado*.
2. **Concepto ya existente.** `HANDYMAN_ROOT=$HOME/HANDYMAN` ya es la raíz del modo
   `global` del skill (`$HOME/HANDYMAN/<project_name>`). Reusar el concepto evita
   una segunda noción de "lugar global de handyman".
3. **Un solo vault para todo lo global.** Registro (`registry.json`), MOC de flota
   (`index.md`, Plan D) y workspaces globales futuros conviven en una raíz única
   navegable; los wikilinks internos resuelven dentro del mismo vault.

## 6. Plan de trabajo (A–E)

**Plan A — Registro de flota.** `scripts/fleet.py register|unregister|list|discover`
con estado en `$HANDYMAN_ROOT/registry.json` y schema
`assets/schemas/registry.schema.json` (draft-07, `additionalProperties:false`).
El registro guarda **solo** `project_root` + `registered` (fecha): todo lo demás se
lee vivo del disco en cada consulta — una sola fuente de verdad, cero drift de
espejo (lección de la mitigación B de `analisis-inconsistencia-bootstrap.md`).
`register` valida que el root resuelva workspace; `discover --scan DIR` localiza
`harness.config.json`/`.handyman/` y con `--register` los agrega. Suite
`tests/test_fleet.sh` cableada en `run_tests.sh`, siempre bajo un `HANDYMAN_ROOT`
temporal.

**Plan B — Colector agregado.** `fleet.py status [--json]`: por cada harness
registrado compone `metrics.collect()` + sesión viva (frontmatter de `current.md`)
+ `harness_version` instalada vs `current_skill_version()` + fecha del último
cierre en `history.md`. Cero parsing nuevo: importa las primitivas de §2. Un root
ilegible degrada a entrada con `error`; el comando siempre sale 0.

**Plan C — Señales de salud.** `fleet.py health [--strict] [--stale-days N]
[--idle-days N] [--today YYYY-MM-DD]` deriva señales por harness:

| Señal | Regla | Default |
|---|---|---|
| `INVARIANT` | >1 feature `in_progress` en `feature_list.json` | — |
| `STALE_WIP` | hay `in_progress` y el `updated` de `current.md` es más viejo que N días | 7 |
| `BEHIND` | `harness_version` < versión actual del skill (o sin sello) | — |
| `IDLE` | hay `pending` en cola y el último cierre es más viejo que N días (o no hay cierres) | 14 |
| `UNREADABLE` | el root registrado no resuelve un workspace legible | — |

Exit 0 por defecto (observa, no gatea); `--strict` sale 1 si hay señales, para
cron/CI del operador.

**Plan D — Presentación.** Dos vistas baratas antes que cualquier dashboard web:
la tabla CLI de `status` y `fleet.py moc`, que regenera `$HANDYMAN_ROOT/index.md` —
el **MOC global de flota** (espejo de `scripts/index_md.py`): frontmatter
`tags: [handyman/fleet]`, una sección por harness (versión, counts, sesión, último
cierre), links markdown solo a archivos existentes (workspaces locales fuera del
vault van con ruta absoluta) y sección `## Notes` del operador preservada entre
regeneraciones.

**Plan E — Entrega.** `references/fleet.md` (registro, subcomandos, tabla de
señales, filosofía read-only, decisiones de §5, trabajo futuro) + alta en
`references/README.md`. `SKILL.md` no se toca: el presupuesto está en 997/1000
palabras y el precedente (features 36–37) resolvió igual.

## 7. Trabajo futuro (explícitamente fuera de esta entrega)

- **Heartbeat push por `post_run`.** Cada cierre de feature podría anexar un evento
  al registro (`fleet.py heartbeat`) y dar un timeline de flota sin escanear. Se
  difiere porque los scripts no viven en los repos destino (§4): requiere resolver
  la ruta del skill desde cada proyecto (estilo `HANDYMAN_SKILL_ROOTS`) o un
  wrapper self-contained. Pull-first cubre la necesidad con 2–10 harnesses.
- **Verificación en vivo opt-in** (`fleet.py status --run-verifier`): correr el
  `init.sh` de cada proyecto bajo demanda y reportar el exit code.
- **HTML estático** (`fleet.py moc --html`): dashboard sin dependencias para
  compartir; el MOC Obsidian cubre el caso personal.
- **Timeline cross-proyecto**: fusionar los headings fechados de todos los
  `history.md` en una vista cronológica única (los datos ya quedan en `status
  --json`).
- **Upgrade de flota**: `fleet.py upgrade --all` orquestando
  `upgrade_harness.py` por cada harness `BEHIND` (hoy ya visible en `health`).

## 8. Riesgos

- **Registro con roots muertos** (proyectos borrados/movidos): mitigado — `status`
  y `health` los degradan a `UNREADABLE`/`error` sin romper; `unregister` los
  limpia.
- **Harnesses muy viejos** sin `harness_version` ni frontmatter: mitigado — cada
  extractor degrada campo a campo a `null`; `BEHIND` trata "sin sello" como atrás.
- **`$HOME/HANDYMAN` compartido con workspaces globales futuros**: `registry.json`
  e `index.md` conviven con directorios `<project_name>`; el schema del registro no
  reserva nada más, y `moc` preserva `## Notes`.

---

*Generado por la feature 60 (`fleet_monitoring_research`). Los Planes A–E se
ejecutan como features 61–65 (`fleet_registry`, `fleet_status`, `fleet_health`,
`fleet_moc`, `fleet_reference_doc`).*

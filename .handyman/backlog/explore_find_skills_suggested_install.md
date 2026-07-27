---
type: Explore Report
topic: find_skills_suggested_install
role: explorer
updated: 2026-07-26
tags: [handyman/role/explorer]
---

# Exploration: find_skills_suggested_install

Pregunta: ¿es viable que handyman sugiera la descarga de skills compañeras usando la skill `find-skills` y el comando real `npx skills add https://github.com/vercel-labs/skills --skill find-skills`? Respuesta corta: sí, el flujo funciona de forma no interactiva, instala a nivel proyecto por defecto y el verificador de handyman detecta el resultado.

## Qué es find-skills y la CLI skills

**La CLI `skills` (vercel-labs/skills).** Es el package manager del ecosistema abierto de "agent skills": paquetes con un `SKILL.md` (frontmatter YAML con `name` y `description`) que extienden las capacidades de un agente. La CLI instala esas skills en los directorios convencionales de más de 75 agentes (Claude Code, Codex, Cursor, Kimi Code CLI, etc.). Comandos clave: `add`, `find`, `use` (usa una skill sin instalarla), `ls`, `remove`, `update`, `init`. Acepta fuentes en formato corto (`owner/repo`), URL completa de GitHub/GitLab, cualquier URL git y rutas locales. Alcance por defecto: **proyecto** (`./<agent>/skills/`); con `-g` instala a nivel usuario (`~/<agent>/skills/`). Por defecto crea una copia canónica y symlinks por agente (`--copy` fuerza copias). Recolecta telemetría anónima desactivable con `DISABLE_TELEMETRY` / `DO_NOT_TRACK` (apagada en CI). Fuente: README oficial en https://github.com/vercel-labs/skills.

**skills.sh** es el directorio/registro del ecosistema: un leaderboard que rankea skills por número de instalaciones y sirve de punto de partida para descubrir skills populares (la extracción automatizada de la portada devuelve poco texto porque es una app dinámica, pero confirma el ranking por installs).

**find-skills** es una skill del repo `vercel-labs/skills` que enseña al agente a descubrir e instalar otras skills: cuándo activarse ("how do I do X", "find a skill for X"), consultar primero el leaderboard de skills.sh, buscar con `npx skills find [query] [--owner <owner>]`, verificar calidad antes de recomendar (installs 1K+, reputación de la fuente, stars del repo), presentar opciones al usuario y ofrecer instalar con `npx skills add <owner/repo@skill> -g -y`. Ya estaba instalada a nivel usuario en `~/.agents/skills/find-skills/SKILL.md` antes de esta prueba. Referencias: https://skills.sh/vercel-labs/skills/find-skills y el `SKILL.md` local.

## Resultado real del comando

Inspección previa de la CLI:

- `npx -y skills --help` → muestra los flags no interactivos: `-y/--yes` (salta confirmaciones), `-g/--global` (scope usuario; sin él es proyecto), `-a/--agent <agents>` (limitar agentes), `-s/--skill <skills>`, `--copy`, `--all` (atajo a `--skill '*' --agent '*' -y`).
- `npx -y skills ls` → confirma que en este repo los agentes detectados (Codex, Gemini CLI, GitHub Copilot, Kimi Code CLI, OpenCode) comparten el directorio universal `.agents/skills/`.

Comando final ejecutado desde el repo root:

```
npx -y skills add https://github.com/vercel-labs/skills --skill find-skills -y
```

- **Exit code: 0.** Totalmente no interactivo con `-y`; no pidió ninguna confirmación (el propio banner de la CLI recomienda `-y` y `-g` para instalar sin prompts).
- **Archivos creados/modificados (todo dentro del repo):**
  - `.agents/skills/find-skills/SKILL.md` — copia canónica de la skill (5.472 bytes). Está ignorada por git (`.gitignore` línea 32: `.agents/skills/*`).
  - `.claude/skills/find-skills` — symlink a `../../.agents/skills/find-skills`. Crea el directorio `.claude/`, que **no está gitignored** y aparece como `?? .claude/` en `git status`.
  - `skills-lock.json` — lockfile nuevo en la raíz con `source: vercel-labs/skills`, `skillPath` y `computedHash` SHA-256 de la skill. Ignorado por git (`.gitignore` línea 41).
  - **Nada fuera del repo fue tocado**: `~/.claude/skills/find-skills` ya existía de una instalación global previa (fecha 18 jul, sin modificar).
- **Salida relevante citada:**
  - `Found 1 skill` / `Selected 1 skill: find-skills`
  - `75 agents` detectados; `Installing to: Claude Code, OpenClaw, Codex, Gemini CLI, GitHub Copilot, Kimi Code CLI, OpenCode`
  - `Security Risk Assessments — find-skills: Gen Safe | Socket 0 alerts | Snyk Med Risk` (detalle en https://skills.sh/vercel-labs/skills)
  - `Done! Review skills before use; they run with full agent permissions.`
- **Verificador de handyman:** `node handyman/dist/tools_discovery.js check --root .` falla (`--root` no es un flag válido de `tools_discovery.py`); la forma correcta es `node handyman/dist/tools_discovery.js check`. Tras la instalación, su salida incluye `NOTE: installed but not declared: find-skills` — o sea, el check detecta la skill a nivel proyecto y la marca como instalada-no-declarada, junto a las demás skills de `.agents/skills/`.
- **Drift de versiones:** la copia de proyecto difiere mínimamente de la ya instalada a nivel usuario (a la de proyecto le falta la línea `- npx skills check - Check for skill updates`); mismo nombre y propósito, distinta revisión.

## Evaluación: descarga sugerida en handyman

Flujo propuesto ("handyman sugiere instalar find-skills"):

1. El líder detecta una necesidad no cubierta por las skills declaradas en `harness.config.json` → `discovery.skills`.
2. Con find-skills presente (usuario o proyecto), el agente busca con `npx skills find <query>` o recomienda directamente el comando `npx skills add <repo> --skill <name> -y`.
3. La skill aterriza en `.agents/skills/` (proyecto) o `~/.agents/skills/` (si se pasa `-g`).
4. `node handyman/dist/tools_discovery.js check` la reporta como `NOTE: installed but not declared`.
5. El líder decide si declararla en `discovery.skills` para convertirla en dependencia verificada.

Pros:

- Flujo real probado de punta a punta: no interactivo con `-y`, exit 0, scope proyecto por defecto (no ensucia el HOME del usuario).
- Lockfile (`skills-lock.json`) con hash de contenido: instalaciones reproducibles y auditables; existe `experimental_install` para restaurar desde el lockfile.
- Evaluación de seguridad integrada en la propia CLI (Gen, Socket, Snyk) antes/después de instalar.
- Compatible de forma nativa con Kimi Code CLI vía el directorio universal `.agents/skills/`.
- El verificador de handyman ya observa el resultado sin cambios de código: el NOTE installed-not-declared es la señal natural para proponer la declaración.

Contras y riesgos:

- **`.claude/` queda sin ignorar**: la CLI crea symlinks para Claude Code dentro del repo y ensucia `git status`. Si se adopta el flujo, conviene añadir `.claude/` a `.gitignore`.
- Instala para **todos los agentes detectados** (aquí 7) salvo que se pase `-a`; en esta máquina convergen en `.agents/skills/` + el symlink `.claude/`, pero en otras podría crear más directorios (`.cursor/`, `.windsurf/`, etc.).
- La skills se ejecutan **con permisos completos del agente** (lo advierte la propia CLI); Snyk marcó `Med Risk` para find-skills. Es contenido estático sin scripts, pero la recomendación debe incluir revisión humana del `SKILL.md`.
- **Duplicación usuario/proyecto**: si la skill ya existe a nivel global, instalarla en el proyecto crea dos copias que pueden divergir (observado: difieren en una línea).
- Telemetría anónima activa por defecto (desactivable con `DISABLE_TELEMETRY=1`).
- Requiere Node + red en el momento de la sugerencia; `npx` descarga la CLI en cada entorno nuevo.
- El paso 6 de find-skills sugiere `-g` (global), mientras que para handyman es más coherente el scope proyecto: la convención de handyman debería fijar el comando sin `-g`.

## Recomendación sobre declarar find-skills en discovery.skills

**Sí, condicionado.** Justificación: find-skills ya está instalada a nivel usuario y, tras esta prueba, también a nivel proyecto; el verificador la señala como `NOTE: installed but not declared`, es decir, el harness ya la "ve" pero no la exige. Declararla en `discovery.skills` la convierte en dependencia verificada del harness y habilita oficialmente el flujo de descarga sugerida, que es justamente su propósito. Condiciones para declararla:

1. Documentar la convención de instalación sugerida: `npx skills add <repo> --skill <name> -y` **sin `-g`** (scope proyecto), para no escribir en el HOME del usuario.
2. Añadir `.claude/` a `.gitignore` del repo si se va a usar la CLI `skills` aquí (hoy deja `?? .claude/` sin trackear).
3. Aceptar explícitamente el riesgo `Med Risk` reportado por Snyk (skill de contenido estático, sin código ejecutable propio) y recordar que toda skill instalada corre con permisos del agente.
4. Tolerar la duplicación usuario/proyecto o elegir un solo scope como canónico.

Si no se quieren asumir esas condiciones, la alternativa razonable es **no declararla** y tratarla como skill opcional del usuario, a costa de convivir con el NOTE permanente en el check.

## Fuentes

- https://github.com/vercel-labs/skills — README oficial de la CLI: comandos (`add`, `find`, `use`, `ls`, `remove`, `update`, `init`), formatos de fuente, flags (`-y`, `-g`, `-a`, `-s`, `--copy`, `--all`), scopes proyecto/global, tabla de agentes soportados (confirma que Kimi Code CLI usa `.agents/skills/`), telemetría y variables `DISABLE_TELEMETRY`/`DO_NOT_TRACK`.
- https://skills.sh/vercel-labs/skills/find-skills — página de la skill find-skills en el registro: descripción, cuándo activarla y su definición de la CLI.
- https://skills.sh/ — portada del directorio/leaderboard de skills rankeado por instalaciones (extracción limitada por ser app dinámica; confirma el modelo de ranking por installs).
- https://www.webreactiva.com/blog/skills-sh — artículo en español sobre qué es skills.sh y el uso habitual del CLI (`npx skills add owner/repo`, sin instalación global, por proyecto).
- Local: `~/.agents/skills/find-skills/SKILL.md` (copia de usuario) y `.agents/skills/find-skills/SKILL.md` (copia instalada en la prueba) — comportamiento detallado de la skill: leaderboard primero, verificación de calidad, oferta de instalación.

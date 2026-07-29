---
type: Implementation Log
feature: mastra_runtime_decoupling
status: implemented
role: implementer
updated: 2026-07-29
tags: [handyman/role/implementer, handyman/feature/mastra_runtime_decoupling]
---

# Implementation Report: mastra_runtime_decoupling

El agente Mastra (`agents/mastra-handyman`) ya bootea desde un cwd arbitrario
fuera del layout del monorepo, contra cualquier proyecto registrado en el
registry handyman. Se elimina el ancla `HANDYMAN_REPO_ROOT=<cwd>/../..`: los
recursos se resuelven desde el paquete `handyman-harness` instalado
(dependencia workspace nueva) y desde el `HANDYMAN_ROOT` machine-global, con
env vars primero en toda la cadena y `HANDYMAN_REPO_ROOT` reducido a override
dev sin default.

## What

- **Nuevo port `src/ports/harness-install.ts`** — toda la localización de la
  instalación handyman en un módulo: `handymanRoot(env)` (`HANDYMAN_ROOT` ??
  `~/HANDYMAN`, con `~` expandido, misma regla que toolbox-core),
  `handymanPackageDir()` (`createRequire(import.meta.url).resolve(
  'handyman-harness/package.json')` → dirname), `resolveHandymanAssetsDir`
  (env `HANDYMAN_ASSETS_DIR` > paquete instalado > fallback dev
  `<HANDYMAN_REPO_ROOT>/handyman` > error accionable), `readRegistryRoots` +
  `resolveProjectRoot` (path absoluto pasa directo; si no, match por basename
  en `$HANDYMAN_ROOT/registry.json` — 0 matches → error con la lista de
  registrados y la sugerencia `handyman toolbox register <root>`; >1 → error
  de ambigüedad con candidatos; mismas formas de error que `resolveProject`
  del MCP, `handyman/src/mcp.ts`), y `resolveToolboxCommand`
  (`HANDYMAN_TOOLBOX_CMD` como prefijo al que se anexa el root > bin
  `handyman` en PATH > `node <pkg>/dist/cli.js toolbox register` > fallback
  dev `node <HANDYMAN_REPO_ROOT>/handyman/dist/toolbox.js register`). El
  lector del registry es LOCAL (schema espejado de toolbox-core): no se mete
  dependencia a `@handyman/toolbox-core` por dos lecturas JSON.
- **`src/ports/config.ts` reescrito.** `AppConfig.repoRoot` pasa a
  `string | undefined` (sin default `<cwd>/../..`); campos nuevos
  `handymanAssetsDir` y `handymanRoot`. `projectRoot` =
  `resolveProjectRoot(HANDYMAN_PROJECT_ROOT)` ?? **cwd** (coherente con el
  MCP: proyecto omitido = cwd). `dataDir`/`telemetryDir` default
  `<HANDYMAN_ROOT>/agent/<harnessId>/{data,logs}` con `harnessId` derivado
  como antes (env > `harness.config.json project_name` > basename).
  `modelCatalogPath` default package-relative (`import.meta.url` del módulo
  → `<pkg>/model-catalog.json`). Header del módulo actualizado con la
  convención de vars nueva.
- **Consumidores migrados al resolvedor de assets:** `roleBody(role,
  handymanAssetsDir)` (lee `<assetsDir>/assets/role-<role>.template.md`) —
  callers en `roles.agent.ts` y `leader.agent.ts`; skill mirror
  (`handyman-skill.ts`) con `skills: [config.handymanAssetsDir]`;
  `run-evals.ts` cierra el feature rojo con `node <handymanAssetsDir>/
  dist/feature.js` (sin `cwd: repoRoot`).
- **Skill scopes (`src/ports/skills.ts`):** cadena nueva —
  `HANDYMAN_SKILL_DIRS` (`:`-separados, reemplaza TODA la cadena) >
  `<pkg>/skills` (package-relative vía `import.meta.url`) >
  `<projectRoot>/.agents/skills` > `<projectRoot>/.github/skills` >
  `~/.agents/skills`. `experimentalSkillDirs` lee el PRIMER scope (los drop-ins
  del leader). El scope deployment viejo (`<repoRoot>/.agents/mastra-handyman/
  skills`) se elimina: **verificado con `ls` que nunca existió en disco** en
  este monorepo (tampoco `.github/skills` a nivel repo; sí existen
  `agents/mastra-handyman/skills`, `.agents/skills` y `~/.agents/skills`) —
  ningún flujo dev lo usa, así que no hace falta env en los npm scripts.
  `skillRegistry(searchDirs)` ahora recibe la cadena ya resuelta; `app.ts`
  computa una sola vez `skillSearchDirs({ projectRoot: config.projectRoot })`
  y la comparte entre el registry del workflow y el `SkillSearchProcessor`
  del implementer — los scopes de proyecto ahora apuntan al PROYECTO
  CONDUCIDO (antes apuntaban al repoRoot, un bug latente cuando se conduce
  un scratch fuera del monorepo).
- **Auto-register (`src/ports/harness-identity.ts`):** usa
  `resolveToolboxCommand`; sigue best-effort (warn, nunca throw) y opt-out
  `HANDYMAN_HARNESS_REGISTER=off`; si ningún comando resuelve, warn claro y
  sigue el boot. Spawner inyectado (`opts.exec`) + `opts.packageDir` para
  tests.
- **Flujo dev intacto (punto 4):** los npm scripts del paquete pinnean
  `HANDYMAN_DATA_DIR=$PWD/data` y `HANDYMAN_TELEMETRY_DIR=$PWD/logs`
  (`run-feature`, `run-workflow`, `run-skill`, `studio`, `test:eval`) y
  `scripts/studio-local.sh` exporta ambos package-local — `data/` y `logs/`
  siguen donde el README promete para dev. El default nuevo
  (`<HANDYMAN_ROOT>/agent/<id>/…`) solo aplica fuera de esos scripts.
- **Dependencia workspace:** `"handyman-harness": "workspace:*"` en
  `agents/mastra-handyman/package.json`; `pnpm install` la enlaza
  (`node_modules/handyman-harness -> ../../../handyman`) y
  `require.resolve('handyman-harness/package.json')` resuelve al checkout.
- **Docs:** README del paquete con sección nueva "Boot desde cualquier cwd"
  (tabla de precedencias), scopes de skills actualizados, nota de Studio
  (gotcha de cwd ahora cubierto por los envs pineados), regla de `data/logs`
  con la ubicación nueva fuera de dev; header de `run-feature.ts`
  actualizado.

## Files Changed

- `agents/mastra-handyman/src/ports/harness-install.ts` — **nuevo**: root,
  package dir, assets dir, registry/proyecto por nombre, comando toolbox.
- `agents/mastra-handyman/src/ports/config.ts` — defaults desacoplados;
  `AppConfig` += `handymanAssetsDir`, `handymanRoot`; `repoRoot` opcional;
  header de vars.
- `agents/mastra-handyman/src/ports/skills.ts` — cadena de scopes nueva
  (package-relative + proyecto conducido + env override).
- `agents/mastra-handyman/src/ports/harness-identity.ts` — auto-register con
  `resolveToolboxCommand` (spawner y packageDir inyectables).
- `agents/mastra-handyman/src/agents/handyman/roles.agent.ts` — `roleBody`
  contra `handymanAssetsDir`.
- `agents/mastra-handyman/src/agents/handyman/leader.agent.ts` — roleBody +
  `experimentalSkillDirs()` sin repoRoot.
- `agents/mastra-handyman/src/agents/handyman-skill.ts` — skill canónica por
  `handymanAssetsDir`; import `join` muerto eliminado.
- `agents/mastra-handyman/src/app.ts` — una sola cadena de skill dirs contra
  el proyecto conducido.
- `agents/mastra-handyman/run-evals.ts` — cierre CLI vía
  `<handymanAssetsDir>/dist/feature.js`.
- `agents/mastra-handyman/run-feature.ts` — header env.
- `agents/mastra-handyman/package.json` — dep `handyman-harness:
  workspace:*`; envs data/logs pineados en scripts.
- `pnpm-lock.yaml` — entrada `handyman-harness: link:../../handyman` en el
  importer del agente (además sincroniza bumps de `@mastra/*` que ya estaban
  en el package.json sin commitear — el lockfile estaba stale, no es cambio
  de esta feature).
- `scripts/studio-local.sh` — exports `HANDYMAN_DATA_DIR`/`HANDYMAN_TELEMETRY_DIR`
  package-local (excepción permitida por el punto 4); comentario actualizado.
- `agents/mastra-handyman/README.md` — sección de boot desacoplado y vars.
- Tests: `src/ports/config.test.ts` (reescrito: resolución por nombre con
  registry fixture en tmp, ambigüedad, nombre inexistente, data/logs fuera de
  cwd, precedencia de assets, catalog package-relative), `src/ports/
  skills.test.ts` (cadena nueva + override env), `src/ports/
  harness-identity.test.ts` (precedencia del comando toolbox con spawner
  inyectado), `src/workflows/feature-cycle.test.ts` (fixture AppConfig).

## Decisions

- **`HANDYMAN_ASSETS_DIR` apunta al DIRECTORIO DEL PAQUETE** (el que contiene
  `assets/` y `SKILL.md`), no a `assets/` — coherente con los otros dos
  peldaños de la precedencia (require.resolve y fallback dev) y con las dos
  consumidoras (templates + skill mirror). Documentado en header y README.
- **`projectRoot` default = cwd** (no hay otro ancla sensata sin repoRoot; el
  MCP hace exactamente eso con `project` omitido).
- **Scope deployment eliminado sin reemplazo en scripts:** no existe en disco
  (verificado), así que no hay comportamiento dev que preservar; quien lo use
  fuera tiene `HANDYMAN_SKILL_DIRS`. `experimentalSkillDirs` pasa a leer el
  primer scope de la cadena (package por defecto) — alinea código con lo que
  el README ya documentaba (los drop-ins viven en `agents/mastra-handyman/
  skills`).
- **`null` = "paquete no instalado"** en los segundos parámetros de
  `resolveHandymanAssetsDir`/`resolveToolboxCommand` (undefined = autodetectar):
  hace la precedencia testeable sin mocks de módulos.
- **Sin `process.execPath`** en el comando toolbox package/dev: se mantiene
  `node` (como el código previo) — el bin `handyman` en PATH es el peldaño
  recomendado fuera del monorepo.
- **Desviación menor del brief:** el brief sugería cubrir el scope deployment
  vía env en npm scripts "si existe y se usa" — no existe (evidencia `ls`),
  así que no se pinea nada; se documenta en README que `HANDYMAN_SKILL_DIRS`
  es la vía para scopes extra.

## Test Output

```text
cd agents/mastra-handyman && pnpm test:unit
# Test Files  8 passed (8)  ·  Tests  77 passed (77)
pnpm exec tsc --noEmit   # exit 0
./init.sh                # verificador raíz — verde (lint/build/test)
```

## Boot evidence (cwd ajeno, MCP apagado)

**Sonda A — resolución de recursos** (`cd /tmp`, registry aislado en
`HANDYMAN_ROOT=/tmp/hm-root-boot-4mnc` con fixture mínimo
`/tmp/hm-bootlab-proj` = harness.config.json + `.handyman/feature_list.json`,
proyecto pasado POR NOMBRE, sin `HANDYMAN_REPO_ROOT`):

```text
$ cd /tmp && HANDYMAN_ROOT=/tmp/hm-root-boot-4mnc HANDYMAN_PROJECT_ROOT=hm-bootlab-proj \
    <pkg>/node_modules/.bin/tsx --eval "<loadConfig + roleBody + skillSearchDirs + resolveToolboxCommand>"
{
  "projectRoot": "/tmp/hm-bootlab-proj",            ← nombre → registry OK
  "harnessId": "bootlab",                           ← project_name OK
  "handymanAssetsDir": ".../handyman",              ← paquete workspace OK
  "handymanRoot": "/tmp/hm-root-boot-4mnc",
  "dataDir": "/tmp/hm-root-boot-4mnc/agent/bootlab/data",      ← NO bajo cwd
  "telemetryDir": "/tmp/hm-root-boot-4mnc/agent/bootlab/logs",
  "modelCatalogPath": ".../agents/mastra-handyman/model-catalog.json",
  "repoRoot": null
}
catalog exists: true
leader template chars: 862                          ← templates OK
skill scopes: [ '<pkg>/skills', '<proj>/.agents/skills',
  '<proj>/.github/skills', '~/.agents/skills' ]
toolbox command: {"file":"node","args":[".../handyman/dist/cli.js",
  "toolbox","register"],"source":"handyman-harness package"}
```

**Sonda B — boot real** (`cd /tmp`, proyecto `/tmp/hm-studio` resuelto POR
NOMBRE contra el registry real `~/HANDYMAN/registry.json`, auto-register
activo e idempotente — no escribió nada; MCP apagado en puerto 19999):

```text
$ cd /tmp && HANDYMAN_PROJECT_ROOT=hm-studio HANDYMAN_MCP_URL=http://127.0.0.1:19999/mcp \
    <pkg>/node_modules/.bin/tsx <pkg>/run-feature.ts boot_probe_decoupling
[LLM] [handyman] Failed to connect with SSE transport ... connect ECONNREFUSED 127.0.0.1:19999
MCPClient errored connecting to MCP server: { ... "code":"MCP_CLIENT_CONNECT_FAILED" ... }
Failed to list tools from server: { ... "code":"MCP_CLIENT_GET_TOOLS_FAILED" ... }
Error: MCP at http://127.0.0.1:19999/mcp exposed 0 tools
    at connectHandymanMcp (.../src/agents/handyman/leader.agent.ts:101:26)
    at async buildApp (.../src/app.ts:34:26)
    at async <anonymous> (.../run-feature.ts:27:47)
exit: 1
```

La resolución de recursos (registry por nombre, assets, catálogo, data/logs,
auto-register best-effort) pasó completa; el boot falla SOLO al conectar al
MCP, con el error claro de siempre (`ECONNREFUSED` + guarda
`MCP at <url> exposed 0 tools` que nombra el endpoint). Verificado además que
`~/HANDYMAN` no ganó directorios `agent/` (la memoria se crea después del
connect) y que el registry real quedó intacto.

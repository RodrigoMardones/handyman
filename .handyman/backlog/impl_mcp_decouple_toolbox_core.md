---
type: Implementation Log
feature: mcp_decouple_toolbox_core
status: implemented
role: implementer
updated: 2026-07-21
tags: [handyman/role/implementer, handyman/feature/mcp_decouple_toolbox_core]
---

# F76 — MCP: mover resolveWorkspace/resolveDocsDir a toolbox-core, declarar frontera

Paso 4 del plan de `docs/analisis-mcp-extension.md` (§4.4, descentralización
suave). El MCP ya estaba ~95% desacoplado de la skill (cero imports de
`SKILL.md`/`assets/`); el último pegamento era `./core/index.js`. Esta feature
completa el desacoplamiento por imports y declara la frontera.

## Qué encontré (y qué ya estaba hecho)

**Hallazgo clave:** la feature 42 ya movió `resolveWorkspace` y `resolveDocsDir`
a `packages/toolbox-core/src/workspace.ts`. `handyman/src/core/workspace.ts` es
un **shim** que re-exporta de `@handyman/toolbox-core/workspace`:

```ts
export { PLATFORM_ROLE_DIRS, resolveDocsDir, resolveWorkspace, VALID_STATUS }
  from "@handyman/toolbox-core/workspace";
```

Y `handyman/src/core/index.ts` re-exporta del shim. El único punto donde el MCP
tocaba `./core/` era el import en `mcp.ts:38`. Cambiarlo a
`@handyman/toolbox-core/workspace` completa la aceptancia #2 sin tocar
toolbox-core, core/index, ni apps/web.

## Qué cambió

`handyman/src/mcp.ts`:

- **Import cambiado:**
  ```diff
  -import { resolveDocsDir, resolveWorkspace } from "./core/index.js";
  +import { resolveDocsDir, resolveWorkspace } from "@handyman/toolbox-core/workspace";
  ```
  Es el único cambio de código. El MCP ahora declara su dependencia del core
  compartido directamente, sin pasar por el barrel `./core/` que es interno del
  paquete skill.

`.handyman/memory/architecture.md` (aceptancia #4):

- **Nueva sección "Frontera del MCP"** antes de "## What Not To Do". Declara:
  1. Imports del MCP: `toolbox-core/registry`, `toolbox-core/workspace`, SDK
     MCP, `zod`. **Cero imports de la skill.**
  2. Contrato "shellear el CLI": cada tool envuelve un CLI hermano via
     subprocess; el paquete MCP **nunca** importa `cmdStart`/`cmdLog` como
     módulo; depende de `handyman-harness` como dep npm y sigue shellear
     `dist/feature.js`. Preserva "verifier-gated close refused by the
     subprocess, not by convention".
  3. Descentralización postergada (Camino B): mover `mcp.ts` a su propio paquete
     es correcto pero prematuro. La migración ya es barata porque el acoplamiento
     restante es solo por ubicación.

## Verificación de aceptancias

1. **`resolveWorkspace` y `resolveDocsDir` viven en toolbox-core y se exportan
   desde `@handyman/toolbox-core`** — ✓ ya estaba hecho (feature 42). Verificado
   con `node -e "import('./packages/toolbox-core/dist/workspace.js')"`: las 4
   exports (`resolveWorkspace`, `resolveDocsDir`, `PLATFORM_ROLE_DIRS`,
   `VALID_STATUS`) están presentes.
2. **mcp.ts importa de `@handyman/toolbox-core/workspace`, no de
   `./core/index.js`** — ✓ cambio aplicado y verificado con `grep`.
3. **apps/web y otras superficies siguen funcionando (sin cambio de
   contrato)** — ✓ apps/web no se tocó. Importa `resolveWorkspace` desde el
   barrel `@handyman/toolbox-core` (que a su vez exporta de `./workspace.js`),
   ruta que no cambié. `npx tsc --noEmit` en apps/web da exit 0 (los 2 errores
   son de tipos stale generados por `.next/dev/`, preexistentes, no relacionados
   con imports de toolbox-core). `test_mcp.js` 12/12 PASS.
4. **docs/architecture.md declara que el MCP es consumidor de toolbox-core, no
   de la skill** — ✓ nueva sección "Frontera del MCP" añadida.

## Paridad

- `tsc --noEmit` limpio en `handyman/`.
- `npm run build` (tsc -b) en handyman y toolbox-core sin errores.
- `test_mcp.js` 12/12 PASS.
- `./init.sh` exit 0.

## Archivos modificados

- `handyman/src/mcp.ts` (1 línea de import).
- `.handyman/memory/architecture.md` (+~25 líneas: nueva sección).

## Nota para F77

F77 (P3: `sprint_status`, `upgrade_check`) puede usar `registerCliTool` con
`script: "sprint.js"` y `script: "upgrade_harness.js"` respectivamente, sin
tocar imports. La frontera declarada aquí aplica también a esas tools.

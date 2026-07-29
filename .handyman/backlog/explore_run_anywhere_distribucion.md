---
type: Explore Report
topic: run_anywhere_distribucion
role: explorer
updated: 2026-07-29
tags: [handyman/role/explorer]
---

# Exploration: empaquetar el formato de trabajo para correr desde cualquier parte y revisar proyectos registrados

Pregunta: ¿cómo empaquetar el formato de trabajo handyman para que personas con proyectos registrados en el formato de cache de handyman puedan correrlo desde cualquier parte y revisar esos proyectos?

Respuesta corta: **el 80% ya existe y está publicado**. El paquete npm `handyman-harness@3.7.5` (bin `handyman`, 13 verbos, servidor MCP de 25 tools) ya corre desde cualquier cwd y cualquier máquina sin checkout (`npx -y handyman-harness@3 mcp`), y el modelo multi-proyecto ya existe vía el registry `$HANDYMAN_ROOT/registry.json` + el arg `project` por tool + las fleet tools. Lo que **no** está empaquetado es el runtime de agente Mastra (`agents/mastra-handyman`, `private: true`, acoplado al monorepo), y hay gaps menores en el paquete publicado (no puede bootstrapear un harness nuevo, `evals` roto, mensajes con rutas stale del monorepo, ambigüedad de nombres por basename).

## Qué es hoy un "proyecto registrado" (el formato de cache)

- **Registry global**: `$HANDYMAN_ROOT/registry.json` (default `~/HANDYMAN/registry.json`), implementado en `packages/toolbox-core/src/registry.ts`. Schema mínimo: `{ version: 1, harnesses: [{ project_root, registered }] }` — solo rutas absolutas + fecha; todo lo demás se lee en vivo del disco de cada harness ("no mirrored state to drift").
- **Registrable** = root cuyo workspace resuelto contiene `feature_list.json` (`registry.ts:92-94`). Se registra con `handyman toolbox register <path>` o `discover --scan DIR [--register]`; el agente Mastra auto-registra al boot (`harness-identity.ts`, best-effort, opt-out `HANDYMAN_HARNESS_REGISTER=off`).
- **El workspace (`.handyman/` o `$HOME/HANDYMAN/<project>/`) es portable**: `harness.config.json` y `feature_list.json.config` usan rutas relativas. Lo no portable: `registry.json` (machine-local por diseño, rutas absolutas), `graphify-out/` (cache con rutas absolutas, fuera del workspace), y un `harness_workspace` absoluto si alguien lo configurara así.
- En esta máquina: `~/HANDYMAN/registry.json` existe con 5 entradas (handyman, phily-app, cmcet-back, /tmp/hm-studio, /tmp/hm-mastra-studio) + `index.md` (MOC global).

## Matriz: cómo selecciona proyecto cada superficie

| Superficie | Selector | Default desde cwd arbitrario |
|---|---|---|
| CLIs (`feature`, `sprint`, `metrics`, `preflight`…) | `--root PATH` | cwd — hay que pasar `--root` |
| `toolbox` (register/list/status/health/timeline/moc) | `--handyman-root` | `$HANDYMAN_ROOT` > `~/HANDYMAN`; **cwd irrelevante** |
| MCP server | arg `project` por tool (nombre registrado \| ruta absoluta) | cwd del proceso servidor |
| Agente Mastra | env `HANDYMAN_PROJECT_ROOT` (un proyecto por proceso) | `HANDYMAN_REPO_ROOT` = `<cwd>/../..` (acople al monorepo) |

Un solo MCP server instalado sirve N proyectos: `runCli` inyecta `--root <project.root>` y localiza los `dist/*.js` relativos al propio paquete (`mcp.ts:92,177-183`). Las fleet tools (`harness_list`, `fleet_status/health/timeline`) leen exclusivamente el registry. Los resources `handyman://{project}/current|resume|docs/{doc}` ya permiten "revisar" cualquier proyecto registrado desde un cliente MCP.

## Estado del empaquetado por capa

1. **Toolchain (CLI + MCP)** — `handyman-harness@3.7.5` publicado. Pack: `handyman/scripts/pack_npm.mjs` (esbuild bundle ESM autocontenido, 21 entry points, guardas anti-`.env`/`workspace:*`, handshake de versión skill↔paquete, `npm pack` offline — publicar es acción humana). Instalación consumidor: `npm i -g handyman-harness` o `npx -y handyman-harness@3 <verbo>`; MCP: `claude mcp add handyman -- npx -y handyman-harness@3 mcp`.
2. **Skill (metodología)** — `npx skills add RodrigoMardones/handyman` (scope proyecto o `-g` usuario). Versión compartida con el paquete, enforced at pack time.
3. **Agente Mastra (runtime)** — **sin empaquetar**. `private: true`, corre in-process vía `tsx` desde el monorepo. Acoples: `HANDYMAN_REPO_ROOT` default `<cwd>/../..`, model catalog en `<repoRoot>/agents/mastra-handyman/model-catalog.json`, auto-register invocando `handyman/dist/toolbox.js` (ruta del monorepo), role templates y skills leídos del repo. Un proyecto por proceso; asume MCP ya levantado (`http://127.0.0.1:8177/mcp`).

## Gaps detectados (con evidencia)

1. **El paquete npm no puede bootstrapear un harness nuevo**: no hay verbo `scaffold`/`init` ni tool MCP de bootstrap; `scripts/scaffold.sh` no viaja en el tarball (aunque `assets/` sí). Crear un harness exige la skill o copiar templates a mano.
2. **`evals` roto en el tarball publicado** (verificado ejecutándolo): `evals.js validate` busca `../evals/trigger-eval.json` y `evals/` no está en `files`.
3. **Mensajes stale con rutas del monorepo**: `mcp.ts:129` sugiere `node handyman/dist/toolbox.js register`; `scaffold.sh:177` idem; `upgrade_harness.ts:339` imprime `scripts/upgrade_harness.py` (Python retirado; `PROG` sigue `upgrade_harness.py`).
4. **Ambigüedad de nombres por basename**: `resolveProject` (`mcp.ts:121`) hace `find(h => h.name === project)`; dos roots con igual basename son ambiguos y gana el primero. El registry no impone unicidad de nombre.
5. **Pinning de proyecto a nivel MCP — deuda ya registrada y prioritaria** (ADR Mastra §Deuda conocida): hoy la mitigación de deriva de proyecto es solo prompt; 2 incidentes observados.
6. **MCP HTTP sin auth, loopback-only** (`mcp.ts:1814+`): "desde cualquier parte" entre máquinas requiere proxy frontal inexistente.
7. **`tests/lab_skill_install.sh` desactualizado como oráculo**: mide el flujo viejo (npm install + tsc sobre la skill) y reporta FAIL en pasos 2-4; el flujo npx actual nunca se reflejó ahí.
8. **Registry sin pruning**: proyectos movidos quedan stale (`harness: false` en `harness_list`); solo `unregister` manual.

## Opciones de empaquetado

### Opción A — Documentar y pulir el camino existente (recomendada como primer paso)

El objetivo del usuario ya se cumple hoy con el toolchain publicado. Trabajo: guía de consumidor ("instala una vez, opera N proyectos"), arreglar los gaps 2-4 y 7 (evals en `files`, mensajes stale, unicidad de nombre o warning, lab test), y quizá un verbo de conveniencia tipo `handyman hub`/`overview` que imprima el estado de la flota. Esfuerzo bajo, sin arquitectura nueva. UX resultante:

```bash
npm i -g handyman-harness            # o npx -y handyman-harness@3 ...
handyman toolbox register ~/proyectos/mi-repo
handyman toolbox status              # revisa TODOS los registrados, desde cualquier cwd
handyman mcp --http                  # un server para toda la flota
```

### Opción B — Paquete autosuficiente para bootstrap

Añadir verbo `scaffold`/`init` al CLI (los `assets/` ya viajan en el tarball) para que `npm i -g handyman-harness` baste para crear + registrar + operar un harness sin instalar la skill. Esfuerzo medio. Cierra el ciclo "persona nueva → proyecto registrado → revisión" solo con npm.

### Opción C — Empaquetar el runtime Mastra como app distribuible

Terreno nuevo (ningún doc lo decide ni lo planea). Requiere: desacoplar del monorepo (embeber role templates/model catalog/skills o resolverlos desde el paquete instalado), selección de proyecto por nombre del registry (no solo `HANDYMAN_PROJECT_ROOT`), endpoint MCP configurable, bundle esbuild como el toolchain, y respetar el pinning de proyecto (gap 5) para que un agente no contamine otro harness. Esfuerzo alto. Mantener `private` hasta estabilizar; alinear con el "Camino B" postergado (`packages/handyman-mcp/`) si algún día se activa.

**Remoto multi-máquina** (ortogonal a las tres): MCP HTTP es loopback-only sin auth; servir la flota fuera de localhost exige proxy con auth — futuro, no bloqueante.

## Restricciones a respetar (decisiones firmes en docs)

- Publicar a npm es acción humana; el pack nunca habla con el registry más allá de `npm pack` (`pack_npm.mjs:7-9`).
- Handshake de versión skill↔paquete enforced at pack time.
- MCP como anti-corruption layer: "el modelo propone, el CLI dispone"; contrato shellear-el-CLI sagrado (nunca importar `cmd*` como módulos).
- Verdad única en disco del proyecto target; nada de negocio entra al storage de Mastra.
- "Requerir un runtime de JS para correr el verificador en repos destino" está en What Not To Do (`memory/architecture.md`).

## Recomendación

Ahora → **Opción A** (el valor ya está construido; hay que pulirlo y contarlo). Después → **Opción B** si se quiere onboarding solo-npm. **Opción C** solo si el agente Mastra debe ser la superficie de revisión remota — es un feature propio, no un packaging.

## Fuentes

- Pipeline y tarball: `handyman/scripts/pack_npm.mjs`, `handyman/.pack-staging/`, `handyman/README.npm.md`, `tests/test_npm_pack.sh`, npm registry (3.7.5 latest, 53 archivos).
- Registry y multi-proyecto: `packages/toolbox-core/src/registry.ts`, `handyman/src/mcp.ts` (resolveProject/runCli/fleet/resources), `handyman/src/toolbox.ts`, `agents/mastra-handyman/src/ports/{harness-identity,config,workspace}.ts`.
- Decisiones: `docs/adr-mastra-adopcion.md`, `docs/analisis-mcp-extension.md` (parcialmente superado), `handyman/references/mcp.md`, `.handyman/memory/architecture.md`, `agents/mastra-handyman/README.md`.

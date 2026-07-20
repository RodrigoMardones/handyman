# 🧰 Handyman toolBox: panel web

Panel [Next.js](https://nextjs.org) para observar harnesses Handyman registrados: features, progreso, backlog, busqueda y relays LLM opcionales. Es la vista central del workspace (`@handyman/web`) y corre por defecto en `http://localhost:3210`.

El panel es autocontenido: embebe el observer de toolBox en el mismo proceso Node (importa `@handyman/toolbox-core` directamente), asi que no necesita ningun servidor aparte.

## Requisitos

- **Node >= 22.13** (pnpm 11 usa el builtin `node:sqlite`; el toolchain en si soporta >= 20).
- **pnpm** (el monorepo usa pnpm workspaces).

## Arranque en 4 pasos

Desde el root del repositorio:

```bash
# 1. Dependencias del workspace
pnpm install

# 2. Compilar el toolchain (arrastra @handyman/toolbox-core via project references)
pnpm --filter handyman build

# 3. Registrar al menos un harness en el registry
#    (escribe $HANDYMAN_ROOT/registry.json; default: ~/HANDYMAN)
node handyman/dist/toolbox.js register /ruta/a/un/repo-con-harness
#    este mismo repositorio sirve como primer harness:
node handyman/dist/toolbox.js register .

# 4. Levantar el panel
pnpm --filter @handyman/web dev
```

Abre `http://localhost:3210`. El puerto se cambia con `PORT`, y el root del registry con `HANDYMAN_ROOT` (util para probar con un registry aislado).

El registry ademas actua como allowlist de lectura: el panel solo resuelve archivos dentro de los project roots registrados y sus workspaces.

## Keys LLM (opcional)

Sin keys el panel funciona completo; solo los relays LLM (draft, triage, summaries) quedan no disponibles. Los providers se activan por variables de entorno:

| Provider | Variables | Default |
|----------|-----------|---------|
| Claude | `ANTHROPIC_API_KEY`, opcional `ANTHROPIC_MODEL` | `claude-opus-4-8` |
| Z.AI | `Z_AI_API_KEY`, opcionales `Z_AI_MODEL` y `Z_AI_API_MODE=paas` | `glm-5.2` |
| Ollama | sin key; opcionales `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | `llama3.2` en `127.0.0.1:11434` |

Las variables se exportan en el shell o se dejan en un `.env` en el directorio de arranque (`TOOLBOX_ENV_DIR` lo redefine cuando el cwd del server no es el root). Nunca commitees un `.env` con keys reales.

## Produccion

```bash
pnpm --filter @handyman/web build
pnpm --filter @handyman/web start
```

## Mapa del workspace

| Unidad | Que es |
|--------|--------|
| [`handyman/`](../../handyman) | Toolchain CLI + skill (feature state, backlog, preflight, toolbox) |
| [`packages/toolbox-core/`](../../packages/toolbox-core) | Capa de datos HTTP-agnostica y relays LLM compartidos |
| `apps/web/` | Este panel |

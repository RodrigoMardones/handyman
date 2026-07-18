# Verification

El agente no afirma que funciona; lo demuestra. Evidencia obligatoria antes de `done`.

## Required Commands

```bash
# Verificador del harness + proyecto (compuerta de cierre; debe salir 0).
# Orquesta: validate -> lint -> build -> test.
./init.sh

# Suite de tests del proyecto (la invoca init.sh). Black-box sobre node dist/.
bash tests/run_tests.sh
```

La toolchain y la suite son **single-track Node**: los CLIs son TypeScript
compilados a `handyman/dist/` (gitignored) y los tests de contrato
(`tests/test_docs.js`) corren bajo node con `ajv` desde `handyman/node_modules`.
Antes de la suite hay que instalar dependencias y compilar (desde `handyman/`):

```bash
cd handyman
npm ci            # instalar dependencias
npm run build     # tsc -> dist/  (requerido: la suite invoca node dist/<x>.js)
```

Calidad de la fuente TS (desde `handyman/`):

```bash
cd handyman
npm run typecheck   # tsc --noEmit
npm run lint        # biome check .
npm run test        # vitest run   (tests unitarios del core TS)
```

Lint de shell (parte de CI; mantener verde el bash que queda). El alcance exacto
difiere por capa: CI lintea `scripts tests`, mientras `init.sh` lintea
`handyman/scripts tests`; `assets/*.template.sh` se excluye a proposito (placeholders
que se rellenan al hacer scaffold).

```bash
find handyman/scripts tests -name '*.sh' -print0 | xargs -0 shellcheck -S warning
```

## CI

`.github/workflows/ci.yml` es single-track Node: `actions/setup-node` 20,
`npm ci`, `npm run build` (todo en `handyman/`), luego `bash tests/run_tests.sh`;
un job paralelo corre ShellCheck. No queda setup-python ni `pip install`.

## Test Levels

1. **Paridad / caracterizacion (black-box):** `tests/test_*.sh` ejercitan cada CLI
   (`node dist/<x>.js`) y fijan stdout/stderr/exit code. Es el nivel critico: garantiza
   que "las ordenes se mantienen" a traves de cualquier refactor.
2. **Unit (core TS):** comportamiento publico del core en `handyman/src/core/`
   (`npm run test` = vitest).
3. **Docs/estructura:** `tests/test_docs.js` valida estructura de la skill, links de
   markdown y JSON Schemas (ajv) con paridad con el anterior `test_docs.py`.
4. **Observer:** `tests/test_toolbox*.sh` cubren `toolbox serve`, `/api/state`,
   `/api/providers`, `/api/draft` (con provider fake) y el markup del panel.
5. **Smoke:** correr un flujo real de bootstrap sobre un repo temporal.

## toolBox observer

El observador se valida sin tocar la red: `tests/test_toolbox_serve.sh` aserta el
markup servido (paleta, live regions, theme control), `/api/state` con metricas,
`/api/providers` con `available()`, el relay `POST /api/draft` con un provider fake,
`POST /api/intake` (write a `feature-request.md`), y la cabecera CSP. No hay un test
que levante un puerto real contra un LLM.

## Anti-patterns

- Marcar `done` con tests en rojo o con el verificador != 0.
- Cambiar el contrato de un CLI y "adaptar" el test para que pase en vez de reproducir
  el contrato exacto (eso rompe la paridad, que es justamente lo que protegemos).
- Tests que solo aseguran "no lanza excepcion".
- Mockear el comportamiento de nucleo (resolucion de workspace, maquina de estados).
- Confiar en el draft del observador sin revision humana: `POST /api/draft` nunca
  escribe disco; solo `POST /api/intake` persiste el draft revisado, y la feature entra
  a `feature_list.json` via `node dist/feature.js add`, no por spawn desde el panel.

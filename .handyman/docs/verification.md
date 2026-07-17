# Verification

El agente no afirma que funciona; lo demuestra. Evidencia obligatoria antes de `done`.

## Required Commands

```bash
# Verificador del harness + proyecto (compuerta de cierre; debe salir 0)
./init.sh

# Suite de tests del proyecto (invocada por init.sh)
bash tests/run_tests.sh

# Lint de shell (parte de CI; mantener verde el bash que quede)
find scripts tests -name '*.sh' -print0 | xargs -0 shellcheck -S warning
```

Durante la migracion, cuando un script tenga par TS, correr **ambos** oraculos:
la suite black-box (paridad) y los tests unitarios TS del core.

```bash
# Objetivo TS (se cablea en la feature de toolchain)
bun test            # (o: bun run test)
bunx tsc --noEmit   # type-check
# biome check .     # (o eslint/prettier, segun decision de toolchain)
```

## Test Levels

1. **Paridad / caracterizacion (black-box):** `tests/test_*.sh` ejercitan cada CLI y
   fijan stdout/stderr/exit code. Es el nivel critico: garantiza que "las ordenes se
   mantienen" a traves del cambio de runtime.
2. **Unit (core TS):** comportamiento publico del `core` migrado (`bun test`/vitest).
3. **Docs/estructura:** `tests/test_docs.py` valida la estructura de la skill.
4. **Smoke:** correr un flujo real de bootstrap sobre un repo temporal.

## Anti-patterns

- Marcar `done` con tests en rojo o con el verificador != 0.
- Migrar un script a TS y "adaptar" el test para que pase en vez de reproducir el
  contrato exacto (eso rompe la paridad, que es justamente lo que protegemos).
- Tests que solo aseguran "no lanza excepcion".
- Mockear el comportamiento de nucleo (resolucion de workspace, maquina de estados).
- Eliminar la suite black-box de un script antes de que su par TS este verde.

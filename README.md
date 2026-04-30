# Foreman

Foreman es una skill para crear y operar un **harness de trabajo con agentes**: una estructura de archivos, roles y verificaciones que permite que uno o mas agentes trabajen sobre un proyecto de software de forma ordenada, auditable y retomable.

La idea central es simple: el chat coordina, pero el disco es la fuente de verdad. Foreman instala o analiza una capa operativa alrededor de un repositorio para que cada sesion tenga estado, backlog, criterios de cierre, reportes y verificacion ejecutable.

## Que Es Foreman

Foreman define un flujo de trabajo para agentes basado en tres roles:

- **Leader:** coordina el trabajo, resuelve el estado del harness, elige una feature y delega.
- **Implementer:** implementa una sola feature, agrega o ajusta tests y deja evidencia en disco.
- **Reviewer:** valida la implementacion contra arquitectura, convenciones, checkpoints y verificacion.

Este patron evita que el trabajo viva solamente en mensajes largos de chat. Los agentes escriben reportes bajo `progress/`, el backlog vive en `feature_list.json`, las reglas del proyecto viven en `docs/`, y el cierre de una feature depende de una verificacion real, normalmente `./init.sh`.

## Para Que Sirve

Foreman sirve para convertir un repositorio normal en un entorno donde los agentes pueden trabajar con disciplina operativa:

- Mantener una lista de features con estados claros: `pending`, `in_progress`, `done` y `blocked`.
- Ejecutar una sola feature a la vez para reducir mezcla de contexto y cambios accidentales.
- Guardar progreso, decisiones, bloqueos e historia en archivos versionables o en un workspace global.
- Separar responsabilidades entre coordinacion, implementacion y revision.
- Exigir tests y verificacion antes de marcar trabajo como terminado.
- Retomar sesiones interrumpidas sin depender de memoria conversacional.
- Evitar el "telefono descompuesto" entre agentes: los reportes largos se escriben en archivos y el chat solo devuelve referencias.

## Cuando Usarlo

Usa Foreman cuando quieras:

- Preparar un repositorio para trabajo asistido por agentes.
- Crear un flujo multiagente con leader, implementer y reviewer.
- Mantener trazabilidad de features, decisiones y revisiones.
- Ejecutar trabajo incremental con criterios de aceptacion claros.
- Migrar el estado operativo de un harness local a `$HOME/FOREMAN/<project_name>`.
- Revisar si un proyecto ya tiene una estructura de harness completa y coherente.

No es necesario para tareas pequenas o implementaciones puntuales donde no quieres usar el flujo formal de harness.

## Modos De Instalacion

Foreman soporta dos formas de organizar el harness.

| Modo | Donde vive el estado mutable | Cuando conviene |
|------|-------------------------------|-----------------|
| `local` | En el root del repositorio | Proyectos pequenos, ejemplos, repos donde quieres versionar todo el harness junto al codigo. |
| `global` | En `$HOME/FOREMAN/<project_name>` | Proyectos donde quieres mantener el repo limpio y guardar progreso, reportes y docs operativas fuera del codigo fuente. |

En modo global, el repositorio conserva archivos puente como `AGENTS.md`, `CHECKPOINTS.md`, `init.sh` y `harness.config.json`. El estado operativo vive en `HARNESS_WORKSPACE`.

## Archivos Principales

| Archivo o directorio | Proposito |
|----------------------|-----------|
| `AGENTS.md` | Mapa de navegacion para cualquier agente que entre al repo. |
| `harness.config.json` | Configuracion puente para resolver `PROJECT_ROOT` y `HARNESS_WORKSPACE` en modo global. |
| `feature_list.json` | Backlog, reglas y estado de cada feature. |
| `progress/current.md` | Estado vivo de la sesion actual. |
| `progress/history.md` | Historial append-only de sesiones cerradas. |
| `docs/architecture.md` | Limites y principios de arquitectura del proyecto. |
| `docs/conventions.md` | Convenciones de estilo, estructura, errores y tests. |
| `docs/verification.md` | Comandos y evidencia requerida para cerrar trabajo. |
| `CHECKPOINTS.md` | Checklist objetivo para revision y cierre. |
| `init.sh` | Verificador ejecutable del harness y del proyecto. |

## Casos De Uso

### Analizar Un Harness Existente

Foreman puede inspeccionar un proyecto que ya tenga `AGENTS.md`, `feature_list.json`, `progress/`, `docs/` e `init.sh`, y reportar su estado: modo de instalacion, feature activa, riesgos, archivos faltantes y pasos recomendados.

### Bootstrap Local

Crea la estructura del harness dentro del repositorio. Es util para ejemplos, proyectos nuevos o repos donde quieres que todo el flujo operativo quede versionado junto al codigo.

### Bootstrap Global

Crea un workspace bajo `$HOME/FOREMAN/<project_name>` para el estado mutable y deja archivos puente en el repo. Es util cuando quieres separar codigo fuente de historial operativo.

### Ejecutar Una Feature

Foreman selecciona una feature `pending`, la marca como `in_progress`, actualiza `progress/current.md`, coordina implementacion, exige tests, corre verificacion y solicita revision antes de cerrar.

### Revisar Trabajo Terminado

Foreman puede revisar una implementacion usando `CHECKPOINTS.md`, los docs del harness y los reportes en `progress/`. El resultado esperado es un veredicto claro: `APPROVED` o `CHANGES_REQUESTED`.

### Migrar De Local A Global

Foreman puede mover el estado operativo de un harness local a `$HOME/FOREMAN/<project_name>` y dejar el repo con archivos puente consistentes.

## Ejemplos De Uso

Invocaciones tipicas desde un chat con skills habilitadas:

```text
usa foreman para analizar este repo
```

```text
usa foreman para bootstrap local en este proyecto
```

```text
usa foreman para bootstrap global en /ruta/al/repositorio
```

```text
foreman run-feature: toma la primera feature pending, implementala con tests, revisala y cierra solo si ./init.sh pasa
```

```text
foreman review la feature cli_recent y deja el veredicto en progress/review_cli_recent.md
```

```text
foreman migrate-global este harness local
```

Ejemplo de flujo completo:

```text
1. foreman analyze
2. foreman bootstrap global
3. foreman run-feature
4. foreman review
5. foreman cierra la feature si el reviewer aprueba y el verificador queda verde
```

## CLI Experimental

Este repositorio incluye un primer MVP de CLI escrito en TypeScript para Bun. La CLI no reemplaza la skill: automatiza las operaciones repetibles del harness y mantiene los mismos archivos como fuente de verdad.

Ejecutar ayuda:

```bash
bun run foreman -- help
```

Consultar estado de un proyecto:

```bash
bun run foreman -- --project /ruta/al/proyecto status
```

Listar features:

```bash
bun run foreman -- --project /ruta/al/proyecto feature list
```

Iniciar una feature pendiente:

```bash
bun run foreman -- --project /ruta/al/proyecto feature start 1 --agent implementer
```

Bloquear una feature con motivo:

```bash
bun run foreman -- --project /ruta/al/proyecto feature block 1 --reason "falta credencial de API"
```

Cerrar una feature con review aprobada y verificador verde:

```bash
bun run foreman -- --project /ruta/al/proyecto feature close 1 --review progress/review_first_feature.md
```

Validar el harness:

```bash
bun run foreman -- --project /ruta/al/proyecto verify
```

Comandos disponibles en el MVP:

- `status`: resuelve `PROJECT_ROOT`, `HARNESS_WORKSPACE`, modo de instalacion y feature activa.
- `config`: imprime la configuracion resuelta en formato `key=value`.
- `verify`: valida archivos requeridos, estado de features y ejecuta `init.sh`.
- `feature list`: muestra backlog en tabla.
- `feature start`: cambia una feature `pending` a `in_progress` y actualiza `progress/current.md`.
- `feature block`: cambia una feature a `blocked` y registra el motivo.
- `feature close`: exige review `APPROVED` y verificacion verde antes de marcar `done`.
- `progress show`: muestra `progress/current.md`.

Ejecutar tests del CLI:

```bash
bun test
```

Preparar artefactos para npm:

```bash
bun run build
bun run smoke:node
bun run pack:dry
```

El desarrollo local sigue usando Bun y TypeScript directamente. Para publicacion futura en npm, el paquete apunta el binario `foreman` a `dist/bin/foreman.js`, que se ejecuta con Node.js 18 o superior.

## Reglas Operativas

- Trabajar una sola feature a la vez.
- Resolver `HARNESS_WORKSPACE` antes de leer o escribir estado.
- No marcar una feature como `done` sin tests, verificacion y revision.
- Guardar reportes de implementacion y revision bajo `progress/`.
- Mantener `progress/history.md` como historial append-only.
- Documentar bloqueos en `progress/current.md` antes de improvisar soluciones.
- Hacer que `./init.sh` falle cuando el estado del harness sea incoherente.

## Referencias Internas

- [Anatomia del harness](references/anatomy.md)
- [Workflow](references/workflow.md)
- [Templates](references/templates.md)
- [Checklists](references/checklists.md)

## Contacto

Para soporte, mejoras o reporte de problemas, usa el canal del repositorio donde publiques esta skill: issue, pull request o contacto directo con la persona mantenedora del proyecto.

Si esta skill vive en una instalacion local, el punto de contacto recomendado es quien administre la carpeta de skills y el workspace Foreman de tu entorno.

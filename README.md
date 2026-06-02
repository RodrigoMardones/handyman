# 🧰 Handyman

[![skills.sh](https://skills.sh/b/RodrigoMardones/handyman)](https://skills.sh/RodrigoMardones/handyman)

Handyman es una skill para crear y operar un **harness de trabajo con agentes**: una estructura de archivos, roles y verificaciones que permite que uno o mas agentes trabajen sobre un proyecto de software de forma ordenada, auditable y retomable.

La idea central es simple: el chat coordina, pero el disco es la fuente de verdad. Handyman instala o analiza una capa operativa alrededor de un repositorio para que cada sesion tenga estado, backlog, criterios de cierre, reportes y verificacion ejecutable.

> Handyman fue conocida previamente como **Foreman**. La nueva version mantiene el mismo flujo y agrega integracion nativa con [Obsidian](https://obsidian.md) sobre el mismo `HARNESS_WORKSPACE`.

## 🧭 Guia Rapida

| Si quieres... | Ve a... | Resultado esperado |
|---------------|---------|--------------------|
| Instalar la skill | [Instalacion Con Skills](#-instalacion-con-skills) | Agregar Handyman a tu entorno de skills. |
| Entender el flujo | [Que Es Handyman](#-que-es-handyman) | Roles, estado en disco y verificacion. |
| Instalar el harness | [Modos De Instalacion](#-modos-de-instalacion) | Elegir `local` o `global` sin mezclar estado. |
| Ubicar archivos | [Archivos Principales](#-archivos-principales) | Saber que editar y que revisar. |
| Usarlo con Obsidian | [Visualizar En Obsidian](#-visualizar-en-obsidian) | Abrir el vault sin commitear metadata local. |
| Asignar modelos | [Modelos Por Rol](#-modelos-por-rol) | Modelo fuerte para leader, baratos para implementer y reviewer. |
| Ejecutar una feature | [Ejemplos De Uso](#-ejemplos-de-uso) | Comandos tipicos para arrancar el flujo. |

> 💡 **Idea guia:** el chat coordina, pero `HARNESS_WORKSPACE` es la fuente de verdad.

## 🧩 Que Es Handyman

Handyman define un flujo de trabajo para agentes basado en tres roles:

- 🧭 **Leader:** coordina el trabajo, resuelve el estado del harness, elige una feature y delega. Usa un modelo de mayor capacidad de razonamiento.
- 🛠️ **Implementer:** implementa una sola feature, agrega o ajusta tests y deja evidencia en disco. Usa por defecto un modelo mas barato y rapido.
- ✅ **Reviewer:** valida la implementacion contra arquitectura, convenciones, checkpoints y verificacion. Usa por defecto un modelo mas barato y rapido.

Cada rol puede correr bajo su propio modelo: el leader usa un modelo fuerte, mientras que implementer y reviewer prefieren un modelo barato ya configurado en el editor y, si no hay, caen a `Claude Sonnet 4.6`. Mas detalles en [references/models.md](references/models.md).

Este patron evita que el trabajo viva solamente en mensajes largos de chat. Los agentes escriben reportes bajo `progress/`, el backlog vive en `feature_list.json`, las reglas del proyecto viven en `docs/`, y el cierre de una feature depende de una verificacion real, normalmente `./init.sh`.

## 🎯 Para Que Sirve

Handyman sirve para convertir un repositorio normal en un entorno donde los agentes pueden trabajar con disciplina operativa:

- 📋 Mantener una lista de features con estados claros: `pending`, `in_progress`, `done` y `blocked`.
- 🎯 Ejecutar una sola feature a la vez para reducir mezcla de contexto y cambios accidentales.
- 🗂️ Guardar progreso, decisiones, bloqueos e historia en archivos versionables o en un workspace global.
- 👥 Separar responsabilidades entre coordinacion, implementacion y revision.
- ✅ Exigir tests y verificacion antes de marcar trabajo como terminado.
- 🔁 Retomar sesiones interrumpidas sin depender de memoria conversacional.
- 📝 Evitar el "telefono descompuesto" entre agentes: los reportes largos se escriben en archivos y el chat solo devuelve referencias.
- 🪨 Visualizar el estado del harness como un vault de Obsidian con frontmatter, tags y wikilinks.

## ✅ Cuando Usarlo

Usa Handyman cuando quieras:

- 🚀 Preparar un repositorio para trabajo asistido por agentes.
- 👥 Crear un flujo multiagente con leader, implementer y reviewer.
- 🧾 Mantener trazabilidad de features, decisiones y revisiones.
- 🧪 Ejecutar trabajo incremental con criterios de aceptacion claros.
- 🌐 Migrar el estado operativo de un harness local a `$HOME/HANDYMAN/<project_name>`.
- 🔎 Revisar si un proyecto ya tiene una estructura de harness completa y coherente.
- 🪨 Navegar el progreso desde Obsidian con backlinks, tags y un MOC central.

No es necesario para tareas pequenas o implementaciones puntuales donde no quieres usar el flujo formal de harness.

## 📦 Instalacion Con Skills

Instala Handyman directamente desde este repositorio con el cliente de skills:

```bash
npx skills add "RodrigoMardones/handyman"
```


## 🏗️ Modos De Instalacion

Handyman soporta dos formas de organizar el harness.

| Modo | Donde vive el estado mutable | Cuando conviene |
|------|-------------------------------|-----------------|
| `local` | En un directorio oculto `.handyman/` dentro del repositorio | Proyectos donde quieres versionar el harness junto al codigo pero manteniendo el root limpio y enfocado en el codigo fuente. |
| `global` | En `$HOME/HANDYMAN/<project_name>` | Proyectos donde quieres mantener el repo limpio y guardar progreso, reportes y docs operativas fuera del codigo fuente. |

En modo local, el estado mutable y las docs operativas (`feature_list.json`, `progress/`, `docs/`, `index.md`) viven bajo `.handyman/`, y el repo conserva en el root los archivos puente `AGENTS.md`, `CHECKPOINTS.md` e `init.sh`. En modo global, el repositorio conserva archivos puente como `AGENTS.md`, `CHECKPOINTS.md`, `init.sh` y `harness.config.json`, y el estado operativo vive en `HARNESS_WORKSPACE`.

> ⚠️ **Guia de decision:** usa `local` si quieres versionar el harness junto al repo sin ensuciar el root; usa `global` si quieres separar codigo fuente de historial operativo.

## 🗂️ Archivos Principales

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
| `index.md` | MOC opcional para navegar el workspace desde Obsidian. |

> 🧭 **Ruta mental:** `AGENTS.md` orienta, `feature_list.json` decide, `progress/` registra y `init.sh` verifica.

> 📁 **En modo local:** `AGENTS.md`, `CHECKPOINTS.md` e `init.sh` quedan en el root del repo; `feature_list.json`, `progress/`, `docs/` e `index.md` viven bajo `.handyman/`.

## 🪨 Visualizar En Obsidian

El `HARNESS_WORKSPACE` esta disenado para abrirse directamente como vault de Obsidian, sin duplicar archivos.

1. Abre Obsidian y elige **Open folder as vault** apuntando al `HARNESS_WORKSPACE` (`PROJECT_ROOT/.handyman` en modo local o `$HOME/HANDYMAN/<project_name>` en modo global).
2. Los reportes en `progress/` ya traen YAML frontmatter (`feature`, `status`, `role`, `updated`, `tags`); los documentos en `docs/` son markdown plano y, si usan frontmatter, solo incluyen `tags` opcional.
3. El archivo `index.md` actua como MOC con enlaces a `feature_list.json`, `docs/`, `progress/current` y `progress/history`. Los archivos puente `AGENTS.md` y `CHECKPOINTS.md` viven en el root del repo, fuera del vault, en ambos modos.
4. Los tags siguen el namespace `#handyman/...` (ej: `#handyman/feature/in_progress`, `#handyman/review/approved`).
5. Plugins recomendados: **Outline**, **Backlinks** y **Tags** (todos core). Opcionales: **Dataview** y **Templater**.
6. Agrega `.obsidian/` y `.trash/` al `.gitignore` (en modo local incluye tambien `.handyman/.obsidian/` y `.handyman/.trash/`) antes de commitear metadata local de Obsidian; usa el snippet de [references/templates.md](references/templates.md#gitignore-obsidian).

Mas detalles en [references/obsidian.md](references/obsidian.md).

> 🧹 **Ayuda de versionado:** `.obsidian/` y `.trash/` son metadata local; frontmatter, tags, MOC y wikilinks son parte del contrato del harness.

## � Modelos Por Rol

Cada rol puede correr bajo su propio modelo para gastar el presupuesto de razonamiento donde se toman las decisiones:

| Rol | Tier por defecto | Modelo sugerido |
|-----|------------------|-----------------|
| `leader` | Razonamiento de alta capacidad | Modelo por defecto del editor o el mas fuerte disponible. |
| `implementer` | Codigo barato y rapido | Modelo barato del editor; si no hay, `Claude Sonnet 4.6`. |
| `reviewer` | Validacion barata | Modelo barato del editor; si no hay, `Claude Sonnet 4.6`. |
| `explorer` | El mas barato y rapido | Modelo rapido del editor; si no hay, `Claude Sonnet 4.6`. |

El modelo se declara en el frontmatter del archivo de rol (`model:`) o en un mapa `models` dentro de `harness.config.json`. El identificador `Claude Sonnet 4.6` es un valor por defecto: reemplazalo por el nombre o alias exacto que exponga la plataforma (por ejemplo `sonnet` en Claude Code, o el nombre del selector de modelos de VS Code). Documenta cualquier sustitucion en `progress/current.md`.

Mas detalles en [references/models.md](references/models.md).

> 💸 **Idea de costo:** modelo fuerte para coordinar, modelos baratos para implementar y revisar.

##  Casos De Uso

### 🔎 Analizar Un Harness Existente

Handyman puede inspeccionar un proyecto que ya tenga `AGENTS.md`, `feature_list.json`, `progress/`, `docs/` e `init.sh`, y reportar su estado: modo de instalacion, feature activa, riesgos, archivos faltantes y pasos recomendados.

### 🏠 Bootstrap Local

Crea la estructura del harness dentro del repositorio. Es util para ejemplos, proyectos nuevos o repos donde quieres que todo el flujo operativo quede versionado junto al codigo.

### 🌐 Bootstrap Global

Crea un workspace bajo `$HOME/HANDYMAN/<project_name>` para el estado mutable y deja archivos puente en el repo. Es util cuando quieres separar codigo fuente de historial operativo.

### 🚀 Ejecutar Una Feature

Handyman selecciona una feature `pending`, la marca como `in_progress`, actualiza `progress/current.md`, coordina implementacion, exige tests, corre verificacion y solicita revision antes de cerrar.

### ✅ Revisar Trabajo Terminado

Handyman puede revisar una implementacion usando `CHECKPOINTS.md`, los docs del harness y los reportes en `progress/`. El resultado esperado es un veredicto claro: `APPROVED` o `CHANGES_REQUESTED`.

### 🔁 Migrar De Local A Global

Handyman puede mover el estado operativo de un harness local a `$HOME/HANDYMAN/<project_name>` y dejar el repo con archivos puente consistentes.

## 💬 Ejemplos De Uso

Invocaciones tipicas desde un chat con skills habilitadas:

```text
usa handyman para analizar este repo
```

```text
usa handyman para bootstrap local en este proyecto
```

```text
usa handyman para bootstrap global en /ruta/al/repositorio
```

```text
handyman run-feature: toma la primera feature pending, implementala con tests, revisala y cierra solo si ./init.sh pasa
```

```text
handyman review la feature cli_recent y deja el veredicto en progress/review_cli_recent.md
```

```text
handyman migrate-global este harness local
```

Ejemplo de flujo completo:

```text
1. handyman analyze
2. handyman bootstrap global
3. handyman run-feature
4. handyman review
5. handyman cierra la feature si el reviewer aprueba y el verificador queda verde
```

## 📏 Reglas Operativas

- 🎯 Trabajar una sola feature a la vez.
- 🧭 Resolver `HARNESS_WORKSPACE` antes de leer o escribir estado.
- ✅ No marcar una feature como `done` sin tests, verificacion y revision.
- 📝 Guardar reportes de implementacion y revision bajo `progress/`.
- 🕰️ Mantener `progress/history.md` como historial append-only.
- 🚧 Documentar bloqueos en `progress/current.md` antes de improvisar soluciones.
- 🧪 Hacer que `./init.sh` falle cuando el estado del harness sea incoherente.
- 🧠 Asignar un modelo por rol: fuerte para el leader, barato para implementer y reviewer.

## ✅ Checklist Express

- [ ] `HARNESS_WORKSPACE` esta resuelto antes de tocar estado.
- [ ] Hay como maximo una feature `in_progress`.
- [ ] Los reportes largos viven en `progress/`, no en el chat.
- [ ] `./init.sh` corre y deja evidencia antes del cierre.
- [ ] El reviewer aprueba antes de marcar `done`.

## 🔗 Referencias Internas

- [Anatomia del harness](references/anatomy.md)
- [Workflow](references/workflow.md)
- [Templates](references/templates.md)
- [Checklists](references/checklists.md)
- [Modelos por rol](references/models.md)
- [Integracion con Obsidian](references/obsidian.md)

## 📜 Licencia Y Atribucion

Handyman se distribuye bajo la licencia [MIT](LICENSE).

Esto significa que puedes:

- Usar la skill libremente, incluso con fines comerciales.
- Modificarla, adaptarla, redistribuirla y sublicenciarla.

La licencia MIT requiere:

- Incluir el aviso de copyright y el texto de la licencia en copias o porciones sustanciales del software.

Texto sugerido para citar la skill:

```text
Handyman skill by Rodrigo Mardones, licensed under the MIT License.
```

## 📬 Contacto

Para soporte, mejoras o reporte de problemas, usa el canal del repositorio donde publiques esta skill: issue, pull request o contacto directo con la persona mantenedora del proyecto.

Si esta skill vive en una instalacion local, el punto de contacto recomendado es quien administre la carpeta de skills y el workspace Handyman de tu entorno.

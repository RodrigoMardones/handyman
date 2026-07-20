---
type: Doc
---

/handyman run-feature

## Feature
- name: documentation_update_sprint_clousure
- title: documentation_update_sprint_closure
## Context

Como usuario de handyman estoy registrando un patron
sobre lo trabajado en repositorio, y es la generacion
de contexto sin cierre de proceso de periodo de trabajo.
por lo que preciso el realizar las siguientes medidas.

1. modificar features para que integren la rama de trabajo
en la que se encuentra, habilitando la posibilidad de trabajar
en multiples ramas y multiples sessiones de handyman de manera
paralela.
2. necesito separar el apartado de docs en de handyman en dos
    - Documentar "sprints": son periodos de carga de trabajo de handyman
    donde se realizan tareas, estos sprints son archivos de documentacion de
    un periodo de trabajo sacado de docs. la idea es comprimir todos los 
    documentos de trabajo importantes y dejarlos en un archivo de trabajo general
    que contenga las tareas trabajadas, los logros, los avances generales. recomiendame
    ideas de otros datos que podrian ser utiles.
    - vamos a generar el proceso de iniciar sprint y cerrar sprint dentro de handyman donde
    indicaremos las siguientes acciones.
        - iniciar sprint agrega un flag a todas las tareas de este sprint dentro de la definicion
        de tarea.
        - cerrar sprint genera el documento de sprint formal indicado arriba y limpia el feature
        list para dejar espacio a un nuevo sprint.
        - documentar tareas de ser necesario en archivo de sprint.2025-SP1.md.  
    - espacio de "sprints" o periodos de trabajo donde viviran
    archivos que expliquen lo que ha trabajado en un espacio de tiempo
    determinado. 
    - espacio de "current" donde se dejara toda documentacion hecha
    en un periodo de tiempo sin revisar, de un sprint abierto.

## Scope
- Includes: handyman, tests, docs, .github, .agents
- Excludes: graphify-out, .github

## Acceptance criteria (observable and testable)
- genera un documento de investigacion conforme al resto de formatos
establecidos en /docs

## Verification
- Gate that must stay green: <./init.sh | pytest -q | ...>

## Considerations
- use handyman skill for literature about the harness workflow
- use ponytail for literature about coding and seniority decision.

## Tools
- skills: handyman, skill-creator, mcp-builder
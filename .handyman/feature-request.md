---
type: Doc
---

[Implementation]
## Feature
- name: research_two_topics_token_related
- title: investigacion de topicos asociado al consumo y uso de tokens

## Context
necesito que realices una investigacion sobre
lo siguiente:

1. impacto en de token en handyman como skill, tamaño ideal de tokens
para skill, references, scripts y otros archivos que se necesiten.
2. cantidad de token por cambios pedidos: la idea es entregar un estimado
de la cantidad de token generados de entrada y salida para el feature realizado
y que estos datos se tengan como metricas siempre. revisar como realizar esto
con cualquier modelo utilizado.
3. ver si podemos realizar una descarga sugerida de skill utilizando la skill por defecto de 
find-skill, utiliza skills con el siguiente comando:

``````

- npx skills add https://github.com/vercel-labs/skills --skill find-skills

``````


## Scope
- Includes: intake context files: handyman/*


## Acceptance criteria (observable and testable)
- genera documentos de investagacion asociados
- realiza busquedas en internet de al menos 4 fuentes utiles.
- genera un plan de acccion para mejoras con respecto a estos campos.
## Verification
- Gate that must stay green: ./init.sh (solo si es necesario)
- Functional check: running `cd apps/web && pnpm run build` outputs a successful Next.js compilation without TS errors, and a node script asserting `!/[—–]/.test(pageSource)` passes.

## Considerations
- skills: handyman, skill-creator, find-skills.

## Post-feature
- Actualizar HARNESS_WORKSPACE/memory/ con el resultado de las auditorías (Pre-Flight Check, Section-Layout-Repetition, Hero discipline).
```

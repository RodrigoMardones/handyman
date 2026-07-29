# Skills experimentales

Cada subdirectorio con un `SKILL.md` se carga como skill nativa del **leader**
(arranque siguiente, sin tocar código — ver `src/ports/skills.ts`). La skill
mirror (`run-skill`) NO las carga: su contrato es la skill canónica sola.

Formato: spec [SKILL.md de Anthropic](https://agentskills.io) — frontmatter
`name` + `description`, cuerpo en Markdown; recursos opcionales en
`references/` dentro del mismo directorio.

`ejemplo-skill/` es una skill mínima viva: sirve para verificar el mecanismo
(el leader gana las tools `skill`/`skill_search`/`skill_read`) y como plantilla
de copia. Bórrala cuando tengas las tuyas.

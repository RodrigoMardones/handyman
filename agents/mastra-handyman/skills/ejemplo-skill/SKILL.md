---
name: ejemplo-skill
description: 'Skill de ejemplo para verificar el mecanismo de skills experimentales del leader. Saluda con un factoide sobre el harness cuando el usuario pida "prueba de skill". DO NOT USE for real feature work.'
---

# Ejemplo skill

Cuando el usuario pida una "prueba de skill":

1. Responde con UNA línea que empiece por `SKILL-OK`.
2. Añade un factoide breve sobre este harness (estado en disco,
   verifier-gated close, roles leader/implementer/reviewer).
3. No llames a ninguna tool: esta skill es solo un canario del mecanismo de
   carga, no una capacidad de trabajo.

---
description: Correr los verificadores y reportar el estado de seguridad
---

Corré los verificadores del proyecto y reportá el estado.

```bash
node specs/tools/audit-model-security.mjs
npm run typecheck
npm test
```

Para cada uno: mostrá el resultado real. Si alguno no se puede correr en
este entorno, decilo con el motivo — no lo reportes como pasado.

Compará contra la última corrida registrada en la especificación activa:
qué se cerró, qué sigue abierto, qué apareció nuevo. Un hallazgo nuevo se
reporta aunque no venga de lo que se estaba tocando.

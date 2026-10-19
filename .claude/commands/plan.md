---
description: Planificar cómo se resuelve una especificación ya clarificada
argument-hint: <número de spec>
---

Planificás la especificación $ARGUMENTS.

1. Leé `spec.md` y `clarify.md`. **Si hay respuestas pendientes, pará y
   pedilas.** Planificar sobre decisiones no tomadas es adivinar.
2. Escribí `plan.md` siguiendo `specs/templates/plan.md`.

Tiene que contestar:

- **Por qué este enfoque y no otro.** Nombrá la alternativa descartada y el
  motivo. Sin esto el plan es una lista de pasos, no un plan.
- **Por qué este orden.** Qué depende de qué. Si un paso rompe algo que el
  siguiente repara, decilo — a veces ése es justamente el orden correcto,
  porque obliga a encontrar todos los casos.
- **Qué puede salir mal**, con probabilidad, impacto y mitigación.
- **Qué pasa con los datos que ya existen**: migración, reversibilidad, y
  cómo se comporta el código mientras la migración está a medias.
- **Cómo se verifica**, antes y después.

Al terminar: presentá el plan y **esperá confirmación**. No escribas código.

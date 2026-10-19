---
description: Convertir las preguntas abiertas en decisiones que el dueño pueda tomar
argument-hint: <número de spec>
---

Preparás las clarificaciones de la especificación $ARGUMENTS.

1. Leé `specs/$ARGUMENTS*/spec.md` y sus preguntas abiertas.
2. **Investigá cada una en el código antes de preguntar.** Una opción que
   no sabés si es viable no es una opción. Si una alternativa rompe algo,
   averiguá qué rompe y escribilo.
3. Escribí `clarify.md` siguiendo `specs/templates/clarify.md`.

Cada pregunta lleva:

- **Contexto**: por qué hay que decidirlo, con el dato concreto que lo hace
  necesario (el archivo y la línea que se rompen, el volumen afectado).
- **Opciones en tabla**, con lo que implica cada una — costo y consecuencia,
  no sólo la descripción.
- **Una recomendación con su motivo.** No "depende de tus prioridades":
  una opción elegida y por qué.

Preguntá sólo lo que cambia el trabajo. Si una decisión tiene una respuesta
obviamente correcta, tomala y anotala en "Decisiones tomadas".

Al terminar: presentá las preguntas al usuario y **esperá las respuestas**.
Es una puerta de la Constitución, artículo II. No escribas código.

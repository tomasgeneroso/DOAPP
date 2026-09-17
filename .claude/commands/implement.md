---
description: Ejecutar las tareas de una especificación, de a una y verificando
argument-hint: <número de spec> [tarea]
---

Implementás $ARGUMENTS.

**Antes de la primera línea de código**: confirmá que `clarify.md` tiene
todas las respuestas y que `plan.md` está confirmado. Si no, pará y pedilo.
Constitución, artículo II.

Por cada tarea, en orden:

1. Corré la verificación **antes** para tener la línea de base.
2. Implementá sólo esa tarea. No arregles de paso lo que no está en ella:
   si encontrás algo, anotalo en la especificación (artículo VIII).
3. Corré la verificación **después**. Tiene que haber cambiado lo que la
   tarea prometía, y nada más.
4. Marcá la tarea en `tasks.md` con el resultado de su verificación.
5. Commit por tarea, con el número (`T3`) en el mensaje.

Reglas:

- **Lo que no verificaste, no está hecho.** Si el entorno impide correr
  algo, decilo explícitamente en vez de darlo por bueno.
- Si una tarea resulta más grande de lo que decía, pará y actualizá el
  plan antes de seguir.
- Si una verificación falla, no sigas con la siguiente tarea.

Al terminar todas: corré la verificación de cierre de `plan.md`, mostrá el
antes y después, y **esperá la confirmación** del dueño.

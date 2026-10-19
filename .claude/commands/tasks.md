---
description: Descomponer un plan confirmado en tareas verificables
argument-hint: <número de spec>
---

Descomponés el plan de la especificación $ARGUMENTS en tareas.

1. Leé `plan.md`. Si no está confirmado, pedí la confirmación primero.
2. Escribí `tasks.md` siguiendo `specs/templates/tasks.md`.

Cada tarea:

- Se puede **revertir sola** sin deshacer las demás.
- Nombra **los archivos** que toca.
- Trae su **verificación concreta**: un comando, una consulta, una prueba
  manual descrita paso a paso. "Probar que funciona" no es una verificación.
- Dice **qué podría romper** y cómo se mitiga.

Agrupá en bloques por tema y dejá explícito el orden entre bloques.

Al terminar: mostrá el desglose y decí que sigue `/implement`. No escribas
código todavía.

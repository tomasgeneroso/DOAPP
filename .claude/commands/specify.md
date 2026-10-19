---
description: Crear la especificación de una unidad de trabajo (el qué, no el cómo)
argument-hint: <descripción del problema>
---

Creá una especificación nueva para: $ARGUMENTS

1. Leé `specs/CONSTITUTION.md` — rige lo que sigue.
2. Elegí el próximo número libre en `specs/` y creá `specs/NNN-nombre-corto/`.
3. **Investigá antes de escribir.** La especificación se apoya en evidencia
   del código, no en suposiciones. Si afirmás que algo está mal, mostrá
   dónde y cuántas veces. Si no lo pudiste comprobar, escribilo como
   hipótesis.
4. Escribí `spec.md` siguiendo `specs/templates/spec.md`.

Reglas:

- **Sin solución.** La especificación dice qué tiene que pasar y cómo se
  sabrá que pasó. Nombres de archivo o librerías son señal de que te
  adelantaste.
- **Todo criterio es verificable.** Cada fila de "Resultado esperado" tiene
  que poder responderse con sí o no corriendo algo.
- **El alcance dice qué NO entra**, con el motivo.
- Todo lo que haya que decidir va a "Preguntas abiertas" y después a
  `clarify.md`.

Al terminar: actualizá la tabla de estado de `specs/README.md`, mostrá el
resumen y decí que sigue `/clarify`. No escribas código.

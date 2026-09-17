# Constitución del proyecto

Reglas que rigen cualquier cambio en DoApp. Están por encima de la
conveniencia de una tarea puntual: si una tarea choca con una regla, se
cambia la tarea o se cambia la regla, pero no se la ignora en silencio.

Última revisión: 2026-09-17

---

## I. Nada se implementa sin especificación aprobada

Todo cambio que toque modelos, autenticación, pagos, datos personales o
permisos arranca por una especificación en `specs/NNN-nombre/`. El orden es
**especificar → clarificar → planificar → tareas → implementar → verificar**.

Un arreglo de una línea en un texto o un estilo no necesita especificación.
Un arreglo de una línea que cambia quién puede leer un dato, sí.

## II. El dueño del proyecto confirma antes y después

Dos puertas obligatorias:

- **Antes de implementar**: la especificación y el plan se presentan y no se
  escribe código hasta que estén confirmados.
- **Antes de cerrar**: el resultado se presenta con la verificación corrida,
  y la tarea queda abierta hasta que se confirme.

Ninguna de las dos se saltea porque "era obvio".

## III. Un hallazgo sin evidencia es una hipótesis

No se reporta una causa sin haberla reproducido o medido. Cuando no se pudo
reproducir, se dice exactamente eso y qué dato falta para confirmarlo.
"Probablemente sea X" se escribe como hipótesis, no como diagnóstico.

Corolario: antes de corregir, primero se instrumenta para poder ver el
problema. Un bug que no se puede observar vuelve.

## IV. La seguridad es una propiedad del modelo, no de la ruta

Un dato sensible se protege donde vive —en el modelo, en la base— y no
confiando en que cada ruta se acuerde de filtrarlo. La ruta que se olvida
de poner `attributes` no debe poder filtrar una contraseña.

Reglas concretas:

- **SEC-01** Un secreto (contraseña, token, código de verificación, semilla
  2FA) nunca sale de una consulta por defecto.
- **SEC-02** Un dato personal de identificación (DNI, CUIT, CBU, fotos de
  documento, matrícula) se guarda cifrado.
- **SEC-03** Un dato personal de contacto se devuelve sólo a quien tiene
  una relación con esa persona.
- **SEC-04** Toda columna declara si admite nulos y sus límites.
- **SEC-05** Ningún cuerpo de request entra entero a un modelo: se listan
  los campos permitidos, nunca los prohibidos.
- **SEC-06** Todo acceso a datos de terceros verifica la relación antes de
  responder, no después.

## V. Cada regla tiene una verificación que se puede correr

Una regla que nadie puede comprobar es una intención. Las reglas de arriba
se verifican con `node specs/tools/audit-model-security.mjs`, que corre en
CI y falla si aparece un hallazgo de severidad alta.

Cuando se acepta convivir con un hallazgo, se anota en la especificación
con motivo y fecha de revisión. No se borra del auditor.

## VI. Los cambios de datos son reversibles

Toda migración trae su `down` y se prueba. Una migración que cifra datos
existentes se escribe para poder correrse dos veces sin romper nada.

## VII. Los secretos no viajan ni quedan escritos

No se registran contraseñas, tokens ni datos de documento en logs, mensajes
de error o respuestas. Lo que se guarda para diagnóstico se enmascara.

## VIII. Lo que se rompe se deja mejor de lo que estaba

Si al tocar un archivo aparece un problema distinto al que se venía a
resolver, se anota en la especificación correspondiente. No se arregla de
paso sin dejar registro, ni se ignora.

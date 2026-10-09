# Clarificación 003 — Antecedentes penales

Cinco decisiones. La primera define el resto.

---

## C1. ¿Se guarda el certificado o sólo su resultado?

**Contexto**: el certificado del Registro Nacional de Reincidencia trae un
**código de verificación** que se puede validar en el sitio del RNR. Eso
permite comprobar que es auténtico sin conservar el documento.

Y pesa lo del artículo 7.4 de la Ley 25.326: el tratamiento de datos de
antecedentes penales está reservado a autoridades públicas competentes.
Mirar un certificado que la persona muestra voluntariamente es una cosa;
construir una base de datos de antecedentes penales es otra.

| # | Opción | Qué se guarda | Implica |
|---|---|---|---|
| A | **Ver y descartar** | Resultado (apto / no apto), código de verificación, fecha de emisión, quién revisó y cuándo. **El archivo se borra** al cerrar la revisión | Lo que no se guarda no se filtra ni se roba. No depende de arreglar `/uploads` para ser seguro. Si hay un reclamo después, no queda el documento como respaldo: queda el código, que es verificable contra el RNR. |
| B | Guardar el certificado cifrado, con acceso restringido a revisores | El documento completo | Hay respaldo ante un reclamo. Exige arreglar `/uploads` primero (spec 004), cifrado de archivos, control de acceso y política de borrado. Es una base de datos de antecedentes penales, con todo lo que eso implica. |
| C | Guardar el certificado un tiempo acotado (ej. 30 días) y después borrarlo | El documento, temporalmente | Intermedio. Hereda las exigencias técnicas de B durante esos días, y hay que construir el borrado automático y confiar en que corra. |

**Recomendación: A.** Resuelve el problema del negocio —saber si la
persona está en condiciones de trabajar— guardando lo mínimo. Evita
depender de 004 para poder desplegar, y evita convertir a DoApp en
custodio de documentos penales. El código de verificación cubre la
necesidad de respaldo: ante un reclamo se puede demostrar qué se verificó
y cuándo, y volver a validarlo contra el RNR.

Si la decisión es B o C, **003 no se despliega antes que 004**.

**Respuesta**: _(pendiente)_

---

## C2. ¿Qué hace que alguien sea rechazado?

**Contexto**: "tener antecedentes" y "no estar en condiciones de trabajar"
no son lo mismo. Un antecedente de hace quince años por algo sin relación
con entrar a una casa es distinto de una condena reciente por robo en
domicilio. Esta decisión define qué hace el revisor frente a cada caso, y
hoy no hay criterio escrito.

También hay un costado práctico: rechazar por cualquier antecedente, sin
distinguir, deja afuera a gente que busca reinsertarse, y es el tipo de
regla que después hay que defender ante un reclamo.

| # | Opción | Implica |
|---|---|---|
| A | Rechazo sólo por delitos relacionados con la actividad (contra las personas, contra la propiedad en domicilio, delitos sexuales), con una lista escrita | El criterio es explicable y defendible. Hay que escribir la lista y que el revisor la aplique. |
| B | Rechazo ante cualquier antecedente registrado | Simple de aplicar, cero criterio. Deja afuera casos sin relación con el riesgo. |
| C | Sin criterio fijo: el revisor decide caso por caso | Flexible. Sin lista escrita, dos revisores resuelven distinto el mismo caso y no hay con qué sostener un rechazo. |

**Recomendación: A.** Es la única que se puede explicar a quien fue
rechazado y sostener si lo reclama. La lista la tenés que definir vos —es
una decisión del negocio, no técnica—; yo la dejo como un documento aparte
que el revisor consulta.

**Respuesta**: _(pendiente)_

---

## C3. ¿Dónde exactamente se bloquea?

**Contexto**: dijiste "para que lo contraten y trabajar". Hay dos momentos
posibles y la diferencia la siente el trabajador.

| # | Opción | Implica |
|---|---|---|
| A | Al **postularse** (`POST /api/proposals`) | El trabajador se entera antes de invertir tiempo. No puede postularse, y la app le dice por qué. |
| B | Al **ser contratado** (cuando el cliente lo elige) | Puede postularse y competir, pero se cae al final. El cliente eligió a alguien que no puede trabajar: mala experiencia para los dos. |
| C | En los dos lugares | A protege al trabajador de perder tiempo; el control en B es la red de seguridad por si algo cambió en el medio. |

**Recomendación: C**, con el bloqueo real en A y la verificación en B como
control. El costo sobre A sola es una línea.

**Respuesta**: _(pendiente)_

---

## C4. ¿Qué pasa con los trabajadores que ya están trabajando?

**Contexto**: hay cuentas que hoy se postulan y trabajan sin este
requisito. Si el bloqueo arranca sin más, mañana no pueden postularse.

| # | Opción | Implica |
|---|---|---|
| A | Plazo: se les avisa y tienen X días para presentarlo; después se bloquea | Nadie queda afuera sin aviso. Hay que construir el aviso y el conteo de días. |
| B | Se bloquea desde el día uno | Coherente de inmediato. Trabajadores activos frenados sin aviso. |
| C | Sólo se exige a los que se registran a partir de ahora | Nadie se ve afectado. Quedan dos clases de trabajadores conviviendo, y los clientes no pueden distinguirlas. |

**Recomendación: A, con 30 días.** B rompe la restricción de no dejar
gente afuera de un día para el otro, y C deja el riesgo original intacto
justamente en las cuentas con más trabajos hechos. ¿Te parece bien 30 días
o preferís otro plazo?

**Respuesta**: _(pendiente)_

---

## C5. ¿Qué ve el cliente?

**Contexto**: la verificación sirve para que el cliente confíe, pero el
contenido del certificado no es asunto suyo.

| # | Opción | Implica |
|---|---|---|
| A | Una insignia "Antecedentes verificados" cuando está aceptado, y nada cuando no | El cliente tiene la señal útil. La ausencia de insignia no dice si no presentó o si fue rechazado, que es lo correcto. |
| B | Mostrar el estado completo (sin presentar / en revisión / aceptado / rechazado) | Más información para el cliente. "Rechazado" es información penal indirecta sobre una persona: no corresponde. |
| C | No mostrar nada; la plataforma garantiza que quien trabaja está verificado | Nada que filtrar. Se pierde la señal de confianza, que es parte del valor. |

**Recomendación: A.** Da la señal sin convertir la ausencia de insignia en
una acusación.

**Respuesta**: _(pendiente)_

---

## Decisiones tomadas

| # | Decisión | Fecha |
|---|---|---|
| — | _(ninguna todavía)_ | |

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

**Respuesta: A, solo el resultado** (dueño, 2026-10-25; confirmado el 2026-10-26: «hacé A»). Pregunta del dueño: el certificado puede contar que la persona tiene antecedentes y aun así el
resultado ser «apto» (lo que se verifica es que el papel sea verídico y que lo que dice no esté dentro de lo que se rechaza, ver C2); ¿se puede
ver una sola vez y borrarlo? **Sí, es exactamente la opción A**: el revisor abre el certificado una vez, anota el resultado (apto / no apto), el
código de verificación, la fecha de emisión y quién lo revisó, y al cerrar la revisión **el archivo se borra**. Lo que queda no revela qué decía el
papel, solo que se miró y qué se resolvió; ante un reclamo se puede volver a verificar el código contra el Registro Nacional de Reincidencia.

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

**Respuesta: criterio escrito, el más simple** (dueño, 2026-10-26: «el criterio de rechazo es obvio: no se aceptan falsas ni con antecedentes»). Se **rechaza** el certificado en dos casos:

1. **Es falso** (no se puede verificar en el Registro Nacional de Reincidencia con su código, o está adulterado).
2. **Tiene antecedentes** (cualquiera, sin distinguir el delito).

No hay lista de delitos ni zona gris: reemplaza a la propuesta anterior («roba o mata»). Al rechazado se le dice el motivo en una frase («el certificado no es válido» o «el certificado registra antecedentes») y puede presentar otro certificado.

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

**Respuesta: A, al postularse** (dueño, 2026-10-25). Cuando no puede postularse, la app le **explica por qué** y le **da la posibilidad de subir otro
certificado** en ese mismo momento (sin tener que ir a buscar dónde).

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
| C4 | A: los trabajadores que ya trabajan tienen 30 días para presentar el certificado; después se bloquea (el dueño entendió «para entregarlos» y dio el visto bueno) | 2026-10-24 |
| C5 | A: insignia «Antecedentes verificados» solo cuando fue aceptado; la ausencia de insignia no dice nada | 2026-10-24 |
| nota | Un cliente puede pedirle a soporte el estado de la verificación de un trabajador si lo necesita: se anota en los T&C cuando se redacte la cláusula | 2026-10-24 |
| C1 | A: solo el resultado. El certificado se ve una vez y se borra al cerrar la revisión; quedan resultado, código de verificación, fecha y revisor (reemplaza el «ambos» anterior) | 2026-10-25 |
| C2 | Se rechaza si el certificado es falso o si tiene antecedentes (cualquiera). Reemplaza a la propuesta «roba o mata» | 2026-10-26 |
| C3 | A: el bloqueo es al postularse, con el motivo a la vista y la posibilidad de subir otro certificado | 2026-10-25 |
| nota (soporte) | Lo de que el cliente consulte a soporte el estado de la verificación **sí se puede**, porque se guarda el resultado; solo se responde «verificado / no verificado» | 2026-10-25 |

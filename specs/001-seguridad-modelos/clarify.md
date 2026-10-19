# Clarificación 001 — Seguridad de los modelos

Cinco decisiones antes de planificar. Cada una con opciones, lo que implica
cada una, y mi recomendación con el motivo.

Respondé con la letra (ej. "C1: A, C2: C, …"). Si ninguna encaja, escribí
la tuya.

---

## C1. Cómo proteger el DNI sin romper las búsquedas

**Contexto**: el DNI se busca por igualdad exacta en dos lugares que
importan — el bloqueo de identidades suspendidas (`auth.ts:160`) y el
control de DNI duplicado (`auth.ts:612`). Un cifrado normal produce un
resultado distinto cada vez, así que `where: { dni }` dejaría de encontrar
nada y **se caería el bloqueo de usuarios baneados**.

| # | Opción | Implica |
|---|---|---|
| A | Hash para buscar + cifrado para mostrar: se agrega `dniHash` (determinista, indexable) y `dni` pasa a cifrado | Las búsquedas usan el hash y siguen siendo exactas. Mostrar el DNI requiere descifrar. Dos columnas por dato. Es el patrón estándar. |
| B | Cifrado determinista: el mismo DNI produce siempre el mismo cifrado | Una sola columna, las búsquedas andan igual. Más débil: quien vea la base puede saber que dos personas tienen el mismo DNI y atacar por frecuencia. |
| C | Dejarlo en claro y proteger sólo el acceso | Cero trabajo de migración. No cumple la Ley 25.326 ante un backup filtrado. |

**Recomendación: A.** Es la única que protege el dato en un backup sin
romper el bloqueo de baneados. El costo es una columna extra y una
migración; el beneficio es que un volcado de la base deja de ser una lista
de documentos.

**Respuesta**: _(pendiente)_

---

## C2. Cómo ocultar los secretos sin romper el login

**Contexto**: el login llama a `user.comparePassword(...)`, un método de
instancia que lee `this.password`. Si el modelo deja de traer `password`
por defecto, ese método recibe `undefined` y **nadie puede iniciar sesión**.

| # | Opción | Implica |
|---|---|---|
| A | `defaultScope` que excluye los secretos + scope explícito `withSecrets` para login y refresh | Protección real en la base del modelo. Hay que tocar los 3-4 lugares que sí necesitan el secreto. Si falta uno, se detecta al probar el login. |
| B | Sólo sobrescribir `toJSON()` | No se rompe nada: el objeto sigue teniendo el dato, sólo se oculta al serializar. Pero `res.json({ user })` es lo único que protege; un `JSON.stringify` manual o un log siguen filtrando. |
| C | Las dos: `defaultScope` para que no se cargue, y `toJSON` como red de seguridad | Más trabajo inicial, dos capas independientes. |

**Recomendación: C.** A sola es correcta pero deja abierto el caso de un
objeto construido a mano; B sola es cómoda pero no protege los logs. Juntas
cubren el hueco de la otra, y el trabajo extra de B sobre A es una función
de diez líneas.

**Respuesta**: _(pendiente)_

---

## C3. Qué hacemos con los datos que ya están cargados

**Contexto**: cifrar campos exige convertir lo que ya está en la base. El
trabajo y el riesgo dependen de cuántos datos reales hay.

| # | Opción | Implica |
|---|---|---|
| A | Hay datos reales en producción → migración con backfill por lotes, reversible, y lectura compatible durante la transición | Lo más cuidadoso. Más tiempo. |
| B | Son datos de prueba, se pueden descartar → migración simple | Mucho más rápido. |
| C | Todavía no hay producción → sólo el cambio de esquema | Lo más simple. |

**Necesito que me digas**: ¿la base de producción tiene usuarios reales con
DNI cargado? ¿Cuántos, aproximadamente?

**Recomendación: A** salvo que me confirmes lo contrario. Escribir el
backfill reversible cuesta unas horas; recuperar documentos corrompidos en
una migración mal hecha cuesta muchísimo más.

**Respuesta**: _(pendiente)_

---

## C4. ¿El auditor bloquea el merge?

**Contexto**: `specs/tools/audit-model-security.mjs --ci` devuelve error
si aparece un hallazgo de severidad alta. Puede correr en CI y frenar el
merge, o sólo avisar.

| # | Opción | Implica |
|---|---|---|
| A | Bloquea: ningún merge con hallazgos altos | La regresión es imposible. Un falso positivo frena el trabajo hasta ajustar el auditor. |
| B | Sólo avisa: queda registrado pero no frena | Nada se frena. Con el tiempo se ignora, como todo warning. |
| C | Bloquea sólo los archivos que toca el PR | Lo mejor de las dos, más complejo de implementar. |

**Recomendación: A.** El auditor ya corre limpio salvo por los hallazgos
conocidos, así que arranca desde cero falsos positivos. Si aparece uno, se
ajusta el patrón — que es exactamente lo que hicimos hoy con
`dontAskBankingInfo`.

**Respuesta**: _(pendiente)_

---

## C5. Alcance de esta tanda

**Contexto**: son 9 hallazgos. Se pueden hacer todos juntos o por partes.

| # | Opción | Implica |
|---|---|---|
| A | Sólo los 3 altos (H1, H2, H3) ahora; los bajos después | Cierra el riesgo real rápido. Menos superficie de cambio para revisar. |
| B | Todo 001 de una | Termina el tema. Un cambio más grande para revisar de una sentada. |
| C | Sólo H3 (asignación masiva) ahora, que es el único explotable desde afuera hoy | El arreglo más chico con impacto inmediato. Deja el resto pendiente. |

**Recomendación: A.** H3 es explotable hoy desde el cliente; H1 y H2 son
riesgo latente pero cada día que pasa suman más consultas que arreglar. Los
dos bajos (`ModuleConfig`, `Quote`) no justifican demorar los altos.

**Respuesta**: _(pendiente)_

---

## Decisiones tomadas

| # | Decisión | Fecha |
|---|---|---|
| — | _(ninguna todavía)_ | |

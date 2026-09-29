# Clarificación 002 — Filtrar publicaciones por rubro

Cinco decisiones. Respondé con la letra (ej. "C1: A, C2: B, …").

---

## C1. ¿Qué significa "en su perfil"?

**Contexto**: la frase admite dos lecturas y construyen cosas distintas.

| # | Opción | Qué se construye |
|---|---|---|
| A | La persona configura **desde su perfil** qué rubros quiere ver en el listado de publicaciones | El filtro afecta lo que **ella** ve. Se conecta `interests` al feed. |
| B | El **perfil público** de alguien muestra sólo sus publicaciones de ciertos rubros | El filtro afecta lo que **otros** ven de ella. Es una preferencia de presentación, no de consumo. |
| C | Las dos cosas | Dos funciones distintas con dos preferencias distintas. |

**Recomendación: A.** Es la que aprovecha lo que ya existe —`interests`,
la pestaña de Ajustes, el onboarding— y la que resuelve el problema de
quien entra a buscar trabajo. B es una función razonable pero distinta, y
mezclarlas ahora obliga a decidir dos veces cada cosa.

**Respuesta: A**, con este detalle del dueño (2026-09-29):

- Se puede elegir **todos, algunos o uno** de los rubros. "Todos" es una
  opción explícita, no la ausencia de elección.
- Se elige **tanto en el onboarding como en el perfil**, con el mismo
  selector.
- La pantalla **dice que la elección afecta al feed siempre**. No hay un
  interruptor aparte: elegir rubros *es* filtrar.

---

## C2. ¿El filtro viene encendido o apagado?

**Contexto**: hay gente que ya eligió rubros en el onboarding **sin saber
que iban a filtrar algo**. Si el filtro arranca encendido, mañana abren la
app y ven menos trabajo que ayer, sin haber tocado nada.

| # | Opción | Implica |
|---|---|---|
| A | Apagado por defecto; se enciende a mano | Nadie se sorprende. La función existe para quien la busca, y hay que contársela para que se use. |
| B | Encendido para quien ya tiene rubros elegidos | Se aprovecha lo que la gente ya cargó. Cambia el feed de usuarios activos sin aviso. |
| C | Apagado, pero con un aviso una sola vez: "elegiste estos rubros, ¿querés ver sólo eso?" | Nadie se sorprende y la función se descubre sola. Requiere construir el aviso y recordar que ya se mostró. |

**Recomendación: C.** A es seguro pero la función queda escondida —y el
problema original es justamente que nadie sabe que sus intereses existen.
B rompe la restricción de no cambiarle el feed a nadie de un día para el
otro. C consigue las dos cosas; el costo es una preferencia más para saber
si el aviso ya se mostró.

**Respuesta: la pregunta cambia de forma.** Con "todos" como opción
explícita, no hace falta un interruptor: la elección *es* el filtro, como
pidió el dueño.

Queda un solo caso sin resolver, y es real: **quien ya eligió rubros en el
onboarding lo hizo bajo otra promesa**. Si su elección empieza a filtrar,
mañana ve menos trabajo sin haber tocado nada.

**Decisión (a confirmar): C adaptada.** La elección manda siempre, pero a
quien ya tenía rubros cargados se le muestra **una sola vez** qué tiene
elegido y qué va a pasar, con la opción de dejarlo así o pasar a "todos".
Después de esa pantalla, la regla es la que pidió el dueño, sin
excepciones.

---

## C3. ¿Dónde se aplica el filtro?

**Contexto**: "las publicaciones" aparecen en varios lugares, y filtrar en
algunos sí y otros no puede resultar confuso.

| # | Opción | Implica |
|---|---|---|
| A | Sólo el listado principal de trabajos | El cambio más chico. La búsqueda explícita sigue mostrando todo. |
| B | Listado + notificaciones de trabajos nuevos | Coherente: si no querés ver mudanzas, tampoco querés que te avisen de una mudanza. |
| C | Todo: listado, notificaciones, búsqueda y matching | Coherencia total. Pero filtrar la búsqueda es discutible: si alguien busca "mudanza" a propósito, esconderle el resultado es un error. |

**Recomendación: B.** La búsqueda es una intención explícita y debe ganarle
a la preferencia — quien escribe "mudanza" quiere ver mudanzas. Las
notificaciones sí son el mismo problema que el feed: llegan sin pedirlas.

**Respuesta: A por ahora.** El dueño dijo "afectará al feed", y el feed es
lo que se construye en esta tanda. Las notificaciones quedan anotadas como
pendiente —el argumento de B sigue siendo válido— pero no entran acá para
no mezclar dos sistemas en un mismo cambio.

---

## C4. ¿Reusamos `interests` o separamos el filtro?

**Contexto**: "me interesa la plomería" y "ocultame todo lo que no sea
plomería" no son lo mismo. Alguien puede querer que le recomienden
plomería sin dejar de ver el resto.

| # | Opción | Implica |
|---|---|---|
| A | Reusar `interests` + un booleano que dice si filtra | Un solo lugar para elegir rubros, cero migración de datos. Si más adelante hay recomendaciones, comparten la lista y puede que se quieran distintas. |
| B | Un campo nuevo `visibleCategories` aparte de `interests` | Cada cosa su campo. Dos listas de rubros para mantener y dos lugares donde elegir: más preciso y más confuso. |

**Recomendación: A.** La separación de B resuelve un problema que todavía
no existe —no hay recomendaciones— a cambio de duplicar la interfaz hoy.
Si algún día se necesita, `visibleCategories` se agrega copiando
`interests`.

**Respuesta: A.** Se desprende de lo que pidió el dueño: el mismo selector
en el onboarding y en el perfil, y una sola elección que afecta al feed.
Dos listas separadas contradirían eso.

---

## C5. ¿Qué pasa si el filtro deja el listado vacío?

**Contexto**: alguien elige "Climatización", no hay publicaciones de eso
esta semana, y ve una pantalla vacía. El riesgo es que concluya que en
DoApp no hay trabajo y se vaya.

| # | Opción | Implica |
|---|---|---|
| A | Pantalla vacía que explica que hay un filtro activo, con un botón para quitarlo | Honesto y directo. La persona decide. |
| B | Si no hay nada del rubro, mostrar el resto igual, avisando | Nunca hay pantalla vacía. Pero el filtro deja de cumplirse, que es justo lo que la persona pidió. |
| C | Vacío con el filtro visible, y debajo "otras publicaciones que podrían interesarte" | Lo mejor de las dos: se respeta el filtro y no queda la sensación de que no hay nada. Más trabajo de interfaz. |

**Recomendación: A** para esta tanda, **C** cuando haya recomendaciones.
B rompe la promesa del filtro sin pedir permiso, que es el mismo error que
arrastramos con `interests`.

**Respuesta: A.** Coherente con "la elección afecta al feed siempre": si
el filtro deja la pantalla vacía, se dice que hay un filtro y se ofrece
quitarlo, pero no se lo desobedece por atrás.

---

## Decisiones tomadas

| # | Decisión | Fecha |
|---|---|---|
| C1 | Filtro sobre lo que ve la propia persona. Todos / algunos / uno, elegible en onboarding y perfil, con aviso de que afecta al feed siempre | 2026-09-29 |
| C2 | "Todos" es una opción explícita, no un interruptor aparte. A quien ya tenía rubros se le avisa una vez antes de aplicarlo | 2026-09-29 |
| C3 | Sólo el feed en esta tanda; notificaciones anotadas como pendiente | 2026-09-29 |
| C4 | Se reusa `User.interests` | 2026-09-29 |
| C5 | Vacío explica el filtro y ofrece quitarlo | 2026-09-29 |

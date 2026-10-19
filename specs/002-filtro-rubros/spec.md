# Especificación 002 — Filtrar publicaciones por rubro

- **Estado**: clarificada — plan pendiente de confirmación
- **Fecha**: 2026-09-29
- **Confirmada por**: _(pendiente)_

## Problema

DoApp ya le pide a cada persona qué rubros le interesan —en el onboarding
y en Ajustes → Intereses— y guarda esa elección en `User.interests`. Hay
18 rubros definidos en `shared/constants/categories.ts`.

**Esa elección no hace nada.** Rastreando `interests` por el servidor, los
únicos usos son leerla y escribirla (`auth.ts:418, 514, 711, 780, 836`).
Ni el listado de trabajos, ni la búsqueda, ni el matching la consultan. El
feed sólo filtra por `category` cuando llega como parámetro de la URL
(`jobs.ts:167`), y ese parámetro lo manda la interfaz de búsqueda, no el
perfil.

O sea: un plomero elige "Plomería" y "Construcción" al registrarse, y
sigue viendo mudanzas, cuidado de mascotas y diseño web en su feed.

## Por qué importa

- **Es una promesa incumplida.** Pedirle a alguien que elija sus rubros y
  después ignorarlo es peor que no preguntarle: enseña que configurar la
  app no sirve.
- **Ruido sobre la propuesta de valor.** Un trabajador que entra a ver si
  hay trabajo para él tiene que descartar a mano lo que no es de su rubro.
  Cuantas más publicaciones haya, peor funciona.
- **El trabajo ya está hecho a medias.** El modelo, la interfaz de Ajustes
  y el onboarding existen. Falta conectarlos.

## Alcance

**Entra:**

- Que cada persona elija **todos, algunos o un solo rubro**, con "todos"
  como opción explícita y no como ausencia de elección.
- Que esa elección se pueda hacer **en el onboarding y en el perfil**, con
  el mismo selector.
- Que la pantalla **diga que la elección afecta al feed siempre**.
- Que la elección se aplique al listado de publicaciones.
- Que el filtro sea evidente cuando está activo: nadie debería creer que
  no hay trabajo cuando en realidad lo está ocultando su propio filtro.

**No entra** (y por qué):

- Recomendaciones o ranking por afinidad: es otro problema — ordenar no es
  filtrar. Queda para una especificación aparte.
- Cambiar la lista de 18 rubros.
- El filtro por rubro de la búsqueda, que ya funciona y es de un solo uso.

## Resultado esperado

| # | Criterio | Cómo se verifica |
|---|---|---|
| 1 | Una persona con el filtro activo y "Plomería" elegida no recibe publicaciones de otros rubros en el listado | Llamada al listado con esa sesión; ninguna publicación tiene otra categoría |
| 2 | La misma persona con el filtro desactivado recibe todas | Misma llamada con el filtro apagado; aparecen rubros variados |
| 3 | El filtro se activa, desactiva y edita sin salir de Ajustes | Recorrido manual |
| 4 | Con el filtro activo y ningún resultado, la pantalla lo explica y ofrece quitarlo | Recorrido manual con un rubro sin publicaciones |
| 5 | Quien nunca configuró nada sigue viendo lo mismo que antes | Sesión sin rubros elegidos; el listado no cambia |
| 6 | El filtro se aplica en la consulta, no sobre la página ya traída | Con filtro activo y muchas publicaciones, una página devuelve el tamaño completo, no un resto |
| 7 | La pantalla de elección dice que afecta al feed | Revisión visual del onboarding y del perfil |

## Restricciones

- **No cambiarle el feed a nadie de un día para el otro.** Hay usuarios que
  ya eligieron rubros en el onboarding sin saber que filtrarían nada.
  Activarlo por defecto les reduciría el feed sin que lo hayan pedido.
- **El servidor decide.** Filtrar sólo en el cliente significa mandar
  publicaciones que la persona no va a ver: gasta datos y no es el filtro
  real.
- **Sin romper la paginación.** El filtro se aplica en la consulta, no
  sobre la página ya traída. Hoy el filtro por ubicación se aplica en
  memoria después de traer las filas y recorta la página (`jobs.ts:249`);
  el de rubros no debe repetir ese error.

## Preguntas abiertas

Ninguna: C1 a C5 respondidas en `clarify.md` el 2026-09-29.

## Corrección sobre el borrador anterior

El criterio 6 decía *"el filtro no se puede evadir ni forzar desde el
cliente"*. Estaba mal planteado: esto no es un control de seguridad. Las
publicaciones son públicas, y alguien que "evada" su propio filtro
simplemente ve más avisos que ya podía ver. Tratarlo como un problema de
seguridad agregaba trabajo sin proteger nada.

Lo que sí importa —y reemplaza a ese criterio— es que el filtro se aplique
en la consulta: por paginación y por no mandar datos que no se van a
mostrar.

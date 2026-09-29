# Especificación 002 — Filtrar publicaciones por rubro

- **Estado**: en clarificación
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

- Que cada persona elija si quiere ver todas las publicaciones o sólo las
  de los rubros que seleccionó.
- Que esa preferencia se aplique al listado de publicaciones.
- Que se pueda cambiar y desactivar desde donde hoy se eligen los rubros.
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
| 6 | El filtro no se puede evadir ni forzar desde el cliente | Llamada manipulando el parámetro; el servidor manda |

## Restricciones

- **No cambiarle el feed a nadie de un día para el otro.** Hay usuarios que
  ya eligieron rubros en el onboarding sin saber que filtrarían nada.
  Activarlo por defecto les reduciría el feed sin que lo hayan pedido.
- **El servidor decide.** Filtrar sólo en el cliente significa mandar
  publicaciones que la persona no va a ver: gasta datos y no es el filtro
  real.
- **Sin romper la paginación.** El filtro se aplica en la consulta, no
  sobre la página ya traída.

## Preguntas abiertas

C1 a C5 en `clarify.md`. La más importante es qué significa exactamente
"en su perfil", porque cambia qué se construye.

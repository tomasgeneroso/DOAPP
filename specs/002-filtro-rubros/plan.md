# Plan 002 — Filtrar publicaciones por rubro

- **Estado**: propuesto — **no se implementa hasta confirmación**
- **Depende de**: C1–C5 respondidas (2026-09-29)

## La decisión técnica que ordena todo

`GET /api/jobs` **es público**: se monta sin `protect` (`index.ts:293`,
`jobs.ts:76`) y no sabe quién pregunta. Para aplicar una preferencia
guardada en el usuario, hay que resolver eso primero.

| # | Opción | Implica |
|---|---|---|
| A | Middleware `optionalAuth`: si viene token lo decodifica, si no sigue igual | El servidor conoce la preferencia sin que el cliente la mande. Sirve después para notificaciones, donde no hay cliente. Hay que escribirlo: no existe en el proyecto. |
| B | El cliente manda `categories=plomeria,pintura` tomándolo de su perfil | Más rápido, no toca middleware. La preferencia deja de aplicarse si el cliente no la manda: un enlace directo, una versión vieja de la app o la app móvil sin actualizar muestran todo. |

**Recomiendo A.** El pedido fue que la elección *"afecte al feed siempre"*,
y B la vuelve opcional para quien haga la llamada sin el parámetro. Además
`optionalAuth` es la pieza que falta para cualquier endpoint público que
quiera personalizar sin obligar a iniciar sesión.

El resto del plan asume A. **Si preferís B, decímelo y sale más rápido**,
a cambio de que el filtro dependa del cliente.

## Enfoque

### Un solo lugar decide qué rubros ve alguien

Una función `categoriasVisibles(user)` que devuelve `null` cuando la
persona ve todo, o la lista de rubros cuando filtra. La usan el feed hoy y
las notificaciones cuando se sumen. Sin esa función, la regla se copia y
las dos copias se desincronizan.

**"Todos" se guarda como lista vacía.** `interests: []` significa ver todo;
`interests: ['plomeria']` significa ver sólo plomería. Así no hace falta
una columna nueva y el estado "no elegí nada" y "elegí todo" son el mismo,
que es lo correcto: las dos cosas muestran el feed completo.

### El filtro va en la consulta

`query.category = { [Op.in]: categorias }` junto a los filtros que ya
existen (`jobs.ts:167`), no sobre el arreglo ya traído. Se evita el
problema que tiene hoy el filtro por ubicación, que recorta la página
después de haberla pedido.

### La pantalla dice lo que hace

El mismo selector de rubros en el onboarding y en Ajustes, con dos cambios:

- Una opción **"Ver todos los rubros"** al principio, que deselecciona el
  resto. Hoy el onboarding **obliga a elegir al menos uno**
  (`OnboardingScreen.tsx:131`): eso deja de tener sentido cuando no elegir
  nada es una respuesta válida.
- Un texto fijo que dice que esta elección afecta al feed, visible al
  elegir y no sólo la primera vez.

### A quien ya eligió, se le avisa una vez

Hay gente con `interests` cargados de un onboarding que no filtraba nada.
Antes de aplicarles el filtro, una pantalla les muestra qué tienen elegido
y qué va a pasar, con dos botones: dejarlo así o ver todos. Se marca que ya
se mostró con una preferencia nueva (`categoryFilterNoticeSeenAt`).

Mientras no la hayan visto, **ven todo como hasta ahora**.

## Orden de trabajo

```
T1 optionalAuth            ← sin esto el servidor no sabe quién pregunta
T2 categoriasVisibles + filtro en la consulta
T3 selector con "ver todos" (onboarding + perfil)
T4 aviso por única vez a quien ya tenía rubros
T5 estado vacío con el filtro explicado
```

T1 y T2 dejan la función andando de punta a punta. T3 la hace usable, T4
protege a los que ya están, T5 cierra el borde feo.

## Riesgos

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| `optionalAuth` hace fallar el endpoint público con un token vencido | media | alto | Ante cualquier error de token, seguir sin usuario en vez de rechazar; probar con token válido, vencido, inválido y ausente |
| Alguien con rubros cargados ve el feed vacío antes de ver el aviso | baja | alto | El filtro sólo se aplica si la preferencia del aviso está marcada; T4 va antes de habilitarlo en producción |
| El filtro se combina mal con el de ubicación | media | medio | Probar los dos juntos; el de rubros va en SQL y el de ubicación sigue en memoria, el orden importa |
| Quedan rubros guardados que ya no existen en la lista de 18 | baja | bajo | Ignorar los desconocidos al filtrar en vez de devolver vacío |

## Datos existentes

- `interests` ya existe y no necesita migración: los valores actuales son
  válidos con la nueva semántica.
- Se agrega `categoryFilterNoticeSeenAt` (fecha, nula) a `users`, con su
  migración y su `down`.
- Nadie pierde datos y nada se reescribe.

## Verificación

- Listado con sesión que eligió un rubro → sólo ese rubro.
- Listado con sesión que eligió "todos" → todos.
- Listado sin sesión → todos, como hoy.
- Token vencido → responde igual que sin token, no falla.
- Una página con filtro activo devuelve el tamaño completo, no un resto.
- `node specs/tools/audit-model-security.mjs` sin hallazgos nuevos.

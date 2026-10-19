# Tareas 002 — Filtrar publicaciones por rubro

Ninguna empezada: esperan la confirmación del plan.

---

- [ ] **T1 — Middleware `optionalAuth`** · `server/middleware/auth.ts`
  - Decodifica el token si viene y deja `req.user`; si no viene, está
    vencido o es inválido, sigue sin usuario **sin responder error**.
  - **Verificación**: cuatro llamadas al feed —con token válido, vencido,
    inválido y sin token— devuelven 200 en los cuatro casos.
  - **Riesgo**: si rechaza en vez de seguir, tira abajo un endpoint
    público. Es el motivo de las cuatro pruebas.

- [ ] **T2 — Filtro por rubro en el listado** · `server/routes/jobs.ts`, `server/utils/categorias.ts`
  - `categoriasVisibles(user)` → `null` (ve todo) o lista de rubros.
  - Aplicar como `Op.in` en la consulta, junto a los filtros existentes.
  - Ignorar rubros que no estén entre los 18 conocidos.
  - **Verificación**: sesión con `['plomeria']` no recibe otras
    categorías; sesión con `[]` recibe variadas; sin sesión, igual que
    hoy; una página con filtro trae el tamaño completo.
  - **Riesgo**: romper los filtros que ya funcionan. Probar rubro +
    ubicación + precio juntos.

- [ ] **T3 — "Ver todos los rubros" en el selector** · `OnboardingScreen.tsx`, `UserSettings.tsx`
  - Opción explícita que deselecciona el resto; elegir un rubro la apaga.
  - Sacar la obligación de elegir al menos uno en el onboarding
    (`OnboardingScreen.tsx:131`).
  - Texto fijo: esta elección afecta al feed.
  - **Verificación**: recorrido manual en las dos pantallas — elegir
    todos, algunos, uno, y volver a todos.
  - **Riesgo**: el onboarding queda sin poder avanzar si la validación no
    se ajusta bien.

- [ ] **T4 — Aviso por única vez** · migración + `client/`
  - `categoryFilterNoticeSeenAt` en `users`.
  - Pantalla para quien tiene `interests` no vacío y la marca sin fecha:
    muestra sus rubros y ofrece dejarlo o ver todos.
  - El filtro de T2 **sólo se aplica si la marca tiene fecha**.
  - **Verificación**: usuario con rubros y sin marca ve todo y recibe el
    aviso; después de responder, el feed obedece; usuario nuevo nunca ve
    el aviso.
  - **Riesgo**: el más alto — si falla, hay gente con el feed recortado
    sin haber elegido. Va antes de habilitar nada en producción.

- [ ] **T5 — Estado vacío con el filtro explicado** · `client/`
  - Cuando no hay resultados y el filtro está activo: decirlo, mostrar los
    rubros elegidos y ofrecer ver todos.
  - **Verificación**: elegir un rubro sin publicaciones y confirmar que la
    pantalla lo explica y el botón lleva a ver todo.
  - **Riesgo**: bajo.

---

## Estado

| Tarea | Estado | Verificada |
|---|---|---|
| T1 | pendiente | — |
| T2 | pendiente | — |
| T3 | pendiente | — |
| T4 | pendiente | — |
| T5 | pendiente | — |

## Anotado para otra especificación

- Filtrar también las **notificaciones** de trabajos nuevos por rubro
  (C3): mismo problema que el feed, llegan sin pedirlas.
- El filtro por **ubicación** se aplica en memoria y recorta la página
  (`jobs.ts:249`). No es parte de 002, pero es un error real que conviene
  arreglar.

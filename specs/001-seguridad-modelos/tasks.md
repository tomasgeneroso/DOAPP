# Tareas 001 — Seguridad de los modelos

Cada tarea se puede revertir sola y trae su verificación. **Ninguna está
empezada**: esperan la confirmación de `clarify.md` y `plan.md`.

---

## Bloque A — Lo explotable hoy (H3)

- [ ] **T1 — Helper de campos permitidos** · `server/utils/pick.ts`
  - Función `pick(body, campos)` que devuelve sólo las claves listadas.
  - **Verificación**: prueba unitaria — claves no listadas no aparecen, y
    un `undefined` no pisa un valor existente.
  - **Riesgo**: ninguno, es código nuevo.

- [ ] **T2 — Editar trabajo con lista de campos** · `server/routes/jobs.ts:1166`
  - Reemplazar `{ ...req.body }` por `pick(req.body, [...])` con los campos
    que el dueño puede editar. `status`, `clientId`, `price` y
    `permanentlyCancelled` quedan fuera.
  - **Verificación**: `audit` sin SEC-05; y un PUT con `status: completed`
    en el body no cambia el estado del trabajo.
  - **Riesgo**: si falta un campo legítimo, la edición deja de guardarlo.
    Mitigación: comparar la lista contra el formulario del cliente.

---

## Bloque B — Secretos (H1)

- [ ] **T3 — `defaultScope` en los tres modelos** · `User`, `RefreshToken`, `PasswordResetToken`
  - Excluir `password`, `twoFactorSecret`, `verificationToken`,
    `phoneVerificationCode`, `token`, `replacedByToken`.
  - Agregar scope `withSecrets`.
  - **Verificación**: `User.findByPk(id)` no trae `password`;
    `User.scope('withSecrets').findByPk(id)` sí.
  - **Riesgo**: rompe el login hasta T4. Van en el mismo commit.

- [ ] **T4 — Usar `withSecrets` donde hace falta** · `server/routes/auth.ts` y servicios
  - Login, refresh, cambio de contraseña, verificación de email/teléfono, 2FA.
  - **Verificación**: probar los cinco flujos a mano, uno por uno.
  - **Riesgo**: un flujo olvidado falla en producción. Mitigación: buscar
    todos los usos de los campos excluidos antes de dar por cerrada la tarea.

- [ ] **T5 — `toJSON` como segunda capa** · los tres modelos
  - Borrar los secretos al serializar, incluso con el scope explícito.
  - **Verificación**: `JSON.stringify(await User.scope('withSecrets').findByPk(id))`
    no contiene el hash.
  - **Riesgo**: bajo.

---

## Bloque C — Identidad cifrada (H2)

- [ ] **T6 — Esquema: `dni_hash` y columnas más anchas** · migración
  - Agregar `dni_hash` indexado en `users` y `banned_identities`. Ampliar
    las columnas que van a guardar texto cifrado.
  - **Verificación**: migración `up` y `down` corridas sobre una copia.
  - **Riesgo**: bajo, sólo esquema.

- [ ] **T7 — Cifrado en el modelo + backfill** · `User`, `BannedIdentity`, `WithdrawalRequest`
  - Hooks de cifrado como los del CBU. Getters que descifran. `isEncrypted()`
    como guarda para no cifrar dos veces.
  - Backfill por lotes de 500.
  - **Verificación**: `audit` sin SEC-02; `SELECT dni FROM users LIMIT 5`
    devuelve texto cifrado; el getter devuelve el original; conteo de filas
    con dato igual antes y después.
  - **Riesgo**: el más alto de todos. Correr primero en copia, con conteo.

- [ ] **T8 — Búsquedas por hash** · `auth.ts:160`, `auth.ts:612`
  - `where: { dni }` pasa a `where: { dniHash: hashDni(dni) }`.
  - **Verificación**: un DNI baneado sigue bloqueando el registro; un DNI
    duplicado sigue siendo rechazado.
  - **Riesgo**: si se omite un lugar, el bloqueo de baneados deja de
    funcionar en silencio. Buscar todos los usos de `dni` en `where`.

---

## Bloque D — Cierre

- [ ] **T9 — Restricciones en `ModuleConfig` y `Quote`** · modelos + migración
  - **Verificación**: `audit` sin SEC-04.
  - **Riesgo**: una fila existente que viole la restricción frena la
    migración. Revisar antes con un `SELECT` de nulos.

- [ ] **T10 — Auditor en CI** · `.github/workflows/`
  - `node specs/tools/audit-model-security.mjs --ci` en el pipeline.
  - **Verificación**: introducir un hallazgo alto a propósito y comprobar
    que el pipeline falla; después revertirlo.
  - **Riesgo**: ninguno si va al final.

---

## Estado

| Tarea | Estado | Verificada |
|---|---|---|
| T1 | pendiente | — |
| T2 | pendiente | — |
| T3 | pendiente | — |
| T4 | pendiente | — |
| T5 | pendiente | — |
| T6 | pendiente | — |
| T7 | pendiente | — |
| T8 | pendiente | — |
| T9 | pendiente | — |
| T10 | pendiente | — |

# Plan 001 — Seguridad de los modelos

- **Estado**: propuesto — **no se implementa hasta confirmación**
- **Supone**: C1=A, C2=C, C3=A, C4=A, C5=A. Si alguna cambia, cambia el plan.

## Enfoque

La regla que ordena todo: **el dato se protege donde vive**. No se recorren
las 180 consultas pidiéndoles que filtren; se hace que el modelo no
entregue el secreto salvo que se lo pidan.

### H1 · Secretos fuera del alcance por defecto

Dos capas, según C2=C:

1. `defaultScope` en `User`, `RefreshToken` y `PasswordResetToken` con
   `attributes: { exclude: [...] }`. Las 180 consultas dejan de traer el
   secreto sin tocar ninguna.
2. Un scope `withSecrets` para los tres o cuatro lugares que sí lo
   necesitan: login, refresh de token, cambio de contraseña, verificación
   2FA.
3. `toJSON()` que borra los secretos incluso si alguien construyó el objeto
   con el scope explícito.

**Por qué no al revés** (recorrer las rutas y agregar `attributes`): son
180 lugares, se arreglan una vez y la ruta 181 vuelve a fallar. No escala.

### H2 · Identidad cifrada, búsquedas por hash

Según C1=A. Para `dni` en `User` y `BannedIdentity`:

- Se agrega `dniHash`: SHA-256 con sal del servidor, determinista,
  indexado. Las búsquedas por igualdad pasan a usarlo.
- `dni` pasa a cifrado con el `encrypt/decrypt` que ya existe en
  `server/utils/encryption.ts` — el mismo que hoy protege el CBU.
- `dniPhotoFront`, `dniPhotoBack`, `selfieUrl`, `licenseNumber` y
  `WithdrawalRequest.bankingInfo`: cifrado sin hash, no se buscan.
- Getters que descifran al leer, como ya hace `getDecryptedCBU()`.

**Compatibilidad durante la transición**: el getter detecta si el valor
está cifrado (`isEncrypted()`, ya existe) y lo devuelve tal cual si todavía
no lo está. Permite desplegar el código antes de terminar el backfill.

### H3 · Lista de campos permitidos

`jobs.ts:1166` pasa de `{ ...req.body }` a una lista explícita de los
campos que el dueño de un trabajo puede editar. Los que hoy entran sin
control —`status`, `clientId`, `price`, `permanentlyCancelled`— dejan de
ser escribibles desde el body.

Se agrega un helper `pick(body, campos)` para que el patrón sea igual de
cómodo que el spread y no haya excusa para volver al atajo.

### H4 · Restricciones declaradas

`ModuleConfig` y `Quote`: `@AllowNull(false)` donde corresponda y su
migración. Es el más chico y el que menos riesgo tiene.

## Orden de trabajo

```
T1 (helper pick)  →  T2 (H3 jobs)                    ← lo explotable hoy, primero
T3 (defaultScope) →  T4 (withSecrets en login)       ← T4 arregla lo que T3 rompe
                  →  T5 (toJSON)
T6 (esquema cifrado) → T7 (backfill) → T8 (búsquedas por hash)
T9 (H4)           →  T10 (auditor en CI)             ← al final: fija el estado alcanzado
```

**Por qué T3 antes que T4**: T3 rompe el login a propósito y T4 lo repara.
Hacerlo en ese orden garantiza que se encuentren *todos* los lugares que
leen secretos — si T4 fuera primero, un lugar olvidado pasaría inadvertido
hasta producción.

**Por qué el auditor en CI al final**: encender el bloqueo antes de cerrar
los hallazgos dejaría el pipeline rojo desde el primer commit.

## Riesgos

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| `defaultScope` rompe un flujo de auth no previsto | media | alto | T3 y T4 en el mismo commit; probar login, registro, refresh, cambio de contraseña y 2FA antes de seguir |
| El backfill corrompe documentos | baja | muy alto | `isEncrypted()` antes de cifrar; corre por lotes; `down` probado en una copia; conteo antes/después |
| Un `include` de Sequelize ignora el `defaultScope` del modelo asociado | media | alto | Probar explícitamente una consulta con `include: [User]` y verificar que no traiga `password` |
| El hash de DNI permite fuerza bruta (sólo 8 dígitos) | alta | medio | Sal del servidor en variable de entorno, no en la base: sin esa sal el espacio de búsqueda no se puede recorrer offline |
| Cambiar la sal deja los hashes viejos inservibles | baja | alto | Documentar que la sal no rota sin re-hashear; guardarla junto al resto de secretos del entorno |

## Datos existentes

Asumiendo C3=A:

1. Migración de esquema: agrega `dni_hash`, amplía las columnas cifradas
   (el cifrado ocupa más que el texto original).
2. Backfill en lotes de 500, con `isEncrypted()` como guarda → se puede
   correr dos veces sin doble cifrado.
3. Verificación: conteo de filas con dato antes y después, y una muestra
   descifrada comparada contra el original.
4. `down`: descifra y restaura. Se prueba en una copia antes de tocar
   producción.

## Verificación

**Antes** de cada tarea: `node specs/tools/audit-model-security.mjs` para
tener la línea de base.

**Después** de cada tarea: el mismo comando; el hallazgo correspondiente
tiene que haber desaparecido y ninguno nuevo tiene que aparecer.

**Al cerrar**:

- `audit --ci` sin hallazgos altos.
- `npm run typecheck` y `npm test`.
- Prueba manual del flujo de autenticación completo.
- Consulta SQL directa a `users` confirmando que el DNI no se lee.

# Especificación 001 — Seguridad de los modelos de datos

- **Estado**: en clarificación
- **Fecha**: 2026-09-17
- **Confirmada por**: _(pendiente)_
- **Verificador**: `node specs/tools/audit-model-security.mjs`

## Problema

La protección de los datos sensibles de DoApp vive en las rutas, no en los
modelos. Cada consulta tiene que acordarse de filtrar lo que no debe salir,
y cada endpoint de escritura tiene que acordarse de limitar lo que entra.
Cuando una ruta nueva se olvida, no hay nada abajo que la detenga.

Auditoría del 2026-09-17 sobre los 43 modelos y las rutas: **5 hallazgos de
severidad alta, 2 medios, 2 bajos**, sobre 28 campos sensibles.

### H1 · Los secretos salen por defecto (SEC-01) — alta

`User`, `RefreshToken` y `PasswordResetToken` guardan secretos y ninguno
define `defaultScope` ni `toJSON` que los excluya.

| Modelo | Campos que viajan en cada consulta |
|---|---|
| `User` | `password`, `twoFactorSecret`, `verificationToken`, `phoneVerificationCode` |
| `RefreshToken` | `token`, `replacedByToken` |
| `PasswordResetToken` | `token` |

**Medición**: de 244 consultas a `User` en rutas y servicios, **180 (74%)
no listan campos**; cada una carga el hash de contraseña y la semilla 2FA
en memoria.

**Lo que no encontré**: ninguna ruta actual serializa el objeto completo a
la respuesta — todas arman el payload a mano. O sea que hoy **no hay
filtración confirmada**. El problema es que 180 puntos dependen de que
nadie escriba `res.json({ user })`, y esa línea es lo más natural del mundo.

### H2 · Datos de identidad guardados en claro (SEC-02) — alta

`User` cifra el CBU con hooks (`encryptBankingInfoOnCreate`), pero el resto
del bloque de identidad queda en claro: `dni`, `dniPhotoFront`,
`dniPhotoBack`, `selfieUrl`, `licenseNumber`.

`BannedIdentity.dni` está en claro y sin cifrado en todo el modelo: es
justamente la tabla que lista documentos de personas bloqueadas.

`WithdrawalRequest.bankingInfo` queda en claro en un modelo que sí cifra
otros campos.

Quien obtenga una copia de la base —backup mal guardado, acceso de sólo
lectura, volcado para depurar— se lleva documentos y datos bancarios
legibles.

### H3 · El cuerpo del request entra entero al modelo (SEC-05) — alta

`server/routes/jobs.ts:1166`:

```js
const updateData: any = { ...req.body };
// …más abajo: delete updateData.existingImages;
```

Es una **denylist**: se borran dos campos conocidos y el resto pasa. Todo
lo que coincida con una columna de `Job` se escribe. Un cliente puede
mandar `status`, `clientId`, `price` o `permanentlyCancelled` en el body de
una edición y cambiarlos.

### H4 · Columnas sin restricciones declaradas (SEC-04) — baja

`ModuleConfig` (6 campos) y `Quote` (22 campos) no declaran obligatoriedad
en ninguna columna: la base acepta filas incompletas y la validación queda
sólo del lado de la aplicación.

## Por qué importa

- **Legal**: la Ley 25.326 de protección de datos personales trata al DNI y
  los datos bancarios como datos que exigen medidas de seguridad. Un
  backup con DNI en claro es un incumplimiento, no sólo un riesgo técnico.
- **Fraude**: DoApp mueve dinero entre desconocidos. Un documento filtrado
  habilita suplantación en una plataforma donde la identidad verificada es
  lo que sostiene la confianza.
- **Deuda que crece**: cada ruta nueva hereda el problema. Hoy son 180
  consultas; en seis meses son más.

## Alcance

**Entra:**

- Los 43 modelos de `server/models/sql/`.
- Los tres hallazgos altos (H1, H2, H3) y los dos bajos (H4).
- El verificador que impide que vuelvan.
- Migración de los datos que ya están en la base.

**No entra** (y por qué):

- Autorización entre usuarios (IDOR): es un problema de rutas, no de
  modelos. Va a la especificación 002.
- El WAF y el filtrado de requests: ya se trabajó por separado.
- Reescribir las 180 consultas una por una: el arreglo tiene que ser en el
  modelo, justamente para no depender de eso.

## Resultado esperado

| # | Criterio | Cómo se verifica |
|---|---|---|
| 1 | Ninguna consulta devuelve un secreto sin pedirlo explícitamente | `audit --ci` sin hallazgos SEC-01; y una consulta sin `attributes` a `User` no trae `password` |
| 2 | El login y el refresh de token siguen funcionando | Prueba de `POST /api/auth/login` y `/refresh` |
| 3 | DNI, fotos de documento, matrícula y datos bancarios quedan cifrados en la base | `audit --ci` sin hallazgos SEC-02; y una consulta SQL directa no muestra el dato legible |
| 4 | Los datos que ya existen quedan cifrados, sin pérdida | Migración con conteo antes/después y `down` probado |
| 5 | El bloqueo por DNI sigue funcionando | Prueba sobre `BannedIdentity` |
| 6 | Ninguna ruta acepta el body entero | `audit --ci` sin hallazgos SEC-05 |
| 7 | El auditor corre en CI y bloquea la regresión | El pipeline falla ante un hallazgo alto introducido a propósito |

## Restricciones

- **No romper sesiones activas**: los `RefreshToken` vigentes tienen que
  seguir validando después del cambio.
- **No perder datos**: cifrar es una operación sobre datos reales; tiene
  que poder correrse dos veces y volverse atrás.
- **Compatibilidad de lectura**: mientras dure la migración, el código debe
  leer tanto lo cifrado como lo que todavía está en claro.
- **Rendimiento**: cifrar no puede agregar una desencriptación por fila en
  listados; los campos cifrados no se devuelven en listas.

## Preguntas abiertas

Van a `clarify.md`: C1 a C5. El plan no se cierra hasta tenerlas
respondidas.

# Especificación 003 — Antecedentes penales para trabajadores

- **Estado**: en clarificación
- **Fecha**: 2026-10-09
- **Confirmada por**: _(pendiente)_

## Problema

Hoy no existe nada de esto. Un trabajador se registra, verifica su DNI y
puede postularse a cualquier trabajo. DoApp manda gente al domicilio de
otra persona sin ninguna verificación de antecedentes.

Lo que se pide: que al registrarse como trabajador presente el certificado
de antecedentes penales, que un revisor lo acepte o lo rechace, y que
**sin esa aceptación no pueda trabajar** — pero que pueda usar y recorrer
la app con normalidad mientras tanto.

## Dos obstáculos que cambian el diseño

Esta función es común y legítima —las plataformas de servicios a domicilio
la tienen—, pero el **cómo** no es libre. Dos cosas que conviene resolver
antes de escribir código, porque definen qué se construye:

### 1. La ley argentina restringe quién puede tratar este dato

La Ley 25.326, artículo 7 inciso 4, dice que los datos relativos a
antecedentes penales *"sólo pueden ser objeto de tratamiento por parte de
las autoridades públicas competentes, en el marco de las leyes y
reglamentaciones respectivas"*.

Guardar el PDF del certificado en la base de una plataforma privada entra
en terreno discutible. **Pedirlo y mirarlo no es lo mismo que
almacenarlo**: el camino con menos exposición es verificarlo y guardar el
resultado, no el documento.

No soy abogado y esto no es asesoramiento legal: es el motivo por el que
la decisión C1 existe y por el que conviene que lo valide un abogado antes
de desplegarlo.

### 2. Los documentos de hoy se sirven sin autenticación

`server/index.ts:281-285` monta el directorio de subidas como estático en
`/uploads` y `/api/uploads`, **sin ningún control de acceso**. Los nombres
se generan con marca de tiempo más 8 bytes aleatorios
(`upload.ts:130-136`), o sea 64 bits: no se adivina por fuerza bruta, pero
cualquiera con la URL descarga el archivo, para siempre y sin iniciar
sesión. Y las URLs se filtran solas: quedan en el HTML, en el historial
del navegador, en logs de proxy, en capturas que se mandan a soporte.

Hoy eso ya aplica a las fotos de DNI y a las matrículas. **Un certificado
de antecedentes penales por el mismo camino sería un documento penal en
una URL pública.** Con el mecanismo actual, esta función no se puede
construir de forma responsable.

Esto es un hallazgo aparte de lo que se vino a hacer, así que queda
anotado como corresponde (Constitución, artículo VIII) y propuesto como
especificación 004.

## Por qué importa

- **Es el punto del que depende la confianza.** DoApp manda desconocidos a
  casas de otras personas. Es la verificación que más justifica la
  existencia de la plataforma.
- **El dato es el más sensible que la app va a manejar.** Más que el DNI:
  un certificado filtrado puede costarle el trabajo a alguien en cualquier
  otro lado.
- **Decidir bien ahora evita deshacer después.** Si se guarda el documento
  y más adelante hay que dejar de guardarlo, hay que borrar archivos,
  backups y registros.

## Alcance

**Entra:**

- Presentar el certificado al registrarse como trabajador, y también más
  tarde desde el perfil.
- Revisión por un administrador: aceptar o rechazar con motivo.
- Estado visible para el trabajador: qué falta, en qué anda, por qué se
  rechazó.
- Bloqueo de la actividad laboral mientras no esté aceptado, **sin
  bloquear la navegación**.
- Señal para el cliente de que el trabajador está verificado, sin exponer
  el contenido del certificado.

**No entra** (y por qué):

- Arreglar el acceso público a `/uploads`: es un problema propio y más
  grande, va a la especificación 004. **003 no se despliega antes que 004**
  si la decisión C1 implica guardar archivos.
- Verificación automática contra el Registro Nacional de Reincidencia: no
  hay convenio ni API; la validación la hace una persona.
- Revisar antecedentes de clientes: se pidió sólo para trabajadores.

## Resultado esperado

| # | Criterio | Cómo se verifica |
|---|---|---|
| 1 | Un trabajador sin el trámite presentado recorre la app completa: ve trabajos, busca, chatea, edita su perfil | Recorrido manual con una cuenta sin presentar nada |
| 2 | Ese trabajador no puede postularse, y al intentarlo se le dice exactamente qué falta y cómo presentarlo | `POST /api/proposals` responde con un código propio y un mensaje accionable |
| 3 | Con el trámite aceptado, puede postularse normalmente | Misma llamada con la cuenta aceptada |
| 4 | Presentado y sin revisar todavía, sigue sin poder trabajar, y la app dice que está en revisión | Recorrido manual en estado pendiente |
| 5 | Un rechazo explica el motivo y permite volver a presentar | Rechazo desde el panel y revisión de lo que ve el trabajador |
| 6 | El contenido del certificado sólo lo ve un revisor autorizado | Intento de acceso con una cuenta común y con otro trabajador |
| 7 | El dato no queda accesible sin autenticación | Pedido directo a la URL del recurso sin sesión |
| 8 | El cliente ve que está verificado, nunca el contenido ni el motivo | Revisión de lo que devuelve el perfil público |
| 9 | Cada acceso de un revisor al dato queda registrado | Consulta del registro de auditoría después de mirar un caso |

## Restricciones

- **No romperle la app a los trabajadores que ya están.** Hay cuentas
  trabajando hoy; el bloqueo no puede dejarlas afuera de un día para el
  otro sin aviso ni plazo.
- **El bloqueo es sólo laboral.** Navegar, buscar, chatear y cobrar lo ya
  trabajado tienen que seguir funcionando.
- **El dato no se expone ni al cliente ni a otros trabajadores**, en
  ninguna respuesta de la API.
- **Minimizar lo que se guarda.** Lo que no se guarda no se filtra.

## Preguntas abiertas

C1 a C5 en `clarify.md`. La primera —si se guarda el certificado o sólo su
resultado— define todo lo demás.

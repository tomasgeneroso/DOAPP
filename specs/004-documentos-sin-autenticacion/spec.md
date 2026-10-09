# Especificación 004 — Documentos subidos accesibles sin autenticación

- **Estado**: propuesta — sin planificar
- **Fecha**: 2026-10-09
- **Origen**: hallazgo al especificar 003
- **Severidad**: alta

## Problema

El directorio de subidas se monta como estático, sin ningún control de
acceso:

```
server/index.ts:281-285
const uploadsStatic = express.static(path.join(__dirname, "../uploads"));
app.use("/uploads", uploadsCors, uploadsStatic);
app.use("/api/uploads", uploadsCors, uploadsStatic);
```

Lo único que protege un archivo es que su nombre sea difícil de adivinar:
marca de tiempo más 8 bytes aleatorios (`upload.ts:130-136`), 64 bits. No
se rompe por fuerza bruta, pero **cualquiera con la URL descarga el
archivo, sin sesión, para siempre**. Y las URLs se filtran sin que nadie
haga nada raro: quedan en el HTML de la página, en el historial del
navegador, en logs de proxies intermedios, en capturas que el usuario
manda a soporte.

Por ese mismo camino hoy se sirven:

| Documento | Campo |
|---|---|
| Foto del DNI, frente y dorso | `dniPhotoFront`, `dniPhotoBack` |
| Selfie de verificación de identidad | `selfieUrl` |
| Matrícula profesional | `licenseDocumentUrl` |
| Póliza de seguro | `insuranceDocumentUrl` |
| Comprobantes de pago | `PaymentProof.fileUrl` |

Es el mismo problema que la especificación 001 encontró en la base —datos
de identidad sin protección— pero en los archivos, y acá es peor: en la
base hace falta acceso a la base; acá basta una URL.

## Relación con 003

**003 no se puede desplegar antes que 004 si se decide guardar el
certificado de antecedentes penales** (opción B o C de su clarificación).
Si se elige la opción A —ver y descartar, sin guardar el archivo— 003
puede avanzar sola, y 004 sigue siendo necesaria por los documentos que ya
están.

## Resultado esperado (borrador)

| # | Criterio | Cómo se verifica |
|---|---|---|
| 1 | Un documento de identidad no se descarga sin sesión | Pedido directo a la URL sin cabecera de autenticación |
| 2 | Sólo lo descarga su dueño o un revisor autorizado | Pedido con la sesión de otro usuario |
| 3 | Las imágenes públicas —avatares, portfolio, blog— siguen cargando sin sesión | Recorrido de la app sin iniciar sesión |
| 4 | Las URLs que ya están en circulación dejan de funcionar | Pedido a una URL vieja |
| 5 | Cada descarga de un documento sensible queda registrada | Consulta del registro después de descargar |

## Enfoque a evaluar

Separar lo público de lo privado: avatares, portfolio y blog pueden seguir
siendo estáticos; los documentos de identidad salen del directorio
servido y pasan a una ruta con autenticación que verifica la relación
antes de devolver el archivo.

Queda por decidir qué se hace con las URLs ya repartidas y si el cambio se
hace con enlaces firmados de vida corta o con una ruta autenticada.

## Preguntas abiertas

Sin desarrollar: esta especificación está anotada, no planificada. Se
clarifica cuando se decida su prioridad frente a 001, 002 y 003.

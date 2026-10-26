# Especificación 005 — Pago combinado: saldo liberado + pasarela

- **Estado**: propuesta — sin planificar
- **Fecha**: 2026-10-24
- **Origen**: regla del dueño, 2026-10-24
- **Severidad**: media (no es un fallo: es una regla nueva que toca dinero)

## Qué pidió el dueño

> «El saldo disponible (siempre que es disponible es porque es liberado) puede usarse como saldo para pagar otros contratos; si tengo 50 de saldo disponible y el
> trabajo que quiero publicar es de 100 entonces ocupo mis 50 de saldo disponible y luego pago solo 50.»

## Qué hay hoy (hecho el 2026-10-24)

- El saldo **liberado** (el que ya se puede retirar, sin lo reservado para un retiro) paga **cualquier** publicación, pero **solo si alcanza para el total**:
  `POST /api/payments/create-order` con `paymentMethod: 'balance'` → `pagarPublicacionConSaldo`. Si no alcanza responde `402 SALDO_INSUFICIENTE`.
- Lo **pendiente** (devoluciones que esperan a que la pasarela libere el pago original) sirve únicamente para volver a publicar la **misma** publicación.
- El aumento de precio de un trabajo ya publicado **sí** se paga combinado (`liquidarAumento`, `jobs.pending_balance_deduction`): es el único camino con pago mixto.

## Qué falta

Con 50 de saldo y una publicación de 100, hoy se paga **todo** por la pasarela. Hay que poder aplicar los 50 y cobrar por la pasarela solo lo que falta, sin costo de
procesamiento sobre la parte pagada con saldo (T&C 7.9: «la parte abonada con saldo no pasa por la pasarela ni paga costo de procesamiento»).

## Por qué no se hizo junto con lo demás

Una publicación pagada de forma combinada tiene **dos** orígenes de plata, y buena parte del sistema da por hecho que hay uno. Estos lugares leen el pago de la
publicación y asumen que `payment.amount` es el total que pagó el cliente:

| Dónde | Qué asume | Qué pasaría con un pago combinado |
|---|---|---|
| `services/payoutAmount.ts` → `componentesDelPago` | `amount` = precio + comisión + IVA + procesamiento | el IVA «implícito» da negativo y la liquidación de una cancelación devuelve de menos |
| `services/controlesDeDinero.ts` (`monto_cierra_con_el_desglose`, tope del reembolso) | `amount` es lo que se puede devolver | frena (o tapa) la devolución de la parte que salió del saldo |
| `services/jobCancellation.ts` | la salida «devolución al medio de pago» devuelve todo por Mercado Pago | la pasarela solo cobró una parte: no puede devolver el total |
| `services/auditoriaSaldos.ts` (invariantes de publicaciones) | un pago por publicación, igual al total | falsos hallazgos todas las noches |
| los 5 lugares que marcan `publicationPaid = true` (`routes/payments.ts` ×3, `routes/admin/payments.ts`, webhook de AstroPay) | cualquiera de ellos confirma el pago | si uno no descuenta la parte del saldo, la plataforma regala esa parte |

## Diseño propuesto (a confirmar)

1. **Un pago, dos fuentes.** El `Payment` de la pasarela lleva `metadata.saldoAplicado = B` (lo que sale del saldo) y su `amount` es lo que cobra la pasarela
   (`splitFees(restante, 0, 0).clientPays`, el mismo cálculo de `liquidarAumento`: el procesamiento se cobra solo sobre lo que pasa por la pasarela).
2. **El saldo se descuenta al CONFIRMAR el pago**, no al crear la orden, con una sola función idempotente `aplicarSaldoDeLaPublicacion(pago, trabajo)` que
   llaman los cinco lugares de arriba. Un barrido cada 15 minutos (el de `devolucionDePresupuesto`) la corre sobre cualquier publicación pagada que todavía tenga
   saldo sin descontar: si alguien olvida un camino, se corrige solo y no se regala nada.
3. **Una función `totalDelPago(pago)` = `amount + saldoAplicado`**, usada por `componentesDelPago`, los controles de dinero y la auditoría. Es la única definición de
   «cuánto pagó el cliente» y reemplaza a `Number(pago.amount)` en esos lugares.
4. **La devolución por el medio de pago no se ofrece** en una publicación pagada de forma combinada (se devuelve a saldo, que es lo que ya pasa cuando no hay
   número de operación de la pasarela). Evita devolver por la pasarela plata que la pasarela no cobró.
5. **Si al confirmar ya no alcanza el saldo** (lo gastó mientras pagaba): se publica igual —la pasarela ya cobró—, queda anotado y se avisa a administración, como
   hace hoy el aumento de precio. El control al crear la orden vuelve a leer el saldo, así que la ventana es corta.
6. **Pantalla**: casilla «Usar mi saldo liberado ($50)» en el pago, marcada por defecto si hay saldo; el resumen muestra «Saldo −$50 · A pagar por la pasarela $50,xx».

## Criterios de aceptación (borrador)

| # | Criterio | Cómo se verifica |
|---|---|---|
| 1 | Con 50 de saldo liberado y 100 de total, la pasarela cobra lo que falta más su procesamiento, y el saldo baja 50 al confirmar | test de integración con los cinco caminos de confirmación |
| 2 | Si nadie confirma (abandonó la pasarela), el saldo no se movió | test: orden creada, nunca confirmada |
| 3 | Cancelar una publicación pagada de forma combinada devuelve precio + comisión + IVA (sin procesamiento) y la auditoría no marca nada | test de cancelación + `auditarSaldos()` limpia |
| 4 | Un camino de confirmación que no descuenta el saldo se corrige solo en el siguiente barrido | test: marcar pagada a mano y correr el barrido |
| 5 | El procesamiento no se cobra sobre la parte pagada con saldo | cuenta de `splitFees` sobre el restante |
| 6 | La web muestra el desglose y la casilla; la app no cambia hasta que se decida | captura en navegador, claro y oscuro, escritorio y celular |

## Decisiones que necesito del dueño

- **D1.** ¿La casilla viene marcada por defecto o la persona tiene que tildarla? (Recomendado: marcada, con el desglose visible antes de pagar.)
- **D2.** Si al confirmar no alcanza el saldo (punto 5): ¿se publica igual y se le reclama la diferencia (como hoy el aumento de precio), o se deja la publicación
  pendiente hasta que complete? (Recomendado: publicar igual; es lo que ya acepta el sistema.)
- **D3.** ¿La devolución al medio de pago se pierde en estas publicaciones (punto 4)? (Recomendado: sí; la devolución a saldo no tiene costo y el saldo se puede retirar.)

## Respuestas del dueño (2026-10-26)

- **D1**: la casilla del saldo **NO** viene marcada: la persona tiene que tildarla.
- **D2**: si al confirmar el pago ya no alcanza el saldo, **no se publica** (no se publica «igual y se reclama la diferencia»).
- **D3**: pidió que se la explique mejor antes de decidir (ver el mensaje del 2026-10-26: si se paga mitad con saldo y mitad con Mercado Pago y después se cancela, la plata no puede volver «a la tarjeta» por completo porque Mercado Pago solo devuelve lo que cobró).
- Falta confirmar que quiere que se arme el pago combinado (usar el saldo que haya y cobrar por Mercado Pago solo lo que falta). Hasta que lo confirme, no se construye.

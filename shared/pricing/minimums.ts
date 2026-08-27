/**
 * Montos minimos de la plataforma.
 *
 * Estaban escritos a mano en cinco lugares y no coincidian: el minimo de
 * contrato era 8.000 en contracts.ts, 5.000 en jobs.ts y en proposals.ts, y
 * 5.000 otra vez suelto dentro de un if; el minimo para publicar un trabajo era
 * 1.000. O sea que el mismo trabajo pasaba o no pasaba segun por que camino
 * entrara, y el mensaje de error decia un numero distinto del que validaba.
 *
 * Por que el minimo importa mas de lo que parece:
 *
 * La comision tiene un piso de MINIMUM_COMMISSION. Debajo de cierto precio ese
 * piso deja de ser un 8% y pasa a ser una proporcion enorme del trabajo -- en
 * uno de 3.000 pesos la comision es el 33%, y con el costo de la pasarela el
 * cliente termina pagando un 52% mas. Nadie compra eso. El minimo de contrato
 * existe para que ese caso no llegue a mostrarse.
 *
 * El punto donde el piso deja de aplicar es MINIMUM_COMMISSION / tasa: con
 * 1.000 y 8%, son 12.500 pesos. Por debajo de ahi el recargo crece rapido.
 */

/** Piso de la comision de la plataforma, en ARS. */
export const MINIMUM_COMMISSION_ARS = 1000;

/**
 * Precio minimo de un trabajo y de un contrato, en ARS.
 *
 * Puesto en el punto donde la comision minima deja de distorsionar el precio
 * (12.500 con 8%), redondeado para arriba. Debajo de esto el cliente ve un
 * recargo que no se puede justificar.
 */
export const MINIMUM_JOB_AMOUNT_ARS = 15000;

/** Retiro minimo a CBU, en ARS. */
export const MINIMUM_WITHDRAWAL_ARS = 1000;

/**
 * OJO con la inflacion.
 *
 * Estos numeros estan fijados en pesos, asi que pierden sentido solos: un
 * minimo de 15.000 en 2026 no es el mismo minimo en 2027, y nadie se va a
 * acordar de revisarlo. Los precios de las membresias ya se resolvieron atando
 * el valor al euro por este mismo motivo. Mientras estos sigan en pesos, hay
 * que revisarlos cuando se revisen las comisiones -- por eso viven todos acá y
 * no desparramados por las rutas.
 */
export const MINIMUMS_LAST_REVIEWED = '2026-08-27';

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

/** La comision mas alta que cobra la plataforma (plan FREE). */
export const TOP_COMMISSION_RATE = 0.08;

/**
 * Precio minimo de un trabajo y de un contrato, en ARS.
 *
 * No es un numero elegido: sale de la regla. Es el punto exacto donde el piso
 * de comision deja de distorsionar el precio.
 *
 * Debajo de MINIMUM_COMMISSION / tasa, el piso deja de ser un 8% y pasa a ser
 * una proporcion arbitraria del trabajo. En uno de 3.000 pesos la comision es
 * el 33%, y con el costo de la pasarela el cliente termina pagando un 52% mas.
 * Arriba de ese punto el recargo es plano y explicable.
 *
 * Derivarlo en vez de fijarlo tiene una ventaja concreta: si algun dia cambia
 * la comision o su piso, el minimo se reacomoda solo en lugar de quedar
 * apuntando a un numero que ya no significa nada.
 *
 * (Ojo: el costo marginal real de un contrato es mucho mas bajo -- unos 350
 * pesos entre soporte, disputas y contracargo esperado -- asi que lo que manda
 * acá no es el costo sino que el precio sea defendible frente al cliente.)
 */

/**
 * Dos reglas, y manda la mas exigente.
 *
 * Regla 1 -- que el piso de comision no distorsione el precio:
 *   minimo = MINIMUM_COMMISSION / tasa
 *
 * Regla 2 -- que al trabajador le quede mas de lo que se llevan entre todos:
 *   minimo > comision + IVA + pasarela
 *
 * La segunda existe porque sin ella se puede construir un caso absurdo: un
 * trabajo tan chico que el trabajador termina cobrando menos de lo que costo
 * moverle la plata. Hoy no manda -- la regla 1 da un numero mucho mas alto --
 * pero si algun dia sube la comision o la tarifa de la pasarela, esta se
 * vuelve la que corta, y conviene que el codigo se de cuenta solo en vez de
 * que lo descubra un usuario.
 *
 * Tomar el maximo de las dos es lo que hace que el minimo siga siendo una
 * consecuencia de las reglas y no un numero que alguien eligio.
 */
function minimumFromCommissionFloor(): number {
  return MINIMUM_COMMISSION_ARS / TOP_COMMISSION_RATE;
}

function minimumFromFeeSum(): number {
  // Punto donde el precio del trabajo iguala a todo lo que se le descuenta.
  // Despejado: P = c*P + IVA(c*P) + tarifa*(P + c*P + IVA)
  const vatRate = 0.21;
  const feeRate = 0.0531; // liberacion a 10 dias, el plazo configurado
  const comm = TOP_COMMISSION_RATE;
  const share = comm * (1 + vatRate) + feeRate * (1 + comm * (1 + vatRate));
  // Con la comision al piso, el peor caso es el trabajo mas chico posible.
  const conPiso = (MINIMUM_COMMISSION_ARS * (1 + vatRate)) / (1 - feeRate);
  return Math.max(conPiso, share > 0 ? MINIMUM_COMMISSION_ARS / share : 0);
}

export const MINIMUM_JOB_AMOUNT_ARS = Math.ceil(
  Math.max(minimumFromCommissionFloor(), minimumFromFeeSum()) / 1000,
) * 1000;

/** Retiro minimo a CBU, en ARS. */
export const MINIMUM_WITHDRAWAL_ARS = 1000;

/**
 * OJO con la inflacion.
 *
 * Estos numeros estan fijados en pesos, asi que pierden sentido solos: un piso
 * de 1.000 en 2026 no es el mismo piso en 2027, y nadie se va a acordar de
 * revisarlo. Las membresias ya se resolvieron atando el precio al euro por este
 * mismo motivo, y aca convendria hacer lo mismo.
 *
 * Mientras sigan en pesos, hay que revisarlos junto con las comisiones. Viven
 * todos aca, y no desparramados por las rutas, justamente para que revisarlos
 * sea tocar un archivo y no buscarlos de a uno.
 */
export const MINIMUMS_LAST_REVIEWED = '2026-08-27';

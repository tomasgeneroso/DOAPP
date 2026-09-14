import { COMMISSION_RATES } from '../constants/membershipPricing.js';
import { MP_FEE_BY_RELEASE_DAYS } from './processingCost.js';

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

/**
 * Piso de la comision de la plataforma, en EUROS.
 *
 * En euros y no en pesos porque los costos de la app son en euros -- VPS,
 * dominio, publicidad, Didit -- y un piso fijado en pesos se licua solo:
 * 1.000 pesos en 2026 no son 1.000 pesos en 2027, y nadie se acuerda de
 * revisarlo. Es la misma decision que ya se tomo con las membresias.
 *
 * EUR 2 es unas ocho veces el costo marginal de un contrato (unos 450 pesos),
 * con margen para que el piso siga cubriendolo aunque el costo suba.
 *
 * OJO, este numero arrastra el minimo de contratacion: MINIMUM_JOB_AMOUNT_ARS
 * se deriva de piso / comision, asi que duplicar el piso duplica el minimo
 * (EUR 1 -> $18.000; EUR 2 -> $36.000 con el euro a 1.800). No es un cambio
 * de margen: es un cambio de que trabajos entran a la plataforma.
 */
export const MINIMUM_COMMISSION_EUR = 2;

/**
 * El piso convertido a pesos.
 *
 * Se pasa la cotizacion desde afuera porque este modulo es compartido con el
 * cliente y el mobile, que no pueden consultar la API de cambio. El valor de
 * respaldo sirve para que una pantalla pueda mostrar algo si la cotizacion no
 * llego; el cobro real siempre usa la del dia.
 */
export function minimumCommissionArs(eurArs = 1800): number {
  return Math.round(MINIMUM_COMMISSION_EUR * eurArs);
}

/**
 * Compatibilidad: hay codigo que todavia lee una constante en pesos.
 * Usa la cotizacion de respaldo, asi que sirve para validar y mostrar, no
 * para calcular un cobro.
 */
export const MINIMUM_COMMISSION_ARS = minimumCommissionArs();

/**
 * La comision mas alta que cobra la plataforma (plan FREE).
 *
 * Se deriva de COMMISSION_RATES en vez de repetirse: estaba escrita al 8% aca
 * mientras la comision real ya era 10%, asi que los minimos se calculaban con
 * una tasa que no existia.
 */
export const TOP_COMMISSION_RATE = COMMISSION_RATES.free / 100;

/**
 * Lo obligatorio es el piso de comision, no un precio minimo de trabajo.
 *
 * Antes el minimo se derivaba del piso: `piso / tasa`, que es el precio a
 * partir del cual el piso deja de morder. Con el piso en EUR 2 eso daba
 * $36.000, y dejaba afuera casi toda la demanda real de oficios -- la visita
 * del plomero, el arreglo electrico, el service de la estufa.
 *
 * La regla es otra y es mas simple: **un trabajo puede valer lo que valga; lo
 * que no puede es generar menos comision que el piso.** Si el trabajo es chico,
 * la comision es el piso y se cobra el piso. La consecuencia es que en trabajos
 * chicos la comision efectiva es mayor al 10%, y eso **hay que mostrarlo**, no
 * esconderlo: es exactamente lo que hace Mercado Libre con su cargo fijo en
 * ventas de bajo monto.
 *
 * Queda un solo minimo, y es tecnico: el trabajo no puede valer menos que la
 * comision que genera. Por debajo de ahi el cliente pagaria mas de comision que
 * de trabajo, el trabajador cobraria una fraccion del precio, y no hay forma de
 * explicarlo. Ese punto es exactamente el piso.
 *
 * Sigue existiendo la regla de sanidad: que al trabajador le quede algo despues
 * de la pasarela. Hoy no manda -- da un numero mucho mas chico que el piso --
 * pero si algun dia sube la tarifa, corta sola en vez de que lo descubra un
 * usuario.
 */
function minimumFromWorkerTakeaway(): number {
  // Punto donde al trabajador le queda cero: P*(1-tarifa) = tarifa*(comision+IVA).
  // Con la comision al piso, que es el peor caso para un trabajo chico.
  const vatRate = 0.21;
  const feeRate = MP_FEE_BY_RELEASE_DAYS[0].withVat; // el tramo mas caro
  const comisionConIva = MINIMUM_COMMISSION_ARS * (1 + vatRate);
  return (feeRate * comisionConIva) / (1 - feeRate);
}

export const MINIMUM_JOB_AMOUNT_ARS = Math.ceil(
  Math.max(MINIMUM_COMMISSION_ARS, minimumFromWorkerTakeaway()) / 100,
) * 100;

/**
 * La comision efectiva de un trabajo, como fraccion del precio.
 *
 * En trabajos por encima de `piso / tasa` es la tasa nominal (10%). Por debajo,
 * el piso manda y la proporcion sube. Las pantallas tienen que mostrar ESTE
 * numero, no el 10%, cuando el piso esta mordiendo: un cliente que ve "10%" y
 * le cobran 36% tiene razon en sentirse enganado.
 */
export function comisionEfectiva(precio: number, eurArs?: number): number {
  const p = Math.max(0, Number(precio) || 0);
  if (p <= 0) return 0;
  const piso = eurArs ? minimumCommissionArs(eurArs) : MINIMUM_COMMISSION_ARS;
  return Math.max(p * TOP_COMMISSION_RATE, piso) / p;
}

/** A partir de que precio la comision deja de ser el piso y pasa a ser la tasa. */
export function precioDondeElPisoDejaDeMorder(eurArs?: number): number {
  const piso = eurArs ? minimumCommissionArs(eurArs) : MINIMUM_COMMISSION_ARS;
  return piso / TOP_COMMISSION_RATE;
}

/**
 * Lo que cuesta procesar un contrato mas: soporte esperado, disputas y
 * contracargo esperado. No escala con el precio salvo el contracargo, que es
 * el unico proporcional.
 */
export const MARGINAL_COST_PER_CONTRACT_ARS = 450;

/**
 * Monto minimo de una ampliacion de contrato, en ARS.
 *
 * A la ampliacion NO se le aplica el piso de comision, y la razon es que el
 * piso existe para cubrir el costo fijo de un contrato -- verificar identidad,
 * emparejar, abrir el expediente -- y ese costo ya lo pago el contrato
 * original. Una ampliacion es marginal: el unico costo que agrega es la
 * pasarela y un poco de soporte.
 *
 * Aplicarle el piso daria absurdos: en una ampliacion de 2.000 pesos la
 * comision seria el 50%.
 *
 * Entonces la regla es otra: la ampliacion tiene que ser lo bastante grande
 * como para que su propia comision cubra lo que cuesta procesarla (unos 450
 * pesos entre soporte, disputas y contracargo esperado). Con comision del 10%,
 * eso son 4.500; redondeado, 5.000.
 */
export const MINIMUM_EXTENSION_ARS = Math.ceil(
  (MARGINAL_COST_PER_CONTRACT_ARS / TOP_COMMISSION_RATE) / 1000,
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

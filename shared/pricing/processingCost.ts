/**
 * Costo de procesamiento de la pasarela de pago.
 *
 * Por que existe como linea separada:
 *
 * La plataforma cobra el trabajo completo y despues le paga al trabajador. El
 * dinero pasa por la cuenta de DOAPP, asi que Mercado Pago cobra su comision
 * sobre el BRUTO -- sobre los $100.000 del trabajo, no sobre los $8.000 que
 * gana la plataforma. Sin esta linea, esa diferencia la pone DOAPP de su
 * bolsillo en cada operacion, y durante la beta (comision 0%) cada trabajo es
 * una perdida directa.
 *
 * Se cobra por separado y con nombre propio a proposito: no es una comision de
 * DOAPP, es un costo de terceros que se traslada. Mezclarlo con la comision
 * haria que la beta "sin comision" muestre un cargo llamado comision.
 */

/**
 * Lo que cobra la pasarela, como fraccion del total cobrado, IVA incluido.
 *
 * OJO: este numero tiene que coincidir con el panel de Mercado Pago, y depende
 * del plazo de liberacion configurado en la cuenta (mas rapido = mas caro). Se
 * lee del entorno para poder corregirlo sin recompilar cuando cambie la tarifa
 * o el plazo.
 *
 * El default corresponde a acreditacion inmediata, que es el tramo mas caro:
 * si el valor real es menor, se cobra de mas y se nota; si fuera al reves, se
 * pierde plata en silencio. Ante la duda, el error caro es el invisible.
 */
export function getProcessingFeeRate(): number {
  const raw = typeof process !== 'undefined' ? process.env?.PAYMENT_PROCESSING_FEE_RATE : undefined;
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed >= 0 && parsed < 0.5) return parsed;
  return 0.0773; // 6,39% + IVA 21%
}

export interface ProcessingCostBreakdown {
  /** Lo que hay que recibir limpio: trabajo + comision + IVA. */
  subtotal: number;
  /** Lo que se le suma al cliente para cubrir a la pasarela. */
  processingCost: number;
  /** Lo que finalmente se cobra. */
  total: number;
  /** La tarifa usada, para poder mostrarla y auditarla. */
  rate: number;
}

/**
 * Cuanto sumarle al cliente para que, despues de que la pasarela cobre lo suyo,
 * queden exactamente `subtotal` pesos en la cuenta.
 *
 * No es `subtotal * tarifa`. La pasarela cobra sobre el TOTAL cobrado, no sobre
 * el subtotal, asi que sumar el porcentaje del subtotal deja siempre corto:
 *
 *   subtotal 100.000, tarifa 7,73%
 *   mal:  100.000 + 7.730  = 107.730  -> la pasarela cobra 8.327, quedan 99.403  (faltan 597)
 *   bien: 100.000 / 0,9227 = 108.378  -> la pasarela cobra 8.378, quedan 100.000
 *
 * El error es chico por operacion y constante: con volumen, es una perdida
 * permanente que nunca aparece como tal en ningun lado.
 */
export function calculateProcessingCost(
  subtotal: number,
  rate: number = getProcessingFeeRate(),
): ProcessingCostBreakdown {
  if (!(subtotal > 0) || rate <= 0) {
    return { subtotal: round2(subtotal), processingCost: 0, total: round2(subtotal), rate };
  }

  const total = round2(subtotal / (1 - rate));
  return {
    subtotal: round2(subtotal),
    processingCost: round2(total - subtotal),
    total,
    rate,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Texto unico para las dos apps, asi no se explica distinto en cada pantalla. */
export const PROCESSING_COST_LABEL = 'Costo de procesamiento';

export const PROCESSING_COST_HELP =
  'Es lo que cobra la pasarela de pago por procesar la transacción. No es una comisión de DOAPP: se traslada tal cual, sin recargo.';

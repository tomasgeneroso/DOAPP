import { IVA } from '../../shared/pricing/processingCost.js';

/**
 * Cuanto cobra el trabajador por un contrato. UNA cuenta, para los tres
 * lugares que la hacian distinto:
 *
 *   completar a mano     precio - pasarela (tarifa fija)      correcto en forma
 *   auto-confirmacion    precio entero                        absorbia la pasarela
 *   mark-paid del admin  precio - COMISION                    le cobraba al trabajador
 *                                                              lo que ya pago el cliente
 *
 * La regla (shared/pricing/processingCost.ts): el cliente paga precio +
 * comision + procesamiento + IVA; el trabajador recibe el precio, entero. Ni
 * la comision ni la pasarela lo tocan: las dos las pago el cliente al pagar.
 * Lo unico que le baja el pago es una devolucion parcial por disputa.
 */

interface ContratoParaPago {
  price: number | string;
  allocatedAmount?: number | string | null;
}

interface PagoParaPago {
  /** Lo ya devuelto al cliente por una disputa (parcial). Sale del bruto del trabajador. */
  refundedAmount?: number | string | null;
}

export interface MontoTrabajador {
  /** Lo que se le transfiere. */
  neto: number;
  /** Su parte del precio, antes de descontar lo devuelto al cliente. */
  bruto: number;
  /** Lo que se le devolvio al cliente por disputa y por eso no cobra el trabajador. */
  devueltoAlCliente: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function montoParaElTrabajador(contract: ContratoParaPago, payment?: PagoParaPago | null): MontoTrabajador {
  const precio = Number(contract.price) || 0;
  const parte = contract.allocatedAmount != null && Number(contract.allocatedAmount) > 0
    ? Number(contract.allocatedAmount)
    : precio;

  // En un contrato con varios trabajadores lo devuelto se reparte proporcional
  // a lo que le toca a cada uno, no entero a cada uno.
  const proporcion = precio > 0 ? parte / precio : 1;

  // Una disputa resuelta con devolucion parcial ya le dio X al cliente. Eso
  // sale de la parte del trabajador: sin esto, tras una parcial se le pagaba
  // el precio entero y la plataforma ponia la diferencia.
  const devueltoAlCliente = r2(Math.max(0, Number(payment?.refundedAmount) || 0) * proporcion);
  const neto = Math.max(0, r2(parte - devueltoAlCliente));
  return { neto, bruto: r2(parte), devueltoAlCliente };
}

export interface ComponentesDelPago {
  /** Comision de DOAPP, sin IVA. */
  comision: number;
  /** IVA sobre la comision. */
  iva: number;
  /** Procesamiento cobrado al cliente, CON su IVA. No vuelve en ninguna cancelacion. */
  procesamiento: number;
}

/**
 * Descompone un pago de publicacion en sus partes, para liquidar una
 * cancelacion. `amount` es el total (precio + comision + IVA + procesamiento
 * + su IVA), `platformFee` la comision y `processingCharge` el procesamiento
 * sin IVA. El IVA de la comision es lo que queda.
 *
 * Los pagos anteriores al cargo de procesamiento tienen processingCharge null
 * y la cuenta sigue cerrando: procesamiento 0, y el resto es IVA.
 */
export function componentesDelPago(
  pago: { amount?: number | string | null; platformFee?: number | string | null; processingCharge?: number | string | null } | null | undefined,
  precio: number,
): ComponentesDelPago {
  if (!pago) return { comision: 0, iva: 0, procesamiento: 0 };
  const total = Number(pago.amount) || 0;
  const comision = Math.max(0, Number(pago.platformFee) || 0);
  const cargo = Math.max(0, Number(pago.processingCharge) || 0);
  const procesamiento = r2(cargo * (1 + IVA));
  const iva = Math.max(0, r2(total - precio - comision - procesamiento));
  return { comision, iva, procesamiento };
}

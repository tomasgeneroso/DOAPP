import { splitFees, getProcessingFeeRate, pasarelaSinIva } from '../../shared/pricing/processingCost.js';

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
 * comision + IVA; la pasarela se lleva su tarifa del total; el trabajador
 * recibe el precio menos esa tarifa. La comision es del cliente y no toca al
 * trabajador.
 *
 * La tarifa que se descuenta es la REAL del pago aprobado (payment.processingFee,
 * leida de fee_details en el webhook) cuando existe. La del .env es respaldo:
 * el cliente elige el medio en el checkout y la tarifa cambia con el medio.
 *
 * Y SIN el IVA de la pasarela: MP descuenta tarifa + IVA, pero ese IVA es
 * credito fiscal de DOAPP (lo recupera al liquidar el IVA de su comision).
 * fee_details viene con IVA incluido, asi que se le saca; la tarifa del .env
 * ya esta sin IVA.
 */

interface ContratoParaPago {
  price: number | string;
  allocatedAmount?: number | string | null;
  commission?: number | string | null;
}

interface PagoParaPago {
  processingFee?: number | string | null;
  amount?: number | string | null;
  platformFee?: number | string | null;
}

export interface MontoTrabajador {
  /** Lo que se le transfiere. */
  neto: number;
  /** Su parte del precio, antes de la pasarela. */
  bruto: number;
  /** Pasarela que absorbe, ya prorrateada si el contrato tiene varios trabajadores. */
  pasarela: number;
  /** De donde salio la pasarela: del pago real o de la tarifa configurada. */
  origenTarifa: 'pago_real' | 'tarifa_configurada';
}

export function montoParaElTrabajador(contract: ContratoParaPago, payment?: PagoParaPago | null): MontoTrabajador {
  const precio = Number(contract.price) || 0;
  const bruto = contract.allocatedAmount != null && Number(contract.allocatedAmount) > 0
    ? Number(contract.allocatedAmount)
    : precio;

  // En un contrato con varios trabajadores la pasarela se reparte proporcional
  // a lo que le toca a cada uno, no entera a cada uno.
  const proporcion = precio > 0 ? bruto / precio : 1;

  const feeReal = Number(payment?.processingFee);
  let pasarelaTotal: number;
  let origenTarifa: MontoTrabajador['origenTarifa'];

  if (Number.isFinite(feeReal) && feeReal > 0) {
    pasarelaTotal = pasarelaSinIva(feeReal);
    origenTarifa = 'pago_real';
  } else {
    const comision = Number(contract.commission) || Number(payment?.platformFee) || 0;
    const total = Number(payment?.amount) || 0;
    const iva = total > 0 ? Math.max(0, total - precio - comision) : Math.round(comision * 0.21 * 100) / 100;
    pasarelaTotal = splitFees(precio, comision, iva, getProcessingFeeRate()).processingCost;
    origenTarifa = 'tarifa_configurada';
  }

  const pasarela = Math.round(pasarelaTotal * proporcion * 100) / 100;
  const neto = Math.max(0, Math.round((bruto - pasarela) * 100) / 100);
  return { neto, bruto, pasarela, origenTarifa };
}

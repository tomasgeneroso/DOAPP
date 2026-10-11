import { patch } from './api';

/**
 * Cambiar el presupuesto de un trabajo publicado, desde el celular.
 *
 * Subir el precio obliga a pagar la diferencia (más su comisión, el costo de procesamiento y el IVA, menos el saldo a
 * favor que se use); el pago queda en revisión de un administrador y, si en 24 horas nadie lo revisa, se aprueba solo
 * siempre que Mercado Pago lo haya confirmado bien. Bajar el precio se acredita al saldo. Las reglas son las del
 * servidor; esto sólo arma el pedido, valida lo que se puede validar antes de mandarlo y traduce la respuesta.
 */

export const PRECIO_MAXIMO = 999_999_999;
export const LARGO_MINIMO_DEL_MOTIVO = 10;

/**
 * «12.000,50» → 12000.5; «12.000» → 12000; «12000» → 12000; «$ 1.500» → 1500. Lo que no se entiende da NaN.
 * En el formato argentino el punto separa los miles y la coma los decimales.
 */
export function parsearNumeroArgentino(texto: string): number {
  const limpio = String(texto ?? '').replace(/[\s$]/g, '');
  if (!limpio) return NaN;
  if (limpio.includes(',')) {
    const normal = limpio.replace(/\./g, '').replace(',', '.');
    return /^\d+(\.\d+)?$/.test(normal) ? parseFloat(normal) : NaN;
  }
  if (/^\d{1,3}(\.\d{3})+$/.test(limpio)) return parseFloat(limpio.replace(/\./g, ''));
  return /^\d+(\.\d+)?$/.test(limpio) ? parseFloat(limpio) : NaN;
}

export type ValidacionDelCambio = { ok: true; precio: number; motivo: string } | { ok: false; error: string };

export function validarCambioDePresupuesto(texto: string, motivo: string, precioActual: number): ValidacionDelCambio {
  const precio = parsearNumeroArgentino(texto);
  if (!Number.isFinite(precio) || precio <= 0) return { ok: false, error: 'El nuevo presupuesto tiene que ser un número mayor a cero.' };
  if (precio > PRECIO_MAXIMO) return { ok: false, error: 'El presupuesto máximo es $999.999.999.' };
  if (Math.abs(precio - Number(precioActual)) < 0.005) return { ok: false, error: 'Es el mismo presupuesto que ya tiene el trabajo.' };
  const m = String(motivo ?? '').trim();
  if (m.length < LARGO_MINIMO_DEL_MOTIVO) return { ok: false, error: `Contá el motivo en al menos ${LARGO_MINIMO_DEL_MOTIVO} caracteres.` };
  return { ok: true, precio, motivo: m };
}

export interface DesgloseDelAumento {
  oldPrice?: number;
  newPrice?: number;
  priceDifference?: number;
  commission?: number;
  vat?: number;
  balanceToUse?: number;
  processingCharge?: number;
  amountToPay?: number;
}

export type ResultadoDelCambio =
  | { tipo: 'aplicado'; mensaje: string }
  | { tipo: 'requierePago'; mensaje: string; aPagar: number; desglose: DesgloseDelAumento }
  | { tipo: 'aumentoEnRevision'; mensaje: string }
  | { tipo: 'conContrato'; mensaje: string }
  | { tipo: 'error'; mensaje: string };

/** Traduce la respuesta de `PATCH /jobs/:id/budget`. Lo que falte o venga raro es un error, no un éxito. */
export function interpretarCambioDePresupuesto(res: any): ResultadoDelCambio {
  if (res?.requiresPayment === true && res?.status === 402) {
    const aPagar = Number(res?.amountRequired ?? res?.breakdown?.amountToPay);
    if (Number.isFinite(aPagar) && aPagar > 0) {
      return { tipo: 'requierePago', mensaje: String(res?.message || ''), aPagar, desglose: res?.breakdown || {} };
    }
  }
  if (res?.success === true) return { tipo: 'aplicado', mensaje: String(res?.message || 'Presupuesto actualizado.') };
  if (res?.code === 'AUMENTO_PAGADO_EN_REVISION') {
    return { tipo: 'aumentoEnRevision', mensaje: String(res?.message || 'Ya pagaste un aumento y está en revisión.') };
  }
  if (res?.status === 400 && String(res?.redirectTo || '').includes('contracts')) {
    return {
      tipo: 'conContrato',
      mensaje: 'Este trabajo ya tiene un contrato en curso: el precio se cambia desde el contrato, no desde acá.',
    };
  }
  return { tipo: 'error', mensaje: String(res?.message || 'No se pudo cambiar el presupuesto.') };
}

export async function cambiarPresupuesto(jobId: string, precio: number, motivo: string): Promise<ResultadoDelCambio> {
  return interpretarCambioDePresupuesto(await patch<any>(`/jobs/${jobId}/budget`, { newPrice: precio, reason: motivo }));
}

export type ResultadoDeCancelar = { ok: true; mensaje: string } | { ok: false; mensaje: string; yaPagado?: boolean };

/** Cancelar un cambio de presupuesto todavía sin pagar. Con el aumento ya pagado el servidor lo rechaza (409). */
export async function cancelarCambioDePresupuesto(jobId: string): Promise<ResultadoDeCancelar> {
  const res: any = await patch<any>(`/jobs/${jobId}/cancel-budget-change`, {});
  if (res?.success === true) return { ok: true, mensaje: String(res?.message || 'Cambio cancelado.') };
  return { ok: false, mensaje: String(res?.message || 'No se pudo cancelar.'), yaPagado: res?.code === 'AUMENTO_PAGADO_EN_REVISION' };
}

/** ¿Se le ofrece cambiar el presupuesto? Sólo al dueño de un trabajo abierto y sin un cambio a medias. */
export function puedeCambiarElPresupuesto(job: any, soyElDueno: boolean): boolean {
  return Boolean(soyElDueno && job && String(job.status) === 'open' && !job.pendingNewPrice && !job.aumentoPendiente);
}

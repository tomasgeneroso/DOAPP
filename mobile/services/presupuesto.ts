import { del, get, patch, post } from './api';

/**
 * Cambiar el presupuesto de un trabajo publicado, desde el celular.
 *
 * Primero se pide el análisis (qué va a pasar: saldos, postulaciones que se quitan, quién tiene que aceptar) y se muestra; recién con la aceptación se cambia.
 * Con alguien ya elegido, queda como pedido hasta que esa persona lo acepte. Las reglas son las del servidor (shared/jobs/cambioDePresupuesto.ts); esto sólo
 * arma el pedido, valida lo que se puede validar antes de mandarlo y traduce la respuesta.
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
  // `aceptaEfectos`: la pantalla ya mostró lo que va a pasar y la persona tocó «Aceptar».
  return interpretarCambioDePresupuesto(await patch<any>(`/jobs/${jobId}/budget`, { newPrice: precio, reason: motivo, aceptaEfectos: true }));
}

export type RevisionDelCambio = { tipo: 'puede'; efectos: string[]; conAceptacion: boolean } | { tipo: 'no'; mensaje: string } | { tipo: 'sin_analisis' };

/** Lo que va a pasar si el presupuesto cambia. Con un servidor que todavía no ofrece el análisis, se sigue sin él. */
export async function revisarCambioDePresupuesto(jobId: string, precio: number): Promise<RevisionDelCambio> {
  const res: any = await post<any>(`/jobs/${jobId}/budget/analisis`, { newPrice: precio });
  if (res?.status === 404) return { tipo: 'sin_analisis' };
  if (res?.success !== true || !res?.analisis) return { tipo: 'no', mensaje: String(res?.message || 'No pudimos revisar el cambio. Probá de nuevo.') };
  if (!res.analisis.puede) return { tipo: 'no', mensaje: String(res.analisis.bloqueo?.mensaje || 'Ahora no se puede cambiar el presupuesto.') };
  return { tipo: 'puede', efectos: (res.efectos || []).map(String), conAceptacion: res.analisis.modo === 'con_aceptacion' };
}

export interface PedidoDeCambioEnCurso {
  soy: 'cliente' | 'elegido';
  estado: 'esperando_respuesta' | 'esperando_pago';
  precioAnterior: number;
  precioNuevo: number;
  motivo: string;
  elegidos: Array<{ trabajadorId: string; nombre: string; montoActual: number; montoNuevo: number; respuesta: 'pendiente' | 'acepta' | 'rechaza' }>;
}

/** El cambio en curso de este trabajo para quien mira; null si no hay (o no le toca). */
export async function leerPedidoDeCambio(jobId: string): Promise<PedidoDeCambioEnCurso | null> {
  const res: any = await get<any>(`/jobs/${jobId}/budget/solicitud`);
  return res?.success === true && res?.solicitud ? (res.solicitud as PedidoDeCambioEnCurso) : null;
}

export async function responderPedidoDeCambio(jobId: string, acepta: boolean): Promise<{ ok: boolean; mensaje: string }> {
  const res: any = await post<any>(`/jobs/${jobId}/budget/solicitud/responder`, { acepta });
  return { ok: res?.success === true, mensaje: String(res?.message || (res?.success ? 'Listo.' : 'No pudimos guardar tu respuesta. Probá de nuevo.')) };
}

export async function retirarPedidoDeCambio(jobId: string): Promise<{ ok: boolean; mensaje: string }> {
  const res: any = await del<any>(`/jobs/${jobId}/budget/solicitud`);
  return { ok: res?.success === true, mensaje: String(res?.message || (res?.success ? 'Listo.' : 'No se pudo retirar el pedido.')) };
}

export type ResultadoDeCancelar = { ok: true; mensaje: string } | { ok: false; mensaje: string; yaPagado?: boolean };

/** Cancelar un cambio de presupuesto todavía sin pagar. Con el aumento ya pagado el servidor lo rechaza (409). */
export async function cancelarCambioDePresupuesto(jobId: string): Promise<ResultadoDeCancelar> {
  const res: any = await patch<any>(`/jobs/${jobId}/cancel-budget-change`, {});
  if (res?.success === true) return { ok: true, mensaje: String(res?.message || 'Cambio cancelado.') };
  return { ok: false, mensaje: String(res?.message || 'No se pudo cancelar.'), yaPagado: res?.code === 'AUMENTO_PAGADO_EN_REVISION' };
}

/** ¿Se le ofrece cambiar el presupuesto? Al dueño de un trabajo publicado (abierto o en curso) y sin un cambio a medias; el análisis del servidor dice el resto. */
export function puedeCambiarElPresupuesto(job: any, soyElDueno: boolean): boolean {
  return Boolean(soyElDueno && job && ['open', 'in_progress'].includes(String(job.status)) && !job.pendingNewPrice && !job.aumentoPendiente);
}

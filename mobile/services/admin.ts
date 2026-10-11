import { get, post, put } from './api';

/**
 * Paneles de administración del celular: pagos, contratos, publicaciones y disputas.
 *
 * Mueven plata o publican cosas, así que las reglas son las del servidor (que revisa el rol y el estado de cada cosa);
 * acá sólo se decide qué botones se le ofrecen a quien administra, qué se le pregunta antes de ejecutar y cómo se le
 * cuenta lo que respondió el servidor.
 */

// ---------------------------------------------------------------------------
// Pagos
// ---------------------------------------------------------------------------

export type AccionDePago = 'aprobar' | 'rechazar' | 'verificar_garantia';

const TIPOS_DE_CONTRATO = ['contract_payment', 'escrow_deposit', 'contract'];

/**
 * Qué se le puede hacer a un pago según dónde está.
 *  - «pendiente de verificación»: aprobarlo o rechazarlo.
 *  - «verificado» y de un contrato: verificar la garantía (es el paso que retiene el dinero y arranca el contrato).
 * Cualquier otro estado no tiene acciones: ya se resolvió o todavía no llegó.
 */
export function accionesDelPago(p: { status?: string; paymentType?: string; type?: string } | null | undefined): AccionDePago[] {
  const estado = String(p?.status ?? '');
  const tipo = String(p?.paymentType ?? p?.type ?? '');
  if (estado === 'pending_verification') return ['aprobar', 'rechazar'];
  if (estado === 'verified' && TIPOS_DE_CONTRATO.includes(tipo)) return ['verificar_garantia'];
  return [];
}

export function tituloDelPago(p: any): string {
  return String(p?.displayInfo?.title || p?.description || 'Pago');
}

export function etiquetaDelTipoDePago(tipo: unknown): string {
  const t = String(tipo ?? '');
  const mapa: Record<string, string> = {
    job_publication: 'Publicación de un trabajo',
    budget_increase: 'Aumento de precio',
    contract_payment: 'Garantía de un contrato',
    escrow_deposit: 'Garantía de un contrato',
    contract: 'Garantía de un contrato',
    membership: 'Membresía',
    on_completion: 'Orden de pago al terminar',
  };
  return mapa[t] || t || 'Pago';
}

export function etiquetaDelEstadoDePago(estado: unknown): string {
  const e = String(estado ?? '');
  const mapa: Record<string, string> = {
    pending: 'Pendiente',
    processing: 'En proceso',
    pending_verification: 'Pendiente de verificación',
    verified: 'Verificado',
    approved: 'Aprobado',
    held_escrow: 'En garantía',
    confirmed_for_payout: 'Listo para pagar al trabajador',
    completed: 'Completado',
    rejected: 'Rechazado',
    refunded: 'Reembolsado',
    cancelled: 'Cancelado',
    failed: 'Fallido',
  };
  return mapa[e] || e;
}

/** Lo que se le pregunta a quien administra antes de ejecutar: es plata, no se hace de un toque. */
export function confirmacionDeAccion(accion: AccionDePago, p: any): { titulo: string; mensaje: string } {
  const monto = `$${Number(p?.amount ?? 0).toLocaleString('es-AR')}`;
  const que = tituloDelPago(p);
  const porMp = p?.mercadopagoVerifiedAt
    ? 'Mercado Pago ya confirmó este pago (monto exacto, sin cuotas ni cupón).'
    : 'Este pago NO tiene la confirmación automática de Mercado Pago: revisalo con cuidado.';
  if (accion === 'aprobar') return { titulo: 'Aprobar el pago', mensaje: `${que}\n${monto}\n\n${porMp}` };
  if (accion === 'verificar_garantia') {
    return { titulo: 'Verificar la garantía', mensaje: `${que}\n${monto}\n\nEl dinero queda retenido y el contrato arranca.` };
  }
  return { titulo: 'Rechazar el pago', mensaje: `${que}\n${monto}\n\nEl cliente recibe el motivo.` };
}

export function motivoValido(motivo: unknown, minimo: number): boolean {
  return String(motivo ?? '').trim().length >= minimo;
}

export const listarPagosPendientes = () => get<any>('/admin/payments/pending?limit=50');
export const aprobarPago = (id: string) => post<any>(`/admin/payments/${id}/approve`, {});
export const rechazarPago = (id: string, motivo: string) => post<any>(`/admin/payments/${id}/reject`, { reason: motivo.trim() });
export const verificarGarantia = (id: string) => post<any>(`/admin/payments/${id}/verify-escrow`, {});

// ---------------------------------------------------------------------------
// Contratos y publicaciones
// ---------------------------------------------------------------------------

export const listarContratosPorAprobar = () => get<any>('/admin/contracts?status=pending&limit=50');
export const aprobarContrato = (id: string) => post<any>(`/admin/contracts/${id}/approve`, {});
export const rechazarContrato = (id: string, motivo: string) => post<any>(`/admin/contracts/${id}/reject`, { reason: motivo.trim() });

export const listarPublicacionesPorAprobar = () => get<any>('/admin/jobs?status=pending_approval&limit=50');
export const aprobarPublicacion = (id: string) => put<any>(`/admin/jobs/${id}/status`, { status: 'approved' });
export const rechazarPublicacion = (id: string, motivo: string) =>
  put<any>(`/admin/jobs/${id}/status`, { status: 'rejected', rejectedReason: motivo.trim() });

/** Un rechazo de publicación necesita un motivo de al menos 10 caracteres: lo lee el cliente. */
export const LARGO_MINIMO_MOTIVO_PUBLICACION = 10;
export const LARGO_MINIMO_MOTIVO = 5;

// ---------------------------------------------------------------------------
// Disputas
// ---------------------------------------------------------------------------

export type TipoDeResolucion = 'full_release' | 'full_refund' | 'partial_refund' | 'no_action';

export const TIPOS_DE_RESOLUCION: Array<{ valor: TipoDeResolucion; etiqueta: string; ayuda: string }> = [
  { valor: 'full_release', etiqueta: 'Liberar todo al trabajador', ayuda: 'El dinero retenido va al trabajador.' },
  { valor: 'full_refund', etiqueta: 'Reembolso total al cliente', ayuda: 'Se devuelve el precio del trabajo; la comisión no se devuelve.' },
  { valor: 'partial_refund', etiqueta: 'Reembolso parcial', ayuda: 'Indicá cuánto se le devuelve al cliente; el resto va al trabajador.' },
  { valor: 'no_action', etiqueta: 'Sin movimiento de dinero', ayuda: 'Se cierra sin mover plata.' },
];

export const requiereMonto = (tipo: TipoDeResolucion): boolean => tipo === 'partial_refund';
/** Una devolución puede haberse hecho «por fuera» (transferencia, otro medio): el casillero sólo aplica a devoluciones. */
export const admiteDevolucionManual = (tipo: TipoDeResolucion): boolean => tipo === 'full_refund' || tipo === 'partial_refund';

export interface ResolucionDeDisputa {
  tipo: TipoDeResolucion | '';
  explicacion: string;
  monto: string;
  devolucionManual: boolean;
}

export type ValidacionDeResolucion = { ok: true; cuerpo: Record<string, unknown> } | { ok: false; error: string };

export function validarResolucion(r: ResolucionDeDisputa): ValidacionDeResolucion {
  if (!r.tipo) return { ok: false, error: 'Elegí cómo se resuelve la disputa.' };
  if (String(r.explicacion ?? '').trim().length < LARGO_MINIMO_MOTIVO) return { ok: false, error: 'Explicá la resolución (la leen las dos partes).' };
  const cuerpo: Record<string, unknown> = { resolution: r.explicacion.trim(), resolutionType: r.tipo };
  if (requiereMonto(r.tipo)) {
    const monto = Number(String(r.monto ?? '').replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(monto) || monto <= 0) return { ok: false, error: 'Para un reembolso parcial indicá el monto a devolver (mayor que cero).' };
    cuerpo.refundAmount = monto;
  }
  if (admiteDevolucionManual(r.tipo) && r.devolucionManual) cuerpo.devolucionManual = true;
  return { ok: true, cuerpo };
}

export type ResultadoDeResolver =
  | { ok: true; mensaje: string }
  | { ok: false; mensaje: string; pideDevolucionManual?: boolean };

/** Traduce la respuesta de resolver una disputa. Un 409 «devolución manual requerida» dice que hay que confirmar la devolución por fuera. */
export function interpretarResolucion(res: any): ResultadoDeResolver {
  if (res?.success === true) return { ok: true, mensaje: String(res?.message || 'Disputa resuelta.') };
  if (res?.codigo === 'DEVOLUCION_MANUAL_REQUERIDA' || res?.code === 'DEVOLUCION_MANUAL_REQUERIDA') {
    return {
      ok: false,
      pideDevolucionManual: true,
      mensaje: String(res?.message || 'Este pago no es de Mercado Pago: si la devolución ya se hizo por fuera, marcá «La devolución se hizo por fuera» y resolvé de nuevo.'),
    };
  }
  return { ok: false, mensaje: String(res?.message || 'No se pudo resolver la disputa.') };
}

export const traerDisputa = (id: string) => get<any>(`/admin/disputes/${id}`);
export const resolverDisputa = (id: string, cuerpo: Record<string, unknown>) => post<any>(`/admin/disputes/${id}/resolve`, cuerpo);

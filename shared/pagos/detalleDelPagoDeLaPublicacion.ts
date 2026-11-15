import { rotuloDelEstadoDeUnPago } from '../admin/resumenDePublicacion';

/**
 * «Detalles del pago» de una publicación (pedido del dueño, 2026-11-15): lo ve el administrador y también la persona que publicó el trabajo, plegable, con
 * cuándo se aprobó el PAGO y cuándo se aprobó el TRABAJO, y si fue automático o lo hizo una persona del equipo.
 *
 * Qué cuenta como cada cosa (sale de lo que ya guarda el sistema, no se inventa):
 * - Pago aprobado por un administrador: `payments.approved_by` + `approved_at` (una transferencia que el equipo verifica).
 * - Pago aprobado solo: Mercado Pago lo confirmó (`payments.mercadopago_verified_at`) sin que nadie del equipo lo tocara.
 * - Trabajo aprobado por un administrador: `jobs.reviewed_by` + `reviewed_at` (el módulo «Aprobación de publicaciones pagadas» está encendido).
 * - Trabajo aprobado solo: quedó publicado al confirmarse el pago, sin pasar por el equipo (módulo apagado): `jobs.publication_paid_at`.
 */

export type ModoDeAprobacion = 'automatico' | 'administrador' | 'pendiente' | 'no_llego' | 'sin_dato';

export interface AprobacionDelDetalle {
  modo: ModoDeAprobacion;
  /** Cuándo (ISO), si se sabe. */
  cuando: string | null;
  /** Quién lo aprobó: solo para el equipo (la persona que publicó ve «un administrador»). */
  quien: string | null;
  /** La frase lista para mostrar. */
  texto: string;
}

export interface EntradaDelDetalle {
  trabajo: {
    status: string;
    price?: number | string | null;
    publicationPaid?: boolean | null;
    publicationPaidAt?: Date | string | null;
    reviewedAt?: Date | string | null;
    reviewedByName?: string | null;
    rejectedReason?: string | null;
    cancelledAt?: Date | string | null;
    cancellationReason?: string | null;
  };
  pago: null | {
    id?: string;
    status: string;
    amount?: number | string | null;
    platformFee?: number | string | null;
    platformFeePercentage?: number | string | null;
    paymentMethod?: string | null;
    mercadopagoPaymentId?: string | null;
    mercadopagoVerifiedAt?: Date | string | null;
    approvedAt?: Date | string | null;
    approvedByName?: string | null;
    createdAt?: Date | string | null;
  };
  pagador?: string | null;
  /** Los comprobantes que tiene el pago (no las notas): los sube el cliente o el equipo. */
  comprobantes?: { cuando: Date | string | null; porElEquipo: boolean }[];
  /** El equipo ve el nombre de quien aprobó; la persona que publicó, solo «un administrador». */
  verNombres: boolean;
}

/** Un hecho de la historia del pago y del trabajo. */
export interface EventoDeHistoria {
  clave: 'pago_iniciado' | 'comprobante' | 'pago_aprobado' | 'trabajo_aprobado' | 'trabajo_no_aprobado' | 'trabajo_cancelado' | 'pendiente_pago' | 'pendiente_trabajo';
  titulo: string;
  texto: string;
  /** Cuándo pasó (ISO). Los hechos que todavía no pasaron no tienen fecha. */
  cuando: string | null;
  /** Cómo fue, cuando corresponde (automático o por un administrador). */
  modo?: ModoDeAprobacion;
  /** Lo que todavía falta: va arriba de todo, antes de lo más reciente. */
  pendiente?: boolean;
}

export interface DetalleDelPagoDeLaPublicacion {
  estadoDelPago: string;
  monto: number;
  /** El IMPORTE que cobra DOAPP (en pesos). */
  comision: number;
  /** La TASA con que se calculó (en %): comisión ÷ precio. */
  tasaDeComision: number;
  metodo: string | null;
  pagador: string | null;
  pagoCreado: string | null;
  pagoAprobado: AprobacionDelDetalle;
  trabajoAprobado: AprobacionDelDetalle;
  cancelado: { cuando: string | null; motivo: string | null } | null;
  /** La historia completa, de lo más reciente a lo más viejo (lo que todavía falta, arriba de todo). */
  historia: EventoDeHistoria[];
}

const iso = (d: Date | string | null | undefined): string | null => {
  if (!d) return null;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
};
const num = (n: unknown): number => {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
};

export const ROTULO_DEL_METODO: Record<string, string> = {
  mercadopago: 'Mercado Pago',
  bank_transfer: 'Transferencia bancaria',
  balance: 'Saldo de DOAPP',
};

/** El nombre legible de un método de pago (también sirve para el «Transferencia Bancaria»/«MercadoPago» que arma la lista de Pagos). */
export function rotuloDelMetodo(metodo: string | null | undefined): string | null {
  if (!metodo) return null;
  const clave = String(metodo).toLowerCase().replace(/\s+/g, '_');
  if (ROTULO_DEL_METODO[clave]) return ROTULO_DEL_METODO[clave];
  if (clave === 'transferencia_bancaria') return 'Transferencia bancaria';
  return String(metodo);
}

/** Estados del trabajo en los que ya estuvo publicado (se aprobó, a mano o solo). */
const YA_PUBLICADO = ['open', 'in_progress', 'completed', 'paused', 'disputed'];

function aprobacionDelPago(e: EntradaDelDetalle): AprobacionDelDetalle {
  const p = e.pago;
  if (!p) return { modo: 'pendiente', cuando: null, quien: null, texto: 'Todavía no hay un pago.' };
  if (p.approvedAt) {
    const quien = e.verNombres ? p.approvedByName ?? null : null;
    return { modo: 'administrador', cuando: iso(p.approvedAt), quien, texto: `Lo aprobó un administrador${quien ? ` (${quien})` : ''}.` };
  }
  if (p.mercadopagoVerifiedAt) {
    return { modo: 'automatico', cuando: iso(p.mercadopagoVerifiedAt), quien: null, texto: 'Automático: Mercado Pago confirmó el pago.' };
  }
  const sinDinero = ['pending', 'processing', 'failed', 'cancelled', 'pending_verification', 'rejected'].includes(String(p.status));
  if (sinDinero) {
    return {
      modo: 'pendiente',
      cuando: null,
      quien: null,
      texto: p.status === 'pending_verification' ? 'Falta que un administrador verifique el comprobante.' : p.status === 'rejected' ? 'Un administrador rechazó el pago.' : 'Todavía no se acreditó.',
    };
  }
  return { modo: 'sin_dato', cuando: iso(e.trabajo.publicationPaidAt), quien: null, texto: 'El pago está acreditado, pero no quedó registrado cuándo ni cómo se aprobó.' };
}

function aprobacionDelTrabajo(e: EntradaDelDetalle): AprobacionDelDetalle {
  const t = e.trabajo;
  if (t.reviewedAt && t.rejectedReason) {
    return { modo: 'no_llego', cuando: iso(t.reviewedAt), quien: null, texto: 'Un administrador no aprobó la publicación.' };
  }
  if (t.reviewedAt) {
    const quien = e.verNombres ? t.reviewedByName ?? null : null;
    return { modo: 'administrador', cuando: iso(t.reviewedAt), quien, texto: `La aprobó un administrador${quien ? ` (${quien})` : ''}.` };
  }
  if (t.status === 'pending_approval') {
    return { modo: 'pendiente', cuando: null, quien: null, texto: 'Está en revisión: la tiene que aprobar un administrador.' };
  }
  if (t.publicationPaid && YA_PUBLICADO.includes(t.status)) {
    return { modo: 'automatico', cuando: iso(t.publicationPaidAt), quien: null, texto: 'Automática: quedó publicada apenas se confirmó el pago.' };
  }
  if (t.status === 'cancelled') {
    return { modo: 'no_llego', cuando: null, quien: null, texto: 'No llegó a aprobarse: se canceló antes.' };
  }
  return { modo: 'pendiente', cuando: null, quien: null, texto: 'Todavía no se aprobó: primero tiene que confirmarse el pago.' };
}

/** Orden lógico de la cadena (el más nuevo primero), para desempatar hechos con la misma fecha. */
const RANGO_DE_LA_CADENA: Record<EventoDeHistoria['clave'], number> = {
  pendiente_trabajo: 9,
  pendiente_pago: 8,
  trabajo_cancelado: 7,
  trabajo_no_aprobado: 6,
  trabajo_aprobado: 5,
  pago_aprobado: 4,
  comprobante: 3,
  pago_iniciado: 1,
};

function armarLaHistoria(e: EntradaDelDetalle, d: Omit<DetalleDelPagoDeLaPublicacion, 'historia'>): EventoDeHistoria[] {
  const hechos: EventoDeHistoria[] = [];
  if (d.pagoCreado) hechos.push({ clave: 'pago_iniciado', titulo: 'Pago iniciado', texto: `Se generó el pago${d.metodo ? ` (${d.metodo})` : ''}.`, cuando: d.pagoCreado });
  for (const c of e.comprobantes ?? []) {
    hechos.push({ clave: 'comprobante', titulo: c.porElEquipo ? 'Comprobante subido por el equipo' : 'Comprobante subido', texto: c.porElEquipo ? 'Lo subió una persona del equipo.' : 'Lo subió quien pagó.', cuando: iso(c.cuando) });
  }
  const pa = d.pagoAprobado;
  if (pa.modo === 'automatico' || pa.modo === 'administrador' || (pa.modo === 'sin_dato' && pa.cuando)) {
    hechos.push({ clave: 'pago_aprobado', titulo: 'Pago aprobado', texto: pa.texto, cuando: pa.cuando, modo: pa.modo });
  } else if (pa.modo === 'pendiente') {
    hechos.push({ clave: 'pendiente_pago', titulo: 'Pago por aprobar', texto: pa.texto, cuando: null, pendiente: true, modo: 'pendiente' });
  }
  const ta = d.trabajoAprobado;
  if (ta.modo === 'automatico' || ta.modo === 'administrador') {
    hechos.push({ clave: 'trabajo_aprobado', titulo: 'Trabajo aprobado', texto: ta.texto, cuando: ta.cuando, modo: ta.modo });
  } else if (ta.modo === 'no_llego' && ta.cuando) {
    hechos.push({ clave: 'trabajo_no_aprobado', titulo: 'Trabajo no aprobado', texto: ta.texto, cuando: ta.cuando, modo: 'no_llego' });
  } else if (ta.modo === 'pendiente' && e.trabajo.status !== 'cancelled') {
    hechos.push({ clave: 'pendiente_trabajo', titulo: 'Trabajo por aprobar', texto: ta.texto, cuando: null, pendiente: true, modo: 'pendiente' });
  }
  if (d.cancelado) {
    hechos.push({ clave: 'trabajo_cancelado', titulo: 'Trabajo cancelado', texto: d.cancelado.motivo || 'El trabajo se canceló.', cuando: d.cancelado.cuando });
  }
  const instante = (h: EventoDeHistoria) => (h.cuando ? new Date(h.cuando).getTime() : Number.NEGATIVE_INFINITY);
  return hechos.sort((a, b) => {
    if (!!a.pendiente !== !!b.pendiente) return a.pendiente ? -1 : 1;
    const dif = instante(b) - instante(a);
    return dif !== 0 ? dif : RANGO_DE_LA_CADENA[b.clave] - RANGO_DE_LA_CADENA[a.clave];
  });
}

export function armarDetalleDelPagoDeLaPublicacion(e: EntradaDelDetalle): DetalleDelPagoDeLaPublicacion {
  const p = e.pago;
  const monto = num(p?.amount ?? e.trabajo.price);
  const comision = num(p?.platformFee);
  const tasa = num(p?.platformFeePercentage);
  const base = {
    estadoDelPago: e.trabajo.publicationPaid ? 'Pagado' : p ? rotuloDelEstadoDeUnPago(p.status).rotulo : 'Esperando pago',
    monto,
    comision,
    tasaDeComision: tasa,
    metodo: rotuloDelMetodo(p?.paymentMethod),
    pagador: e.pagador ?? null,
    pagoCreado: iso(p?.createdAt),
    pagoAprobado: aprobacionDelPago(e),
    trabajoAprobado: aprobacionDelTrabajo(e),
    cancelado: e.trabajo.status === 'cancelled' ? { cuando: iso(e.trabajo.cancelledAt), motivo: e.trabajo.cancellationReason ?? null } : null,
  };
  return { ...base, historia: armarLaHistoria(e, base) };
}

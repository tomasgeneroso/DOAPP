import { Op } from 'sequelize';
import { Payment } from '../models/sql/Payment.model.js';
import { PaymentProof } from '../models/sql/PaymentProof.model.js';
import { conSistema } from '../db/contextoRls.js';

/**
 * Lo que necesita saber quien publicó un trabajo sobre el pago de su publicación: cuál es, en qué está y si todavía tiene que subir el comprobante (reporte del dueño, 2026-11-19:
 * «después de pagar la publicación no me da la opción de subir el comprobante»). La lista de «Mis trabajos» y el detalle traían `payment: null` escrito a mano, así que el botón
 * «Subir comprobante» nunca aparecía. Ahora sale de la base: es el pago de la publicación (`jobs.publication_payment_id`) de ESA persona.
 *
 * Pide comprobante un pago por transferencia o por Binance que todavía no se cerró; lo tiene entregado si hay un comprobante activo (no una nota del equipo).
 */
export interface PagoDeLaPublicacion {
  id: string;
  status: string;
  method: string;
  requiresProof: boolean;
  proofSubmitted: boolean;
  /** Lo último que dijo el equipo sobre el comprobante (nota), si hay. */
  ultimaNotaDelEquipo: string | null;
}

const ABIERTOS = ['pending', 'pending_verification', 'processing'];
const CON_COMPROBANTE = ['bank_transfer', 'binance'];

export async function pagosDeLasPublicaciones(trabajos: Array<{ id: unknown; publicationPaymentId?: unknown }>, personaId: string): Promise<Map<string, PagoDeLaPublicacion>> {
  const salida = new Map<string, PagoDeLaPublicacion>();
  const ids = [...new Set(trabajos.map((j) => j.publicationPaymentId).filter(Boolean).map(String))];
  if (ids.length === 0) return salida;

  const pagos: any[] = await Payment.findAll({ where: { id: { [Op.in]: ids }, payerId: personaId } as any, attributes: ['id', 'status', 'paymentMethod'], raw: true });
  const pruebas: any[] = await conSistema(() =>
    PaymentProof.findAll({ where: { paymentId: { [Op.in]: pagos.map((p) => p.id) } } as any, attributes: ['paymentId', 'kind', 'isActive', 'notes', 'uploadedAt'], order: [['uploadedAt', 'DESC']], raw: true }),
  );

  const porPago = new Map<string, { entregado: boolean; nota: string | null }>();
  for (const pr of pruebas) {
    const k = String(pr.paymentId);
    const actual = porPago.get(k) ?? { entregado: false, nota: null };
    if (pr.kind === 'note') actual.nota = actual.nota ?? (pr.notes ? String(pr.notes) : null);
    else if (pr.isActive) actual.entregado = true;
    porPago.set(k, actual);
  }
  const pagoPorId = new Map(pagos.map((p) => [String(p.id), p]));
  for (const t of trabajos) {
    const p = t.publicationPaymentId ? pagoPorId.get(String(t.publicationPaymentId)) : undefined;
    if (!p) continue;
    const info = porPago.get(String(p.id)) ?? { entregado: false, nota: null };
    const pideComprobante = CON_COMPROBANTE.includes(String(p.paymentMethod)) && ABIERTOS.includes(String(p.status));
    salida.set(String(t.id), {
      id: String(p.id),
      status: String(p.status),
      method: String(p.paymentMethod),
      requiresProof: pideComprobante,
      proofSubmitted: info.entregado,
      ultimaNotaDelEquipo: info.nota,
    });
  }
  return salida;
}

import { Job } from '../models/sql/Job.model.js';
import { Payment } from '../models/sql/Payment.model.js';
import { PaymentProof } from '../models/sql/PaymentProof.model.js';
import { conSistema } from '../db/contextoRls.js';
import { Op } from 'sequelize';
import { User } from '../models/sql/User.model.js';
import { armarDetalleDelPagoDeLaPublicacion, type DetalleDelPagoDeLaPublicacion } from '../../shared/pagos/detalleDelPagoDeLaPublicacion.js';

/**
 * Los «Detalles del pago» de un trabajo publicado: el pago de su publicación, cuándo y cómo se aprobó el pago y el trabajo (automático o por un administrador).
 * Lo piden el equipo (con nombres) y quien publicó el trabajo (sin nombres del equipo). Quién puede verlo lo decide la ruta.
 */
export async function detalleDelPagoDeLaPublicacion(job: Job, opciones: { verNombres: boolean }): Promise<{ detalle: DetalleDelPagoDeLaPublicacion; payment: Payment | null }> {
  const pago = job.publicationPaymentId ? await Payment.findByPk(job.publicationPaymentId) : null;

  // Los comprobantes del pago (no las notas): para la historia. Quién puede ver este detalle ya lo decidió la ruta.
  const comprobantes: any[] = pago
    ? await conSistema(() => PaymentProof.findAll({ where: { paymentId: pago.id, kind: { [Op.ne]: 'note' } } as any, attributes: ['id', 'kind', 'uploadedAt'], raw: true }))
    : [];

  const idsDeNombres = [(pago as any)?.approvedBy, (job as any).reviewedBy, job.clientId].filter(Boolean).map(String);
  const usuarios = idsDeNombres.length ? await User.findAll({ where: { id: [...new Set(idsDeNombres)] } as any, attributes: ['id', 'name'] }) : [];
  const nombreDe = (id: unknown): string | null => (id ? (usuarios.find((u: any) => String(u.id) === String(id)) as any)?.name ?? null : null);

  const detalle = armarDetalleDelPagoDeLaPublicacion({
    verNombres: opciones.verNombres,
    comprobantes: comprobantes.map((c) => ({ cuando: c.uploadedAt, porElEquipo: c.kind === 'admin_verification' })),
    pagador: nombreDe(pago?.payerId ?? job.clientId),
    trabajo: {
      status: String(job.status),
      price: job.price as any,
      publicationPaid: job.publicationPaid,
      publicationPaidAt: (job as any).publicationPaidAt,
      reviewedAt: (job as any).reviewedAt,
      reviewedByName: nombreDe((job as any).reviewedBy),
      rejectedReason: (job as any).rejectedReason,
      cancelledAt: (job as any).cancelledAt,
      cancellationReason: (job as any).cancellationReason,
    },
    pago: pago
      ? {
          id: String(pago.id),
          status: String(pago.status),
          amount: (pago as any).amount,
          platformFee: (pago as any).platformFee,
          platformFeePercentage: (pago as any).platformFeePercentage,
          paymentMethod: (pago as any).paymentMethod,
          mercadopagoPaymentId: (pago as any).mercadopagoPaymentId,
          mercadopagoVerifiedAt: (pago as any).mercadopagoVerifiedAt,
          approvedAt: (pago as any).approvedAt,
          approvedByName: nombreDe((pago as any).approvedBy),
          createdAt: pago.createdAt,
        }
      : null,
  });
  return { detalle, payment: pago };
}

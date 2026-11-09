import { Op } from 'sequelize';
import { Contract } from '../models/sql/Contract.model.js';
import { Job } from '../models/sql/Job.model.js';
import { Payment } from '../models/sql/Payment.model.js';
import { TIPOS_DE_PAGO_DE_CONTRATO } from './vinculoDePagos.js';

/**
 * Contratos terminados cuyo dinero ya estaba en DOAPP por el pago de la PUBLICACIÓN del trabajo.
 *
 * Caso real (2026-11-09): en el flujo normal («primero se paga, después se elige al trabajador») el cliente paga al PUBLICAR y el contrato nace después, sin un
 * pago propio. «Pagos a trabajadores» solo listaba contratos con un pago de contrato en «confirmado para pagar» (`contract_payment` / `escrow_deposit` con
 * `contract_id`), así que un contrato terminado de ese flujo quedaba en «pendiente de pago» (`pending_payout`) sin aparecer en ninguna lista y sin forma de
 * marcarle el pago al trabajador sin saltearse el control (solo owner o super_admin, con justificación).
 *
 * Entra a la lista un contrato que cumple TODO esto:
 *  - terminó (`completed`) y está pendiente de pagarle al trabajador (`pending_payout`);
 *  - su trabajo se pagó al publicarlo (`publicationPaid`) y el pago de la publicación ya tiene la plata adentro (verificado, completado o en garantía);
 *  - es de UN solo lugar: en un trabajo de varios lugares el cobro de cada trabajador se acredita a su SALDO al terminar (`acreditarSaldo`) y lo retira desde
 *    «Retiros»; transferirlo además desde acá sería pagarlo dos veces;
 *  - NO tiene un pago de contrato propio vigente (ese sigue el camino de siempre, por «confirmado para pagar»).
 */

/** Estados de un pago de publicación que significan «la plata ya está en DOAPP». */
export const PAGOS_CON_LA_PLATA_ADENTRO = ['completed', 'approved', 'verified', 'held_escrow', 'confirmed_for_payout'];

const ESTADOS_DE_PAGO_MUERTOS = ['rejected', 'cancelled', 'failed', 'refunded'];

export interface ContratoRespaldadoPorLaPublicacion {
  contratoId: string;
  jobId: string;
  pagoId: string;
  /** El pago de la publicación, con lo que hace falta para calcular desde cuándo se puede transferir. */
  pago: any;
}

export async function respaldadosPorLaPublicacion(soloEsteContrato?: string): Promise<ContratoRespaldadoPorLaPublicacion[]> {
  const where: any = { status: 'completed', paymentStatus: 'pending_payout' };
  if (soloEsteContrato) where.id = soloEsteContrato;

  const contratos: any[] = await Contract.findAll({
    where,
    attributes: ['id', 'jobId'],
    include: [{ model: Job, as: 'job', attributes: ['id', 'publicationPaid', 'publicationPaymentId', 'maxWorkers'], required: true }],
  });
  const candidatos = contratos.filter((c) => c.job?.publicationPaid && c.job.publicationPaymentId && (Number(c.job.maxWorkers) || 1) <= 1);
  if (!candidatos.length) return [];

  const conPagoPropio = new Set(
    (
      (await Payment.findAll({
        where: {
          contractId: { [Op.in]: candidatos.map((c) => String(c.id)) },
          paymentType: { [Op.in]: TIPOS_DE_PAGO_DE_CONTRATO },
          status: { [Op.notIn]: ESTADOS_DE_PAGO_MUERTOS },
        } as any,
        attributes: ['contractId'],
      })) as any[]
    ).map((p) => String(p.contractId)),
  );

  const pagos: any[] = await Payment.findAll({
    where: { id: { [Op.in]: [...new Set(candidatos.map((c) => String(c.job.publicationPaymentId)))] }, status: { [Op.in]: PAGOS_CON_LA_PLATA_ADENTRO } } as any,
    attributes: ['id', 'status', 'amount', 'platformFee', 'approvedAt', 'createdAt', 'moneyReleaseDate'],
  });
  const pagoPorId = new Map<string, any>(pagos.map((p) => [String(p.id), p]));

  return candidatos
    .filter((c) => !conPagoPropio.has(String(c.id)) && pagoPorId.has(String(c.job.publicationPaymentId)))
    .map((c) => ({
      contratoId: String(c.id),
      jobId: String(c.jobId),
      pagoId: String(c.job.publicationPaymentId),
      pago: pagoPorId.get(String(c.job.publicationPaymentId)),
    }));
}

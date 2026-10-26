import { Payment } from '../models/sql/Payment.model.js';
import { POLITICAS, PAGO_TRABAJADOR_RETENCION_DIAS } from '../../shared/constants/policies.js';
import type { EstadoDeLaLiquidacion, LiquidacionDelContrato } from '../../shared/pagos/liquidacion.js';
import { liberaMpEl, pagableDesde } from './liberacionDeSaldo.js';

export type { LiquidacionDelContrato };

const HORA = 3_600_000;

/** El pago que respalda el contrato: el suyo, o —en los trabajos de varios lugares y las cotizaciones— el de la publicación. */
async function pagoQueRespalda(contrato: any): Promise<Payment | null> {
  try {
    const atributos = ['id', 'status', 'approvedAt', 'paidAt', 'createdAt', 'moneyReleaseDate', 'paymentMethod'];
    const propio = await Payment.findOne({ where: { contractId: contrato.id } as any, attributes: atributos, order: [['createdAt', 'ASC']] });
    if (propio) return propio;
    const pubId = contrato.job?.publicationPaymentId ?? null;
    if (pubId) return await Payment.findByPk(String(pubId), { attributes: atributos });
    if (contrato.jobId) {
      const { Job } = await import('../models/sql/Job.model.js');
      const trabajo: any = await Job.findByPk(String(contrato.jobId), { attributes: ['id', 'publicationPaymentId'] });
      if (trabajo?.publicationPaymentId) return await Payment.findByPk(String(trabajo.publicationPaymentId), { attributes: atributos });
    }
  } catch {
    /* sin el pago no se inventa una espera */
  }
  return null;
}

const iso = (d: Date | null | undefined) => (d && Number.isFinite(d.getTime()) ? d.toISOString() : null);

/**
 * Cuándo se libera el dinero de un contrato y desde cuándo lo puede retirar el trabajador. Es una cuenta sobre las mismas reglas que ejecutan
 * `autoConfirmContracts` (liberación a las 24 h) y `pagableDesde` (retención de `DIAS_PARA_DISPUTAR` días + liberación de la pasarela), así lo que se le
 * muestra a la persona es lo que después pasa de verdad. Mientras el contrato no está completado las fechas son una estimación.
 */
export async function liquidacionDelContrato(contrato: any, ahora: Date = new Date()): Promise<LiquidacionDelContrato> {
  const status = String(contrato.status);
  const pago = await pagoQueRespalda(contrato);
  const liberaPasarela = pago ? liberaMpEl(pago as any) : null;
  const pasarelaPendiente = liberaPasarela && liberaPasarela.getTime() > ahora.getTime() ? liberaPasarela : null;
  const pagadoEl = (pago as any)?.approvedAt || (pago as any)?.paidAt || (pago as any)?.createdAt || null;
  const moneyRelease = (pago as any)?.moneyReleaseDate || null;

  const plataAsegurada =
    contrato.job?.publicationPaid === true ||
    String(contrato.escrowStatus) === 'held_escrow' ||
    ['escrow', 'held'].includes(String(contrato.paymentStatus));

  let estado: EstadoDeLaLiquidacion;
  if (String(contrato.escrowStatus) === 'refunded' || status === 'cancelled' || status === 'rejected') estado = 'devuelto';
  else if (status === 'completed' || String(contrato.escrowStatus) === 'released') estado = 'liberado';
  else if (!plataAsegurada) estado = 'sin_pago';
  else if (status === 'awaiting_confirmation') estado = 'esperando_confirmacion';
  else estado = 'en_custodia';

  const base = {
    diasDeReclamo: PAGO_TRABAJADOR_RETENCION_DIAS,
    liberaLaPasarelaEl: iso(pasarelaPendiente),
  };
  if (estado === 'devuelto' || estado === 'sin_pago') {
    return { estado, confirmaSolaEl: null, transferibleDesde: null, transferibleSiConfirmanHoy: null, esEstimado: false, ...base };
  }

  if (estado === 'liberado') {
    const desde = pagableDesde(
      { completedAt: contrato.completedAt ?? null, clientConfirmedAt: contrato.clientConfirmedAt ?? null, updatedAt: contrato.updatedAt ?? null },
      pagadoEl,
      moneyRelease,
    );
    return { estado, confirmaSolaEl: null, transferibleDesde: iso(desde), transferibleSiConfirmanHoy: null, esEstimado: false, ...base };
  }

  // Todavía no se completó: si nadie confirma, a las 24 h de la hora de fin (o de que se avisó que terminó) se da por terminado solo.
  const finDelTrabajo = contrato.endDate ? new Date(contrato.endDate) : null;
  const desdeQueTermino = status === 'awaiting_confirmation' && contrato.awaitingConfirmationAt ? new Date(contrato.awaitingConfirmationAt) : finDelTrabajo;
  const flexibleSinFin = !!contrato.job?.endDateFlexible && !contrato.job?.endDate;
  const confirmaSola = desdeQueTermino && !flexibleSinFin ? new Date(desdeQueTermino.getTime() + POLITICAS.AUTO_CONFIRMACION_HORAS * HORA) : null;
  // Si ya pasó (el cron todavía no lo corrió), el plazo se cuenta desde ahora.
  const confirmaSolaEfectiva = confirmaSola && confirmaSola.getTime() < ahora.getTime() ? ahora : confirmaSola;

  const desdeSiNadie = confirmaSolaEfectiva ? pagableDesde({ completedAt: confirmaSolaEfectiva }, pagadoEl, moneyRelease) : null;
  const desdeSiConfirmanHoy = pagableDesde({ completedAt: ahora }, pagadoEl, moneyRelease);

  return {
    estado,
    confirmaSolaEl: iso(confirmaSolaEfectiva),
    transferibleDesde: iso(desdeSiNadie ?? desdeSiConfirmanHoy),
    transferibleSiConfirmanHoy: iso(desdeSiConfirmanHoy),
    esEstimado: true,
    ...base,
  };
}

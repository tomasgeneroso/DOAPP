/** Aplica la regla de `shared/jobs/cambioDePresupuesto.ts` a un trabajo real: cuenta los contratos y mira si hay un pago de la publicación en revisión. */
import { Op } from 'sequelize';
import { Contract } from '../models/sql/Contract.model.js';
import { Payment } from '../models/sql/Payment.model.js';
import { conSistema } from '../db/contextoRls.js';
import { bloqueoDelPresupuesto, type BloqueoDelPresupuesto } from '../../shared/jobs/cambioDePresupuesto.js';

const NO_CUENTAN = ['cancelled', 'rejected'];

export const contratosVigentesDelTrabajo = (jobId: string): Promise<number> =>
  conSistema(() => Contract.count({ where: { jobId, status: { [Op.notIn]: NO_CUENTAN } } as any }));

export async function hayAlguienElegido(job: { id: string; selectedWorkers?: unknown; doerId?: unknown }, soloContratos = false): Promise<boolean> {
  if ((await contratosVigentesDelTrabajo(String(job.id))) > 0) return true;
  if (soloContratos) return false;
  // Si el trabajo tuvo contratos y todos se cayeron, la lista de elegidos puede haber quedado vieja: mandan los contratos.
  const alguna = await conSistema(() => Contract.count({ where: { jobId: job.id } as any, paranoid: false }));
  if (alguna > 0) return false;
  return (Array.isArray(job.selectedWorkers) && job.selectedWorkers.length > 0) || Boolean(job.doerId);
}

export type BloqueoDelCambio = BloqueoDelPresupuesto | { codigo: 'PAGO_EN_REVISION'; mensaje: string };

export async function bloqueoParaCambiarElPrecio(job: any, como: { status?: string; startDate?: Date | string | null; soloContratos?: boolean } = {}): Promise<BloqueoDelCambio | null> {
  const regla = bloqueoDelPresupuesto({
    status: como.status ?? String(job.status),
    publicationPaid: job.publicationPaid,
    startDate: como.startDate ?? job.startDate,
    hayAlguienElegido: await hayAlguienElegido(job, como.soloContratos),
  });
  if (regla) return regla;
  // Con un comprobante de la publicación esperando revisión, ese pago es por el precio actual: no se cambia hasta que se resuelva.
  if (!job.publicationPaid && job.publicationPaymentId) {
    const enRevision = await conSistema(() => Payment.count({ where: { id: job.publicationPaymentId, status: 'pending_verification' } as any }));
    if (enRevision > 0) return { codigo: 'PAGO_EN_REVISION', mensaje: 'Hay un pago de esta publicación en revisión. Cuando se resuelva vas a poder cambiar el presupuesto.' };
  }
  return null;
}

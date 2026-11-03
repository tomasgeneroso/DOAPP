import { Op } from 'sequelize';
import { Job } from '../models/sql/Job.model.js';
import { Contract } from '../models/sql/Contract.model.js';
import { conSistema } from '../db/contextoRls.js';

/**
 * Cuándo un trabajo se da por terminado.
 *
 * Un trabajo termina cuando terminaron TODOS sus contratos vigentes. Un contrato cancelado o rechazado (un trabajador que no pudo y fue
 * reemplazado, una propuesta que no se concretó) ya no cuenta: antes se miraba cada contrato que alguna vez tuvo el trabajo, así que uno
 * cancelado lo dejaba «en curso» para siempre aunque el que trabajó ya hubiera terminado y cobrado.
 *
 * Lo llaman las DOS formas de terminar un contrato (las dos partes confirman, o pasan las 24 h sin respuesta). La segunda no lo llamaba:
 * un contrato confirmado solo cerraba su pago pero el trabajo seguía en curso.
 */
export const ESTADOS_DE_CONTRATO_QUE_NO_CUENTAN = ['cancelled', 'rejected'];

export async function completarTrabajoSiTerminaron(jobId: string): Promise<boolean> {
  // Es una decisión del sistema sobre TODOS los contratos del trabajo: con la seguridad por filas, quien confirma (el trabajador) solo vería el suyo y el trabajo
  // se daría por terminado mientras otro trabajador sigue en curso.
  return conSistema(() => completar(jobId));
}

async function completar(jobId: string): Promise<boolean> {
  const contratos: any[] = await Contract.findAll({ where: { jobId } as any, attributes: ['id', 'status'] });
  const vigentes = contratos.filter((c) => !ESTADOS_DE_CONTRATO_QUE_NO_CUENTAN.includes(String(c.status)));
  if (vigentes.length === 0 || vigentes.some((c) => String(c.status) !== 'completed')) return false;

  // Condicional: si ya estaba terminado o cancelado no se toca (y no se avisa dos veces).
  const [cambiados] = await Job.update({ status: 'completed' } as any, { where: { id: jobId, status: { [Op.notIn]: ['completed', 'cancelled'] } } as any });
  if (cambiados === 0) return false;

  // El aviso en vivo es secundario: el estado ya quedó guardado.
  try {
    const job: any = await Job.findByPk(jobId);
    const { socketService } = await import('../index.js');
    socketService.notifyJobUpdate(String(jobId), job?.clientId ? String(job.clientId) : '', { action: 'job_completed', job });
  } catch {
    /* sin aviso en vivo: la pantalla lo ve al recargar */
  }
  return true;
}

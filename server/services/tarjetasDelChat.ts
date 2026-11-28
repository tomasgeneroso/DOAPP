/**
 * El estado ACTUAL de las tarjetas de postulación del chat. El texto de la tarjeta es una foto de cuando se mandó; el estado («pendiente», «aceptada») y si el trabajo sigue abierto se leen
 * ahora de la postulación y del trabajo. Así la tarjeta nunca ofrece «Aceptar» sobre algo ya resuelto (pedido del dueño, 2026-11-27: antes de ofrecer, verificar) aunque
 * la copia guardada en el mensaje no se haya actualizado.
 */
import { Op } from 'sequelize';
import { Proposal } from '../models/sql/Proposal.model.js';
import { Job } from '../models/sql/Job.model.js';
import { Contract } from '../models/sql/Contract.model.js';
import { POSTULACION_QUITADA_POR_PRESUPUESTO } from '../../shared/jobs/cambioDePresupuesto.js';

export async function conEstadoActual(mensajes: any[]): Promise<any[]> {
  const planos = mensajes.map((m) => (typeof m?.toJSON === 'function' ? m.toJSON() : m));
  const ids = [...new Set(planos.map((m) => m?.metadata?.proposalId).filter(Boolean).map(String))];
  if (ids.length === 0) return planos;

  const propuestas: any[] = await Proposal.findAll({ where: { id: ids } as any, attributes: ['id', 'status', 'jobId', 'freelancerId', 'approvedBy', 'approvedAt', 'cancellationReason'] });
  if (propuestas.length === 0) return planos;
  const porId = new Map(propuestas.map((p) => [String(p.id), p]));
  const trabajos: any[] = await Job.findAll({ where: { id: [...new Set(propuestas.map((p) => p.jobId).filter(Boolean))] } as any, attributes: ['id', 'status'] });
  const estadoDelTrabajo = new Map(trabajos.map((j) => [String(j.id), String(j.status)]));
  const aprobadas = propuestas.filter((p) => p.status === 'approved' && p.jobId);
  const contratos: any[] = aprobadas.length
    ? await Contract.findAll({ where: { [Op.or]: aprobadas.map((p) => ({ jobId: p.jobId, doerId: p.freelancerId })) } as any, attributes: ['id', 'jobId', 'doerId'], order: [['createdAt', 'ASC']] })
    : [];
  const contratoDe = new Map(contratos.map((c) => [`${c.jobId}:${c.doerId}`, String(c.id)]));

  return planos.map((m) => {
    const propuesta: any = m?.metadata?.proposalId ? porId.get(String(m.metadata.proposalId)) : null;
    if (!propuesta) return m;
    const contrato = contratoDe.get(`${propuesta.jobId}:${propuesta.freelancerId}`);
    return {
      ...m,
      metadata: {
        ...m.metadata,
        proposalStatus: String(propuesta.status),
        quitadaPorPresupuesto: propuesta.status === 'cancelled' && propuesta.cancellationReason === POSTULACION_QUITADA_POR_PRESUPUESTO,
        jobStatus: estadoDelTrabajo.get(String(propuesta.jobId)) ?? m.metadata.jobStatus,
        ...(contrato ? { contractId: contrato } : {}),
        ...(propuesta.approvedBy ? { aceptadaPor: propuesta.approvedBy, aceptadaEl: propuesta.approvedAt ? new Date(propuesta.approvedAt).toISOString() : null, autoSelected: propuesta.approvedBy === 'automatica' } : {}),
      },
    };
  });
}

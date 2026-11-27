/** Cómo se aceptó la postulación que dio origen a un contrato. `null`: no hay postulación o es anterior a que se guardara. */
import { Proposal } from '../models/sql/Proposal.model.js';
import { conSistema } from '../db/contextoRls.js';
import type { Aceptacion } from '../../shared/contratos/aceptacion.js';

export async function aceptacionDelContrato(contrato: { jobId?: unknown; doerId?: unknown } | null | undefined): Promise<Aceptacion | null> {
  if (!contrato?.jobId || !contrato.doerId) return null;
  const p: any = await conSistema(() =>
    Proposal.findOne({ where: { jobId: String(contrato.jobId), freelancerId: String(contrato.doerId), status: 'approved' } as any, attributes: ['approvedBy', 'approvedAt'], order: [['createdAt', 'DESC']] }),
  );
  return p?.approvedBy ? { como: p.approvedBy, cuando: p.approvedAt ? new Date(p.approvedAt).toISOString() : null } : null;
}

import { Op } from 'sequelize';
import { Job } from '../models/sql/Job.model.js';
import { Contract } from '../models/sql/Contract.model.js';
import { Payment } from '../models/sql/Payment.model.js';
import { User } from '../models/sql/User.model.js';
import { conSistema } from '../db/contextoRls.js';
import { buscarPublicaciones } from './vinculosDeId.js';
import { resumenDePublicacion } from '../../shared/admin/resumenDePublicacion.js';

/**
 * El panel de publicaciones del administrador: UNA fila por publicación, con su estado final, el de su contrato y el de su pago, y buscable por cualquier id
 * vinculado (trabajador, cliente, pago, contrato, retiro…). Qué dice cada rótulo: `shared/admin/resumenDePublicacion.ts`; cómo se llega de un id a una
 * publicación: `services/vinculosDeId.ts`.
 *
 * Se arma con consultas por lote (una para contratos, una para pagos, una para personas), no una por publicación.
 */

export interface FilaDelPanel {
  id: string;
  titulo: string;
  precio: number;
  estadoDelTrabajo: string;
  creadaEl: string;
  cliente: { id: string; nombre: string } | null;
  trabajadores: Array<{ id: string; nombre: string }>;
  estadoFinal: { clave: string; rotulo: string };
  contrato: { clave: string; rotulo: string; cantidad: number; terminados: number; contratoId: string | null };
  pago: { clave: string; rotulo: string; detalle: string | null; pagoId: string | null };
  alerta: string | null;
  /** Por qué apareció, cuando se buscó por un id o un nombre. */
  coincide: string[];
}

export interface RespuestaDelPanel {
  filas: FilaDelPanel[];
  /** Cuántas publicaciones hay por estado final (sobre todo lo traído, no solo lo filtrado: para poder navegar entre estados). */
  resumen: Record<string, number>;
  total: number;
  buscado: string | null;
}

/** Los contratos, los pagos y los nombres de los trabajadores de un grupo de publicaciones, con consultas por lote. */
async function relacionadosDe(trabajos: any[]) {
  const idsT = trabajos.map((t) => String(t.id));
  const contratos: any[] = await Contract.findAll({
    where: { jobId: { [Op.in]: idsT } } as any,
    attributes: ['id', 'jobId', 'status', 'paymentStatus', 'doerId'],
    order: [['createdAt', 'ASC']],
  });
  const idsC = contratos.map((c) => String(c.id));
  const idsPagoPub = trabajos.map((t) => t.publicationPaymentId).filter(Boolean).map(String);
  const pagos: any[] = await Payment.findAll({
    where: {
      [Op.or]: [
        { jobId: { [Op.in]: idsT } },
        ...(idsPagoPub.length ? [{ id: { [Op.in]: idsPagoPub } }] : []),
        ...(idsC.length ? [{ contractId: { [Op.in]: idsC } }] : []),
      ],
    } as any,
    attributes: ['id', 'jobId', 'contractId', 'status', 'paymentType', 'amount', 'createdAt'],
    order: [['createdAt', 'ASC']],
  });
  const idsDoers = [...new Set(contratos.map((c) => String(c.doerId)).filter(Boolean))];
  const doers: any[] = idsDoers.length ? await User.findAll({ where: { id: { [Op.in]: idsDoers } } as any, attributes: ['id', 'name'] }) : [];
  const nombreDe = new Map<string, string>(doers.map((u) => [String(u.id), String(u.name)]));

  const contratosPorTrabajo = new Map<string, any[]>();
  for (const c of contratos) contratosPorTrabajo.set(String(c.jobId), [...(contratosPorTrabajo.get(String(c.jobId)) ?? []), c]);
  const trabajoDeContrato = new Map<string, string>(contratos.map((c) => [String(c.id), String(c.jobId)]));
  const pagoPublicacionDe = new Map<string, string>(trabajos.filter((t) => t.publicationPaymentId).map((t) => [String(t.publicationPaymentId), String(t.id)]));
  // Cada pago a su trabajo: por su `job_id`, por el trabajo que lo señala o por su contrato (los tres caminos, así un pago viejo sin `job_id` igual se encuentra).
  const pagosPorTrabajo = new Map<string, any[]>();
  for (const p of pagos) {
    const t = (p.jobId && idsT.includes(String(p.jobId)) ? String(p.jobId) : null) ?? pagoPublicacionDe.get(String(p.id)) ?? (p.contractId ? trabajoDeContrato.get(String(p.contractId)) : null) ?? null;
    if (t) pagosPorTrabajo.set(t, [...(pagosPorTrabajo.get(t) ?? []), p]);
  }
  return { contratosPorTrabajo, pagosPorTrabajo, nombreDe };
}

/** El resumen (estado final, contrato, pago y alerta) de UNA publicación, a partir de sus filas de la base. */
function resumirTrabajo(t: any, cs: any[], ps: any[]) {
  return resumenDePublicacion(
    { status: t.status, publicationPaid: t.publicationPaid, publicationPaymentId: t.publicationPaymentId, cancellationRequestedAt: t.cancellationRequestedAt },
    cs.map((c) => ({ id: String(c.id), status: c.status, paymentStatus: c.paymentStatus })),
    ps.map((p) => ({ id: String(p.id), status: p.status, paymentType: p.paymentType, contractId: p.contractId, amount: p.amount })),
  );
}

/**
 * El MISMO resumen que ve el panel de Publicaciones, para cualquier grupo de trabajos (lo usa la lista de Pagos): así un pago, su contrato y su publicación
 * dicen siempre lo mismo, calculado de un solo lugar (regla del dueño, 2026-11-12: «todo debe estar con los mismos estados»).
 */
export async function resumenesDeTrabajos(trabajos: any[]): Promise<Map<string, ReturnType<typeof resumirTrabajo>>> {
  if (trabajos.length === 0) return new Map();
  const { contratosPorTrabajo, pagosPorTrabajo } = await relacionadosDe(trabajos);
  return new Map(trabajos.map((t) => [String(t.id), resumirTrabajo(t, contratosPorTrabajo.get(String(t.id)) ?? [], pagosPorTrabajo.get(String(t.id)) ?? [])]));
}

export async function panelDePublicaciones(opciones: { q?: string; estado?: string; limite?: number } = {}): Promise<RespuestaDelPanel> {
  const limite = Math.min(Math.max(Number(opciones.limite) || 100, 1), 300);
  const q = String(opciones.q ?? '').trim();
  const estado = String(opciones.estado ?? 'todas');

  return conSistema(async () => {
    let motivos = new Map<string, string[]>();
    const where: any = {};
    if (q) {
      const r = await buscarPublicaciones(q);
      if (r.jobIds.length === 0) return { filas: [], resumen: {}, total: 0, buscado: q };
      motivos = r.motivos;
      where.id = { [Op.in]: r.jobIds };
    }

    const trabajos: any[] = await Job.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: q ? Math.max(limite, 300) : limite,
      include: [{ model: User, as: 'client', attributes: ['id', 'name'], required: false }],
    });
    if (trabajos.length === 0) return { filas: [], resumen: {}, total: 0, buscado: q || null };

    const { contratosPorTrabajo, pagosPorTrabajo, nombreDe } = await relacionadosDe(trabajos);
    const todas: FilaDelPanel[] = trabajos.map((t) => {
      const cs = contratosPorTrabajo.get(String(t.id)) ?? [];
      const ps = pagosPorTrabajo.get(String(t.id)) ?? [];
      const r = resumirTrabajo(t, cs, ps);
      const vistos = new Set<string>();
      const trabajadores = cs
        .filter((c) => !['cancelled', 'rejected'].includes(String(c.status)) && c.doerId && !vistos.has(String(c.doerId)) && vistos.add(String(c.doerId)))
        .map((c) => ({ id: String(c.doerId), nombre: nombreDe.get(String(c.doerId)) ?? 'Sin nombre' }));
      return {
        id: String(t.id),
        titulo: String(t.title ?? ''),
        precio: Number(t.price) || 0,
        estadoDelTrabajo: String(t.status),
        creadaEl: new Date(t.createdAt).toISOString(),
        cliente: t.client ? { id: String(t.client.id), nombre: String(t.client.name) } : null,
        trabajadores,
        estadoFinal: r.estadoFinal,
        contrato: r.contrato,
        pago: r.pago,
        alerta: r.alerta,
        coincide: motivos.get(String(t.id)) ?? [],
      };
    });

    const resumen: Record<string, number> = {};
    for (const f of todas) resumen[f.estadoFinal.clave] = (resumen[f.estadoFinal.clave] ?? 0) + 1;
    const filtradas = estado === 'todas' ? todas : todas.filter((f) => f.estadoFinal.clave === estado);
    return { filas: filtradas.slice(0, limite), resumen, total: filtradas.length, buscado: q || null };
  });
}

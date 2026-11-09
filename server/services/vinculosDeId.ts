import { Op, cast, col, where as donde } from 'sequelize';
import type { ModelStatic, Model } from 'sequelize';
import { Job } from '../models/sql/Job.model.js';
import { Contract } from '../models/sql/Contract.model.js';
import { Payment } from '../models/sql/Payment.model.js';
import { Proposal } from '../models/sql/Proposal.model.js';
import { User } from '../models/sql/User.model.js';
import { WithdrawalRequest } from '../models/sql/WithdrawalRequest.model.js';
import { BalanceTransaction } from '../models/sql/BalanceTransaction.model.js';
import { Dispute } from '../models/sql/Dispute.model.js';
import { Ticket } from '../models/sql/Ticket.model.js';
import { conSistema } from '../db/contextoRls.js';

/**
 * De cualquier ID (o pedazo de ID, o nombre, o correo) a las PUBLICACIONES a las que está vinculado.
 *
 * Regla del dueño (2026-11-09): desde el panel de publicaciones se tiene que poder buscar con el id del trabajador, del cliente, del pago, del contrato, de la
 * publicación, del retiro… y que aparezca la publicación. Cada tipo de id llega a su publicación por un camino; acá están todos, y cada coincidencia dice POR QUÉ
 * apareció («es el pago de la publicación», «es el trabajador del contrato»…), para que quien busca vea el vínculo y no solo el resultado.
 *
 * El id puede venir entero, o un pedazo del principio, del medio o del final: las pantallas muestran unos con los primeros 8 caracteres y otros con los últimos 8
 * (un contrato «901FC989» es el FINAL de su id), así que se busca el pedazo en cualquier lugar.
 *
 * Camino de cada id (todos terminan en un trabajo):
 *   publicación → ella misma ·· persona → sus publicaciones como cliente y los contratos donde es trabajador ·· contrato → su trabajo ·· pago → su trabajo
 *   (`payments.job_id`), el contrato al que pertenece, el trabajo que lo señala y la propuesta de una cotización pagada ·· propuesta → su trabajo ·· retiro →
 *   las publicaciones de quien lo pidió ·· movimiento de saldo → su contrato o su pago ·· disputa → su contrato ·· ticket → el contrato sobre el que escribió.
 */

export type MotivoDeCoincidencia = string;

export interface ResultadoDeBuscar {
  /** Los trabajos a los que llegó, sin repetir. */
  jobIds: string[];
  /** Por cada trabajo, las razones por las que apareció. */
  motivos: Map<string, MotivoDeCoincidencia[]>;
}

/** ¿Parece un pedazo de id (hexadecimal y guiones, 4 o más)? */
export const parecePedazoDeId = (t: string): boolean => /^[0-9a-f-]{4,36}$/i.test(t);

/** Cuántas filas se miran por tipo de id: un pedazo muy corto (4 caracteres) no debe traer media base. */
const TOPE_POR_TIPO = 60;

const tienePedazo = (modelo: ModelStatic<Model>, columnaDeLaBase: string, pedazo: string) =>
  donde(cast(col(`${modelo.name}.${columnaDeLaBase}`), 'text'), { [Op.iLike]: `%${pedazo}%` });

const escaparLike = (s: string) => s.replace(/[%_\\]/g, '\\$&');

export async function buscarPublicaciones(consulta: string): Promise<ResultadoDeBuscar> {
  const q = String(consulta ?? '').trim().slice(0, 100);
  const motivos = new Map<string, MotivoDeCoincidencia[]>();
  if (q.length < 3) return { jobIds: [], motivos };

  const sumar = (jobId: unknown, motivo: string) => {
    if (!jobId) return;
    const k = String(jobId);
    const lista = motivos.get(k) ?? [];
    if (!lista.includes(motivo)) lista.push(motivo);
    motivos.set(k, lista);
  };

  // Es una decisión del sistema sobre TODO (el panel ya exige un rol de administración): con la seguridad por filas, soporte no vería los contratos ni los pagos de otros.
  await conSistema(async () => {
    if (parecePedazoDeId(q)) {
      const p = q;

      // Publicación
      for (const j of (await Job.findAll({ where: tienePedazo(Job, 'id', p), attributes: ['id'], limit: TOPE_POR_TIPO })) as any[]) sumar(j.id, 'Es el ID de la publicación');

      // Persona: cliente de publicaciones, o trabajador de contratos
      const personas: any[] = await User.findAll({ where: tienePedazo(User, 'id', p), attributes: ['id', 'name'], limit: TOPE_POR_TIPO });
      if (personas.length) {
        const idsP = personas.map((u) => String(u.id));
        for (const j of (await Job.findAll({ where: { clientId: { [Op.in]: idsP } } as any, attributes: ['id', 'clientId'], limit: 200 })) as any[]) sumar(j.id, 'Es el cliente');
        for (const j of (await Job.findAll({ where: { doerId: { [Op.in]: idsP } } as any, attributes: ['id', 'doerId'], limit: 200 })) as any[]) sumar(j.id, 'Es el trabajador');
        for (const c of (await Contract.findAll({ where: { doerId: { [Op.in]: idsP } } as any, attributes: ['id', 'jobId'], limit: 200 })) as any[]) sumar(c.jobId, 'Es el trabajador del contrato');
        for (const c of (await Contract.findAll({ where: { clientId: { [Op.in]: idsP } } as any, attributes: ['id', 'jobId'], limit: 200 })) as any[]) sumar(c.jobId, 'Es el cliente del contrato');
      }

      // Contrato
      for (const c of (await Contract.findAll({ where: tienePedazo(Contract, 'id', p), attributes: ['id', 'jobId'], limit: TOPE_POR_TIPO })) as any[]) sumar(c.jobId, 'Es el ID del contrato');

      // Pago: su trabajo directo, el contrato al que pertenece, el trabajo que lo señala como pago de la publicación y la propuesta de una cotización pagada
      const pagos: any[] = await Payment.findAll({ where: tienePedazo(Payment, 'id', p), attributes: ['id', 'jobId', 'contractId', 'metadata', 'paymentType'], limit: TOPE_POR_TIPO });
      if (pagos.length) {
        const idsPago = pagos.map((x) => String(x.id));
        for (const x of pagos) sumar(x.jobId, x.paymentType === 'job_publication' ? 'Es el pago de la publicación' : 'Es un pago de la publicación');
        const idsContrato = pagos.map((x) => x.contractId).filter(Boolean).map(String);
        if (idsContrato.length) {
          for (const c of (await Contract.findAll({ where: { id: { [Op.in]: idsContrato } } as any, attributes: ['id', 'jobId'] })) as any[]) sumar(c.jobId, 'Es el pago del contrato');
        }
        for (const j of (await Job.findAll({ where: { publicationPaymentId: { [Op.in]: idsPago } } as any, attributes: ['id'] })) as any[]) sumar(j.id, 'Es el pago de la publicación');
        const idsPropuesta = pagos.map((x) => x.metadata?.proposalId).filter((v: unknown) => typeof v === 'string' && parecePedazoDeId(v)).map(String);
        if (idsPropuesta.length) {
          for (const pr of (await Proposal.findAll({ where: { id: { [Op.in]: idsPropuesta } } as any, attributes: ['id', 'jobId'] })) as any[]) sumar(pr.jobId, 'Es el pago de una cotización de la publicación');
        }
      }

      // Propuesta
      for (const pr of (await Proposal.findAll({ where: tienePedazo(Proposal, 'id', p), attributes: ['id', 'jobId'], limit: TOPE_POR_TIPO })) as any[]) sumar(pr.jobId, 'Es el ID de una propuesta');

      // Retiro: las publicaciones de quien lo pidió (como cliente) y los contratos donde cobró (como trabajador)
      const retiros: any[] = await WithdrawalRequest.findAll({ where: tienePedazo(WithdrawalRequest, 'id', p), attributes: ['id', 'userId'], limit: TOPE_POR_TIPO });
      if (retiros.length) {
        const idsU = [...new Set(retiros.map((r) => String(r.userId)))];
        for (const j of (await Job.findAll({ where: { clientId: { [Op.in]: idsU } } as any, attributes: ['id'], limit: 200 })) as any[]) sumar(j.id, 'Es un retiro de su cliente');
        for (const c of (await Contract.findAll({ where: { doerId: { [Op.in]: idsU } } as any, attributes: ['id', 'jobId'], limit: 200 })) as any[]) sumar(c.jobId, 'Es un retiro de su trabajador');
      }

      // Movimiento de saldo: su contrato o su pago
      const movimientos: any[] = await BalanceTransaction.findAll({ where: tienePedazo(BalanceTransaction, 'id', p), attributes: ['id', 'relatedContractId', 'relatedPaymentId'], limit: TOPE_POR_TIPO });
      if (movimientos.length) {
        const idsC = movimientos.map((m) => m.relatedContractId).filter(Boolean).map(String);
        const idsPg = movimientos.map((m) => m.relatedPaymentId).filter(Boolean).map(String);
        if (idsC.length) for (const c of (await Contract.findAll({ where: { id: { [Op.in]: idsC } } as any, attributes: ['id', 'jobId'] })) as any[]) sumar(c.jobId, 'Es un movimiento de saldo del contrato');
        if (idsPg.length) for (const x of (await Payment.findAll({ where: { id: { [Op.in]: idsPg } } as any, attributes: ['id', 'jobId'] })) as any[]) sumar(x.jobId, 'Es un movimiento de saldo del pago');
      }

      // Disputa y ticket: el contrato sobre el que tratan
      for (const d of (await Dispute.findAll({ where: tienePedazo(Dispute, 'id', p), attributes: ['id', 'contractId'], limit: TOPE_POR_TIPO })) as any[]) {
        const c: any = d.contractId ? await Contract.findByPk(d.contractId, { attributes: ['id', 'jobId'] }) : null;
        sumar(c?.jobId, 'Es el ID de una disputa del contrato');
      }
      for (const t of (await Ticket.findAll({ where: tienePedazo(Ticket, 'id', p), attributes: ['id', 'relatedContract'], limit: TOPE_POR_TIPO })) as any[]) {
        const c: any = t.relatedContract ? await Contract.findByPk(t.relatedContract, { attributes: ['id', 'jobId'] }) : null;
        sumar(c?.jobId, 'Es el ID de un ticket sobre el contrato');
      }
    } else {
      // Texto: el título de la publicación, o el nombre o el correo de una persona
      const like = `%${escaparLike(q)}%`;
      for (const j of (await Job.findAll({ where: { title: { [Op.iLike]: like } } as any, attributes: ['id'], limit: 100 })) as any[]) sumar(j.id, 'Coincide con el título');
      const personas: any[] = await User.findAll({ where: { [Op.or]: [{ name: { [Op.iLike]: like } }, { email: { [Op.iLike]: like } }] } as any, attributes: ['id'], limit: TOPE_POR_TIPO });
      if (personas.length) {
        const idsP = personas.map((u) => String(u.id));
        for (const j of (await Job.findAll({ where: { clientId: { [Op.in]: idsP } } as any, attributes: ['id'], limit: 200 })) as any[]) sumar(j.id, 'Coincide con el cliente');
        for (const c of (await Contract.findAll({ where: { doerId: { [Op.in]: idsP } } as any, attributes: ['id', 'jobId'], limit: 200 })) as any[]) sumar(c.jobId, 'Coincide con el trabajador');
      }
    }
  });

  return { jobIds: [...motivos.keys()], motivos };
}

import { Op, cast, col, where as donde } from 'sequelize';
import type { ModelStatic, Model } from 'sequelize';
import { Job } from '../models/sql/Job.model.js';
import { Contract } from '../models/sql/Contract.model.js';
import { Payment } from '../models/sql/Payment.model.js';
import { Proposal } from '../models/sql/Proposal.model.js';
import { User } from '../models/sql/User.model.js';
import { Dispute } from '../models/sql/Dispute.model.js';
import { Ticket } from '../models/sql/Ticket.model.js';
import { WithdrawalRequest } from '../models/sql/WithdrawalRequest.model.js';
import { BalanceTransaction } from '../models/sql/BalanceTransaction.model.js';
import { conSistema } from '../db/contextoRls.js';
import { buscarPublicaciones, parecePedazoDeId } from './vinculosDeId.js';

/**
 * Buscar en el registro de acciones por el id de una publicación, de una persona, de un pago, de un contrato… y que aparezca TODO lo que está relacionado
 * (pedido del dueño, 2026-11-15: «si busco por id de publicación o id de usuario no encuentra nada; que todo tenga relación»).
 *
 * El registro guarda en cada asiento el objeto sobre el que se actuó (`target_id`), quién lo hizo (`performed_by`) y, en la metadata, otros ids. Buscar solo en la
 * descripción y en el nombre del objeto no encontraba nada: un asiento sobre un PAGO no dice el id de su publicación, y uno sobre una publicación no dice el de su
 * cliente. En vez de pedirle a cada lugar que escribe en el registro que anote todos los parentescos (y dejar afuera lo ya escrito), el parentesco se arma al BUSCAR,
 * con el mismo mapa de ids que usa el panel de publicaciones:
 *
 *   pedazo de id → los objetos que lo tienen (persona, publicación, contrato, pago, propuesta, disputa, ticket, retiro, movimiento de saldo)
 *   → sus publicaciones → de cada publicación: su cliente y su trabajador, sus contratos, sus pagos (también el de la publicación) y sus propuestas.
 *
 * Sirve para lo viejo y lo nuevo. Cada tipo de objeto que se agregue al mapa de `vinculosDeId.ts` queda buscable acá sin tocar nada más.
 */

/** Tope de ids relacionados que se buscan: un pedazo muy corto no debe traer media base. */
const TOPE_DE_RELACIONADOS = 400;
const TOPE_POR_TIPO = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const tienePedazo = (modelo: ModelStatic<Model>, columnaDeLaBase: string, pedazo: string) =>
  donde(cast(col(`${modelo.name}.${columnaDeLaBase}`), 'text'), { [Op.iLike]: `%${pedazo}%` });

export interface RelacionadosDelRegistro {
  /** Todos los ids (de cualquier tipo) sobre los que puede haber asientos. */
  ids: string[];
  /** Las personas: además de lo que se hizo SOBRE ellas, lo que HICIERON (`performed_by`). */
  personas: string[];
  /** Para decirle a quien busca qué se incluyó. */
  resumen: { publicaciones: number; pagos: number; contratos: number; personas: number; propuestas: number; otros: number };
}

export async function relacionadosParaElRegistro(consulta: string): Promise<RelacionadosDelRegistro> {
  const q = String(consulta ?? '').trim().slice(0, 100);
  const vacio: RelacionadosDelRegistro = { ids: [], personas: [], resumen: { publicaciones: 0, pagos: 0, contratos: 0, personas: 0, propuestas: 0, otros: 0 } };
  if (q.length < 4 || !parecePedazoDeId(q)) return vacio;

  const trabajos = new Set<string>();
  const pagos = new Set<string>();
  const contratos = new Set<string>();
  const propuestas = new Set<string>();
  const personas = new Set<string>();
  const otros = new Set<string>();
  const agregar = (conjunto: Set<string>, id: unknown) => {
    if (id && UUID.test(String(id))) conjunto.add(String(id));
  };

  // Es una decisión del sistema sobre TODO (la pantalla ya exige el permiso de leer el registro): con la seguridad por filas, el equipo no vería lo de otras personas.
  await conSistema(async () => {
    const ids = async (modelo: ModelStatic<Model>, columna = 'id') =>
      ((await (modelo as any).findAll({ where: tienePedazo(modelo, columna, q), attributes: ['id'], limit: TOPE_POR_TIPO, raw: true })) as any[]).map((f) => f.id);

    for (const id of await ids(User as any)) agregar(personas, id);
    for (const id of await ids(Job as any)) agregar(trabajos, id);
    for (const id of await ids(Contract as any)) agregar(contratos, id);
    for (const id of await ids(Payment as any)) agregar(pagos, id);
    for (const id of await ids(Proposal as any)) agregar(propuestas, id);
    for (const modelo of [Dispute, Ticket, WithdrawalRequest, BalanceTransaction]) for (const id of await ids(modelo as any)) agregar(otros, id);

    // Las publicaciones a las que llega cualquiera de esos ids (persona → sus publicaciones, pago → su publicación, contrato → su trabajo, retiro…).
    const llegadas = await buscarPublicaciones(q);
    for (const j of llegadas.jobIds) agregar(trabajos, j);

    // Lo que una persona hizo o le hicieron fuera de una publicación: sus pagos (membresías, retiros…) y los contratos donde participa.
    if (personas.size) {
      const idsP = [...personas];
      const pagosDeLaPersona: any[] = await Payment.findAll({ where: { [Op.or]: [{ payerId: { [Op.in]: idsP } }, { recipientId: { [Op.in]: idsP } }] } as any, attributes: ['id'], limit: 200, raw: true });
      for (const p of pagosDeLaPersona) agregar(pagos, p.id);
      const contratosDeLaPersona: any[] = await Contract.findAll({ where: { [Op.or]: [{ clientId: { [Op.in]: idsP } }, { doerId: { [Op.in]: idsP } }] } as any, attributes: ['id'], limit: 200, raw: true });
      for (const c of contratosDeLaPersona) agregar(contratos, c.id);
      const retiros: any[] = await WithdrawalRequest.findAll({ where: { userId: { [Op.in]: idsP } } as any, attributes: ['id'], limit: 100, raw: true });
      for (const r of retiros) agregar(otros, r.id);
    }

    // De cada publicación: su cliente y su trabajador, sus contratos, sus pagos (el de la publicación incluido) y sus propuestas.
    if (trabajos.size) {
      const idsJ = [...trabajos].slice(0, 100);
      const js: any[] = await Job.findAll({ where: { id: { [Op.in]: idsJ } } as any, attributes: ['id', 'clientId', 'doerId', 'publicationPaymentId'], raw: true });
      for (const j of js) {
        agregar(personas, j.clientId);
        agregar(personas, j.doerId);
        agregar(pagos, j.publicationPaymentId);
      }
      const cs: any[] = await Contract.findAll({ where: { jobId: { [Op.in]: idsJ } } as any, attributes: ['id', 'clientId', 'doerId'], limit: 200, raw: true });
      for (const c of cs) {
        agregar(contratos, c.id);
        agregar(personas, c.clientId);
        agregar(personas, c.doerId);
      }
      const ps: any[] = await Payment.findAll({ where: { jobId: { [Op.in]: idsJ } } as any, attributes: ['id', 'payerId'], limit: 200, raw: true });
      for (const p of ps) {
        agregar(pagos, p.id);
        agregar(personas, p.payerId);
      }
      const prs: any[] = await Proposal.findAll({ where: { jobId: { [Op.in]: idsJ } } as any, attributes: ['id', 'freelancerId'], limit: 200, raw: true });
      for (const pr of prs) {
        agregar(propuestas, pr.id);
        agregar(personas, pr.freelancerId);
      }
    }

    // De cada pago: su contrato (un pago de contrato no siempre trae el trabajo).
    if (pagos.size) {
      const idsPg = [...pagos].slice(0, 100);
      const pgs: any[] = await Payment.findAll({ where: { id: { [Op.in]: idsPg } } as any, attributes: ['id', 'contractId', 'jobId', 'payerId'], raw: true });
      for (const p of pgs) {
        agregar(contratos, p.contractId);
        agregar(trabajos, p.jobId);
        agregar(personas, p.payerId);
      }
    }
  });

  const todos = [...new Set([...trabajos, ...pagos, ...contratos, ...propuestas, ...personas, ...otros])].slice(0, TOPE_DE_RELACIONADOS);
  return {
    ids: todos,
    personas: [...personas].slice(0, TOPE_DE_RELACIONADOS),
    resumen: { publicaciones: trabajos.size, pagos: pagos.size, contratos: contratos.size, personas: personas.size, propuestas: propuestas.size, otros: otros.size },
  };
}

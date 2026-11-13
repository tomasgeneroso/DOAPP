import { Op } from 'sequelize';
import { Contract } from '../models/sql/Contract.model.js';
import { Job } from '../models/sql/Job.model.js';
import { Payment } from '../models/sql/Payment.model.js';
import { User } from '../models/sql/User.model.js';
import { Notification } from '../models/sql/Notification.model.js';
import { conSistema } from '../db/contextoRls.js';
import { montoParaElTrabajador } from './payoutAmount.js';
import { pagableDesde } from './liberacionDeSaldo.js';
import { logMoneyEvent } from '../utils/auditLog.js';
import { decryptCBU } from '../utils/encryption.js';
import { leerDestinoDelPerfil } from '../../shared/pagos/destinoDeRetiro.js';
import { textoDelCobro } from '../../shared/pagos/cobroEnEspera.js';
import type { CobroPendiente } from '../../shared/pagos/aFavorPendiente.js';

/**
 * El cobro de un trabajador de un contrato de UN solo lugar (pedido del dueño, 2026-11-13).
 *
 * En un trabajo de un solo lugar el pago al trabajador lo hace el EQUIPO (Pagos a trabajadores: transferencia con comprobante, libro y factura): no pasa por el saldo
 * del trabajador, así que antes no figuraba en ninguna parte de su pantalla de saldo y no había nada que pedir. Ahora:
 *  - se muestra como «cobro en espera de liberación», con los días que faltan (la MISMA fecha que obliga al equipo: `pagableDesde`);
 *  - cuando ya se liberó, el trabajador lo PIDE. El pedido solo deja una marca (`payout_requested_at`) y avisa al equipo: no mueve plata; el pago sigue siendo
 *    manual y con todos sus controles, así que no hay forma de cobrar dos veces.
 *
 * Los trabajos de varios lugares no entran acá: su cobro se acredita al SALDO y se retira desde Retiros.
 */

const ATRIBUTOS_DEL_PAGO = ['id', 'status', 'amount', 'platformFee', 'approvedAt', 'createdAt', 'paidAt', 'moneyReleaseDate', 'paymentMethod', 'workerPaymentAmount'];

interface CobroCalculado {
  contrato: any;
  monto: number;
  disponibleDesde: Date;
}

/** Los contratos terminados de un trabajador que esperan que el equipo le pague, con cuánto y desde cuándo (lo mismo que calcula el equipo). */
async function cobrosPendientesDeContratos(userId: string, soloEste?: string): Promise<CobroCalculado[]> {
  const where: any = { doerId: userId, status: 'completed', paymentStatus: 'pending_payout' };
  if (soloEste) where.id = soloEste;
  const contratos: any[] = await Contract.findAll({
    where,
    include: [{ model: Job, as: 'job', attributes: ['id', 'title', 'publicationPaymentId', 'maxWorkers'], required: true }],
    order: [['updatedAt', 'DESC']],
    limit: 50,
  });
  const salida: CobroCalculado[] = [];
  for (const c of contratos) {
    if ((Number(c.job?.maxWorkers) || 1) > 1) continue; // varios lugares: cobra por saldo
    let pago: any = await Payment.findOne({ where: { contractId: c.id } as any, attributes: ATRIBUTOS_DEL_PAGO, order: [['createdAt', 'ASC']] }).catch(() => null);
    if (!pago && c.job?.publicationPaymentId) pago = await Payment.findByPk(String(c.job.publicationPaymentId), { attributes: ATRIBUTOS_DEL_PAGO }).catch(() => null);
    let monto = 0;
    try {
      monto = montoParaElTrabajador(c as any, pago as any).neto;
    } catch {
      monto = Number(c.allocatedAmount || c.price) || 0;
    }
    const desde = pagableDesde(c as any, pago?.approvedAt || pago?.createdAt, pago?.moneyReleaseDate);
    salida.push({ contrato: c, monto, disponibleDesde: desde });
  }
  return salida;
}

/** Las tarjetas de «Cobros pendientes» del trabajador para lo que le paga el equipo. */
export async function cobrosDelTrabajo(userId: string, ahora: Date = new Date()): Promise<CobroPendiente[]> {
  return conSistema(async () => {
    const calculados = await cobrosPendientesDeContratos(String(userId));
    return calculados.map(({ contrato: c, monto, disponibleDesde }) => ({
      id: `cobro-${c.id}`,
      tipo: 'cobro_del_trabajo' as const,
      monto: Math.round(monto * 100) / 100,
      etiqueta: 'Cobro de un trabajo',
      descripcion: String(c.job?.title || 'Trabajo'),
      disponibleDesde: disponibleDesde.toISOString(),
      trabajo: c.job ? { id: String(c.job.id), titulo: String(c.job.title || 'Trabajo') } : null,
      contrato: { id: String(c.id), titulo: String(c.job?.title || 'Contrato') },
      liberado: ahora.getTime() >= disponibleDesde.getTime(),
      pedidoEl: c.payoutRequestedAt ? new Date(c.payoutRequestedAt).toISOString() : null,
    }));
  });
}

export type ResultadoDelPedido =
  | { ok: true; pedidoEl: string; monto: number }
  | { ok: false; status: number; code: string; message: string; disponibleDesde?: string };

/**
 * El trabajador pide el cobro de un contrato terminado. Solo si: es SU contrato, está terminado y pendiente de pago, es de un solo lugar, ya se liberó, tiene una
 * cuenta cargada (y no la cambió hace menos de las horas de enfriamiento) y no lo había pedido. El pedido es una marca atómica: dos toques seguidos piden una sola vez.
 */
export async function pedirElCobro(userId: string, contractId: string, ahora: Date = new Date()): Promise<ResultadoDelPedido> {
  return conSistema(async () => {
    const calculados = await cobrosPendientesDeContratos(String(userId), contractId);
    const c = calculados[0];
    if (!c) {
      return { ok: false as const, status: 404, code: 'COBRO_NO_ENCONTRADO', message: 'No encontramos un cobro pendiente de ese contrato. Puede que ya se haya pagado o que se cobre por tu saldo.' };
    }
    if (c.contrato.payoutRequestedAt) {
      return { ok: false as const, status: 409, code: 'COBRO_YA_PEDIDO', message: 'Ya pediste este cobro. El equipo de DOAPP te transfiere a tu cuenta y te avisamos cuando se acredite.' };
    }
    if (ahora.getTime() < c.disponibleDesde.getTime()) {
      const t = textoDelCobro({ liberado: false, disponibleDesde: c.disponibleDesde.toISOString() }, ahora);
      return { ok: false as const, status: 409, code: 'COBRO_EN_ESPERA', message: `Todavía no se puede pedir. ${t.detalle}`, disponibleDesde: c.disponibleDesde.toISOString() };
    }

    const user: any = await User.findByPk(userId, { attributes: ['id', 'name', 'bankingInfo', 'bankingInfoUpdatedAt'] });
    const destino = leerDestinoDelPerfil(user?.bankingInfo, (cifrado) => { try { return decryptCBU(cifrado); } catch { return null; } }, String(user?.name || ''));
    if (!destino) {
      return { ok: false as const, status: 400, code: 'BANKING_INFO_NOT_SAVED', message: 'Para que te podamos transferir, cargá primero la cuenta donde querés cobrar (en tu perfil).' };
    }
    const { verificarEnfriamientoCbu } = await import('./paymentSafeguards.js');
    const enfriamiento = verificarEnfriamientoCbu(user?.bankingInfoUpdatedAt);
    if (!enfriamiento.permitido) {
      return { ok: false as const, status: 403, code: 'CUENTA_EN_ENFRIAMIENTO', message: enfriamiento.motivo || 'Cambiaste tu cuenta hace poco: esperá un tiempo antes de pedir el cobro.' };
    }

    // La marca se pone de una sola vez: si otro pedido llegó antes, este no hace nada.
    const [marcados] = await Contract.update({ payoutRequestedAt: ahora } as any, {
      where: { id: c.contrato.id, doerId: userId, status: 'completed', paymentStatus: 'pending_payout', payoutRequestedAt: { [Op.is]: null } } as any,
    });
    if (marcados === 0) {
      return { ok: false as const, status: 409, code: 'COBRO_YA_PEDIDO', message: 'Ya pediste este cobro. El equipo de DOAPP te transfiere a tu cuenta y te avisamos cuando se acredite.' };
    }

    const titulo = String(c.contrato.job?.title || 'Trabajo');
    await logMoneyEvent({
      action: 'WORKER_PAYOUT_REQUESTED',
      actor: `user:${userId}`,
      severity: 'low',
      description: `El trabajador pidió el cobro del contrato de "${titulo}" (liberado desde ${c.disponibleDesde.toISOString()}).`,
      contractId: String(c.contrato.id),
      userId: String(userId),
      monto: c.monto,
      moneda: 'ARS',
      metadata: { pagableDesde: c.disponibleDesde.toISOString() },
    });

    // Avisos: a la persona (quedó pedido) y al equipo (hay un cobro para pagar). Un aviso que falla no deshace el pedido.
    try {
      await Notification.create({
        recipientId: userId,
        type: 'info',
        category: 'payment',
        title: 'Pediste tu cobro',
        message: `Recibimos tu pedido de cobro de "${titulo}". El equipo de DOAPP te transfiere a tu cuenta y te avisamos cuando se acredite.`,
        relatedModel: 'Contract',
        relatedId: String(c.contrato.id),
        sentVia: ['in_app'],
        data: { contractId: String(c.contrato.id) },
      } as any);
      const equipo: any[] = await User.findAll({ where: { adminRole: { [Op.in]: ['owner', 'super_admin', 'admin'] } } as any, attributes: ['id'] });
      for (const a of equipo) {
        await Notification.create({
          recipientId: a.id,
          type: 'info',
          category: 'payment',
          title: 'Un trabajador pidió su cobro',
          message: `Pidió el cobro de "${titulo}" (ya está liberado). Lo ves en Pagos → Pagos a trabajadores.`,
          relatedModel: 'Contract',
          relatedId: String(c.contrato.id),
          sentVia: ['in_app'],
          data: { contractId: String(c.contrato.id) },
        } as any);
      }
    } catch (e: any) {
      console.error('No se pudo avisar del pedido de cobro:', e?.message);
    }
    return { ok: true as const, pedidoEl: ahora.toISOString(), monto: c.monto };
  });
}

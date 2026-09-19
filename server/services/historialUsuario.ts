import { Op } from 'sequelize';
import { Contract } from '../models/sql/Contract.model.js';
import { Dispute } from '../models/sql/Dispute.model.js';
import { Payment } from '../models/sql/Payment.model.js';
import { BalanceTransaction } from '../models/sql/BalanceTransaction.model.js';
import { AuditLog } from '../models/sql/AuditLog.model.js';
import { User } from '../models/sql/User.model.js';
import { Job } from '../models/sql/Job.model.js';
import { leerMetadata } from '../utils/auditLog.js';

/**
 * El historial de un usuario, para mirarlo antes de decidir sobre él.
 *
 * Lo que un admin necesita saber cuando le llega la disputa de alguien no es
 * "cuántos contratos tuvo" sino el patrón: cuántas veces reclamó, cómo
 * terminaron esas veces, a favor de quién, y cuánta plata se movió. El
 * detector de abuso (abuseDetector.ts) da la alarma; esto da el expediente.
 *
 * Todo sale de lo que ya está registrado: contratos, disputas, el libro de
 * dinero y los movimientos de saldo. No se calcula ninguna reputación nueva
 * ni se toma ninguna decisión acá: es una vista.
 */

export interface MesDelHistorial {
  /** '2026-09' */
  mes: string;
  contratos: number;
  disputas: number;
  cancelaciones: number;
  contracargos: number;
}

export interface EventoDelHistorial {
  fecha: string;
  tipo: 'disputa' | 'cancelacion' | 'contracargo';
  titulo: string;
  detalle: string;
  monto: number | null;
  /** 'el usuario' | 'la otra parte' | null si no hubo decisión. */
  aFavorDe: string | null;
  contractId: string | null;
  disputeId: string | null;
}

export interface HistorialUsuario {
  usuario: { id: string; name: string; email: string; createdAt: string | null };
  resumen: {
    contratos: number;
    comoCliente: number;
    comoTrabajador: number;
    completados: number;
    cancelados: number;
    cancelacionesPropias: number;
    disputasAbiertas: number;
    disputasGanadas: number;
    disputasPerdidas: number;
    disputasEnCurso: number;
    contracargos: number;
  };
  dinero: {
    pagadoComoCliente: number;
    cobradoComoTrabajador: number;
    devueltoAEsteUsuario: number;
    saldoActual: number;
  };
  meses: MesDelHistorial[];
  eventos: EventoDelHistorial[];
}

const mesDe = (d: Date | string) => new Date(d).toISOString().slice(0, 7);
const num = (v: any) => Math.round((Number(v) || 0) * 100) / 100;

/** Los últimos `meses` meses en orden, incluido el actual, aunque estén vacíos. */
function esqueleto(meses: number): Map<string, MesDelHistorial> {
  const out = new Map<string, MesDelHistorial>();
  const hoy = new Date();
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - i, 1));
    const mes = d.toISOString().slice(0, 7);
    out.set(mes, { mes, contratos: 0, disputas: 0, cancelaciones: 0, contracargos: 0 });
  }
  return out;
}

export async function historialDeUsuario(userId: string, meses = 12): Promise<HistorialUsuario | null> {
  const user = await User.findByPk(userId, { attributes: ['id', 'name', 'email', 'createdAt', 'balanceArs'] });
  if (!user) return null;

  const desde = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - (meses - 1), 1));
  const porMes = esqueleto(meses);
  const eventos: EventoDelHistorial[] = [];

  const contratos = await Contract.findAll({
    where: { [Op.or]: [{ clientId: userId }, { doerId: userId }] } as any,
    attributes: ['id', 'clientId', 'doerId', 'status', 'cancelledBy', 'price', 'allocatedAmount', 'createdAt', 'jobId'],
    order: [['createdAt', 'DESC']],
    limit: 2000,
  });

  const titulos = new Map<string, string>();
  const jobIds = [...new Set(contratos.map((c) => String((c as any).jobId)).filter(Boolean))];
  if (jobIds.length) {
    const jobs = await Job.findAll({ where: { id: { [Op.in]: jobIds } } as any, attributes: ['id', 'title'] });
    for (const j of jobs) titulos.set(String(j.id), (j as any).title || 'trabajo');
  }
  const tituloDe = (c: any) => titulos.get(String(c.jobId)) || 'trabajo';

  for (const c of contratos as any[]) {
    const mes = porMes.get(mesDe(c.createdAt));
    if (mes) mes.contratos++;
    if (c.status === 'cancelled') {
      const propia = String(c.cancelledBy || '') === String(userId);
      if (mes) mes.cancelaciones++;
      eventos.push({
        fecha: new Date(c.createdAt).toISOString(),
        tipo: 'cancelacion',
        titulo: propia ? 'Canceló un contrato' : 'Le cancelaron un contrato',
        detalle: `"${tituloDe(c)}" · ${String(c.clientId) === String(userId) ? 'como cliente' : 'como trabajador'}`,
        monto: num(c.allocatedAmount || c.price),
        aFavorDe: null,
        contractId: String(c.id),
        disputeId: null,
      });
    }
  }

  const ids = contratos.map((c) => c.id);
  const disputas = ids.length
    ? await Dispute.findAll({
        where: { contractId: { [Op.in]: ids } } as any,
        attributes: ['id', 'contractId', 'initiatedBy', 'status', 'resolutionType', 'refundAmount', 'createdAt', 'resolvedAt'],
        order: [['createdAt', 'DESC']],
      })
    : [];
  const contratoPorId = new Map(contratos.map((c) => [String(c.id), c as any]));

  let disputasAbiertas = 0, disputasGanadas = 0, disputasPerdidas = 0, disputasEnCurso = 0;
  for (const d of disputas as any[]) {
    const c = contratoPorId.get(String(d.contractId));
    const esCliente = c && String(c.clientId) === String(userId);
    const laAbrio = String(d.initiatedBy) === String(userId);
    const mes = porMes.get(mesDe(d.createdAt));
    if (mes) mes.disputas++;
    if (laAbrio) disputasAbiertas++;

    // Quién se llevó la plata: liberar favorece al trabajador, devolver al cliente.
    let aFavorDe: string | null = null;
    if (d.status === 'resolved_released') aFavorDe = esCliente ? 'la otra parte' : 'el usuario';
    else if (d.status === 'resolved_refunded') aFavorDe = esCliente ? 'el usuario' : 'la otra parte';
    else if (d.status === 'resolved_partial') aFavorDe = 'repartido';
    else if (!String(d.status).startsWith('resolved') && d.status !== 'cancelled') disputasEnCurso++;

    if (laAbrio && aFavorDe === 'el usuario') disputasGanadas++;
    if (laAbrio && aFavorDe === 'la otra parte') disputasPerdidas++;

    eventos.push({
      fecha: new Date(d.createdAt).toISOString(),
      tipo: 'disputa',
      titulo: laAbrio ? 'Abrió una disputa' : 'Recibió una disputa',
      detalle: `"${c ? tituloDe(c) : 'contrato'}" · ${esCliente ? 'como cliente' : 'como trabajador'} · ${d.status}`,
      monto: d.refundAmount != null ? num(d.refundAmount) : null,
      aFavorDe,
      contractId: String(d.contractId),
      disputeId: String(d.id),
    });
  }

  // Contracargos: quedan en el libro de dinero con el id del cliente que lo hizo.
  const asientos = await AuditLog.findAll({
    where: { action: 'CHARGEBACK_RECEIVED', createdAt: { [Op.gte]: desde } } as any,
    limit: 2000,
  });
  let contracargos = 0;
  for (const a of asientos as any[]) {
    const m = leerMetadata(a) || {};
    if (String(m.userId || a.userId || '') !== String(userId)) continue;
    contracargos++;
    const mes = porMes.get(mesDe(a.createdAt));
    if (mes) mes.contracargos++;
    eventos.push({
      fecha: new Date(a.createdAt).toISOString(),
      tipo: 'contracargo',
      titulo: 'Contracargo',
      detalle: a.description || 'Desconoció un pago ante su banco',
      monto: m.monto != null ? num(m.monto) : null,
      aFavorDe: null,
      contractId: m.contractId ? String(m.contractId) : null,
      disputeId: null,
    });
  }

  // Plata: lo que pagó, lo que cobró y lo que se le devolvió.
  const pagos = await Payment.findAll({
    where: { payerId: userId, status: { [Op.in]: ['completed', 'held_escrow', 'awaiting_confirmation', 'refunded'] } } as any,
    attributes: ['amount'],
    limit: 2000,
  });
  const movimientos = await BalanceTransaction.findAll({
    where: { userId } as any,
    attributes: ['type', 'amount'],
    limit: 5000,
  });

  const dinero = {
    pagadoComoCliente: num(pagos.reduce((s, p: any) => s + (Number(p.amount) || 0), 0)),
    cobradoComoTrabajador: num(
      movimientos.filter((m: any) => m.type === 'payment').reduce((s, m: any) => s + (Number(m.amount) || 0), 0),
    ),
    devueltoAEsteUsuario: num(
      movimientos.filter((m: any) => m.type === 'refund').reduce((s, m: any) => s + (Number(m.amount) || 0), 0),
    ),
    saldoActual: num((user as any).balanceArs),
  };

  eventos.sort((a, b) => b.fecha.localeCompare(a.fecha));

  return {
    usuario: {
      id: String(user.id),
      name: (user as any).name,
      email: (user as any).email,
      createdAt: (user as any).createdAt ? new Date((user as any).createdAt).toISOString() : null,
    },
    resumen: {
      contratos: contratos.length,
      comoCliente: contratos.filter((c) => String((c as any).clientId) === String(userId)).length,
      comoTrabajador: contratos.filter((c) => String((c as any).doerId) === String(userId)).length,
      completados: contratos.filter((c) => (c as any).status === 'completed').length,
      cancelados: contratos.filter((c) => (c as any).status === 'cancelled').length,
      cancelacionesPropias: contratos.filter((c) => (c as any).status === 'cancelled' && String((c as any).cancelledBy) === String(userId)).length,
      disputasAbiertas,
      disputasGanadas,
      disputasPerdidas,
      disputasEnCurso,
      contracargos,
    },
    dinero,
    meses: [...porMes.values()],
    eventos: eventos.slice(0, 100),
  };
}

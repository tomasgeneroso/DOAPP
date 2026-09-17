import { Op } from 'sequelize';
import { Contract } from '../models/sql/Contract.model.js';
import { Dispute } from '../models/sql/Dispute.model.js';
import { AuditLog } from '../models/sql/AuditLog.model.js';
import { User } from '../models/sql/User.model.js';
import { leerMetadata } from '../utils/auditLog.js';
import { POLITICAS } from '../../shared/constants/policies.js';

/**
 * Detector de abuso de reclamos.
 *
 * Rappi y las de delivery lo tienen y no lo publican: una cuenta que reclama en
 * una proporcion alta de sus pedidos pierde el reembolso automatico y pasa a
 * revision. Aca no se bloquea nada solo: se marca al usuario en el panel de
 * admin como "con advertencia" para que una persona lo mire antes de resolver
 * su proxima disputa o devolucion.
 *
 * Lo que se mide, por usuario y sobre una ventana movil:
 *   contratos      cuantos tuvo (como cliente o como trabajador)
 *   disputas       cuantas abrio, y cuantas perdio
 *   contracargos   cuantos hizo (como cliente)
 *   cancelaciones  cuantas hizo el
 *
 * La regla no es un numero: es una PROPORCION sobre lo que hizo. Tres disputas
 * en tres contratos es un patron; tres en cuarenta es mala suerte. Y hay un
 * minimo de actividad: con un solo contrato no hay proporcion que valga.
 *
 * Los umbrales estan aca y no en policies.ts a proposito: no son una promesa
 * al usuario, son un criterio interno de revision. Se ajustan mirando el panel.
 */

export const UMBRALES = {
  /** Menos contratos que esto: no se evalua. */
  MINIMO_CONTRATOS: 3,
  /** Disputas abiertas / contratos. */
  DISPUTAS_ABIERTAS: 0.34,
  /** Disputas perdidas / disputas abiertas (cuando abrio al menos 2). */
  DISPUTAS_PERDIDAS: 0.5,
  /** Contracargos / contratos como cliente. Uno solo ya se marca con 5+ contratos. */
  CONTRACARGOS: 0.15,
  /** Cancelaciones propias / contratos. */
  CANCELACIONES: 0.34,
} as const;

export interface PerfilDeAbuso {
  userId: string;
  nombre: string;
  email: string;
  ventanaDias: number;
  contratos: number;
  contratosComoCliente: number;
  contratosComoTrabajador: number;
  disputasAbiertas: number;
  disputasPerdidas: number;
  disputasGanadas: number;
  contracargos: number;
  cancelacionesPropias: number;
  /** Por que esta marcado. Vacio = no esta marcado. */
  motivos: string[];
  nivel: 'ok' | 'advertencia' | 'revisar';
}

function perdioLaDisputa(d: any, userId: string): boolean {
  // Quien la abrio pierde si se resolvio del todo a favor del otro.
  const abrio = String(d.initiatedBy) === userId;
  const esCliente = String(d.clientId || '') === userId;
  if (d.status === 'resolved_released') return abrio ? esCliente : false; // se libero al trabajador: perdio el cliente
  if (d.status === 'resolved_refunded') return abrio ? !esCliente : false; // se devolvio al cliente: perdio el trabajador
  return false;
}

export async function perfilDeAbuso(userId: string, ventanaDias: number = POLITICAS.CANCELACION_VENTANA_DIAS): Promise<PerfilDeAbuso | null> {
  const user = await User.findByPk(userId, { attributes: ['id', 'name', 'email'] });
  if (!user) return null;
  const desde = new Date(Date.now() - ventanaDias * 86_400_000);

  const contratos = await Contract.findAll({
    where: {
      [Op.or]: [{ clientId: userId }, { doerId: userId }],
      createdAt: { [Op.gte]: desde },
      status: { [Op.in]: ['accepted', 'in_progress', 'awaiting_confirmation', 'completed', 'cancelled', 'disputed'] },
    } as any,
    attributes: ['id', 'clientId', 'doerId', 'status', 'cancelledBy'],
  });

  const ids = contratos.map((c) => c.id);
  const disputas = ids.length
    ? await Dispute.findAll({ where: { contractId: { [Op.in]: ids } } as any, attributes: ['id', 'contractId', 'initiatedBy', 'status'] })
    : [];
  const porContrato = new Map(contratos.map((c) => [String(c.id), c]));

  let disputasAbiertas = 0, disputasPerdidas = 0, disputasGanadas = 0;
  for (const d of disputas as any[]) {
    if (String(d.initiatedBy) !== userId) continue;
    disputasAbiertas++;
    const c = porContrato.get(String(d.contractId));
    const enriched = { ...d.toJSON(), clientId: c?.clientId };
    if (perdioLaDisputa(enriched, userId)) disputasPerdidas++;
    else if (String(d.status).startsWith('resolved_')) disputasGanadas++;
  }

  // Contracargos: quedan en el libro con el userId del cliente que lo hizo.
  const asientos = await AuditLog.findAll({
    where: { action: 'CHARGEBACK_RECEIVED', createdAt: { [Op.gte]: desde } } as any,
    limit: 2000,
  });
  let contracargos = 0;
  for (const a of asientos as any[]) {
    const m = leerMetadata(a) || {};
    if (String(m.userId || a.userId || '') === userId) contracargos++;
  }

  const cancelacionesPropias = contratos.filter((c) => c.status === 'cancelled' && String((c as any).cancelledBy) === userId).length;
  const contratosComoCliente = contratos.filter((c) => String(c.clientId) === userId).length;
  const contratosComoTrabajador = contratos.filter((c) => String(c.doerId) === userId).length;
  const total = contratos.length;

  const motivos: string[] = [];
  if (total >= UMBRALES.MINIMO_CONTRATOS) {
    if (disputasAbiertas / total >= UMBRALES.DISPUTAS_ABIERTAS) {
      motivos.push(`Abrió ${disputasAbiertas} disputas en ${total} contratos (${Math.round((disputasAbiertas / total) * 100)}%)`);
    }
    if (disputasAbiertas >= 2 && disputasPerdidas / disputasAbiertas >= UMBRALES.DISPUTAS_PERDIDAS) {
      motivos.push(`Perdió ${disputasPerdidas} de las ${disputasAbiertas} disputas que abrió`);
    }
    if (contratosComoCliente > 0 && contracargos / contratosComoCliente >= UMBRALES.CONTRACARGOS) {
      motivos.push(`${contracargos} contracargo${contracargos === 1 ? '' : 's'} en ${contratosComoCliente} contratos como cliente`);
    }
    if (cancelacionesPropias / total >= UMBRALES.CANCELACIONES) {
      motivos.push(`Canceló ${cancelacionesPropias} de ${total} contratos`);
    }
  } else if (contracargos >= 2) {
    // Un contracargo puede ser un error del banco. Dos, con poca actividad, no.
    motivos.push(`${contracargos} contracargos con solo ${total} contratos`);
  }

  const nivel: PerfilDeAbuso['nivel'] =
    motivos.length === 0 ? 'ok' : motivos.length >= 2 || contracargos >= 2 ? 'revisar' : 'advertencia';

  return {
    userId,
    nombre: (user as any).name,
    email: (user as any).email,
    ventanaDias,
    contratos: total,
    contratosComoCliente,
    contratosComoTrabajador,
    disputasAbiertas,
    disputasPerdidas,
    disputasGanadas,
    contracargos,
    cancelacionesPropias,
    motivos,
    nivel,
  };
}

/**
 * Los usuarios marcados, para el panel. Recorre solo a quienes tuvieron
 * actividad con consecuencias en la ventana (disputa, contracargo o
 * cancelacion): evaluar a todos los usuarios cada vez seria caro e inutil.
 */
export async function usuariosMarcados(ventanaDias: number = POLITICAS.CANCELACION_VENTANA_DIAS): Promise<PerfilDeAbuso[]> {
  const desde = new Date(Date.now() - ventanaDias * 86_400_000);
  const candidatos = new Set<string>();

  const disputas = await Dispute.findAll({ where: { createdAt: { [Op.gte]: desde } } as any, attributes: ['initiatedBy'] });
  for (const d of disputas as any[]) candidatos.add(String(d.initiatedBy));

  const cancelados = await Contract.findAll({
    where: { status: 'cancelled', updatedAt: { [Op.gte]: desde }, cancelledBy: { [Op.ne]: null } } as any,
    attributes: ['cancelledBy'],
  });
  for (const c of cancelados as any[]) if (c.cancelledBy) candidatos.add(String(c.cancelledBy));

  const asientos = await AuditLog.findAll({ where: { action: 'CHARGEBACK_RECEIVED', createdAt: { [Op.gte]: desde } } as any, limit: 2000 });
  for (const a of asientos as any[]) {
    const m = leerMetadata(a) || {};
    const u = m.userId || a.userId;
    if (u) candidatos.add(String(u));
  }

  const perfiles: PerfilDeAbuso[] = [];
  for (const id of candidatos) {
    const p = await perfilDeAbuso(id, ventanaDias);
    if (p && p.nivel !== 'ok') perfiles.push(p);
  }
  // Los peores primero.
  perfiles.sort((a, b) => (a.nivel === b.nivel ? b.motivos.length - a.motivos.length : a.nivel === 'revisar' ? -1 : 1));
  return perfiles;
}

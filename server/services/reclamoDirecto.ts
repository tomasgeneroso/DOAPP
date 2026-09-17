import { Op } from 'sequelize';
import { Dispute, IPropuestaAcuerdo, TipoAcuerdo } from '../models/sql/Dispute.model.js';
import { Contract } from '../models/sql/Contract.model.js';
import { Payment } from '../models/sql/Payment.model.js';
import { User } from '../models/sql/User.model.js';
import { Notification } from '../models/sql/Notification.model.js';
import { resolverDisputa } from './disputeResolution.js';
import { logMoneyEvent } from '../utils/auditLog.js';
import { logger } from './logger.js';
import { POLITICAS } from '../../shared/constants/policies.js';
import { estadoDelReclamo, plazoDeReclamo, TIPOS_DE_ACUERDO } from '../../shared/disputes/reclamo.js';

/**
 * Reclamo directo: lo que pasa en la base cuando las partes hablan, proponen,
 * aceptan, retiran o escalan. La logica de "quien puede que" vive en
 * shared/disputes/reclamo.ts y la usan tambien las pantallas; aca solo se
 * aplica y se mueve la plata, siempre por resolverDisputa (una sola puerta).
 */

const HORAS = POLITICAS.RECLAMO_DIRECTO_HORAS;
const $ = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`;

function log(d: Dispute, action: string, performedBy: string | null, details?: string) {
  d.logs = [...(d.logs || []), { action, performedBy: performedBy as any, timestamp: new Date(), details }];
  d.changed('logs', true);
}

async function avisar(recipientId: string, title: string, message: string, disputeId: string, type: 'info' | 'warning' | 'success' | 'error' = 'info') {
  await Notification.create({
    recipientId, type, category: 'disputes', title, message,
    relatedModel: 'Dispute', relatedId: disputeId, actionText: 'Ver reclamo', sentVia: ['in_app'],
  } as any);
  try {
    const { socketService } = await import('../index.js');
    socketService.notifyUser(String(recipientId), 'dispute:updated', { disputeId });
  } catch { /* sin socket en tests */ }
}

async function avisarAdmins(title: string, message: string, disputeId: string) {
  const admins = await User.findAll({ where: { role: { [Op.in]: ['admin', 'super_admin', 'owner', 'support'] } }, attributes: ['id'] });
  for (const a of admins) {
    await Notification.create({
      recipientId: a.id, type: 'warning', category: 'admin', title, message,
      relatedModel: 'Dispute', relatedId: disputeId, actionText: 'Revisar', sentVia: ['in_app'],
    } as any);
  }
}

/** Datos con los que arranca un reclamo. Se llama al crear la disputa. */
export function camposDeReclamoNuevo(contract: { status: string }, ahora = new Date()) {
  return {
    status: 'negotiation' as const,
    negotiationDeadline: plazoDeReclamo(ahora),
    contractStatusBefore: contract.status,
    agreementProposal: null,
    escalationReason: null,
  };
}

/** Texto que recibe la parte reclamada al abrirse el reclamo. */
export function mensajeDeApertura(titulo: string): { title: string; message: string } {
  return {
    title: 'Te hicieron un reclamo',
    message:
      `La otra parte abrio un reclamo por "${titulo}". Tenes ${HORAS} horas para responder y tratar de arreglarlo entre ustedes: ` +
      `podes contestar, proponer devolver una parte o rehacer el trabajo. Si en ${HORAS} horas no hay acuerdo, interviene un administrador. ` +
      `El pago del contrato queda congelado mientras tanto.`,
  };
}

/** Una parte propone un acuerdo. Reemplaza la propuesta anterior si la habia. */
export async function proponerAcuerdo(
  d: Dispute,
  userId: string,
  p: { tipo: TipoAcuerdo; monto?: number; nota?: string },
): Promise<{ ok: boolean; motivo?: string }> {
  if (!d.isNegotiating()) return { ok: false, motivo: 'El reclamo ya no esta en manos de las partes.' };
  if (String(d.initiatedBy) !== String(userId) && String(d.against) !== String(userId)) {
    return { ok: false, motivo: 'Solo las partes pueden proponer un acuerdo.' };
  }
  if (!TIPOS_DE_ACUERDO[p.tipo]) return { ok: false, motivo: 'Tipo de acuerdo invalido.' };

  const contract = await Contract.findByPk(d.contractId);
  if (!contract) return { ok: false, motivo: 'Contrato inexistente.' };

  let monto: number | undefined;
  if (p.tipo === 'reembolso_parcial') {
    monto = Math.round((Number(p.monto) || 0) * 100) / 100;
    const tope = Number((contract as any).allocatedAmount ?? contract.price) || 0;
    if (monto <= 0) return { ok: false, motivo: 'Indica cuanto se devuelve.' };
    if (monto >= tope) return { ok: false, motivo: `Para devolver todo el precio (${$(tope)}) elegi "devolver todo".` };
  }

  const propuesta: IPropuestaAcuerdo = {
    tipo: p.tipo,
    monto,
    nota: String(p.nota || '').slice(0, 1000),
    propuestoPor: String(userId),
    propuestaEl: new Date(),
  };
  d.agreementProposal = propuesta;
  d.changed('agreementProposal', true);
  log(d, 'Propuesta de acuerdo', userId, `${TIPOS_DE_ACUERDO[p.tipo].titulo}${monto ? ` · ${$(monto)}` : ''}${propuesta.nota ? ` · ${propuesta.nota}` : ''}`);
  await d.save();

  const otra = String(d.initiatedBy) === String(userId) ? d.against : d.initiatedBy;
  await avisar(
    String(otra),
    'Te proponen un acuerdo',
    `La otra parte propone: ${TIPOS_DE_ACUERDO[p.tipo].titulo.toLowerCase()}${monto ? ` (${$(monto)})` : ''}. ` +
      `Si aceptas, se aplica en el momento y el reclamo se cierra sin administrador. Si no, podes seguir conversando o pedir que intervenga uno.`,
    d.id,
  );
  return { ok: true };
}

/** La otra parte rechaza la propuesta vigente. Queda registrado; se puede seguir hablando. */
export async function rechazarAcuerdo(d: Dispute, userId: string, nota?: string): Promise<{ ok: boolean; motivo?: string }> {
  if (!d.isNegotiating()) return { ok: false, motivo: 'El reclamo ya no esta en manos de las partes.' };
  const p = d.agreementProposal;
  if (!p) return { ok: false, motivo: 'No hay una propuesta para rechazar.' };
  if (String(p.propuestoPor) === String(userId)) return { ok: false, motivo: 'Podes reemplazar tu propuesta, no rechazarla.' };

  d.agreementProposal = null;
  d.changed('agreementProposal', true);
  log(d, 'Propuesta rechazada', userId, `${TIPOS_DE_ACUERDO[p.tipo].titulo}${nota ? ` · ${String(nota).slice(0, 500)}` : ''}`);
  await d.save();
  await avisar(String(p.propuestoPor), 'Rechazaron tu propuesta', `La otra parte no acepto: ${TIPOS_DE_ACUERDO[p.tipo].titulo.toLowerCase()}.${nota ? ` Dijo: "${String(nota).slice(0, 300)}"` : ''} Podes proponer otra cosa o pedir que intervenga un administrador.`, d.id);
  return { ok: true };
}

/**
 * La otra parte acepta la propuesta: se aplica en el acto. Es la unica forma de
 * que se mueva plata sin un admin, y por eso pasa por resolverDisputa igual que
 * una resolucion: exclusion mutua, tope de devoluciones, libro de dinero.
 */
export async function aceptarAcuerdo(d: Dispute, userId: string): Promise<{ ok: boolean; motivo?: string }> {
  const estado = estadoDelReclamo(d as any, userId);
  if (!estado.puedeAceptarPropuesta) return { ok: false, motivo: 'No hay una propuesta de la otra parte para aceptar.' };
  const p = d.agreementProposal!;
  const contract = await Contract.findByPk(d.contractId);
  if (!contract) return { ok: false, motivo: 'Contrato inexistente.' };

  const nombres = await User.findAll({ where: { id: { [Op.in]: [d.initiatedBy, d.against] } }, attributes: ['id', 'name'] });
  const nombre = (id: string) => nombres.find((u) => String(u.id) === String(id))?.name || 'una de las partes';
  const quien = `Acuerdo directo entre las partes: ${nombre(p.propuestoPor)} propuso y ${nombre(userId)} acepto.`;

  if (p.tipo === 'rehacer') {
    // Sin plata de por medio: el contrato vuelve a donde estaba y el reclamo se cierra.
    await volverElContrato(d, contract);
    d.status = 'cancelled';
    d.resolution = `${quien} ${TIPOS_DE_ACUERDO.rehacer.titulo}. ${p.nota || ''}`.trim();
    d.resolutionType = 'no_action';
    d.resolvedAt = new Date();
    d.resolvedBy = null as any;
    log(d, 'Acuerdo aceptado', userId, TIPOS_DE_ACUERDO.rehacer.titulo);
    await d.save();
  } else {
    const r = await resolverDisputa({
      disputeId: String(d.id),
      tipo: p.tipo === 'reembolso_total' ? 'full_refund' : 'partial_refund',
      montoDevolucion: p.monto,
      resolucion: `${quien} ${TIPOS_DE_ACUERDO[p.tipo].titulo}${p.monto ? ` (${$(p.monto)})` : ''}. ${p.nota || ''}`.trim(),
      actor: `acuerdo:${userId}`,
      resueltoPor: null,
    });
    if (!r.ok) return { ok: false, motivo: r.motivo };
    await d.reload();
    log(d, 'Acuerdo aceptado', userId, `${TIPOS_DE_ACUERDO[p.tipo].titulo}${p.monto ? ` · ${$(p.monto)}` : ''}`);
    await d.save();
  }

  for (const parte of [d.initiatedBy, d.against]) {
    await avisar(String(parte), 'Reclamo cerrado por acuerdo', `${TIPOS_DE_ACUERDO[p.tipo].titulo}${p.monto ? ` (${$(p.monto)})` : ''}. Se aplico sin intervencion de un administrador.`, d.id, 'success');
  }
  logger.info('disputes', `Reclamo ${d.id} cerrado por acuerdo (${p.tipo}) aceptado por ${userId}`);
  return { ok: true };
}

/** Quien abrio el reclamo lo retira. El contrato vuelve a donde estaba. */
export async function retirarReclamo(d: Dispute, userId: string, nota?: string): Promise<{ ok: boolean; motivo?: string }> {
  if (!d.isNegotiating()) return { ok: false, motivo: 'Solo se puede retirar mientras el reclamo esta entre las partes; despues decide el administrador.' };
  if (String(d.initiatedBy) !== String(userId)) return { ok: false, motivo: 'Solo quien abrio el reclamo puede retirarlo.' };
  const contract = await Contract.findByPk(d.contractId);
  if (!contract) return { ok: false, motivo: 'Contrato inexistente.' };

  await volverElContrato(d, contract);
  d.status = 'cancelled';
  d.resolution = `Reclamo retirado por quien lo abrio.${nota ? ` ${String(nota).slice(0, 500)}` : ''}`;
  d.resolutionType = 'no_action';
  d.resolvedAt = new Date();
  d.agreementProposal = null;
  d.changed('agreementProposal', true);
  log(d, 'Reclamo retirado', userId, nota ? String(nota).slice(0, 500) : undefined);
  await d.save();

  await avisar(String(d.against), 'Retiraron el reclamo', 'La otra parte retiro el reclamo. El contrato sigue como estaba y el pago deja de estar congelado.', d.id, 'success');
  return { ok: true };
}

/**
 * Pasa a manos de un administrador. Lo pide una parte (si puede) o el reloj.
 * No cambia el reloj del silencio: si la parte reclamada nunca contesto, a los
 * 7 dias de la apertura pierde igual (T&C 10.10).
 */
export async function escalarReclamo(
  d: Dispute,
  quien: { userId: string } | { sistema: 'plazo_vencido' } | { adminId: string; justificacion: string },
): Promise<{ ok: boolean; motivo?: string }> {
  if (!d.isNegotiating()) return { ok: false, motivo: 'El reclamo ya esta en manos de un administrador o cerrado.' };

  let motivo: string;
  let performedBy: string | null = null;
  if ('userId' in quien) {
    const estado = estadoDelReclamo(d as any, quien.userId);
    if (!estado.puedeEscalar) return { ok: false, motivo: estado.motivoNoEscalar };
    motivo = 'pedido_de_parte';
    performedBy = quien.userId;
  } else if ('adminId' in quien) {
    // Un admin puede intervenir antes de las 72 h (abuso evidente, emergencia),
    // pero tiene que decir por que: el plazo es de las partes.
    if (String(quien.justificacion || '').trim().length < 15) {
      return { ok: false, motivo: 'Para intervenir antes del plazo hace falta una justificacion (15 caracteres o mas).' };
    }
    motivo = 'intervencion_admin';
    performedBy = quien.adminId;
  } else {
    motivo = quien.sistema;
  }

  d.status = 'open';
  d.escalatedAt = new Date();
  d.escalationReason = motivo;
  // La propuesta vigente queda en el log; el admin decide con todo a la vista.
  if (d.agreementProposal) {
    log(d, 'Propuesta pendiente al escalar', null, `${TIPOS_DE_ACUERDO[d.agreementProposal.tipo].titulo}${d.agreementProposal.monto ? ` · ${$(d.agreementProposal.monto)}` : ''} (propuso ${d.agreementProposal.propuestoPor})`);
  }
  log(
    d,
    'Interviene un administrador',
    performedBy,
    motivo === 'plazo_vencido'
      ? `Vencieron las ${HORAS} h sin acuerdo`
      : motivo === 'intervencion_admin'
        ? `Intervencion anticipada: ${(quien as any).justificacion}`
        : 'Lo pidio una de las partes',
  );
  await d.save();

  const texto = motivo === 'plazo_vencido'
    ? `Pasaron ${HORAS} horas sin acuerdo entre las partes. Un administrador va a revisar el reclamo y decidir. Vas a poder seguir escribiendo y adjuntando pruebas.`
    : motivo === 'intervencion_admin'
      ? 'Un administrador decidio intervenir en el reclamo antes del plazo. Va a revisarlo y decidir. Podes seguir escribiendo y adjuntando pruebas.'
      : 'Una de las partes pidio que intervenga un administrador. Va a revisar el reclamo y decidir. Podes seguir escribiendo y adjuntando pruebas.';
  for (const parte of [d.initiatedBy, d.against]) {
    await avisar(String(parte), 'Interviene un administrador', texto, d.id, 'warning');
  }
  if (motivo !== 'intervencion_admin') {
    await avisarAdmins(
      'Reclamo escalado a disputa',
      `El reclamo ${String(d.id).slice(0, 8)} paso a disputa (${motivo === 'plazo_vencido' ? `vencieron las ${HORAS} h` : 'lo pidio una parte'}). Objetivo del equipo: resolver en ${POLITICAS.DISPUTA_OBJETIVO_RESOLUCION_DIAS} dias.`,
      d.id,
    );
  }

  await logMoneyEvent({
    action: 'DISPUTE_ESCALATED',
    actor: performedBy ? `user:${performedBy}` : 'system:reclamo',
    severity: 'high',
    description: `Reclamo directo escalado a disputa (${motivo})`,
    contractId: String(d.contractId),
    disputeId: String(d.id),
    metadata: { motivo, propuestaPendiente: d.agreementProposal || null },
  });

  logger.info('disputes', `Reclamo ${d.id} escalado (${motivo})`);
  return { ok: true };
}

/** El contrato vuelve al estado previo al reclamo y el pago deja de estar en disputa. */
async function volverElContrato(d: Dispute, contract: Contract) {
  const previo = d.contractStatusBefore || 'in_progress';
  await contract.update({
    status: previo,
    disputeId: null,
    disputeResolvedAt: new Date(),
  } as any);
  const payment = d.paymentId ? await Payment.findByPk(d.paymentId) : await Payment.findOne({ where: { contractId: contract.id } });
  if (payment && String(payment.status) === 'disputed') {
    // Vuelve al estado que tenia el escrow: si estaba retenido, sigue retenido.
    await payment.update({ status: (payment as any).isEscrow ? 'held_escrow' : 'completed', disputeId: null } as any);
  }
}

/**
 * Cron: avisa a las 24 h del vencimiento y escala al vencer.
 * Corre cada 15 minutos: el reloj que ve el usuario tiene que coincidir con
 * lo que hace el sistema, y un cron de 6 horas haria mentir al reloj.
 */
export async function revisarReclamosDirectos(ahora = new Date()): Promise<{ avisados: number; escalados: number }> {
  const enReclamo = await Dispute.findAll({ where: { status: 'negotiation' }, limit: 500 });
  let avisados = 0;
  let escalados = 0;

  for (const d of enReclamo) {
    try {
      const plazo = d.negotiationDeadline ? new Date(d.negotiationDeadline) : plazoDeReclamo(d.createdAt);
      if (ahora >= plazo) {
        const r = await escalarReclamo(d, { sistema: 'plazo_vencido' });
        if (r.ok) escalados++;
        continue;
      }
      const avisoDesde = new Date(plazo.getTime() - POLITICAS.RECLAMO_DIRECTO_AVISO_HORAS_ANTES * 3_600_000);
      if (ahora >= avisoDesde && !(d.logs || []).some((l: any) => l.action === 'aviso_reclamo')) {
        const horas = Math.max(1, Math.round((plazo.getTime() - ahora.getTime()) / 3_600_000));
        for (const parte of [d.initiatedBy, d.against]) {
          await avisar(String(parte), `Quedan ${horas} h para arreglar el reclamo`, `Si en ${horas} horas no hay acuerdo, interviene un administrador y decide con lo que haya en el reclamo. Todavia pueden proponer un acuerdo o retirarlo.`, d.id, 'warning');
        }
        log(d, 'aviso_reclamo', null, `Aviso a las dos partes · quedan ${horas} h`);
        await d.save();
        avisados++;
      }
    } catch (e: any) {
      logger.error('disputes', `Error revisando reclamo ${d.id}: ${e.message}`);
    }
  }
  return { avisados, escalados };
}

export function startReclamoDirectoJob(): void {
  const QUINCE_MIN = 15 * 60 * 1000;
  setInterval(() => {
    revisarReclamosDirectos().catch((e) => logger.error('disputes', `reclamoDirecto: ${e.message}`));
  }, QUINCE_MIN);
}

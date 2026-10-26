import { Op } from 'sequelize';
import { sequelize } from '../config/database.js';
import { ContractChangeRequest } from '../models/sql/ContractChangeRequest.model.js';
import { ContractCancellationRequest } from '../models/sql/ContractCancellationRequest.model.js';
import { Contract } from '../models/sql/Contract.model.js';
import { Job } from '../models/sql/Job.model.js';
import { User } from '../models/sql/User.model.js';
import { Ticket } from '../models/sql/Ticket.model.js';
import { siguienteNumeroDeTicket } from './numeroDeTicket.js';
import { Notification } from '../models/sql/Notification.model.js';
import { DONDE_ES_ADMIN } from '../utils/admins.js';
import { logEvento } from '../utils/auditLog.js';
import emailService from './email.js';
import { config } from '../config/env.js';

/**
 * Solicitudes de cambio o cancelación de un contrato, que la otra parte acepta o rechaza.
 *
 * Qué había: la pantalla del cliente y la de la app las mostraban, pero el flujo no corría de punta a punta. Crear una
 * solicitud fallaba (se escribía un campo que el modelo no tiene), leerla fallaba (se pedía una asociación con el nombre
 * de una columna), la tabla no tenía migración, el escalamiento a soporte armaba un ticket con campos inexistentes y
 * los enlaces de los correos iban a una pantalla que no existe. Y lo que sí andaba hacía daño:
 *  - Aceptar una CANCELACIÓN ponía el contrato en «cancelled» sin mover un peso: el pago en garantía quedaba retenido
 *    para siempre contra un contrato cancelado, y se salteaba la revisión del administrador que el resto de las
 *    cancelaciones sí tiene (`/request-cancellation`, términos 9.2 y 9.3).
 *  - Aceptar una MODIFICACIÓN de precio escribía el precio nuevo y un total «×1,1» a mano: no cobraba ni devolvía la
 *    diferencia y la comisión estaba escrita a mano (la vigente vive en `commissionService`).
 *
 * Reglas de ahora (falla cerrado: lo que no se puede resolver bien, no se hace):
 *  - Aceptar una cancelación NO cancela: abre la solicitud de cancelación oficial, marcada de mutuo acuerdo, y la
 *    resuelve un administrador, que es quien decide el dinero. Mientras tanto el trabajo queda en pausa, como en el
 *    camino oficial.
 *  - El precio no se cambia por acá. Mueve plata y tiene sus trámites (cambio de presupuesto del trabajo, ajuste del
 *    contrato antes de que haya propuestas). Lo que sí se puede acordar: fecha de inicio (antes de empezar), fecha de
 *    fin y una nota. Se aplican al contrato y, si el trabajo tiene un solo lugar, también al trabajo.
 *  - Solo se pide cambiar un contrato vivo (pendiente, listo, aceptado o en curso), una sola solicitud pendiente por
 *    contrato, y solo la otra parte responde, una sola vez.
 */

export const HORAS_PARA_RESPONDER = 48;
export const ESTADOS_QUE_ADMITEN_CAMBIOS = ['pending', 'ready', 'accepted', 'in_progress'] as const;
/** Antes de empezar: recién ahí se puede mover la fecha de inicio. */
export const ESTADOS_SIN_INICIAR = ['pending', 'ready', 'accepted'] as const;
export const LIMITE_NOTA = 500;
export const LIMITE_MOTIVO = 1000;

const PRECIO_FUERA =
  'El precio no se cambia con una solicitud de cambio: mueve dinero y tiene su propio trámite. ' +
  'Escribinos desde el Centro de ayuda y lo resolvemos con vos.';

export const admiteCambios = (estado: unknown): boolean => (ESTADOS_QUE_ADMITEN_CAMBIOS as readonly string[]).includes(String(estado));
export const noEmpezo = (estado: unknown): boolean => (ESTADOS_SIN_INICIAR as readonly string[]).includes(String(estado));

export interface NuevosTerminos {
  startDate?: string;
  endDate?: string;
  description?: string;
}

export type ResultadoDeValidar = { ok: true; terminos: NuevosTerminos } | { ok: false; mensaje: string };

const fechaDe = (v: unknown): Date | null => {
  if (v === undefined || v === null || v === '') return null;
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Qué se puede acordar en una modificación. Todo lo que no entra acá se rechaza con un motivo claro. */
export function validarNuevosTerminos(
  crudos: unknown,
  contrato: { status: unknown; startDate: Date | string; endDate: Date | string },
  ahora: Date = new Date(),
): ResultadoDeValidar {
  if (!crudos || typeof crudos !== 'object' || Array.isArray(crudos)) {
    return { ok: false, mensaje: 'Indicá qué querés cambiar: la fecha de inicio, la de fin o una nota.' };
  }
  const t = crudos as Record<string, unknown>;
  if (t.price !== undefined && t.price !== null && t.price !== '') return { ok: false, mensaje: PRECIO_FUERA };
  if (!noEmpezo(contrato.status) && !(String(contrato.status) === 'in_progress')) {
    return { ok: false, mensaje: 'Este contrato ya no admite cambios.' };
  }

  const out: NuevosTerminos = {};
  const inicio = fechaDe(t.startDate);
  const fin = fechaDe(t.endDate);
  if ((t.startDate !== undefined && t.startDate !== null && t.startDate !== '') && !inicio) return { ok: false, mensaje: 'La fecha de inicio no es válida.' };
  if ((t.endDate !== undefined && t.endDate !== null && t.endDate !== '') && !fin) return { ok: false, mensaje: 'La fecha de fin no es válida.' };

  if (inicio) {
    if (!noEmpezo(contrato.status)) return { ok: false, mensaje: 'El trabajo ya empezó: ya no se puede cambiar la fecha de inicio.' };
    if (inicio.getTime() <= ahora.getTime()) return { ok: false, mensaje: 'La fecha de inicio tiene que ser futura.' };
    out.startDate = inicio.toISOString();
  }
  if (fin) {
    if (fin.getTime() <= ahora.getTime()) return { ok: false, mensaje: 'La fecha de fin tiene que ser futura.' };
    out.endDate = fin.toISOString();
  }
  if (inicio || fin) {
    const inicioFinal = inicio ?? new Date(contrato.startDate);
    const finFinal = fin ?? new Date(contrato.endDate);
    if (inicioFinal.getTime() >= finFinal.getTime()) return { ok: false, mensaje: 'La fecha de inicio tiene que ser anterior a la de fin.' };
  }

  if (t.description !== undefined && t.description !== null && t.description !== '') {
    if (typeof t.description !== 'string') return { ok: false, mensaje: 'La nota tiene que ser un texto.' };
    const nota = t.description.trim();
    if (nota.length > LIMITE_NOTA) return { ok: false, mensaje: `La nota no puede pasar de ${LIMITE_NOTA} caracteres.` };
    if (nota) out.description = nota;
  }

  if (!out.startDate && !out.endDate && !out.description) {
    return { ok: false, mensaje: 'Indicá qué querés cambiar: la fecha de inicio, la de fin o una nota.' };
  }
  return { ok: true, terminos: out };
}

export function validarMotivo(crudo: unknown): { ok: true; motivo: string } | { ok: false; mensaje: string } {
  const motivo = typeof crudo === 'string' ? crudo.trim() : '';
  if (motivo.length < 5) return { ok: false, mensaje: 'Contá brevemente el motivo (al menos 5 caracteres).' };
  if (motivo.length > LIMITE_MOTIVO) return { ok: false, mensaje: `El motivo no puede pasar de ${LIMITE_MOTIVO} caracteres.` };
  return { ok: true, motivo };
}

/** El texto de la persona va a un correo en HTML: se escapa, no se confía. */
export const escaparHtml = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const clienteUrl = () => config.clientUrl || 'https://doapparg.com';
const nombreDelTipo = (tipo: unknown) => (tipo === 'cancel' ? 'cancelación' : 'modificación');

/** La forma que consumen la web y la app: `requestedBy` y `respondedBy` son personas, no ids. */
export function serializarSolicitud(cr: any): Record<string, unknown> {
  const j = typeof cr?.toJSON === 'function' ? cr.toJSON() : { ...cr };
  const { requester, responder, ...resto } = j;
  return {
    ...resto,
    requestedById: j.requestedBy ?? null,
    respondedById: j.respondedBy ?? null,
    requestedBy: requester ?? null,
    respondedBy: responder ?? null,
  };
}

export const INCLUIR_PERSONAS = [
  { model: User, as: 'requester', attributes: ['id', 'name', 'email', 'avatar'] },
  { model: User, as: 'responder', attributes: ['id', 'name', 'email', 'avatar'] },
];

const INCLUIR_CONTRATO = {
  model: Contract,
  as: 'contract',
  include: [
    { model: User, as: 'client', attributes: ['id', 'name', 'email', 'avatar'] },
    { model: User, as: 'doer', attributes: ['id', 'name', 'email', 'avatar'] },
    { model: Job, as: 'job' },
  ],
};

async function avisar(usuarioId: string, titulo: string, mensaje: string, contractId: string, solicitudId: string, correo: { to?: string; html: string; asunto: string }) {
  // Un aviso que falla no puede tumbar lo que ya se hizo: se anota y se sigue.
  try {
    await Notification.create({
      recipientId: usuarioId,
      type: 'info',
      category: 'contract',
      title: titulo,
      message: mensaje,
      relatedModel: 'ContractChangeRequest',
      relatedId: solicitudId,
      actionText: 'Ver solicitud',
      actionUrl: `/contracts/${contractId}/change-requests/${solicitudId}`,
      sentVia: ['in_app'],
    } as any);
  } catch (e: any) {
    console.error('[solicitudes de cambio] no se pudo crear el aviso:', e?.message);
  }
  if (correo.to) {
    try {
      await emailService.sendEmail({ to: correo.to, subject: correo.asunto, html: correo.html });
    } catch (e: any) {
      console.error('[solicitudes de cambio] no se pudo mandar el correo:', e?.message);
    }
  }
}

const boton = (url: string, texto: string, color = '#0ea5e9') =>
  `<p><a href="${url}" style="display:inline-block;padding:12px 24px;background-color:${color};color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;">${texto}</a></p>`;

export type RespuestaDelServicio<T = {}> = ({ ok: true } & T) | { ok: false; status: number; mensaje: string };

/** Crear la solicitud. */
export async function crearSolicitud(args: {
  contractId: string;
  userId: string;
  type: unknown;
  reason: unknown;
  newTerms?: unknown;
}): Promise<RespuestaDelServicio<{ solicitud: any }>> {
  const { contractId, userId } = args;
  if (args.type !== 'cancel' && args.type !== 'modify') return { ok: false, status: 400, mensaje: 'Tipo inválido' };
  const motivo = validarMotivo(args.reason);
  if (motivo.ok === false) return { ok: false, status: 400, mensaje: motivo.mensaje };

  const contrato: any = await Contract.findByPk(contractId, {
    include: [
      { model: User, as: 'client', attributes: ['id', 'name', 'email'] },
      { model: User, as: 'doer', attributes: ['id', 'name', 'email'] },
      { model: Job, as: 'job', attributes: ['id', 'title'] },
    ],
  });
  if (!contrato) return { ok: false, status: 404, mensaje: 'Contrato no encontrado' };

  const esCliente = String(contrato.clientId) === String(userId);
  const esTrabajador = String(contrato.doerId) === String(userId);
  if (!esCliente && !esTrabajador) return { ok: false, status: 403, mensaje: 'No tenés permiso para pedir cambios en este contrato' };

  if (!admiteCambios(contrato.status)) {
    return { ok: false, status: 400, mensaje: 'Este contrato ya no admite cambios: está terminado, cancelado, en revisión o en disputa.' };
  }

  let terminos: NuevosTerminos | undefined;
  if (args.type === 'modify') {
    const v = validarNuevosTerminos(args.newTerms, contrato);
    if (v.ok === false) return { ok: false, status: 400, mensaje: v.mensaje };
    terminos = v.terminos;
  }

  if (args.type === 'cancel') {
    const oficial = await ContractCancellationRequest.findOne({ where: { contractId, status: 'pending' } });
    if (oficial) return { ok: false, status: 400, mensaje: 'Ya hay una solicitud de cancelación en revisión para este contrato.' };
  }

  let solicitud: any;
  try {
    solicitud = await ContractChangeRequest.create({
      contractId,
      requestedBy: userId,
      type: args.type,
      reason: motivo.motivo,
      newTerms: terminos,
    } as any);
  } catch (e: any) {
    // El índice único (un solo pendiente por contrato) también cierra la carrera de dos pedidos a la vez.
    if (e?.name === 'SequelizeUniqueConstraintError') return { ok: false, status: 400, mensaje: 'Ya existe una solicitud pendiente para este contrato' };
    throw e;
  }

  const otraParte = esCliente ? contrato.doer : contrato.client;
  const quien = esCliente ? contrato.client : contrato.doer;
  const trabajo = contrato.job?.title || 'Contrato';
  const url = `${clienteUrl()}/contracts/${contractId}/change-requests/${solicitud.id}`;
  const cambios = terminos
    ? `<p><strong>Lo que se propone:</strong></p><ul>
        ${terminos.startDate ? `<li>Fecha de inicio: ${new Date(terminos.startDate).toLocaleDateString('es-AR')}</li>` : ''}
        ${terminos.endDate ? `<li>Fecha de fin: ${new Date(terminos.endDate).toLocaleDateString('es-AR')}</li>` : ''}
        ${terminos.description ? `<li>Nota: ${escaparHtml(terminos.description)}</li>` : ''}
      </ul>`
    : '';
  await avisar(
    String(otraParte.id),
    `Solicitud de ${nombreDelTipo(args.type)} de contrato`,
    `${quien.name} pidió ${args.type === 'cancel' ? 'cancelar' : 'modificar'} el contrato de "${trabajo}". Tenés ${HORAS_PARA_RESPONDER / 24} días para responder.`,
    contractId,
    solicitud.id,
    {
      to: otraParte.email,
      asunto: `Solicitud de ${nombreDelTipo(args.type)} de contrato - ${trabajo}`,
      html: `<h2>Solicitud de ${nombreDelTipo(args.type)} de contrato</h2>
        <p><strong>${escaparHtml(quien.name)}</strong> pidió ${args.type === 'cancel' ? 'cancelar' : 'modificar'} el contrato de <strong>${escaparHtml(trabajo)}</strong>.</p>
        <p><strong>Motivo:</strong></p><p>${escaparHtml(motivo.motivo)}</p>${cambios}
        ${args.type === 'cancel' ? '<p>Si aceptás, se abre una cancelación de mutuo acuerdo que revisa un administrador (es quien resuelve el dinero).</p>' : ''}
        <p style="color:#d97706;font-weight:bold;">⏰ Tenés ${HORAS_PARA_RESPONDER / 24} días para responder. Si no respondés, la solicitud pasa a soporte.</p>
        ${boton(url, 'Ver solicitud y responder')}`,
    },
  );

  await logEvento({
    action: 'CONTRACT_CHANGE_REQUESTED',
    actor: `user:${userId}`,
    performedBy: userId,
    category: 'contract',
    severity: 'medium',
    description: `Pidió ${args.type === 'cancel' ? 'cancelar' : 'modificar'} el contrato ${contractId}`,
    targetModel: 'Contract',
    targetId: String(contractId),
    metadata: { solicitudId: solicitud.id, tipo: args.type, motivo: motivo.motivo, nuevosTerminos: terminos ?? null },
  });

  return { ok: true, solicitud };
}

/** Datos de la solicitud de cancelación oficial que abre un mutuo acuerdo. */
function prioridadDe(contrato: any): 'medium' | 'high' | 'urgent' {
  const dias = Math.ceil((new Date(contrato.startDate).getTime() - Date.now()) / 86_400_000);
  if (contrato.status === 'in_progress' || dias <= 1) return 'urgent';
  if (dias <= 3) return 'high';
  return 'medium';
}

/**
 * Abre la solicitud de cancelación OFICIAL (la que revisa un administrador). Es lo que hace aceptar una cancelación:
 * el contrato no se cancela solo, porque cancelar mueve plata y eso lo decide una persona con los términos 9.2/9.3.
 */
export async function abrirCancelacionDeMutuoAcuerdo(
  contrato: any,
  solicitud: any,
  quienAcepto: string,
  t: any,
): Promise<{ id: string; yaExistia: boolean }> {
  const existente: any = await ContractCancellationRequest.findOne({ where: { contractId: contrato.id, status: 'pending' }, transaction: t });
  if (existente) return { id: existente.id, yaExistia: true };

  const job: any = contrato.job || (await Job.findByPk(contrato.jobId, { transaction: t }));
  const prioridad = prioridadDe(contrato);
  const motivo = `Cancelación de mutuo acuerdo: la otra parte aceptó la solicitud. Motivo original: ${solicitud.reason}`.slice(0, 2000);
  const oficial: any = await ContractCancellationRequest.create(
    {
      contractId: contrato.id,
      jobId: contrato.jobId,
      requestedBy: solicitud.requestedBy,
      otherPartyId: quienAcepto,
      reason: motivo,
      category: 'other',
      requestType: 'full_cancellation',
      priority: prioridad,
      previousJobStatus: job?.status || null,
      previousContractStatus: contrato.status,
      statusHistory: [
        {
          status: 'pending',
          changedAt: new Date(),
          changedBy: quienAcepto,
          note: `Solicitud creada de mutuo acuerdo (solicitud de cambio ${solicitud.id})`,
        },
      ],
    } as any,
    { transaction: t },
  );

  // Igual que el camino oficial: mientras se revisa, el trabajo no recibe a nadie más.
  if (job && !['completed', 'cancelled', 'paused'].includes(String(job.status))) {
    job.status = 'paused';
    job.pausedReason = 'Solicitud de cancelación de contrato pendiente';
    job.pausedAt = new Date();
    await job.save({ transaction: t });
  }
  return { id: oficial.id, yaExistia: false };
}

/** Responder (aceptar o rechazar). Una sola vez, solo la otra parte. */
export async function responderSolicitud(args: {
  id: string;
  userId: string;
  accept: boolean;
}): Promise<RespuestaDelServicio<{ solicitud: any; cancelacionOficialId?: string; cambiosAplicados?: Record<string, unknown> }>> {
  const t = await sequelize.transaction();
  let correo: null | { to?: string; asunto: string; html: string; usuarioId: string; titulo: string; mensaje: string; contractId: string } = null;
  try {
    const solicitud: any = await ContractChangeRequest.findByPk(args.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!solicitud) { await t.rollback(); return { ok: false, status: 404, mensaje: 'Solicitud no encontrada' }; }
    if (solicitud.status !== 'pending') { await t.rollback(); return { ok: false, status: 400, mensaje: 'Esta solicitud ya fue procesada' }; }

    const contrato: any = await Contract.findByPk(solicitud.contractId, {
      include: [
        { model: User, as: 'client', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'doer', attributes: ['id', 'name', 'email'] },
        { model: Job, as: 'job' },
      ],
      transaction: t,
      // El bloqueo es del contrato; el trabajo y las personas se leen sin bloquear (Postgres no deja bloquear el lado
      // opcional de un JOIN).
      lock: { level: t.LOCK.UPDATE, of: Contract },
    } as any);
    if (!contrato) { await t.rollback(); return { ok: false, status: 404, mensaje: 'Contrato no encontrado' }; }

    const yo = String(args.userId);
    if (String(solicitud.requestedBy) === yo) { await t.rollback(); return { ok: false, status: 400, mensaje: 'No podés responder tu propia solicitud' }; }
    const esCliente = String(contrato.clientId) === yo;
    const esTrabajador = String(contrato.doerId) === yo;
    if (!esCliente && !esTrabajador) { await t.rollback(); return { ok: false, status: 403, mensaje: 'No tenés permiso para responder esta solicitud' }; }

    const quienPidio = esCliente ? contrato.doer : contrato.client;
    const quienRespondio = esCliente ? contrato.client : contrato.doer;
    const trabajo = contrato.job?.title || 'Contrato';
    const urlContrato = `${clienteUrl()}/contracts/${contrato.id}`;
    let cancelacionOficialId: string | undefined;
    let cambiosAplicados: Record<string, unknown> | undefined;
    let detalle = '';

    if (args.accept) {
      // Mientras esperaba, el contrato puede haber terminado, haberse cancelado o entrado en disputa.
      if (!admiteCambios(contrato.status)) {
        await t.rollback();
        return { ok: false, status: 409, mensaje: 'El contrato cambió de estado mientras tanto y ya no admite este cambio. Pedí una solicitud nueva si todavía hace falta.' };
      }

      if (solicitud.type === 'cancel') {
        const r = await abrirCancelacionDeMutuoAcuerdo(contrato, solicitud, yo, t);
        cancelacionOficialId = r.id;
        detalle = '<p>Se abrió una <strong>cancelación de mutuo acuerdo</strong>. Un administrador la revisa y resuelve el dinero según los términos; el contrato sigue como está hasta entonces.</p>';
      } else {
        const v = validarNuevosTerminos(solicitud.newTerms, contrato);
        if (v.ok === false) { await t.rollback(); return { ok: false, status: 409, mensaje: v.mensaje }; }
        const antes: Record<string, unknown> = { startDate: contrato.startDate, endDate: contrato.endDate, notes: contrato.notes ?? null };
        const cambios: Record<string, unknown> = {};
        if (v.terminos.startDate) { contrato.startDate = new Date(v.terminos.startDate); cambios.startDate = v.terminos.startDate; }
        if (v.terminos.endDate) { contrato.endDate = new Date(v.terminos.endDate); cambios.endDate = v.terminos.endDate; }
        if (v.terminos.description) {
          const linea = `[Cambio acordado el ${new Date().toLocaleDateString('es-AR')}] ${v.terminos.description}`;
          contrato.notes = [contrato.notes, linea].filter(Boolean).join('\n').slice(-1000);
          cambios.notes = linea;
        }
        await contrato.save({ transaction: t });

        // El trabajo con un solo lugar comparte las fechas con su único contrato: si no se mueven juntas, los avisos
        // y la auto-selección siguen mirando las viejas. Con varios lugares las fechas son de todos: no se tocan.
        const job: any = contrato.job;
        const unSoloLugar = job && Number(job.maxWorkers || 1) <= 1;
        if (unSoloLugar && (v.terminos.startDate || v.terminos.endDate)) {
          if (v.terminos.startDate) {
            job.startDate = new Date(v.terminos.startDate);
            job.reminder12hSent = false; job.reminder6hSent = false; job.reminder2hSent = false;
          }
          if (v.terminos.endDate) job.endDate = new Date(v.terminos.endDate);
          await job.save({ transaction: t });
        }
        cambiosAplicados = cambios;
        await logEvento({
          action: 'CONTRACT_TERMS_CHANGED',
          actor: `user:${yo}`,
          performedBy: yo,
          category: 'contract',
          severity: 'medium',
          description: `Se aplicaron los cambios acordados del contrato ${contrato.id}`,
          targetModel: 'Contract',
          targetId: String(contrato.id),
          changes: Object.keys(cambios).map((k) => ({ field: k, oldValue: antes[k] ?? null, newValue: cambios[k] })),
          metadata: { solicitudId: solicitud.id, pidio: solicitud.requestedBy, acepto: yo },
        });
        detalle = '<p>Los cambios acordados ya están aplicados al contrato.</p>';
      }
    }

    solicitud.status = args.accept ? 'accepted' : 'rejected';
    solicitud.respondedBy = yo;
    solicitud.respondedAt = new Date();
    await solicitud.save({ transaction: t });
    await t.commit();

    await logEvento({
      action: args.accept ? 'CONTRACT_CHANGE_ACCEPTED' : 'CONTRACT_CHANGE_REJECTED',
      actor: `user:${yo}`,
      performedBy: yo,
      category: 'contract',
      severity: 'medium',
      description: `${args.accept ? 'Aceptó' : 'Rechazó'} la solicitud de ${nombreDelTipo(solicitud.type)} del contrato ${contrato.id}`,
      targetModel: 'Contract',
      targetId: String(contrato.id),
      metadata: { solicitudId: solicitud.id, pidio: solicitud.requestedBy, tipo: solicitud.type, cancelacionOficialId: cancelacionOficialId ?? null },
    });

    if (cancelacionOficialId) await avisarAAdministradores(contrato, cancelacionOficialId, trabajo);

    correo = {
      usuarioId: String(quienPidio.id),
      to: quienPidio.email,
      contractId: String(contrato.id),
      titulo: args.accept ? `Aceptaron tu solicitud de ${nombreDelTipo(solicitud.type)}` : `Rechazaron tu solicitud de ${nombreDelTipo(solicitud.type)}`,
      mensaje: args.accept
        ? solicitud.type === 'cancel'
          ? `${quienRespondio.name} aceptó cancelar "${trabajo}". Un administrador revisa la cancelación y resuelve el dinero.`
          : `${quienRespondio.name} aceptó los cambios de "${trabajo}" y ya están aplicados.`
        : `${quienRespondio.name} rechazó tu solicitud para "${trabajo}".`,
      asunto: `Solicitud de ${nombreDelTipo(solicitud.type)} ${args.accept ? 'aceptada' : 'rechazada'} - ${trabajo}`,
      html: `<h2>${args.accept ? '✅ Tu solicitud fue aceptada' : '❌ Tu solicitud fue rechazada'}</h2>
        <p><strong>${escaparHtml(quienRespondio.name)}</strong> ${args.accept ? 'aceptó' : 'rechazó'} tu solicitud de ${nombreDelTipo(solicitud.type)} para <strong>${escaparHtml(trabajo)}</strong>.</p>
        ${args.accept ? detalle : '<p>Si necesitás ayuda, escribinos desde el Centro de ayuda.</p>'}
        ${boton(urlContrato, 'Ver contrato', args.accept ? '#10b981' : '#0ea5e9')}`,
    };
    await avisar(correo.usuarioId, correo.titulo, correo.mensaje, correo.contractId, String(solicitud.id), { to: correo.to, asunto: correo.asunto, html: correo.html });

    return { ok: true, solicitud, cancelacionOficialId, cambiosAplicados };
  } catch (e) {
    try { await t.rollback(); } catch { /* ya estaba cerrada */ }
    throw e;
  }
}

async function avisarAAdministradores(contrato: any, cancelacionId: string, trabajo: string) {
  try {
    const admins = await User.findAll({ where: { ...DONDE_ES_ADMIN }, attributes: ['id'] });
    for (const a of admins as any[]) {
      await Notification.create({
        recipientId: a.id,
        type: 'warning',
        category: 'contract',
        title: '[MUTUO ACUERDO] Solicitud de cancelación',
        message: `Las dos partes acordaron cancelar el contrato de "${trabajo}". Revisá la solicitud y resolvé el dinero.`,
        relatedModel: 'ContractCancellationRequest',
        relatedId: cancelacionId,
        actionText: 'Revisar solicitud',
        sentVia: ['in_app'],
      } as any);
    }
  } catch (e: any) {
    console.error('[solicitudes de cambio] no se pudo avisar a los administradores:', e?.message);
  }
}

/**
 * Las solicitudes sin respuesta pasan a soporte. La corre el cron cada 6 horas y también se puede disparar a mano.
 * Cada una en su transacción y releyendo el estado: dos corridas juntas no duplican el ticket.
 */
export async function escalarSolicitudesVencidas(ahora: Date = new Date()): Promise<{ escaladas: number; fallidas: number }> {
  const limite = new Date(ahora.getTime() - HORAS_PARA_RESPONDER * 3_600_000);
  const vencidas: any[] = await ContractChangeRequest.findAll({
    where: { status: 'pending', createdAt: { [Op.lte]: limite } },
    attributes: ['id'],
  });

  let escaladas = 0;
  let fallidas = 0;
  for (const { id } of vencidas) {
    const t = await sequelize.transaction();
    try {
      const sol: any = await ContractChangeRequest.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!sol || sol.status !== 'pending') { await t.rollback(); continue; }

      const contrato: any = await Contract.findByPk(sol.contractId, {
        include: [
          { model: User, as: 'client', attributes: ['id', 'name', 'email'] },
          { model: User, as: 'doer', attributes: ['id', 'name', 'email'] },
          { model: Job, as: 'job', attributes: ['id', 'title'] },
        ],
        transaction: t,
      });
      if (!contrato) { await t.rollback(); fallidas++; continue; }

      const pidioElCliente = String(sol.requestedBy) === String(contrato.clientId);
      const quienPidio = pidioElCliente ? contrato.client : contrato.doer;
      const sinRespuesta = pidioElCliente ? contrato.doer : contrato.client;
      const trabajo = contrato.job?.title || 'Contrato';

      // El número lo exige la validación del modelo antes de que corra su gancho de creación: se pide acá,
      // igual que en las rutas de tickets (de una secuencia: no repite aunque dos corran a la vez).
      const numero = await siguienteNumeroDeTicket(sequelize);
      const ticket: any = await Ticket.create(
        {
          ticketNumber: numero,
          subject: `Solicitud de ${nombreDelTipo(sol.type)} sin respuesta - ${trabajo}`.slice(0, 200),
          category: 'report_contract',
          priority: 'high',
          status: 'open',
          createdBy: sol.requestedBy,
          relatedUser: sinRespuesta.id,
          relatedContract: contrato.id,
          messages: [
            {
              author: sol.requestedBy,
              isInternal: false,
              createdAt: new Date(),
              message:
                `Solicitud escalada automáticamente: pasaron ${HORAS_PARA_RESPONDER} horas sin respuesta.\n\n` +
                `Tipo: ${sol.type === 'cancel' ? 'Cancelación' : 'Modificación'}\nMotivo: ${sol.reason}\n` +
                `Contrato: ${contrato.id}\nCliente: ${contrato.client.name}\nTrabajador: ${contrato.doer.name}\n` +
                `Pidió: ${quienPidio.name}\nSin respuesta de: ${sinRespuesta.name}`,
            },
          ],
        } as any,
        { transaction: t },
      );

      sol.status = 'escalated_to_support';
      sol.escalatedAt = ahora;
      sol.supportTicketId = ticket.id;
      await sol.save({ transaction: t });
      await t.commit();
      escaladas++;

      await logEvento({
        action: 'CONTRACT_CHANGE_ESCALATED',
        actor: 'cron:escalateExpiredChangeRequests',
        category: 'contract',
        severity: 'medium',
        description: `La solicitud de ${nombreDelTipo(sol.type)} del contrato ${contrato.id} pasó a soporte por falta de respuesta`,
        targetModel: 'Contract',
        targetId: String(contrato.id),
        metadata: { solicitudId: sol.id, ticketId: ticket.id },
      });

      const urlSolicitud = `${clienteUrl()}/contracts/${contrato.id}/change-requests/${sol.id}`;
      await avisar(String(quienPidio.id), 'Tu solicitud pasó a soporte', `No hubo respuesta en ${HORAS_PARA_RESPONDER / 24} días: tu solicitud sobre "${trabajo}" pasó al equipo de soporte.`, String(contrato.id), String(sol.id), {
        to: quienPidio.email,
        asunto: `Tu solicitud pasó a soporte - ${trabajo}`,
        html: `<h2>Tu solicitud pasó a soporte</h2>
          <p>No recibimos respuesta de la otra parte en ${HORAS_PARA_RESPONDER / 24} días, así que tu solicitud de ${nombreDelTipo(sol.type)} para <strong>${escaparHtml(trabajo)}</strong> pasó a nuestro equipo.</p>
          <p>Número de ticket: <strong>${escaparHtml(ticket.ticketNumber)}</strong></p>
          ${boton(`${clienteUrl()}/tickets/${ticket.id}`, 'Ver el ticket')}`,
      });
      await avisar(String(sinRespuesta.id), 'Una solicitud sin tu respuesta pasó a soporte', `${quienPidio.name} había pedido ${sol.type === 'cancel' ? 'cancelar' : 'modificar'} "${trabajo}" y no respondiste: pasó a soporte.`, String(contrato.id), String(sol.id), {
        to: sinRespuesta.email,
        asunto: `Solicitud sin respuesta pasó a soporte - ${trabajo}`,
        html: `<h2>Una solicitud de cambio pasó a soporte</h2>
          <p><strong>${escaparHtml(quienPidio.name)}</strong> pidió ${sol.type === 'cancel' ? 'cancelar' : 'modificar'} el contrato de <strong>${escaparHtml(trabajo)}</strong> y no recibimos tu respuesta en ${HORAS_PARA_RESPONDER / 24} días.</p>
          <p><strong>Motivo:</strong></p><p>${escaparHtml(sol.reason)}</p>
          ${boton(urlSolicitud, 'Ver la solicitud')}`,
      });
    } catch (e: any) {
      try { await t.rollback(); } catch { /* ya estaba cerrada */ }
      fallidas++;
      console.error(`[solicitudes de cambio] no se pudo escalar ${id}:`, e?.message);
    }
  }
  return { escaladas, fallidas };
}

export { INCLUIR_CONTRATO };

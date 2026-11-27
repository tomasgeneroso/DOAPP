import { Op } from 'sequelize';
import { sequelize } from '../config/database.js';
import { conSistema } from '../db/contextoRls.js';
import { Ticket } from '../models/sql/Ticket.model.js';
import { Contract } from '../models/sql/Contract.model.js';
import { Job } from '../models/sql/Job.model.js';
import { User } from '../models/sql/User.model.js';
import { Notification } from '../models/sql/Notification.model.js';
import emailService from './email.js';
import { siguienteNumeroDeTicket } from './numeroDeTicket.js';
import { avisarContratoAlChatDelEquipo } from './chatDelEquipo.js';
import { POLITICAS } from '../../shared/constants/policies.js';
import {
  ETIQUETA_DE_PROBLEMA_DEL_TRABAJO,
  LARGO_MAXIMO_DEL_RELATO,
  LARGO_MINIMO_DEL_RELATO,
  esCategoriaDeProblema,
  problemaDeLasEtiquetas,
  tituloDeProblema,
  type ProblemaDelTrabajo,
} from '../../shared/tickets/problemasDelTrabajo.js';
import { correoAlEquipo } from '../utils/remitenteDeCorreo.js';

/**
 * «Hubo problemas durante el trabajo» (pedido del dueño, 2026-11-21): quien contrató abre un TICKET; mientras esté abierto la confirmación automática se detiene.
 * El ticket se lleva a un reclamo o se resuelve con el mismo trabajo, y entonces el contrato vuelve a poder confirmarse con un plazo nuevo (ver shared/tickets/problemasDelTrabajo.ts).
 *
 * No hay columna nueva: «hay un problema abierto» se lee del propio ticket (etiqueta `hubo-problemas`, contrato relacionado, estado abierto).
 */
export class ErrorDeProblema extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly extra: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ErrorDeProblema';
  }
}

const EQUIPO = ['owner', 'super_admin', 'admin', 'support'];
const ESTADOS_CERRADOS = ['resolved', 'closed'];
const ESTADOS_DEL_CONTRATO_EN_MARCHA = ['in_progress', 'awaiting_confirmation'];
const HORAS = POLITICAS.AUTO_CONFIRMACION_HORAS;

const conLaEtiqueta = { [Op.contains]: [ETIQUETA_DE_PROBLEMA_DEL_TRABAJO] } as any;

/**
 * El ticket de problema que sigue abierto en este contrato (si hay).
 * Se mira como sistema: con la seguridad por fila cada persona ve solo sus tickets, y el trabajador tiene que saber que hay un aviso abierto (sin ver el ticket).
 */
export async function problemaAbierto(contractId: string): Promise<Ticket | null> {
  return conSistema(() =>
    Ticket.findOne({
      where: { relatedContract: contractId, tags: conLaEtiqueta, status: { [Op.notIn]: ESTADOS_CERRADOS } } as any,
      order: [['createdAt', 'DESC']],
    }),
  );
}

/**
 * ¿La confirmación automática de este contrato está detenida? Sí mientras haya un problema abierto, y también durante el plazo nuevo después de resolverlo
 * (si no, el contrato se confirmaba solo apenas se cerraba el ticket, porque el reloj viejo ya había vencido).
 */
export async function confirmacionDetenidaPorProblema(contractId: string, ahora = new Date()): Promise<boolean> {
  try {
    if (await problemaAbierto(contractId)) return true;
    const ultimo = await conSistema(() =>
      Ticket.findOne({
        where: { relatedContract: contractId, tags: conLaEtiqueta } as any,
        order: [['updatedAt', 'DESC']],
        attributes: ['id', 'updatedAt'],
      }),
    );
    if (!ultimo) return false;
    return ahora.getTime() - new Date(ultimo.updatedAt as any).getTime() < HORAS * 60 * 60 * 1000;
  } catch (error) {
    // Ante la duda NO se confirma solo ni se libera plata: este barrido mueve dinero.
    console.error('[problemasDelTrabajo] no se pudo comprobar si hay un aviso; se deja el contrato como está:', error);
    return true;
  }
}

/** Qué contratos de la lista tienen un problema abierto (para marcar cada trabajador en la vista del trabajo). */
export async function contratosConProblemaAbierto(contractIds: string[]): Promise<Set<string>> {
  if (contractIds.length === 0) return new Set();
  // Los avisos de problemas son un agregado: si la consulta falla, la lista del equipo y los contratos se ven igual (antes un error acá dejaba la vista del trabajo sin contratos).
  try {
    const tickets = await conSistema(() =>
      Ticket.findAll({
        where: { relatedContract: { [Op.in]: contractIds }, tags: conLaEtiqueta, status: { [Op.notIn]: ESTADOS_CERRADOS } } as any,
        attributes: ['relatedContract'],
      }),
    );
    return new Set(tickets.map((t) => String(t.relatedContract)));
  } catch (error) {
    console.error('[problemasDelTrabajo] no se pudieron leer los avisos abiertos:', error);
    return new Set();
  }
}

/**
 * Lo que las pantallas del contrato necesitan saber del problema abierto. El número y el enlace del ticket son de quien lo abrió (y del equipo): la otra parte
 * solo sabe que hay un aviso abierto y de qué tipo, no lo que se escribió.
 */
export async function resumenDelProblemaDelContrato(contractId: string, quienMira: { id: string; adminRole?: string | null }) {
  // Igual que arriba: el contrato se ve aunque no se pueda leer el aviso (el trabajador no podía abrir su contrato si esta consulta fallaba).
  try {
    const t = await problemaAbierto(contractId);
    if (!t) return null;
    const esDelTicket = String(t.createdBy) === String(quienMira.id) || hayEquipo(quienMira.adminRole);
    return {
      ticketId: esDelTicket ? t.id : null,
      ticketNumber: esDelTicket ? t.ticketNumber : null,
      categoria: problemaDeLasEtiquetas(t.tags)?.categoria ?? 'other',
      abiertoEl: t.createdAt,
      esMio: esDelTicket,
    };
  } catch (error) {
    console.error('[problemasDelTrabajo] no se pudo leer el aviso del contrato:', error);
    return null;
  }
}

/** Lo que la pantalla de un ticket necesita para ofrecer «llevar a reclamo» y «seguir con el mismo trabajo». `null` si el ticket no es de un problema del trabajo. */
export async function resumenDelProblemaDelTicket(ticket: { tags?: unknown; relatedContract?: string | null; status?: string }): Promise<ProblemaDelTrabajo | null> {
  const problema = problemaDeLasEtiquetas(ticket.tags);
  if (!problema || !ticket.relatedContract) return null;
  const abierto = !ESTADOS_CERRADOS.includes(String(ticket.status));
  const contrato = await Contract.findByPk(ticket.relatedContract, { attributes: ['id', 'status'], paranoid: false });
  return {
    contractId: String(ticket.relatedContract),
    categoria: problema.categoria,
    abierto,
    puedeSeguirConElTrabajo: abierto && !!contrato && ESTADOS_DEL_CONTRATO_EN_MARCHA.includes(String(contrato.status)),
  };
}

async function avisar(recipientId: string, title: string, message: string, contractId: string, type: 'info' | 'warning' | 'success' = 'info', actionUrl?: string) {
  await Notification.create({
    recipientId,
    type,
    category: 'contracts',
    title,
    message,
    relatedModel: 'Contract',
    relatedId: contractId,
    actionUrl: actionUrl ?? `/contracts/${contractId}`,
    actionText: 'Ver contrato',
    sentVia: ['in_app'],
  } as any).catch(() => {});
}

/** El plazo de confirmación vuelve a empezar de cero: quien contrató tiene `AUTO_CONFIRMACION_HORAS` horas nuevas para aceptar el fin del trabajo. */
async function empezarPlazoNuevo(contractId: string): Promise<boolean> {
  const [filas] = await Contract.update({ awaitingConfirmationAt: new Date() } as any, { where: { id: contractId, status: 'awaiting_confirmation' } as any });
  return filas > 0;
}

/**
 * Quien contrató avisa que hubo problemas. Abre el ticket, detiene la confirmación automática y avisa al trabajador y al equipo.
 * Si ya había confirmado el fin del trabajo, esa confirmación se retira: tendrá que aceptarlo de nuevo cuando el problema se resuelva.
 */
export async function reportarProblema(args: { contractId: string; userId: string; categoria: unknown; detalle: unknown }): Promise<{ ticket: Ticket; contract: Contract }> {
  const contract = await Contract.findByPk(args.contractId);
  if (!contract) throw new ErrorDeProblema(404, 'CONTRATO_NO_ENCONTRADO', 'Contrato no encontrado');
  if (String(contract.clientId) !== String(args.userId)) throw new ErrorDeProblema(403, 'SOLO_QUIEN_CONTRATO', 'Solo quien contrató puede avisar que hubo problemas durante el trabajo.');
  if (!ESTADOS_DEL_CONTRATO_EN_MARCHA.includes(String(contract.status))) {
    throw new ErrorDeProblema(409, 'CONTRATO_FUERA_DE_MARCHA', 'Solo se avisa de un problema mientras el trabajo está en marcha o esperando confirmación. Después se puede abrir un reclamo desde el contrato.');
  }
  if (!esCategoriaDeProblema(args.categoria)) throw new ErrorDeProblema(400, 'CATEGORIA_INVALIDA', 'Elegí qué pasó.');
  const detalle = String(args.detalle ?? '').trim();
  if (detalle.length < LARGO_MINIMO_DEL_RELATO) throw new ErrorDeProblema(400, 'RELATO_MUY_CORTO', `Contanos qué pasó (al menos ${LARGO_MINIMO_DEL_RELATO} letras) para que el equipo pueda ayudar.`);
  if (detalle.length > LARGO_MAXIMO_DEL_RELATO) throw new ErrorDeProblema(400, 'RELATO_MUY_LARGO', `El relato puede tener hasta ${LARGO_MAXIMO_DEL_RELATO} letras.`);

  const abierto = await problemaAbierto(contract.id);
  if (abierto) throw new ErrorDeProblema(409, 'PROBLEMA_YA_ABIERTO', `Ya avisaste de un problema en este contrato (${abierto.ticketNumber}). Escribí ahí lo que falte.`, { ticketId: abierto.id });

  const job = await Job.findByPk(contract.jobId, { attributes: ['id', 'title'] });
  const titulo = job?.title || 'el trabajo';
  const ticketNumber = await siguienteNumeroDeTicket(sequelize);

  const ticket = await Ticket.create({
    ticketNumber,
    subject: `Hubo problemas durante el trabajo: ${titulo}`.slice(0, 200),
    category: 'report_contract',
    priority: 'high',
    status: 'open',
    createdBy: args.userId,
    relatedContract: contract.id,
    relatedUser: contract.doerId,
    tags: [ETIQUETA_DE_PROBLEMA_DEL_TRABAJO, args.categoria],
    messages: [{ author: args.userId, message: `${tituloDeProblema(args.categoria)}.\n\n${detalle}`, isInternal: false, createdAt: new Date() }],
  } as any);

  // Si ya había aceptado el fin del trabajo, lo retira: con el problema abierto no se completa solo cuando el trabajador confirme.
  if (contract.clientConfirmed) {
    await Contract.update({ clientConfirmed: false, clientConfirmedAt: null } as any, { where: { id: contract.id, status: { [Op.in]: ESTADOS_DEL_CONTRATO_EN_MARCHA } } as any });
    await contract.reload();
  }

  void avisarContratoAlChatDelEquipo(String(contract.id), (n) => `🚩 Quien contrató avisó que hubo problemas en el trabajo de ${n} (${ticketNumber}). La confirmación automática está detenida.`, 'problema_avisado');
  await avisar(String(contract.doerId), 'El cliente avisó que hubo problemas', `Quien te contrató avisó que hubo problemas en "${titulo}" (${ticketNumber}). El equipo de DOAPP lo revisa; mientras tanto el pago no se libera solo. Podés contar tu versión en el ticket.`, contract.id, 'warning');
  await avisar(String(args.userId), 'Recibimos tu aviso', `Abrimos el ticket ${ticketNumber}. Mientras esté abierto la confirmación automática está detenida y el pago no se libera. Si se arregla, podés seguir con el mismo trabajo; si no, llevarlo a un reclamo.`, contract.id, 'info', `/tickets/${ticket.id}`);

  const url = `${process.env.CLIENT_URL || 'http://localhost:5173'}/admin/tickets/${ticket.id}`;
  // Sin datos de las personas: el correo del equipo lleva el número, el trabajo y la categoría; el relato está en el ticket.
  await emailService
    .sendEmail(correoAlEquipo({
      asunto: `[Hubo problemas durante el trabajo] ${ticketNumber}`,
      html: `<p>Quien contrató avisó que hubo problemas en <strong>${String(titulo).replace(/[<>&]/g, '')}</strong>.</p><ul><li><strong>Ticket:</strong> ${ticketNumber}</li><li><strong>Qué pasó:</strong> ${tituloDeProblema(args.categoria)}</li></ul><p>La confirmación automática del contrato está detenida mientras el ticket esté abierto.</p><a href="${url}">Ver el ticket en el panel</a>`,
    }))
    .catch(() => {});

  return { ticket, contract };
}

const hayEquipo = (adminRole?: string | null) => !!adminRole && EQUIPO.includes(String(adminRole));

/**
 * El problema se resuelve con el mismo trabajo (se arregló o fue un malentendido): el ticket se cierra como resuelto y el contrato sigue.
 * Lo hace quien abrió el ticket o el equipo. Si el contrato espera confirmación, el plazo empieza de nuevo y quien contrató puede aceptar el fin del trabajo otra vez.
 */
export async function seguirConElMismoTrabajo(args: { ticketId: string; quien: { id: string; adminRole?: string | null }; nota?: unknown }): Promise<{ ticket: Ticket; plazoNuevo: boolean }> {
  const ticket = await Ticket.findByPk(args.ticketId);
  if (!ticket) throw new ErrorDeProblema(404, 'TICKET_NO_ENCONTRADO', 'Ticket no encontrado');
  if (!problemaDeLasEtiquetas(ticket.tags) || !ticket.relatedContract) throw new ErrorDeProblema(400, 'NO_ES_UN_PROBLEMA_DEL_TRABAJO', 'Este ticket no es de un problema durante el trabajo.');
  const esEquipo = hayEquipo(args.quien.adminRole);
  if (!esEquipo && String(ticket.createdBy) !== String(args.quien.id)) throw new ErrorDeProblema(403, 'SIN_PERMISO', 'No tenés permiso para resolver este ticket.');
  if (ESTADOS_CERRADOS.includes(String(ticket.status))) throw new ErrorDeProblema(409, 'TICKET_YA_CERRADO', 'Este ticket ya está cerrado.');

  const contract = await Contract.findByPk(ticket.relatedContract);
  if (!contract) throw new ErrorDeProblema(404, 'CONTRATO_NO_ENCONTRADO', 'Contrato no encontrado');
  if (!ESTADOS_DEL_CONTRATO_EN_MARCHA.includes(String(contract.status))) {
    throw new ErrorDeProblema(409, 'CONTRATO_FUERA_DE_MARCHA', contract.status === 'disputed' ? 'El contrato está en reclamo: lo resuelve el equipo desde el reclamo.' : 'El contrato ya no está en marcha: no hay nada que retomar.');
  }

  const nota = typeof args.nota === 'string' ? args.nota.trim().slice(0, 500) : '';
  const quien = esEquipo ? 'el equipo de DOAPP' : 'quien contrató';
  ticket.status = 'resolved';
  ticket.resolution = `Se resolvió con el mismo trabajo (lo confirmó ${quien}).${nota ? ` ${nota}` : ''}`.slice(0, 1000);
  ticket.messages = [
    ...(ticket.messages || []),
    { author: args.quien.id, message: `El problema se resolvió con el mismo trabajo.${nota ? ` ${nota}` : ''} El contrato sigue y se puede aceptar el fin del trabajo de nuevo.`, isInternal: false, createdAt: new Date() } as any,
  ];
  ticket.changed('messages', true);
  await ticket.save();

  const plazoNuevo = await empezarPlazoNuevo(contract.id);
  const job = await Job.findByPk(contract.jobId, { attributes: ['id', 'title'] });
  const titulo = job?.title || 'el trabajo';
  void avisarContratoAlChatDelEquipo(String(contract.id), (n) => `✅ El problema del trabajo de ${n} se resolvió: el trabajo sigue.`, 'problema_resuelto');
  await avisar(String(contract.clientId), 'Seguimos con el mismo trabajo', `El problema de "${titulo}" se resolvió. Ya podés aceptar el fin del trabajo${plazoNuevo ? `; si no hacés nada, se confirma solo en ${HORAS} horas` : ''}.`, contract.id, 'success');
  await avisar(String(contract.doerId), 'El problema se resolvió', `El problema que se había avisado en "${titulo}" se resolvió y el trabajo sigue. Cuando termines, tocá «Completé el trabajo».`, contract.id, 'success');
  return { ticket, plazoNuevo };
}

/**
 * Cualquier otra forma de cerrar el ticket (el equipo cambia el estado o lo cierra) también devuelve el plazo nuevo a quien contrató, y a nadie se le confirma solo el trabajo
 * apenas se cierra el ticket. Mejor esfuerzo: no frena el cierre.
 */
export async function alCerrarseElTicket(ticket: { tags?: unknown; relatedContract?: string | null; status?: string }): Promise<void> {
  if (!problemaDeLasEtiquetas(ticket.tags) || !ticket.relatedContract) return;
  if (!ESTADOS_CERRADOS.includes(String(ticket.status))) return;
  await empezarPlazoNuevo(String(ticket.relatedContract)).catch(() => false);
}

/**
 * Se abrió un reclamo sobre el contrato: el ticket de problema pasa a resuelto («llevado a reclamo») y desde ahí manda el reclamo.
 */
export async function alAbrirseUnReclamo(contractId: string, disputeId: string): Promise<void> {
  const tickets = await Ticket.findAll({ where: { relatedContract: contractId, tags: conLaEtiqueta, status: { [Op.notIn]: ESTADOS_CERRADOS } } as any });
  for (const t of tickets) {
    t.status = 'resolved';
    t.resolution = `Se llevó a un reclamo (${String(disputeId).slice(0, 8)}). Desde ahí lo resuelve el equipo de DOAPP.`;
    t.messages = [...(t.messages || []), { author: t.createdBy, message: 'Se llevó este problema a un reclamo. Seguimos desde ahí.', isInternal: false, createdAt: new Date() } as any];
    t.changed('messages', true);
    await t.save();
  }
}

/** Quien contrató confirmó el fin del trabajo: si había un problema abierto, ya no lo es. */
export async function alConfirmarQuienContrato(contractId: string): Promise<void> {
  const t = await problemaAbierto(contractId);
  if (!t) return;
  t.status = 'resolved';
  t.resolution = 'Quien contrató confirmó el fin del trabajo.';
  t.messages = [...(t.messages || []), { author: t.createdBy, message: 'Confirmé el fin del trabajo: el problema quedó resuelto.', isInternal: false, createdAt: new Date() } as any];
  t.changed('messages', true);
  await t.save();
}

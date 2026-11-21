import { Notification } from '../models/sql/Notification.model.js';

/**
 * Avisos de los mensajes de reclamos y tickets (pedido del dueño, 2026-11-21): quien no escribió el mensaje recibe una notificación con el enlace a SU pantalla.
 * El aviso no lleva el texto del mensaje (se lee adentro), y nunca va a quien lo escribió. Mejor esfuerzo: un aviso que falla no frena el mensaje.
 */
const unicos = (ids: Array<string | null | undefined>, excepto: string): string[] => [...new Set(ids.filter((i): i is string => !!i).map(String))].filter((i) => i !== String(excepto));

async function crear(recipientId: string, datos: { title: string; message: string; category: string; relatedModel: string; relatedId: string; actionUrl: string; actionText: string }) {
  await Notification.create({ recipientId, type: 'info', sentVia: ['in_app'], ...datos } as any).catch(() => {});
}

/** Un mensaje nuevo en un reclamo: lo reciben la otra parte, el equipo asignado y, si lo escribe el equipo, las dos partes. */
export async function avisarMensajeDeReclamo(
  reclamo: { id: string; initiatedBy: string; against: string; assignedTo?: string | null },
  quienEscribio: string,
): Promise<void> {
  const partes = unicos([reclamo.initiatedBy, reclamo.against], quienEscribio);
  const equipo = unicos([reclamo.assignedTo], quienEscribio).filter((i) => !partes.includes(i));
  for (const id of partes) {
    await crear(id, { title: 'Mensaje nuevo en el reclamo', message: 'Hay un mensaje nuevo en el reclamo de tu contrato.', category: 'disputes', relatedModel: 'Dispute', relatedId: reclamo.id, actionUrl: `/disputes/${reclamo.id}`, actionText: 'Ver el reclamo' });
  }
  for (const id of equipo) {
    await crear(id, { title: 'Mensaje nuevo en un reclamo que atendés', message: 'Una de las partes escribió en el reclamo.', category: 'disputes', relatedModel: 'Dispute', relatedId: reclamo.id, actionUrl: `/admin/disputes/${reclamo.id}`, actionText: 'Ver el reclamo' });
  }
}

/** Un mensaje nuevo en un ticket: lo recibe quien lo abrió (a su pantalla) y quien lo atiende (al panel), menos quien escribió. */
export async function avisarMensajeDeTicket(
  ticket: { id: string; ticketNumber: string; createdBy: string; assignedTo?: string | null },
  quienEscribio: string,
): Promise<void> {
  for (const id of unicos([ticket.createdBy], quienEscribio)) {
    await crear(id, { title: `Nuevo mensaje en ticket ${ticket.ticketNumber}`, message: 'El equipo de DOAPP respondió a tu ticket.', category: 'ticket', relatedModel: 'Ticket', relatedId: ticket.id, actionUrl: `/tickets/${ticket.id}`, actionText: 'Ver ticket' });
  }
  for (const id of unicos([ticket.assignedTo], quienEscribio).filter((i) => i !== String(ticket.createdBy))) {
    await crear(id, { title: `Mensaje nuevo en el ticket ${ticket.ticketNumber}`, message: 'Quien abrió el ticket escribió de nuevo.', category: 'ticket', relatedModel: 'Ticket', relatedId: ticket.id, actionUrl: `/admin/tickets/${ticket.id}`, actionText: 'Ver ticket' });
  }
}

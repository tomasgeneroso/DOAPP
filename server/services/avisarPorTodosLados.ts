/**
 * Un aviso a una persona: aparece dentro de DOAPP (la campana) y le llega por correo con el MISMO texto (pedido del dueño, 2026-11-27: «lo que se muestra por correo
 * también se muestra por notificaciones»). La notificación es lo que no se puede perder: se escribe primero y el correo nunca la frena.
 */
import { Notification } from '../models/sql/Notification.model.js';
import { User } from '../models/sql/User.model.js';
import { conSistema } from '../db/contextoRls.js';
import { config } from '../config/env.js';
import logger from './logger.js';

export interface AvisoAUnaPersona {
  userId: string;
  titulo: string;
  mensaje: string;
  /** Dirección dentro de DOAPP, por ejemplo `/jobs/<id>`. */
  ruta: string;
  tipo?: 'info' | 'success' | 'warning' | 'error';
  categoria: import('../models/sql/Notification.model.js').NotificationCategory;
  relatedModel?: string;
  relatedId?: string;
}

/**
 * La parte de DOAPP de algo que YA sale por correo: para que esté también en la campana. Se llama al lado del correo. Se busca a la persona por su id o por su correo
 * (si no tiene cuenta, no hay nada que hacer) y nunca frena a quien llama.
 */
export async function avisarEnDoapp(a: Omit<AvisoAUnaPersona, 'userId'> & { userId?: string; email?: string }): Promise<void> {
  try {
    let userId = a.userId ? String(a.userId) : undefined;
    if (!userId && a.email) {
      const persona: any = await conSistema(() => User.findOne({ where: { email: String(a.email).trim().toLowerCase() }, attributes: ['id'] }));
      userId = persona ? String(persona.id) : undefined;
    }
    if (!userId) return;
    await conSistema(() =>
      Notification.create({
        recipientId: userId,
        type: a.tipo ?? 'info',
        category: a.categoria,
        title: a.titulo.slice(0, 200),
        message: a.mensaje.slice(0, 1000),
        relatedModel: a.relatedModel,
        relatedId: a.relatedId,
        actionUrl: a.ruta,
        actionText: 'Ver',
        sentVia: ['in_app', 'email'],
      } as any),
    );
  } catch (e: any) {
    logger.silentError('notifications', `El correo salió, pero el aviso dentro de DOAPP no se pudo guardar: ${a.titulo}`, e, { userId: a.userId });
  }
}

export async function avisarPorTodosLados(a: AvisoAUnaPersona): Promise<void> {
  await conSistema(() =>
    Notification.create({
      recipientId: a.userId,
      type: a.tipo ?? 'info',
      category: a.categoria,
      title: a.titulo.slice(0, 200),
      message: a.mensaje.slice(0, 1000),
      relatedModel: a.relatedModel,
      relatedId: a.relatedId,
      actionUrl: a.ruta,
      actionText: 'Ver',
      sentVia: ['in_app', 'email'],
    } as any),
  );
  try {
    const persona: any = await conSistema(() => User.findByPk(a.userId, { attributes: ['id', 'email', 'name'] }));
    if (!persona?.email) return;
    const { default: correo } = await import('./email.js');
    await correo.sendAvisoGeneral(persona.email, persona.name || '', a.titulo, a.mensaje, `${config.clientUrl || 'https://doapparg.com'}${a.ruta}`);
  } catch (e: any) {
    logger.silentError('notifications', 'El aviso quedó en DOAPP, pero el correo no salió', e, { userId: a.userId });
  }
}

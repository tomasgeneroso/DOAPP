import { Notification } from '../models/sql/Notification.model.js';
import emailService from './email.js';
import logger from './logger.js';

/**
 * Avisarle a alguien que su pago quedó registrado.
 *
 * Por qué existe: quien paga en Mercado Pago vuelve a DOAPP y no tiene forma de saber si su pago llegó. En las
 * cotizaciones y los contratos lo confirma el aviso automático de Mercado Pago (el webhook), que corre sin que el
 * comprador esté mirando, y hasta ahora ese camino avisaba al trabajador pero no a quien había pagado; la orden de
 * pago al terminar no avisaba a nadie. La pantalla de retorno muestra el estado mientras la persona está mirando; esto
 * es lo que le queda cuando cerró la pestaña: una notificación dentro de la app y un email.
 *
 * Nunca lanza: el aviso es lo último de la operación y el menos importante, y no puede deshacer un pago ya registrado.
 * Si falla queda en el registro de errores silenciosos, no se traga.
 */
export interface AvisoDePago {
  userId: string | number;
  titulo: string;
  mensaje: string;
  monto?: number;
  relatedModel?: string;
  relatedId?: string;
  actionText?: string;
  /** Ruta de la app a la que lleva el botón del email, por ejemplo `/contracts/<id>`. */
  ruta?: string;
  /** `false` cuando quien llama ya creó la notificación dentro de la app y sólo falta el email. */
  notificarEnLaApp?: boolean;
}

export async function avisarPagoRecibido(aviso: AvisoDePago): Promise<void> {
  if (!aviso.userId) return;

  if (aviso.notificarEnLaApp !== false) {
    try {
      await Notification.create({
        recipientId: aviso.userId,
        type: 'success',
        category: 'payment',
        title: aviso.titulo,
        message: aviso.mensaje,
        relatedModel: aviso.relatedModel,
        relatedId: aviso.relatedId,
        actionText: aviso.actionText,
        sentVia: ['in_app', 'push'],
      } as any);
    } catch (e) {
      logger.silentError('payments', 'No se pudo crear la notificación de pago recibido', e, {
        userId: String(aviso.userId), titulo: aviso.titulo,
      });
    }
  }

  try {
    await emailService.sendPagoRecibido(String(aviso.userId), {
      titulo: aviso.titulo,
      mensaje: aviso.mensaje,
      monto: aviso.monto,
      ruta: aviso.ruta,
    });
  } catch (e) {
    logger.silentError('payments', 'No se pudo enviar el email de pago recibido', e, {
      userId: String(aviso.userId), titulo: aviso.titulo,
    });
  }
}

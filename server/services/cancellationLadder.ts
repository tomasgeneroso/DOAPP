import { Op } from 'sequelize';
import { Contract } from '../models/sql/Contract.model.js';
import { User } from '../models/sql/User.model.js';
import { Notification } from '../models/sql/Notification.model.js';
import { logMoneyEvent } from '../utils/auditLog.js';
import { POLITICAS } from '../../shared/constants/policies.js';

/**
 * Penalidad en escalera al trabajador que cancela.
 *
 * Un trabajador que acepta un contrato y despues no va le hace perder al
 * cliente el dia, la confianza y a veces la plata de materiales que ya compro.
 * Y le hace perder a la plataforma la reputacion frente a ese cliente, que es
 * lo mas caro de recuperar.
 *
 * Pero castigar duro la primera vez es injusto -- la gente se enferma, se le
 * rompe el auto -- y no castigar nunca convierte la cancelacion en gratis.
 * Airbnb lo resolvio con una escalera: cada escalon es predecible, el
 * trabajador sabe exactamente que le pasa si vuelve a cancelar, y eso es lo
 * que disuade. Una regla que nadie puede predecir no cambia comportamiento;
 * solo genera enojo.
 *
 *   1ª cancelacion en 90 dias   aviso. Se le explica la escalera.
 *   2ª                          marca visible en el perfil por 90 dias, y se le
 *                               avisa que la proxima lo suspende.
 *   3ª o mas                    suspendido de postularse por 14 dias.
 *
 * La ventana es de 90 dias y no de toda la vida: un trabajador que cancelo dos
 * veces hace un año y desde entonces cumplio todo no es el mismo que uno que
 * cancelo dos veces este mes. Airbnb y Uber miden sobre ventana movil por la
 * misma razon.
 *
 * Lo que NO hace: penalizar en plata. El trabajador no pago nada, asi que no
 * hay de donde descontar sin generar deuda, y una deuda con la plataforma es
 * la forma mas rapida de que alguien se vaya para siempre.
 */

// Los numeros viven en shared/constants/policies.ts, junto con los terminos
// que los nombran (9.4). Aca solo se les da el nombre corto de este archivo.
export const VENTANA_DIAS = POLITICAS.CANCELACION_VENTANA_DIAS;
export const MARCA_VISIBLE_DIAS = POLITICAS.CANCELACION_MARCA_VISIBLE_DIAS;
export const SUSPENSION_DIAS = POLITICAS.CANCELACION_SUSPENSION_DIAS;

export interface ResultadoEscalera {
  cancelacionesEnVentana: number;
  escalon: 'aviso' | 'marca' | 'suspension';
  suspendidoHasta?: Date;
  marcaHasta?: Date;
}

/** Cuantas veces cancelo este trabajador en la ventana. */
export async function cancelacionesRecientes(trabajadorId: string): Promise<number> {
  const desde = new Date(Date.now() - VENTANA_DIAS * 86_400_000);
  return Contract.count({
    where: {
      doerId: trabajadorId,
      cancelledBy: trabajadorId,
      status: 'cancelled',
      updatedAt: { [Op.gte]: desde },
    } as any,
  });
}

/**
 * Aplica el escalon que corresponde despues de una cancelacion.
 *
 * Se llama DESPUES de que el contrato quedo cancelado con cancelledBy puesto,
 * asi que la cuenta ya incluye esta cancelacion.
 */
export async function aplicarEscalera(trabajadorId: string, contractId: string): Promise<ResultadoEscalera> {
  const n = await cancelacionesRecientes(trabajadorId);
  const user = await User.findByPk(trabajadorId);
  if (!user) throw new Error(`Trabajador ${trabajadorId} no encontrado`);

  const ahora = new Date();
  let resultado: ResultadoEscalera;

  if (n <= 1) {
    resultado = { cancelacionesEnVentana: n, escalon: 'aviso' };
    await Notification.create({
      recipientId: trabajadorId,
      type: 'warning',
      category: 'contracts',
      title: 'Cancelaste un trabajo que habías aceptado',
      message:
        'Entendemos que pasan cosas. Pero tené presente cómo funciona: si cancelás otro trabajo ' +
        `aceptado en los próximos ${VENTANA_DIAS} días, tu perfil va a mostrar una marca de cancelación ` +
        `durante ${MARCA_VISIBLE_DIAS} días. A la tercera, no vas a poder postularte por ${SUSPENSION_DIAS} días. ` +
        'Avisar a tiempo siempre es mejor que cancelar.',
      relatedModel: 'Contract',
      relatedId: contractId,
      sentVia: ['in_app'],
    } as any);
  } else if (n === 2) {
    const marcaHasta = new Date(ahora.getTime() + MARCA_VISIBLE_DIAS * 86_400_000);
    resultado = { cancelacionesEnVentana: n, escalon: 'marca', marcaHasta };
    await user.update({ cancellationMarkUntil: marcaHasta } as any);
    await Notification.create({
      recipientId: trabajadorId,
      type: 'warning',
      category: 'contracts',
      title: 'Segunda cancelación: tu perfil ahora lo muestra',
      message:
        `Cancelaste dos trabajos aceptados en ${VENTANA_DIAS} días. Durante los próximos ${MARCA_VISIBLE_DIAS} días ` +
        'los clientes van a ver una marca de cancelación en tu perfil. ' +
        `Si cancelás otro, no vas a poder postularte durante ${SUSPENSION_DIAS} días.`,
      relatedModel: 'Contract',
      relatedId: contractId,
      sentVia: ['in_app'],
    } as any);
  } else {
    const suspendidoHasta = new Date(ahora.getTime() + SUSPENSION_DIAS * 86_400_000);
    const marcaHasta = new Date(ahora.getTime() + MARCA_VISIBLE_DIAS * 86_400_000);
    resultado = { cancelacionesEnVentana: n, escalon: 'suspension', suspendidoHasta, marcaHasta };
    await user.update({
      suspendedFromApplyingUntil: suspendidoHasta,
      cancellationMarkUntil: marcaHasta,
    } as any);
    await Notification.create({
      recipientId: trabajadorId,
      type: 'error',
      category: 'contracts',
      title: `No vas a poder postularte hasta el ${suspendidoHasta.toLocaleDateString('es-AR')}`,
      message:
        `Cancelaste ${n} trabajos aceptados en ${VENTANA_DIAS} días. Tus postulaciones quedan suspendidas ` +
        `por ${SUSPENSION_DIAS} días. Los contratos que ya tenés en curso siguen igual. ` +
        'Si hubo un motivo de fuerza mayor, escribile a soporte con el detalle.',
      relatedModel: 'Contract',
      relatedId: contractId,
      sentVia: ['in_app'],
    } as any);
  }

  // Queda asentado: una suspension es una decision sobre una persona y tiene
  // que poder reconstruirse si la discute.
  await logMoneyEvent({
    action: 'WORKER_CANCELLATION_LADDER',
    actor: 'system:escalera',
    severity: resultado.escalon === 'suspension' ? 'high' : 'medium',
    description: `Trabajador cancelo contrato aceptado. Escalon aplicado: ${resultado.escalon} (${n} en ${VENTANA_DIAS} dias).`,
    contractId,
    userId: trabajadorId,
    metadata: resultado,
  });

  return resultado;
}

/**
 * Si el trabajador esta suspendido de postularse.
 *
 * Devuelve la fecha hasta la que dura, o null si puede postularse.
 */
export async function suspendidoHasta(trabajadorId: string): Promise<Date | null> {
  const user = await User.findByPk(trabajadorId, { attributes: ['id', 'suspendedFromApplyingUntil'] as any });
  const hasta = (user as any)?.suspendedFromApplyingUntil;
  if (!hasta) return null;
  return new Date(hasta) > new Date() ? new Date(hasta) : null;
}

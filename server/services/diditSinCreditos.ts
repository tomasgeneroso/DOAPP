import { Op } from 'sequelize';
import { User } from '../models/sql/User.model.js';
import { Notification } from '../models/sql/Notification.model.js';

/**
 * Didit sin créditos (2026-11-11): la verificación de identidad es un servicio pago. Cuando se acaban los créditos, Didit rechaza cada pedido
 * (`400: You don't have enough credits…`) y `POST /api/auth/kyc/start` le contestaba a la persona «502: No pudimos iniciar la verificación. Probá de nuevo»: parecía
 * una caída del servidor, reintentar no servía y NADIE del equipo se enteraba hasta que una persona lo contó («al registrarse da error 502»).
 *
 * Ahora: (1) se reconoce ese error, (2) la persona recibe un mensaje honesto (la verificación no está disponible por ahora, su cuenta quedó creada) con 503 y no 502, y
 * (3) los dueños reciben una notificación con qué hacer, una vez cada pocas horas (no una por cada intento de cada persona).
 */

const ENTRE_AVISOS_MS = 6 * 3_600_000;
let ultimoAviso = 0;

/** ¿El error de Didit es «no hay créditos»? Se lee del mensaje (`Didit API 400: {"detail":"You don't have enough credits…"}`) o del código 402. */
export function esFalloDeCreditos(error: unknown): boolean {
  const texto = String((error as { message?: unknown })?.message ?? error ?? '');
  return /enough credits|insufficient credits|no (tienes|tenés) (suficientes )?cr[eé]ditos|Didit API 402/i.test(texto);
}

export const MENSAJE_PARA_LA_PERSONA =
  'La verificación de identidad no está disponible en este momento. Tu cuenta quedó creada: volvé en un rato y te la pedimos de nuevo. No hace falta registrarte otra vez.';

/** Avisa a los dueños, como mucho una vez cada `ENTRE_AVISOS_MS` por proceso. Nunca tira abajo el pedido que lo origina. */
export async function avisarQueDiditNoTieneCreditos(ahora: number = Date.now()): Promise<boolean> {
  console.error('[didit] SIN CRÉDITOS: nadie puede verificar su identidad. Recargá en https://business.didit.me');
  if (ahora - ultimoAviso < ENTRE_AVISOS_MS) return false;
  ultimoAviso = ahora;
  try {
    const duenos: any[] = await User.findAll({ where: { adminRole: { [Op.eq]: 'owner' } } as any, attributes: ['id'] });
    for (const d of duenos) {
      await Notification.create({
        recipientId: d.id,
        type: 'warning',
        category: 'system',
        title: 'Didit se quedó sin créditos: nadie puede verificar su identidad',
        message: 'Las personas que se registran no pueden pasar la verificación. Recargá los créditos en https://business.didit.me. Mientras tanto, su cuenta queda creada y se les pide de nuevo más tarde.',
        read: false,
      } as never);
    }
    return duenos.length > 0;
  } catch (e) {
    console.error('[didit] no se pudo avisar a los dueños:', (e as Error).message);
    return false;
  }
}

/** Para las pruebas. */
export function __reiniciarElAviso() {
  ultimoAviso = 0;
}

import { COMMISSION_RATES, MEMBERSHIP_PROMO_DAYS } from './membershipPricing.js';
import { POLITICAS } from './policies.js';

/**
 * Lo que da la membresía PRO (regla del dueño, 2026-10-25). Es la ÚNICA lista: la repiten el T&C 8.1, el modal de planes, el checkout, el correo de bienvenida, el
 * artículo de la beta y la app. Los números salen de las constantes; si se cambia uno, cambia en todos lados.
 *
 * Durante la beta la membresía no está a la venta y todos tienen sus funciones; la comisión es 0% para todos hasta la fecha de cierre.
 */
export function beneficiosPro(): string[] {
  return [
    `${POLITICAS.CONTRATOS_LIBRES_POR_MES} contrato libre de comisión por mes (el mes que no se usa no se acumula)`,
    `Comisión del ${COMMISSION_RATES.pro}% en los demás contratos, en vez del ${COMMISSION_RATES.free}%`,
    `${MEMBERSHIP_PROMO_DAYS} días de promoción del perfil por mes`,
    'Estadísticas de tu actividad',
    'Insignia PRO y prioridad en las búsquedas: más visibilidad',
    'Prioridad en la atención de soporte',
  ];
}

/** Las mismas ventajas en una frase (para correos y descripciones). */
export const resumenDeBeneficiosPro = (): string => beneficiosPro().join('; ');

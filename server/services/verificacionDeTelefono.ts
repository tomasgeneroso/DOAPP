import { isBetaPhase } from './platformPhase.js';
import { getWhatsAppStatus } from './whatsapp.js';

/**
 * Verificación del teléfono por WhatsApp: se activa con la versión real, no en la beta.
 *
 * Durante la beta no se ofrece (ni en la web ni en la app) y el servidor no manda códigos, aunque el canal de WhatsApp
 * esté configurado. Tampoco se exige para el escalón 2 de la credibilidad (teléfono y correo): quien no puede
 * verificarlo no tiene que quedar trabado en el escalón 1. Al pasar a la fase real todo se enciende solo, sin tocar nada.
 */

/** ¿Se le puede ofrecer a la gente verificar el teléfono ahora? Solo en la fase real y con el canal funcionando. */
export async function telefonoSePuedeVerificar(): Promise<boolean> {
  return !(await isBetaPhase()) && getWhatsAppStatus().ready;
}

/** ¿Cuenta el teléfono verificado para la credibilidad? Solo en la fase real. */
export async function telefonoCuentaParaLaCredibilidad(): Promise<boolean> {
  return !(await isBetaPhase());
}

export const MENSAJE_TELEFONO_EN_BETA =
  'La verificación del teléfono por WhatsApp se activa con la versión real de DOAPP. Por ahora no hace falta.';

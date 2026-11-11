import crypto from 'node:crypto';
import { User } from '../models/sql/User.model.js';
import { conSistema } from '../db/contextoRls.js';
import { config } from '../config/env.js';

/**
 * Baja de los correos del módulo de correos (2026-11-11). Todo correo de una campaña lleva en el pie un enlace para darse de baja (es obligatorio en la Argentina para los correos que
 * no son del servicio mismo) y la cabecera `List-Unsubscribe`, con la que Gmail y otros ofrecen «Cancelar suscripción» con un toque.
 *
 * El enlace lleva un TOKEN: el id de la persona y una firma (HMAC con el secreto del servidor). No se puede armar el de otra persona sin el secreto, y no hace falta iniciar sesión.
 * Estar de baja NO borra nada ni cierra la cuenta: solo deja de recibir campañas (los correos propios del funcionamiento —pagos, contratos, seguridad— siguen).
 */

const firmar = (userId: string): string => crypto.createHmac('sha256', config.jwtSecret).update(`baja-de-correos:${userId}`).digest('base64url').slice(0, 32);

export function tokenDeBaja(userId: string): string {
  return `${Buffer.from(userId, 'utf8').toString('base64url')}.${firmar(userId)}`;
}

/** El id de la persona si el token es auténtico, o null. */
export function userIdDelToken(token: string): string | null {
  const partes = String(token ?? '').split('.');
  if (partes.length !== 2 || !partes[0] || !partes[1]) return null;
  let userId: string;
  try {
    userId = Buffer.from(partes[0], 'base64url').toString('utf8');
  } catch {
    return null;
  }
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
  const esperada = Buffer.from(firmar(userId));
  const recibida = Buffer.from(partes[1]);
  if (esperada.length !== recibida.length || !crypto.timingSafeEqual(esperada, recibida)) return null;
  return userId;
}

const baseDeLaApp = (): string => (config.clientUrl || 'https://doapparg.com').replace(/\/$/, '');

/** El enlace del pie del correo: una página de la web (la API no puede servir páginas con formularios: su política de seguridad lo prohíbe). */
export function enlaceDeBaja(userId: string): string {
  return `${baseDeLaApp()}/baja-de-correos/${tokenDeBaja(userId)}`;
}

/** El de la cabecera `List-Unsubscribe`: el cliente de correo hace un POST directo a la API, sin abrir nada (baja con un toque). */
export function enlaceDeBajaDeUnToque(userId: string): string {
  return `${baseDeLaApp()}/api/correos/baja/${tokenDeBaja(userId)}`;
}

/** Da de baja (o de alta de nuevo). Devuelve false si la persona no existe. */
export async function fijarBajaDeCorreos(userId: string, deBaja: boolean, ahora: Date = new Date()): Promise<boolean> {
  return conSistema(async () => {
    const [filas] = await User.update({ marketingEmailsUnsubscribedAt: deBaja ? ahora : null } as never, { where: { id: userId } });
    return filas > 0;
  });
}

export async function estaDeBaja(userId: string): Promise<boolean | null> {
  return conSistema(async () => {
    const u = await User.findByPk(userId, { attributes: ['id', 'marketingEmailsUnsubscribedAt'] });
    return u ? !!u.marketingEmailsUnsubscribedAt : null;
  });
}

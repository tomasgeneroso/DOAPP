import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { User } from '../models/sql/User.model.js';
import { logEvento } from '../utils/auditLog.js';

/**
 * Enlazar Google o X a una cuenta que se creó con correo y contraseña.
 *
 * Quien se registró con contraseña y después entra con «Ingresar con Google» sin que la cuenta esté enlazada puede terminar en una
 * cuenta distinta. Acá, desde Seguridad y con la sesión iniciada, se enlaza a la cuenta actual.
 *
 * El peligro de este flujo es el «enlace forzado»: un atacante empieza el enlace con SU sesión y le pasa el enlace a la víctima;
 * si la víctima lo completa, su Google quedaría enlazado a la cuenta del atacante. Por eso el enlace lleva un token firmado Y un
 * valor aparte (`nonce`) que viaja en una cookie del navegador que inició el enlace: sin las dos cosas iguales, no se enlaza nada.
 */
export type ProveedorVinculable = 'google' | 'twitter';

export const COOKIE_DE_VINCULO = 'vinculo_social';
const VIGENCIA = '10m';
const PROPOSITO = 'vincular-cuenta';

const CAMPO: Record<ProveedorVinculable, 'googleId' | 'twitterId'> = { google: 'googleId', twitter: 'twitterId' };

export const esProveedorVinculable = (p: unknown): p is ProveedorVinculable => p === 'google' || p === 'twitter';

export function emitirVinculo(userId: string, proveedor: ProveedorVinculable): { token: string; nonce: string } {
  const nonce = crypto.randomBytes(16).toString('hex');
  const token = jwt.sign({ id: String(userId), proveedor, nonce, proposito: PROPOSITO }, config.jwtSecret as string, { expiresIn: VIGENCIA });
  return { token, nonce };
}

/** La persona que inició el enlace, o null si el token no sirve, es de otro proveedor, venció o la cookie no coincide. */
export function leerVinculo(token: unknown, nonceDeLaCookie: unknown, proveedor: ProveedorVinculable): string | null {
  if (typeof token !== 'string' || typeof nonceDeLaCookie !== 'string' || !nonceDeLaCookie) return null;
  try {
    const d: any = jwt.verify(token, config.jwtSecret as string);
    if (d?.proposito !== PROPOSITO || d?.proveedor !== proveedor || typeof d?.nonce !== 'string' || !d?.id) return null;
    const a = Buffer.from(d.nonce);
    const b = Buffer.from(nonceDeLaCookie);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return String(d.id);
  } catch {
    return null;
  }
}

export type ResultadoDeVincular = 'ok' | 'ya_vinculada' | 'en_uso' | 'otra_cuenta_vinculada' | 'sin_usuario';

/** Guarda el id del proveedor en la cuenta. Nunca pisa uno distinto ya enlazado ni toma el de otra cuenta. */
export async function vincularCuenta(userId: string, proveedor: ProveedorVinculable, idExterno: string, extra: { avatar?: string } = {}): Promise<ResultadoDeVincular> {
  const campo = CAMPO[proveedor];
  const id = String(idExterno || '').trim();
  if (!id) return 'sin_usuario';
  const user: any = await User.findByPk(userId);
  if (!user) return 'sin_usuario';
  if (user[campo]) return String(user[campo]) === id ? 'ya_vinculada' : 'otra_cuenta_vinculada';
  const otra = await User.findOne({ where: { [campo]: id } as any, attributes: ['id'] });
  if (otra && String(otra.id) !== String(userId)) return 'en_uso';

  user[campo] = id;
  const campos: string[] = [campo];
  if (extra.avatar && !user.avatar) {
    user.avatar = extra.avatar;
    campos.push('avatar');
  }
  await user.save({ fields: campos });
  await logEvento({
    action: 'ACCOUNT_SOCIAL_LINKED',
    actor: `user:${userId}`,
    performedBy: userId,
    category: 'user',
    severity: 'medium',
    description: `La cuenta enlazó ${proveedor === 'google' ? 'Google' : 'X'} desde Configuración → Seguridad.`,
    targetModel: 'User',
    targetId: String(userId),
    metadata: { proveedor },
  });
  return 'ok';
}

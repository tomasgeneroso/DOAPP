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

// ───────────────────────── Enlazar desde la APP del celular ─────────────────────────
//
// En la web el enlace queda atado al navegador con una cookie. En el celular el enlace se hace en el navegador del teléfono, que NO
// tiene esa cookie (la sesión de la app vive en otro lado), así que se ata de otra manera: el callback NO enlaza nada, deja un código
// de un solo uso (5 min) con lo que Google/X devolvió, y la app lo CONFIRMA con su propia sesión (`POST /auth/social/link-confirm`).
// El código solo sirve si quien confirma es la misma persona que empezó el enlace. Así, el «enlace forzado» (el atacante empieza con su
// sesión y le pasa el enlace a la víctima) falla: el código le llega a la app de la víctima, que tiene otra sesión, y no se enlaza nada.
const VIGENCIA_PENDIENTE_MS = 5 * 60 * 1000;
const MAXIMO_PENDIENTES = 1000;

export interface VinculoPendiente {
  userId: string;
  proveedor: ProveedorVinculable;
  idExterno: string;
  avatar?: string;
  vence: number;
}
const pendientes = new Map<string, VinculoPendiente>();

function limpiarPendientes(ahora: number): void {
  for (const [c, p] of pendientes) if (p.vence <= ahora) pendientes.delete(c);
  while (pendientes.size > MAXIMO_PENDIENTES) {
    const primero = pendientes.keys().next().value as string | undefined;
    if (primero === undefined) break;
    pendientes.delete(primero);
  }
}

/** Un enlace que empieza la app: lleva la marca `origen: 'app'` y no depende de ninguna cookie del navegador. */
export function emitirVinculoDeApp(userId: string, proveedor: ProveedorVinculable): string {
  return jwt.sign({ id: String(userId), proveedor, origen: 'app', proposito: PROPOSITO }, config.jwtSecret as string, { expiresIn: VIGENCIA });
}

/** La persona que empezó el enlace desde la app, o null si el token no sirve, es de la web, de otro proveedor o venció. */
export function leerVinculoDeApp(token: unknown, proveedor: ProveedorVinculable): string | null {
  if (typeof token !== 'string') return null;
  try {
    const d: any = jwt.verify(token, config.jwtSecret as string);
    if (d?.proposito !== PROPOSITO || d?.proveedor !== proveedor || d?.origen !== 'app' || !d?.id) return null;
    return String(d.id);
  } catch {
    return null;
  }
}

/** Guarda lo que devolvió Google/X para que la app lo confirme. Devuelve el código de un solo uso. */
export function guardarVinculoPendiente(userId: string, proveedor: ProveedorVinculable, idExterno: string, avatar?: string, ahora: number = Date.now()): string {
  limpiarPendientes(ahora);
  const codigo = crypto.randomBytes(32).toString('hex');
  pendientes.set(codigo, { userId: String(userId), proveedor, idExterno: String(idExterno), avatar, vence: ahora + VIGENCIA_PENDIENTE_MS });
  return codigo;
}

/**
 * Lo pendiente, solo si el código existe, no venció y quien confirma es quien empezó. El código se gasta SIEMPRE al leerlo: si otra
 * persona lo prueba, no queda para reintentar.
 */
export function canjearVinculoPendiente(codigo: unknown, quienConfirma: string, ahora: number = Date.now()): VinculoPendiente | null {
  if (typeof codigo !== 'string' || !/^[0-9a-f]{64}$/.test(codigo)) return null;
  const p = pendientes.get(codigo);
  pendientes.delete(codigo);
  if (!p || p.vence <= ahora) return null;
  if (p.userId !== String(quienConfirma)) return null;
  return p;
}

/** Solo para pruebas. */
export function _vaciarVinculosPendientes(): void {
  pendientes.clear();
}

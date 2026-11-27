import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Op, literal } from 'sequelize';
import { config } from '../config/env.js';
import { AdminPanelKey } from '../models/sql/AdminPanelKey.model.js';
import { generarClaveFuerte } from '../../shared/seguridad/clave.js';

/**
 * Clave de panel (pedido del dueño, 2026-11-26): para ejercer CUALQUIER rol hace falta, además de la sesión de la cuenta, una clave propia generada por el
 * sistema. Al ponerla se entrega un PASE (8 h): cookie httpOnly en la web, cabecera en la app. Sin pase, la persona opera como un usuario común en todo
 * DOAPP y `/api/admin` la rechaza (lo hace cumplir `protect`, así ninguna ruta queda afuera).
 */
export const NOMBRE_DEL_PASE = 'panel';
export const CABECERA_DEL_PASE = 'x-clave-de-panel';
export const HORAS_QUE_DURA_EL_PASE = 8;
export const INTENTOS_ANTES_DE_TRABAR = 5;
export const MINUTOS_TRABADA = 15;
const MINUTOS_DEL_CODIGO = 30;
const PROPOSITO = 'panel';

export const CODIGO_FALTA_LA_CLAVE = 'CLAVE_DE_PANEL_REQUERIDA';

/** Solo las pruebas pueden correr sin ella (para no repetir el paso en cada una). En cualquier servidor es obligatoria y no hay variable que la apague. */
export const claveDePanelExigida = (): boolean => !(process.env.NODE_ENV === 'test' && process.env.CLAVE_DE_PANEL_EN_PRUEBAS !== 'si');

const hashDeCodigo = (c: string) => crypto.createHash('sha256').update(c.trim().toUpperCase()).digest('hex');

// ───── El pase ─────

export function emitirPase(userId: string, stamp: string): string {
  return jwt.sign({ id: userId, sello: stamp, proposito: PROPOSITO }, config.jwtSecret, { expiresIn: `${HORAS_QUE_DURA_EL_PASE}h` });
}

/** ¿El pase sirve para esta persona AHORA? Firma y vencimiento, de ella, con la clave vigente y posterior al último «cerrar todas las sesiones». */
export async function paseValido(pase: unknown, usuario: { id: string; tokensValidAfter?: Date | string | null }): Promise<boolean> {
  if (typeof pase !== 'string' || !pase) return false;
  let datos: any;
  try {
    datos = jwt.verify(pase, config.jwtSecret);
  } catch {
    return false;
  }
  if (datos?.proposito !== PROPOSITO || String(datos.id) !== String(usuario.id) || !datos.sello) return false;
  const desde = usuario.tokensValidAfter ? new Date(usuario.tokensValidAfter).getTime() : 0;
  if (desde && !Number.isNaN(desde) && Number(datos.iat || 0) < Math.floor(desde / 1000)) return false;
  const clave = await AdminPanelKey.findByPk(usuario.id, { attributes: ['stamp', 'keyHash'] });
  return !!clave?.keyHash && clave.stamp === datos.sello;
}

export function paseDelPedido(req: { cookies?: Record<string, any>; headers: Record<string, any> }): string | null {
  const dePrueba = [req.cookies?.[NOMBRE_DEL_PASE], req.headers?.[CABECERA_DEL_PASE]];
  return (dePrueba.find((x) => typeof x === 'string' && x) as string) || null;
}

export async function tienePoderesDeEquipo(req: { cookies?: Record<string, any>; headers: Record<string, any> }, usuario: any): Promise<boolean> {
  if (!usuario?.adminRole) return false;
  return !claveDePanelExigida() || paseValido(paseDelPedido(req), usuario);
}

/**
 * Deja a esta persona como un usuario común SOLO en este pedido. Se tapa la lectura de `adminRole` en esta copia en memoria: el dato guardado no se toca
 * (un `save()` posterior no lo borra).
 */
export function cerrarPoderesDeEquipo(usuario: any): void {
  Object.defineProperty(usuario, 'adminRole', { configurable: true, enumerable: false, get: () => undefined, set: () => undefined });
}

// ───── Intentos ─────

// Una clave que no coincide es 400 y NUNCA 401: la web toma un 401 como «la sesión venció» y manda a la persona al ingreso.
export type Intento = { ok: true } | { ok: false; status: 400 | 429; message: string };

const trabada = (hasta: Date): Intento => ({ ok: false, status: 429, message: `Demasiados intentos. Probá de nuevo en ${Math.max(1, Math.ceil((hasta.getTime() - Date.now()) / 60_000))} minutos.` });

/**
 * Todo lo que se puede adivinar (la clave, la contraseña de la cuenta, el código del correo) pasa por acá: el intento se RESERVA antes de comparar, así
 * muchos pedidos a la vez no prueban más de lo permitido.
 */
export async function conIntentos(userId: string, comprobar: () => Promise<boolean>, mensajeSiFalla: string): Promise<Intento> {
  await AdminPanelKey.bulkCreate([{ userId, failedAttempts: 0 }] as any, { ignoreDuplicates: true });
  const ahora = new Date();
  const [, filas] = await AdminPanelKey.update(
    { failedAttempts: literal('failed_attempts + 1') } as any,
    { where: { userId, [Op.or]: [{ lockedUntil: null }, { lockedUntil: { [Op.lte]: ahora } }] }, returning: true },
  );
  const fila = (filas as AdminPanelKey[])[0];
  if (!fila) {
    const actual = await AdminPanelKey.findByPk(userId, { attributes: ['lockedUntil'] });
    return trabada(actual?.lockedUntil || new Date(Date.now() + MINUTOS_TRABADA * 60_000));
  }
  const hasta = new Date(Date.now() + MINUTOS_TRABADA * 60_000);
  const trabar = () => AdminPanelKey.update({ failedAttempts: 0, lockedUntil: hasta } as any, { where: { userId } });
  if (fila.failedAttempts > INTENTOS_ANTES_DE_TRABAR) {
    await trabar();
    return trabada(hasta);
  }
  if (await comprobar()) {
    await AdminPanelKey.update({ failedAttempts: 0, lockedUntil: null } as any, { where: { userId } });
    return { ok: true };
  }
  if (fila.failedAttempts >= INTENTOS_ANTES_DE_TRABAR) {
    await trabar();
    return trabada(hasta);
  }
  return { ok: false, status: 400, message: mensajeSiFalla };
}

// ───── La clave ─────

export async function estadoDeLaClave(userId: string): Promise<{ creada: boolean; desde: Date | null }> {
  const f = await AdminPanelKey.findByPk(userId, { attributes: ['keyHash', 'keySetAt'] });
  return { creada: !!f?.keyHash, desde: f?.keySetAt ?? null };
}

/**
 * Genera una clave nueva y la devuelve UNA sola vez (se guarda solo el hash). `soloSiNoHay`: la primera creación no pisa una que ya exista, aunque lleguen
 * dos pedidos a la vez.
 */
export async function generarClaveDePanel(userId: string, opciones: { soloSiNoHay?: boolean } = {}): Promise<string | null> {
  const clave = generarClaveFuerte();
  const datos = { keyHash: await bcrypt.hash(clave, 12), stamp: crypto.randomBytes(16).toString('hex'), keySetAt: new Date(), failedAttempts: 0, lockedUntil: null, resetCodeHash: null, resetExpiresAt: null };
  await AdminPanelKey.bulkCreate([{ userId, failedAttempts: 0 }] as any, { ignoreDuplicates: true });
  const [cambiadas] = await AdminPanelKey.update(datos as any, { where: { userId, ...(opciones.soloSiNoHay ? { keyHash: null } : {}) } });
  return cambiadas === 1 ? clave : null;
}

export async function claveCorrecta(userId: string, clave: unknown): Promise<string | null> {
  const f = await AdminPanelKey.findByPk(userId, { attributes: ['keyHash', 'stamp'] });
  if (!f?.keyHash || typeof clave !== 'string' || !clave || clave.length > 100) return null;
  return (await bcrypt.compare(clave.trim(), f.keyHash)) ? f.stamp! : null;
}

/** Un código de un solo uso para el correo de la cuenta (crear sin contraseña de cuenta, o recuperar la clave). */
export async function crearCodigo(userId: string): Promise<string> {
  const codigo = crypto.randomBytes(5).toString('hex').toUpperCase();
  await AdminPanelKey.bulkCreate([{ userId, failedAttempts: 0 }] as any, { ignoreDuplicates: true });
  await AdminPanelKey.update({ resetCodeHash: hashDeCodigo(codigo), resetExpiresAt: new Date(Date.now() + MINUTOS_DEL_CODIGO * 60_000) } as any, { where: { userId } });
  return codigo;
}

export async function codigoCorrecto(userId: string, codigo: unknown): Promise<boolean> {
  const f = await AdminPanelKey.findByPk(userId, { attributes: ['resetCodeHash', 'resetExpiresAt'] });
  if (!f?.resetCodeHash || !f.resetExpiresAt || f.resetExpiresAt.getTime() < Date.now() || typeof codigo !== 'string') return false;
  return crypto.timingSafeEqual(Buffer.from(hashDeCodigo(codigo)), Buffer.from(f.resetCodeHash));
}

/** Borra la clave: la persona crea una nueva la próxima vez que entre. Los pases que hubiera dejan de valer. */
export async function borrarClaveDePanel(userId: string): Promise<boolean> {
  return (await AdminPanelKey.destroy({ where: { userId } })) > 0;
}

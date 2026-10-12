import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

/**
 * Descargar una factura desde la app del celular.
 *
 * La ruta de descarga exige sesión (cabecera Authorization), pero la app abre el PDF con el navegador del teléfono, que
 * no manda esa cabecera: la persona veía un error de «no autorizado». En vez de aflojar la ruta, la app pide una
 * dirección de descarga que:
 *   - sirve para UNA factura y para UNA persona (van firmadas dentro),
 *   - vence a los 5 minutos,
 *   - se firma con una clave DERIVADA, distinta de la de las sesiones: aunque alguien la copie, no sirve como token de
 *     inicio de sesión (el middleware de sesión la rechaza por firma).
 */

export const VIDA_DE_LA_DESCARGA_SEGUNDOS = 5 * 60;

const claveDeDescarga = (): string =>
  crypto.createHash('sha256').update(`${config.jwtSecret}:descarga-de-factura`).digest('hex');

export function firmarDescargaDeFactura(facturaId: string, usuarioId: string): string {
  return jwt.sign({ typ: 'descarga-de-factura', inv: String(facturaId), sub: String(usuarioId) }, claveDeDescarga(), {
    expiresIn: VIDA_DE_LA_DESCARGA_SEGUNDOS,
  });
}

/** Devuelve de quién es la descarga, o null si la firma no es válida, venció o es de otra factura. */
export function verificarDescargaDeFactura(token: unknown, facturaId: string): { usuarioId: string } | null {
  if (typeof token !== 'string' || token.length === 0 || token.length > 2000) return null;
  try {
    const d = jwt.verify(token, claveDeDescarga()) as { typ?: string; inv?: string; sub?: string };
    if (d.typ !== 'descarga-de-factura') return null;
    if (!d.sub || d.inv !== String(facturaId)) return null;
    return { usuarioId: d.sub };
  } catch {
    return null;
  }
}

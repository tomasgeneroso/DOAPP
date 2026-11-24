import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import path from 'path';
import { Op } from 'sequelize';
import { config } from '../config/env.js';
import { User } from '../models/sql/User.model.js';
import crypto from 'crypto';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database.js';
import { estaBaneadoAhora } from './auth.js';
import { sesionVigente } from '../services/vigenciaDeSesion.js';

/**
 * Quién puede ver los archivos privados de /uploads.
 *
 * Todo `uploads/` se servía sin autenticación (`express.static`): las fotos del DNI y la selfie, la matrícula y
 * el seguro, los comprobantes de pago (con datos bancarios), las facturas y los recibos quedaban a una URL de
 * distancia de cualquiera que la conociera. Los nombres llevan 64 bits al azar, pero las URLs viajan en las
 * respuestas de la API, en logs de nginx y en el historial del navegador, y no vencen. La auditoría de "ver
 * documentos de identidad" (view_kyc_media) era decorativa: el panel pedía las URLs por un endpoint auditado y
 * después cargaba la imagen de la carpeta pública.
 *
 * Qué carpetas son privadas y quién entra:
 *   dni                      el dueño del documento, o un administrador (owner, super_admin, admin, support, dpo)
 *   payment-proofs           las partes del pago (quien pagó y quien recibe), o un administrador
 *   worker-payment-proofs    las partes del contrato, o un administrador
 *   invoices, receipts       el dueño de la factura, o un administrador
 *   disputes                 quien inició el reclamo o contra quien es (los archivos de sus pruebas y mensajes), o un administrador
 *   tickets                  quien creó el ticket, o un administrador
 *   daily-log                las dos partes del contrato, o un administrador
 *   (auditoría de seguridad, 2026-11-24: eran públicas por dirección. Valen también para lo ya subido: la regla es por carpeta, no por fecha.)
 *   Excepción: un archivo de «disputes» que es una foto de una publicación del perfil YA PUBLICADA sigue público (hasta 2026-11-24 las publicaciones guardaban ahí
 *   sus fotos; el script server/scripts/moverFotosDePublicaciones.ts las pasa a su propia carpeta).
 *   Enlaces firmados: `GET /api/archivo/enlace` da, a quien puede ver un archivo, una dirección que vale 10 minutos y se abre sin sesión (la app móvil abre los
 *   archivos con el navegador del teléfono, que no lleva la sesión).
 *
 * Qué NO se toca: avatars, blogs, job-images, portfolio, post-media, proposals y documents (publicaciones y adjuntos que se
 * muestran a otras personas) y licenses (hoy sólo el seguro del profesional; la matrícula pasó a license-docs, encriptada).
 *
 * Falla cerrado: sin sesión 401; con sesión pero sin relación con el archivo 403. La sesión es la misma de la
 * app (cookie httpOnly o Bearer): un <img> del navegador manda la cookie solo.
 */

export const CARPETAS_PRIVADAS = ['dni', 'payment-proofs', 'worker-payment-proofs', 'invoices', 'receipts', 'delivery', 'license-docs', 'disputes', 'tickets', 'daily-log'] as const;
export type CarpetaPrivada = (typeof CARPETAS_PRIVADAS)[number];

export const ROLES_QUE_VEN_ARCHIVOS_PRIVADOS = ['owner', 'super_admin', 'admin', 'support', 'dpo'];

/** `/dni/abc.jpg` o `/DNI/../avatars/x` → { carpeta, archivo } normalizado, o null si la ruta no es segura. */
export function parsearRutaDeArchivo(rutaCruda: string): { carpeta: string; archivo: string } | null {
  let decodificada: string;
  try {
    decodificada = decodeURIComponent(String(rutaCruda || '').split('?')[0]);
  } catch {
    return null;
  }
  if (decodificada.includes('\0') || decodificada.includes('\\')) return null;
  const normalizada = path.posix.normalize('/' + decodificada).replace(/^\/+/, '');
  // Un `..` que se escapa de la raíz, o que cambia de carpeta, nunca es legítimo.
  if (normalizada.startsWith('..') || decodificada.split('/').includes('..')) return null;
  const [carpeta, ...resto] = normalizada.split('/');
  if (!carpeta) return null;
  return { carpeta: carpeta.toLowerCase(), archivo: resto.join('/') };
}

/** Duración de un enlace firmado a un archivo privado. */
export const SEGUNDOS_DE_UN_ENLACE_FIRMADO = 600;
const claveDeFirma = () => `${config.jwtSecret}:enlace-de-archivo`;
const calcularFirma = (ruta: string, vence: number) => crypto.createHmac('sha256', claveDeFirma()).update(`${ruta}|${vence}`).digest('hex').slice(0, 40);

/** La dirección firmada de un archivo (`carpeta/archivo`): vale hasta `vence` y solo para ESE archivo. */
export function firmarArchivo(carpeta: string, archivo: string, ahora = Date.now()): { ruta: string; firma: string; vence: number } {
  const ruta = `${carpeta.toLowerCase()}/${archivo}`;
  const vence = Math.floor(ahora / 1000) + SEGUNDOS_DE_UN_ENLACE_FIRMADO;
  return { ruta, firma: calcularFirma(ruta, vence), vence };
}

export function firmaValida(carpeta: string, archivo: string, firma: unknown, vence: unknown, ahora = Date.now()): boolean {
  const v = Number(vence);
  if (typeof firma !== 'string' || !/^[0-9a-f]{40}$/.test(firma) || !Number.isFinite(v) || v * 1000 < ahora) return false;
  const esperada = calcularFirma(`${carpeta.toLowerCase()}/${archivo}`, v);
  return crypto.timingSafeEqual(Buffer.from(esperada), Buffer.from(firma));
}

const escaparLike = (t: string) => t.replace(/[\\%_]/g, (c) => '\\' + c);
const hayFila = async (sql: string, reemplazos: Record<string, unknown>): Promise<boolean> =>
  (await sequelize.query(sql, { replacements: reemplazos, type: QueryTypes.SELECT })).length > 0;

/** ¿Es la foto de una publicación del perfil ya publicada? Esas (viejas, guardadas en «disputes») siguen siendo públicas. */
async function esFotoDeUnaPublicacion(carpeta: string, archivo: string): Promise<boolean> {
  return hayFila('SELECT 1 FROM posts WHERE is_published = true AND gallery::text LIKE :p LIMIT 1', { p: `%/uploads/${carpeta}/${escaparLike(archivo)}%` });
}

async function usuarioDeLaSesion(req: Request): Promise<any | null> {
  let token: string | undefined = (req as any).cookies?.token;
  if (!token && req.headers.authorization?.startsWith('Bearer')) token = req.headers.authorization.split(' ')[1];
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { id?: string; iat?: number };
    if (!decoded?.id) return null;
    const user: any = await User.findByPk(decoded.id, { attributes: { exclude: ['password'] } });
    if (!user || estaBaneadoAhora(user) || !sesionVigente(decoded, user)) return null;
    return user;
  } catch {
    return null;
  }
}

/** Las direcciones con las que se guarda el archivo: con y sin el prefijo /api, que son la misma cosa. */
function direcciones(carpeta: string, archivo: string): string[] {
  return [`/uploads/${carpeta}/${archivo}`, `/api/uploads/${carpeta}/${archivo}`];
}

export async function esElDuenoDelArchivo(user: any, carpeta: CarpetaPrivada, archivo: string): Promise<boolean> {
  const urls = direcciones(carpeta, archivo);
  switch (carpeta) {
    case 'dni':
      return !!(await User.count({
        where: { id: user.id, [Op.or]: [{ dniPhotoFront: { [Op.in]: urls } }, { dniPhotoBack: { [Op.in]: urls } }, { selfieUrl: { [Op.in]: urls } }] } as any,
      }));
    case 'payment-proofs': {
      const { PaymentProof } = await import('../models/sql/PaymentProof.model.js');
      const { Payment } = await import('../models/sql/Payment.model.js');
      const pruebas: any[] = await PaymentProof.findAll({ where: { fileUrl: { [Op.in]: urls } } as any, attributes: ['paymentId', 'userId'] });
      for (const p of pruebas) {
        if (String(p.userId) === String(user.id)) return true;
        const pago: any = await Payment.findByPk(p.paymentId, { attributes: ['payerId', 'recipientId'] });
        if (pago && [String(pago.payerId), String(pago.recipientId)].includes(String(user.id))) return true;
      }
      return false;
    }
    case 'worker-payment-proofs': {
      const { Contract } = await import('../models/sql/Contract.model.js');
      const contratos: any[] = await Contract.findAll({ where: { paymentProofUrl: { [Op.in]: urls } } as any, attributes: ['clientId', 'doerId'] });
      if (contratos.some((c) => [String(c.clientId), String(c.doerId)].includes(String(user.id)))) return true;
      // El comprobante de la transferencia al trabajador también queda como evidencia del pago.
      const { PaymentProof } = await import('../models/sql/PaymentProof.model.js');
      const { Payment } = await import('../models/sql/Payment.model.js');
      const pruebas: any[] = await PaymentProof.findAll({ where: { fileUrl: { [Op.in]: urls } } as any, attributes: ['paymentId'] });
      for (const p of pruebas) {
        const pago: any = await Payment.findByPk(p.paymentId, { attributes: ['payerId', 'recipientId'] });
        if (pago && [String(pago.payerId), String(pago.recipientId)].includes(String(user.id))) return true;
      }
      return false;
    }
    case 'delivery': {
      // Fotos de entrega del contrato: las ven las dos partes (el equipo entra por el rol, más abajo).
      const { Contract } = await import('../models/sql/Contract.model.js');
      for (const url of urls) {
        const contrato: any = await Contract.findOne({ where: { deliveryPhotos: { [Op.contains]: [{ url }] } } as any, attributes: ['clientId', 'doerId'] });
        if (contrato && [String(contrato.clientId), String(contrato.doerId)].includes(String(user.id))) return true;
      }
      return false;
    }
    case 'disputes':
      return hayFila('SELECT 1 FROM disputes WHERE (initiated_by = :u OR against = :u) AND (evidence::text LIKE :p OR messages::text LIKE :p) LIMIT 1', { u: user.id, p: `%/uploads/disputes/${escaparLike(archivo)}%` });
    case 'tickets':
      return hayFila('SELECT 1 FROM tickets WHERE created_by = :u AND messages::text LIKE :p LIMIT 1', { u: user.id, p: `%/uploads/tickets/${escaparLike(archivo)}%` });
    case 'daily-log':
      return hayFila('SELECT 1 FROM contracts WHERE (client_id = :u OR doer_id = :u) AND daily_log::text LIKE :p LIMIT 1', { u: user.id, p: `%/uploads/daily-log/${escaparLike(archivo)}%` });
    case 'license-docs':
      // Los archivos de la matrícula están ENCRIPTADOS y se entregan por GET /api/users/:id/license-document/:lado
      // (services/matricula.ts), que decide el acceso y los desencripta. Por la ruta de archivos sólo los ve administración.
      return false;
    case 'invoices':
    case 'receipts': {
      const { Invoice } = await import('../models/sql/Invoice.model.js');
      const facturas: any[] = await Invoice.findAll({ where: { pdfUrl: { [Op.in]: urls } } as any, attributes: ['userId'] });
      return facturas.some((f) => String(f.userId) === String(user.id));
    }
  }
}

export async function protegerArchivosPrivados(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ruta = parsearRutaDeArchivo(req.path);
    if (!ruta) {
      res.status(400).json({ success: false, message: 'Ruta de archivo no válida' });
      return;
    }
    if (!(CARPETAS_PRIVADAS as readonly string[]).includes(ruta.carpeta)) {
      next();
      return;
    }

    // Un enlace firmado (lo da GET /api/archivo/enlace a quien puede ver el archivo) se abre sin sesión mientras no venza.
    const firma = res.locals?.firmaDeArchivo?.firma ?? (req.query as Record<string, unknown>)?.firma;
    const vence = res.locals?.firmaDeArchivo?.vence ?? (req.query as Record<string, unknown>)?.vence;
    if (ruta.archivo && firma && firmaValida(ruta.carpeta, ruta.archivo, firma, vence)) {
      next();
      return;
    }
    // Las fotos de publicaciones del perfil que se guardaron en «disputes» antes de tener carpeta propia siguen siendo públicas.
    if (ruta.carpeta === 'disputes' && ruta.archivo && (await esFotoDeUnaPublicacion(ruta.carpeta, ruta.archivo))) {
      next();
      return;
    }

    const user = await usuarioDeLaSesion(req);
    if (!user) {
      res.status(401).json({ success: false, message: 'Iniciá sesión para ver este archivo' });
      return;
    }
    if (user.adminRole && ROLES_QUE_VEN_ARCHIVOS_PRIVADOS.includes(String(user.adminRole))) {
      next();
      return;
    }
    if (ruta.archivo && (await esElDuenoDelArchivo(user, ruta.carpeta as CarpetaPrivada, ruta.archivo))) {
      next();
      return;
    }
    res.status(403).json({ success: false, message: 'No tenés permiso para ver este archivo' });
  } catch (error) {
    // Ante cualquier error el archivo NO se entrega.
    console.error('[archivos privados] error al decidir el acceso:', error);
    res.status(500).json({ success: false, message: 'No se pudo verificar el acceso al archivo' });
  }
}

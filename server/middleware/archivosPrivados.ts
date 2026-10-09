import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import path from 'path';
import { Op } from 'sequelize';
import { config } from '../config/env.js';
import { User } from '../models/sql/User.model.js';
import { estaBaneadoAhora } from './auth.js';

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
 *
 * Qué NO se toca: avatars, blogs, job-images, portfolio, proposals, disputes y documents (publicaciones y
 * adjuntos que se muestran a otras personas; las evidencias de disputas y de posts comparten carpeta y requieren
 * una decisión aparte) y licenses: la matrícula profesional se le muestra A PROPÓSITO a quien contrata (link en el
 * detalle del trabajo, JobDetail.tsx). Si el dueño decide que no, se agrega 'licenses' a CARPETAS_PRIVADAS.
 *
 * Falla cerrado: sin sesión 401; con sesión pero sin relación con el archivo 403. La sesión es la misma de la
 * app (cookie httpOnly o Bearer): un <img> del navegador manda la cookie solo.
 */

export const CARPETAS_PRIVADAS = ['dni', 'payment-proofs', 'worker-payment-proofs', 'invoices', 'receipts'] as const;
type CarpetaPrivada = (typeof CARPETAS_PRIVADAS)[number];

const ROLES_QUE_VEN_ARCHIVOS_PRIVADOS = ['owner', 'super_admin', 'admin', 'support', 'dpo'];

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

async function usuarioDeLaSesion(req: Request): Promise<any | null> {
  let token: string | undefined = (req as any).cookies?.token;
  if (!token && req.headers.authorization?.startsWith('Bearer')) token = req.headers.authorization.split(' ')[1];
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { id?: string };
    if (!decoded?.id) return null;
    const user: any = await User.findByPk(decoded.id, { attributes: { exclude: ['password'] } });
    if (!user || estaBaneadoAhora(user)) return null;
    return user;
  } catch {
    return null;
  }
}

/** Las direcciones con las que se guarda el archivo: con y sin el prefijo /api, que son la misma cosa. */
function direcciones(carpeta: string, archivo: string): string[] {
  return [`/uploads/${carpeta}/${archivo}`, `/api/uploads/${carpeta}/${archivo}`];
}

async function esElDuenoDelArchivo(user: any, carpeta: CarpetaPrivada, archivo: string): Promise<boolean> {
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

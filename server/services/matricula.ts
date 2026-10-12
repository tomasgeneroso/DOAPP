import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Op } from 'sequelize';
import { encryptBuffer, decryptBuffer } from '../utils/encryption.js';
import { matriculaEstaEnClaro, matriculaParaGuardar } from '../utils/matriculaCifrada.js';
import { User } from '../models/sql/User.model.js';
import { Contract } from '../models/sql/Contract.model.js';

/**
 * Matrícula profesional: archivos (frente y reverso) y quién los puede ver.
 *
 * Lo que dicen los Términos (4.6) y la Política de Privacidad (1.4, 3, 4):
 *  - DOAPP recibe el número y hasta dos archivos y los guarda ENCRIPTADOS (AES-256-GCM, la clave del CBU y el DNI).
 *  - No los verifica: se basa en la buena fe del Usuario.
 *  - Los archivos los ve administración y, una vez que las dos partes están vinculadas en un contrato, el Usuario
 *    contratante, para que los verifique por su cuenta. El dueño, siempre.
 *
 * El archivo se guarda en `uploads/license-docs/` (carpeta privada: ver archivosPrivados.ts) ya encriptado; en disco nunca
 * queda el original. La referencia guardada en el usuario NO es una dirección que se pueda abrir: el archivo se entrega
 * por GET /api/users/:id/license-document/:lado, que decide el acceso y lo desencripta al vuelo.
 */

export const CARPETA_DE_MATRICULAS = path.join(process.cwd(), 'uploads', 'license-docs');
export const PREFIJO_DE_LA_REFERENCIA = '/uploads/license-docs/';
const CARPETA_ANTERIOR = path.join(process.cwd(), 'uploads', 'licenses');

export type LadoDeLaMatricula = 'front' | 'back';
export const LADOS_DE_LA_MATRICULA: readonly LadoDeLaMatricula[] = ['front', 'back'];

/** Roles de administración que ven los archivos privados (los mismos de archivosPrivados.ts). */
export const ROLES_QUE_VEN_LA_MATRICULA = ['owner', 'super_admin', 'admin', 'support', 'dpo'];

const TIPOS: Array<{ ext: string; mime: string; firma: (b: Buffer) => boolean }> = [
  { ext: 'jpg', mime: 'image/jpeg', firma: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', mime: 'image/png', firma: (b) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v) },
  { ext: 'webp', mime: 'image/webp', firma: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  { ext: 'pdf', mime: 'application/pdf', firma: (b) => b.subarray(0, 4).toString('latin1') === '%PDF' },
];

/** El tipo según el CONTENIDO (no según lo que diga el cliente): sólo imagen (JPG, PNG, WEBP) o PDF. */
export function tipoDeContenido(datos: Buffer): { ext: string; mime: string } | null {
  if (!Buffer.isBuffer(datos) || datos.length < 12) return null;
  const t = TIPOS.find((x) => x.firma(datos));
  return t ? { ext: t.ext, mime: t.mime } : null;
}

const mimeDeLaExtension = (ext: string): string => TIPOS.find((t) => t.ext === ext)?.mime || 'application/octet-stream';

/** Nombre de archivo de una referencia válida, o null (nada de rutas, `..` ni carpetas ajenas). */
export function nombreDeLaReferencia(ref: unknown): string | null {
  const texto = String(ref ?? '');
  const sinApi = texto.startsWith('/api/') ? texto.slice(4) : texto;
  if (!sinApi.startsWith(PREFIJO_DE_LA_REFERENCIA)) return null;
  const nombre = sinApi.slice(PREFIJO_DE_LA_REFERENCIA.length);
  return /^license-[0-9]+-[0-9a-f]{12}\.(jpg|png|webp|pdf)\.enc$/.test(nombre) ? nombre : null;
}

/** Encripta y guarda un archivo; devuelve la referencia a guardar en el usuario. */
export async function guardarArchivoDeMatricula(datos: Buffer): Promise<string> {
  const tipo = tipoDeContenido(datos);
  if (!tipo) throw new Error('El archivo no es una imagen (JPG, PNG, WEBP) ni un PDF');
  fs.mkdirSync(CARPETA_DE_MATRICULAS, { recursive: true });
  const nombre = `license-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${tipo.ext}.enc`;
  await fs.promises.writeFile(path.join(CARPETA_DE_MATRICULAS, nombre), encryptBuffer(datos), { mode: 0o600 });
  return `${PREFIJO_DE_LA_REFERENCIA}${nombre}`;
}

/** Lee y desencripta. Lanza si la referencia no es válida, el archivo falta o no se puede desencriptar. */
export async function leerArchivoDeMatricula(ref: unknown): Promise<{ datos: Buffer; mime: string }> {
  const nombre = nombreDeLaReferencia(ref);
  if (!nombre) throw new Error('Referencia de archivo no válida');
  const cifrado = await fs.promises.readFile(path.join(CARPETA_DE_MATRICULAS, nombre));
  const datos = decryptBuffer(cifrado);
  const ext = nombre.split('.').slice(-2, -1)[0];
  return { datos, mime: mimeDeLaExtension(ext) };
}

/** Borra el archivo de una referencia: la nueva (encriptada) o, si todavía no se migró, la anterior en claro. */
export async function borrarArchivoDeMatricula(ref: unknown): Promise<void> {
  const nombre = nombreDeLaReferencia(ref);
  let ruta: string | null = nombre ? path.join(CARPETA_DE_MATRICULAS, nombre) : null;
  if (!ruta) {
    const texto = String(ref ?? "").split("?")[0];
    const anterior = texto.replace(/^\/api/, "");
    const base = path.basename(anterior);
    if (anterior.startsWith("/uploads/licenses/") && /^license-[A-Za-z0-9._-]+$/.test(base)) ruta = path.join(CARPETA_ANTERIOR, base);
  }
  if (!ruta) return;
  try {
    await fs.promises.unlink(ruta);
  } catch {
    /* ya no estaba */
  }
}

/** ¿Es administración con permiso para ver los archivos de matrícula? (sin consultar la base) */
export const esAdministracionQueVeMatriculas = (quien: any): boolean =>
  !!(quien?.adminRole && ROLES_QUE_VEN_LA_MATRICULA.includes(String(quien.adminRole)));

/** ¿`quien` puede ver los archivos de la matrícula de `duenoId`? Él mismo, administración, o su contratante ya vinculado. */
export async function puedeVerLosArchivosDeLaMatricula(quien: any, duenoId: string): Promise<boolean> {
  if (!quien?.id || !duenoId) return false;
  if (String(quien.id) === String(duenoId)) return true;
  if (quien.adminRole && ROLES_QUE_VEN_LA_MATRICULA.includes(String(quien.adminRole))) return true;
  // «Una vez que se encuentran ambas partes»: hay un contrato entre el que mira (cliente) y el dueño (trabajador).
  const vinculados = await Contract.count({
    where: { clientId: quien.id, doerId: duenoId, status: { [Op.notIn]: ['cancelled', 'rejected'] } } as any,
  });
  return vinculados > 0;
}

export const direccionDeLaMatricula = (duenoId: string, lado: LadoDeLaMatricula): string =>
  `/api/users/${duenoId}/license-document/${lado}`;

/**
 * Lo que se le muestra a quien mira: las direcciones por las que PUEDE abrir los archivos (nunca la referencia interna).
 * Sin permiso, nada; la existencia se informa aparte (`hasLicenseDocument`).
 */
export function presentarArchivosDeLaMatricula(
  usuario: { id?: string; licenseDocumentUrl?: string | null; licenseDocumentBackUrl?: string | null },
  puedeVer: boolean,
): { licenseDocumentUrl: string | null; licenseDocumentBackUrl: string | null; hasLicenseDocument: boolean } {
  const id = String(usuario?.id ?? '');
  const tieneFrente = !!usuario?.licenseDocumentUrl;
  const tieneReverso = !!usuario?.licenseDocumentBackUrl;
  return {
    licenseDocumentUrl: puedeVer && tieneFrente && id ? direccionDeLaMatricula(id, 'front') : null,
    licenseDocumentBackUrl: puedeVer && tieneReverso && id ? direccionDeLaMatricula(id, 'back') : null,
    hasLicenseDocument: tieneFrente || tieneReverso,
  };
}

// ------------------------------------------------------------------ encriptar lo que ya estaba guardado en claro

export interface ResultadoDelCifradoDeMatriculas {
  numeros: number;
  archivos: number;
  errores: number;
}

/**
 * Encripta lo anterior a este cambio: números de matrícula guardados en claro y archivos que están en `uploads/licenses/`
 * (el original se borra después de guardar la copia encriptada). Idempotente: lo que ya está encriptado no se toca.
 * Cada usuario va aparte: un fallo no frena a los demás ni tumba el arranque.
 */
export async function encriptarMatriculasExistentes(): Promise<ResultadoDelCifradoDeMatriculas> {
  const r: ResultadoDelCifradoDeMatriculas = { numeros: 0, archivos: 0, errores: 0 };
  const usuarios = await User.findAll({
    where: {
      [Op.or]: [
        { licenseNumber: { [Op.ne]: null } },
        { licenseDocumentUrl: { [Op.ne]: null } },
        { licenseDocumentBackUrl: { [Op.ne]: null } },
      ],
    } as any,
    attributes: ['id', 'licenseNumber', 'licenseDocumentUrl', 'licenseDocumentBackUrl'],
  });

  for (const u of usuarios as any[]) {
    try {
      const cambios: Record<string, unknown> = {};

      // El número: se compara lo CRUDO guardado (el getter ya entrega el texto en claro).
      const crudo = u.getDataValue('licenseNumber');
      if (matriculaEstaEnClaro(crudo)) {
        cambios.licenseNumber = matriculaParaGuardar(crudo);
        r.numeros += 1;
      }

      // Los archivos: los que todavía apuntan a la carpeta anterior (en claro).
      for (const campo of ['licenseDocumentUrl', 'licenseDocumentBackUrl'] as const) {
        const ref = u[campo];
        if (!ref || nombreDeLaReferencia(ref)) continue; // vacío, o ya está encriptado
        const nombre = path.basename(String(ref).split('?')[0]);
        const origen = path.join(CARPETA_ANTERIOR, nombre);
        if (!/^[A-Za-z0-9._-]+$/.test(nombre) || !fs.existsSync(origen)) {
          // La referencia no lleva a ningún archivo: no hay nada que proteger ni que mostrar. Se anota y se deja.
          console.warn(`[matrícula] el usuario ${u.id} tiene una referencia que no lleva a un archivo (${campo}); se deja como está`);
          r.errores += 1;
          continue;
        }
        const nuevaRef = await guardarArchivoDeMatricula(await fs.promises.readFile(origen));
        cambios[campo] = nuevaRef;
        // El original en claro se borra recién cuando la referencia nueva ya quedó guardada (abajo).
        (cambios as any)[`__borrar_${campo}`] = origen;
      }

      const aBorrar = Object.entries(cambios).filter(([k]) => k.startsWith('__borrar_')).map(([, v]) => String(v));
      const aGuardar = Object.fromEntries(Object.entries(cambios).filter(([k]) => !k.startsWith('__borrar_')));
      if (Object.keys(aGuardar).length === 0) continue;
      // Actualización directa y sin ganchos: el usuario se cargó con pocas columnas y los ganchos del modelo esperan las demás.
      await User.update(aGuardar as any, { where: { id: u.id }, hooks: false, validate: false } as any);
      for (const origen of aBorrar) {
        try {
          await fs.promises.unlink(origen);
          r.archivos += 1;
        } catch {
          r.errores += 1;
        }
      }
    } catch (error) {
      r.errores += 1;
      console.error(`[matrícula] no se pudo encriptar lo del usuario ${u?.id}:`, (error as Error)?.message);
    }
  }
  return r;
}

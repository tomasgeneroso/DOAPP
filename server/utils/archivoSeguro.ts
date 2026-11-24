import crypto from 'crypto';

/**
 * Nombres y extensiones de los archivos subidos (auditoría de seguridad, 2026-11-24: falla CRÍTICA).
 *
 * Los archivos se guardaban con la extensión que escribía quien los subía (`ataque.html`) y se revisaba solo el tipo que declaraba el navegador y los primeros
 * bytes. Un archivo `ataque.html` con tipo falso `image/png` y encabezado de GIF pasaba las dos revisiones, y se servía desde el mismo sitio de la web como
 * `text/html`: el código de la página corría con la sesión de quien lo abriera (también el dueño). Se pudo hacer sin cuenta, por la consulta de invitado.
 *
 * Ahora la extensión sale SIEMPRE de una lista cerrada según el tipo declarado, nunca del nombre del archivo: un `.html` que dice ser PNG se guarda como `.png`,
 * se sirve como imagen y no se ejecuta; lo que no es de la lista se guarda como `.bin` (se descarga, no se abre).
 */
const EXTENSION_POR_TIPO: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'video/mp4': '.mp4',
  'video/mpeg': '.mpg',
  'video/quicktime': '.mov',
  'video/x-msvideo': '.avi',
  'video/webm': '.webm',
};

/** Las extensiones que el navegador puede MOSTRAR en la página. El resto se descarga (ver `cabecerasDeArchivoSubido`). */
export const EXTENSIONES_QUE_SE_MUESTRAN: ReadonlySet<string> = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.mp4', '.webm', '.mov', '.mpg']);

export function extensionSegura(tipoDeclarado?: string | null): string {
  return EXTENSION_POR_TIPO[String(tipoDeclarado ?? '').toLowerCase().trim()] ?? '.bin';
}

/** `1732400000000-9f8e7d6c5b4a3f2e.png`: sin nada del nombre original (el nombre que se muestra a la persona vive en la base, no en el disco). */
export function nombreSeguro(archivo: { mimetype?: string | null }, prefijo = ''): string {
  return `${prefijo}${Date.now()}-${crypto.randomBytes(8).toString('hex')}${extensionSegura(archivo.mimetype)}`;
}

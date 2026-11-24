/**
 * Un archivo del chat vive en las carpetas de esta plataforma: `/uploads/…`, `/api/uploads/…` o `/api/archivo?ruta=…`, sin `..` ni barras invertidas.
 * Lo que manda el cliente por el socket nunca puede apuntar a una dirección de afuera (seguimiento, phishing) ni a un esquema como `javascript:`.
 */
export function esDireccionDeArchivoPropia(direccion: string): boolean {
  if (typeof direccion !== 'string' || direccion.length > 500 || /[\u0000-\u001f\\]/.test(direccion) || direccion.includes('..')) return false;
  return /^\/(api\/)?uploads\/[A-Za-z0-9._\-\/]+$/.test(direccion) || /^\/api\/archivo\?ruta=[A-Za-z0-9._\-\/%]+$/.test(direccion);
}

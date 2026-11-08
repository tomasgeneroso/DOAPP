/**
 * La «clave de persona»: lo que tienen en común TODOS los documentos de una misma persona (el DNI argentino, el pasaporte argentino, el pasaporte
 * y el DNI italianos de quien tiene doble ciudadanía) aunque cada documento tenga otro número.
 *
 * Qué motivó esto (2026-11-06): el sistema solo guardaba una clave de identidad si el número de documento tenía forma de DNI argentino (7 a 9 dígitos),
 * así que un pasaporte o un DNI italiano no dejaban ninguna clave y la misma persona podía abrir cuatro cuentas verificadas con cuatro documentos.
 *
 * La clave es PRIMER APELLIDO + PRIMER NOMBRE + FECHA DE NACIMIENTO, normalizados: sin acentos, en mayúsculas, solo letras. Un documento dice
 * «PÉREZ GARCÍA, María José» y otro «PEREZ, MARIA»: los dos dan `PEREZ|MARIA|1990-05-15`. No es una prueba (dos personas distintas pueden coincidir: es raro,
 * pero pasa) sino una ALERTA: una coincidencia no frena nada, le avisa a administración para que la mire.
 *
 * Este módulo solo arma el texto normalizado. Guardarlo se hace con `huellaDePersona` (server/utils/encryption.ts), que lo firma con la clave del servidor:
 * en la base no quedan el nombre ni la fecha de nacimiento en claro.
 */

/** Palabras que acompañan al apellido pero no son el apellido («DE LA CRUZ» → CRUZ, «DI MARIA» → MARIA, «DA SILVA» → SILVA). */
const PARTICULAS = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'LO', 'EL', 'AL', 'DI', 'DA', 'DAS', 'DO', 'DOS', 'DU', 'VAN', 'VON', 'DER', 'DEN', 'SAN', 'SANTA', 'MC', 'MAC', 'Y', 'E']);

/** Sin acentos ni signos, en mayúsculas, con los espacios simples. «María-José O'Brien» → «MARIA JOSE O BRIEN». */
export function soloLetras(texto: unknown): string {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]+/g, ' ')
    .trim();
}

/** El primer apellido «de verdad»: se saltean las partículas del comienzo. Null si no queda ninguno. */
export function primerApellido(apellidos: unknown): string | null {
  const palabras = soloLetras(apellidos).split(' ').filter(Boolean);
  const util = palabras.find((p) => !PARTICULAS.has(p));
  return util ?? null;
}

/** El primer nombre de pila. Null si no hay. */
export function primerNombre(nombres: unknown): string | null {
  const palabras = soloLetras(nombres).split(' ').filter(Boolean);
  return palabras.find((p) => !PARTICULAS.has(p)) ?? null;
}

/** Una fecha de nacimiento «AAAA-MM-DD» razonable (entre 1900 y hoy) o null. No acepta otros formatos: Didit la entrega así. */
export function fechaDeNacimientoValida(valor: unknown, hoy: Date = new Date()): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(valor ?? '').trim());
  if (!m) return null;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  if (fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) return null; // 31 de febrero, etc.
  if (anio < 1900 || fecha.getTime() > hoy.getTime()) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export interface DatosDelDocumento {
  nombres?: unknown;
  apellidos?: unknown;
  fechaDeNacimiento?: unknown;
}

/**
 * El texto de la clave («PEREZ|MARIA|1990-05-15») o null si falta alguno de los tres datos: sin los tres no se arma una clave (mejor ninguna que una floja
 * que junte a personas distintas).
 */
export function claveDePersona(datos: DatosDelDocumento, hoy: Date = new Date()): string | null {
  const apellido = primerApellido(datos.apellidos);
  const nombre = primerNombre(datos.nombres);
  const nacimiento = fechaDeNacimientoValida(datos.fechaDeNacimiento, hoy);
  if (!apellido || !nombre || !nacimiento) return null;
  return `${apellido}|${nombre}|${nacimiento}`;
}

/** Lo que Didit leyó del documento (`id_verifications[0]`), listo para `claveDePersona`. Tolera la forma vieja (`id_verification`). */
export function datosDelDocumentoDeDidit(decision: any): DatosDelDocumento {
  const idv = decision?.id_verifications?.[0] || decision?.id_verification || {};
  return { nombres: idv?.first_name, apellidos: idv?.last_name, fechaDeNacimiento: idv?.date_of_birth };
}

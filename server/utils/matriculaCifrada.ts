import { decrypt, encrypt, isEncrypted } from './encryption.js';

/**
 * El número de matrícula se guarda encriptado (AES-256-GCM, la misma clave que el CBU y el DNI).
 *
 * Se aplica en el propio modelo (`User.licenseNumber`: get/set), así que el resto del código sigue leyendo y escribiendo
 * el número en claro y nadie tiene que acordarse de encriptar. Lo que ya estaba guardado en claro (antes de este
 * cambio) se sigue leyendo bien y se encripta al reescribirse o con la tarea de arranque (`matricula.ts`).
 *
 * Falla cerrado: si lo guardado está encriptado pero no se puede desencriptar (cambió la clave, dato alterado), se
 * devuelve null — nunca el texto encriptado ni un valor inventado — y se deja constancia en el log.
 */

export const LARGO_MAXIMO_DE_LA_MATRICULA = 40;

/** Lo que se escribe en la base: encriptado, o null si no hay número. */
export function matriculaParaGuardar(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim();
  if (texto === '') return null;
  if (isEncrypted(texto)) return texto; // ya viene encriptado (por ejemplo, al copiar el valor ya guardado)
  return encrypt(texto.slice(0, LARGO_MAXIMO_DE_LA_MATRICULA));
}

/** Lo que se lee de la base, en claro. */
export function matriculaLeida(guardado: unknown): string | null {
  if (guardado === null || guardado === undefined) return null;
  const texto = String(guardado);
  if (texto === '') return null;
  if (!isEncrypted(texto)) return texto; // dato anterior al cifrado
  try {
    return decrypt(texto);
  } catch {
    console.error('[matrícula] no se pudo desencriptar un número de matrícula guardado (¿cambió ENCRYPTION_KEY?)');
    return null;
  }
}

/** ¿Lo guardado todavía está en claro? (para la tarea que encripta lo anterior) */
export function matriculaEstaEnClaro(guardado: unknown): boolean {
  const texto = guardado === null || guardado === undefined ? '' : String(guardado);
  return texto !== '' && !isEncrypted(texto);
}

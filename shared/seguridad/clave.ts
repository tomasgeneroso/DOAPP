/**
 * Cómo tiene que ser una contraseña NUEVA (registro, restablecer y cambiar): al menos 6 caracteres y al menos un símbolo (pedido del dueño, 2026-11-24).
 * Las claves que ya existen no se tocan: esto solo se pide al crear o cambiar una. Lo usan el servidor, la web y la app, para que digan lo mismo.
 *
 * Símbolo = un signo de puntuación ASCII (! ? . , - _ @ # $ % & * + = etc.). Las letras con tilde y la «ñ» NO cuentan como símbolo.
 * Máximo 72 bytes: bcrypt ignora lo que pasa de ahí, y una clave más larga parecería más segura de lo que es.
 */
export const LARGO_MINIMO_DE_CLAVE = 6;
export const BYTES_MAXIMOS_DE_CLAVE = 72;

export const TEXTO_DE_LA_REGLA_DE_CLAVE = 'Al menos 6 caracteres y un símbolo (por ejemplo ! ? . - _ @ # $ %).';

const TIENE_SIMBOLO = /[!-/:-@[-`{-~]/;

/** Por qué una contraseña nueva no sirve, o `null` si sirve. */
export function motivoDeClaveDebil(clave: unknown): string | null {
  if (typeof clave !== 'string' || clave.length < LARGO_MINIMO_DE_CLAVE) return 'La contraseña debe tener al menos 6 caracteres.';
  // Tamaño en bytes (UTF-8) sin depender de Buffer, que no existe en el navegador.
  const bytes = encodeURIComponent(clave).replace(/%[A-F\d]{2}/g, 'x').length;
  if (bytes > BYTES_MAXIMOS_DE_CLAVE) return 'La contraseña es demasiado larga (máximo 72 caracteres).';
  if (!TIENE_SIMBOLO.test(clave)) return 'La contraseña debe tener al menos un símbolo (por ejemplo ! ? . - _ @ # $ %).';
  return null;
}

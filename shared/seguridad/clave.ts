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

/** Largo de una clave generada por el sistema: 32 caracteres al azar sobre 69 posibles son más de 190 bits (imposible de adivinar). */
export const LARGO_DE_UNA_CLAVE_GENERADA = 32;
// Sin los que se confunden al copiarlos a mano (0 O 1 l I) y con símbolos que no molestan al pegarlos.
const GRUPOS_DE_CARACTERES = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!#$%*+-=?@_'];

/** Un entero al azar en [0, n), sin sesgo, con el generador criptográfico del navegador o de Node. */
function alAzar(n: number): number {
  const caja = new Uint32Array(1);
  const tope = Math.floor(0x100000000 / n) * n;
  do {
    globalThis.crypto.getRandomValues(caja);
  } while (caja[0] >= tope);
  return caja[0] % n;
}

/** Una clave nueva extremadamente segura, con al menos un carácter de cada grupo. */
export function generarClaveFuerte(largo: number = LARGO_DE_UNA_CLAVE_GENERADA): string {
  const todos = GRUPOS_DE_CARACTERES.join('');
  const letras = GRUPOS_DE_CARACTERES.map((g) => g[alAzar(g.length)]);
  while (letras.length < Math.max(largo, GRUPOS_DE_CARACTERES.length)) letras.push(todos[alAzar(todos.length)]);
  // Mezcla (Fisher-Yates): los obligatorios no quedan siempre al principio.
  for (let i = letras.length - 1; i > 0; i--) {
    const j = alAzar(i + 1);
    [letras[i], letras[j]] = [letras[j], letras[i]];
  }
  return letras.join('');
}

/** Por qué una contraseña nueva no sirve, o `null` si sirve. */
export function motivoDeClaveDebil(clave: unknown): string | null {
  if (typeof clave !== 'string' || clave.length < LARGO_MINIMO_DE_CLAVE) return 'La contraseña debe tener al menos 6 caracteres.';
  // Tamaño en bytes (UTF-8) sin depender de Buffer, que no existe en el navegador.
  const bytes = encodeURIComponent(clave).replace(/%[A-F\d]{2}/g, 'x').length;
  if (bytes > BYTES_MAXIMOS_DE_CLAVE) return 'La contraseña es demasiado larga (máximo 72 caracteres).';
  if (!TIENE_SIMBOLO.test(clave)) return 'La contraseña debe tener al menos un símbolo (por ejemplo ! ? . - _ @ # $ %).';
  return null;
}

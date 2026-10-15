import crypto from 'crypto';

/**
 * Cambiar la contraseña SIN saber la actual: se le manda un código al correo de la cuenta.
 *
 * Quien está dentro de su cuenta pero no recuerda la clave actual no puede usar «cambiar contraseña» (la pide) ni quiere salir
 * a «olvidé mi contraseña». El código de 6 números prueba que tiene acceso al correo. Reglas, todas pensadas contra quien intente
 * adivinarlo con una sesión robada:
 *  - vale 15 minutos y se gasta al usarlo bien;
 *  - 5 intentos equivocados lo anulan (hay que pedir otro);
 *  - no se puede pedir otro antes de 60 segundos (no se usa para llenar de correos);
 *  - en memoria se guarda solo un hash (con el id de la cuenta), nunca el código.
 * Vive en memoria: el servidor corre en un solo proceso (`ecosystem.config.cjs`); un reinicio solo obliga a pedir otro código.
 */
export const VIGENCIA_DEL_CODIGO_MS = 15 * 60 * 1000;
export const ESPERA_PARA_REENVIAR_MS = 60 * 1000;
export const INTENTOS_MAXIMOS = 5;

interface Pendiente {
  hash: string;
  vence: number;
  enviadoEl: number;
  intentos: number;
}

const pendientes = new Map<string, Pendiente>();

const hashear = (userId: string, codigo: string) => crypto.createHash('sha256').update(`${userId}:${codigo}`).digest('hex');

function limpiar(ahora: number) {
  for (const [id, p] of pendientes) if (p.vence <= ahora) pendientes.delete(id);
}

/** Un código nuevo, o cuántos segundos hay que esperar para pedir otro. */
export function emitirCodigoDeClave(userId: string, ahora: number = Date.now()): { codigo: string } | { esperarSegundos: number } {
  limpiar(ahora);
  const previo = pendientes.get(String(userId));
  if (previo && ahora - previo.enviadoEl < ESPERA_PARA_REENVIAR_MS) {
    return { esperarSegundos: Math.ceil((ESPERA_PARA_REENVIAR_MS - (ahora - previo.enviadoEl)) / 1000) };
  }
  const codigo = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  pendientes.set(String(userId), { hash: hashear(String(userId), codigo), vence: ahora + VIGENCIA_DEL_CODIGO_MS, enviadoEl: ahora, intentos: 0 });
  return { codigo };
}

export type ResultadoDelCodigo = 'ok' | 'incorrecto' | 'sin_codigo' | 'bloqueado';

/** Comprueba el código. Si es correcto se gasta (un solo uso); si falla 5 veces se anula. */
export function verificarCodigoDeClave(userId: string, codigo: unknown, ahora: number = Date.now()): ResultadoDelCodigo {
  const id = String(userId);
  const p = pendientes.get(id);
  if (!p || p.vence <= ahora) {
    pendientes.delete(id);
    return 'sin_codigo';
  }
  const texto = typeof codigo === 'string' ? codigo.trim() : '';
  const buscado = Buffer.from(hashear(id, /^\d{6}$/.test(texto) ? texto : '------'));
  const guardado = Buffer.from(p.hash);
  if (/^\d{6}$/.test(texto) && buscado.length === guardado.length && crypto.timingSafeEqual(buscado, guardado)) {
    pendientes.delete(id);
    return 'ok';
  }
  p.intentos += 1;
  if (p.intentos >= INTENTOS_MAXIMOS) {
    pendientes.delete(id);
    return 'bloqueado';
  }
  return 'incorrecto';
}

/** Solo para pruebas. */
export function _vaciarCodigosDeClave(): void {
  pendientes.clear();
}

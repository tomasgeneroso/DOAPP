import crypto from 'crypto';

/**
 * Ingresar a la APP con Google o X.
 *
 * El ingreso social se hace en el navegador del teléfono (la app no puede ver el formulario de Google), y al terminar el
 * servidor tiene que entregarle la sesión a la app. Poner el token de sesión (que vale 30 días) en un enlace `doapp://…` sería
 * regalarlo: cualquier otra app que registre ese mismo esquema lo recibe. Por eso el enlace lleva un CÓDIGO que:
 *  - vale 2 minutos,
 *  - se puede usar UNA sola vez,
 *  - no es la sesión: la app lo canjea por la sesión contra el servidor (`POST /auth/app-login-code`), y quien lo intercepte
 *    llega tarde (la app ya lo gastó) o no lo puede usar sin haber iniciado el ingreso.
 *
 * Vive en memoria: el servidor corre en un solo proceso (`ecosystem.config.cjs`, `instances: 1`); un reinicio entre el ingreso
 * y el canje solo obliga a repetir el ingreso.
 */
const VIGENCIA_MS = 2 * 60 * 1000;
const MAXIMO_PENDIENTES = 2000;

interface Pendiente {
  userId: string;
  vence: number;
  /** SHA-256 (hex) de un secreto que la app genera y NO sale del teléfono: quien intercepte el código no puede canjearlo sin el secreto. */
  desafio?: string;
}

/**
 * El código viaja por `doapp://auth-callback?codigo=…`. Cualquier otra app instalada en el teléfono puede registrar el mismo esquema `doapp://` y quedarse con ese
 * enlace (auditoría de seguridad, 2026-11-24). Por eso la app manda, al empezar, el DESAFÍO (hash de un secreto propio) y al canjear el VERIFICADOR (el secreto): el
 * servidor comprueba que el hash coincide. Es el mismo mecanismo que PKCE de OAuth. Una app vieja que no manda desafío sigue andando como antes.
 */
export const esDesafioValido = (d: unknown): d is string => typeof d === 'string' && /^[0-9a-f]{64}$/.test(d);

/** El valor de `state` para el ingreso desde la app: `app` o `app:<desafío>`. */
export const estadoDeLaApp = (desafio: unknown): string => (esDesafioValido(desafio) ? `app:${desafio}` : 'app');

/** Lo que dice el `state` que vuelve de Google: si viene de la app y con qué desafío. */
export function leerEstadoDeLaApp(state: unknown): { esApp: boolean; desafio?: string } {
  if (state === 'app') return { esApp: true };
  const m = typeof state === 'string' ? state.match(/^app:([0-9a-f]{64})$/) : null;
  return m ? { esApp: true, desafio: m[1] } : { esApp: false };
}

const pendientes = new Map<string, Pendiente>();

function limpiarVencidos(ahora: number): void {
  for (const [codigo, p] of pendientes) if (p.vence <= ahora) pendientes.delete(codigo);
  // Tope duro: si algo los acumulara, se descartan los más viejos en vez de crecer sin límite.
  while (pendientes.size > MAXIMO_PENDIENTES) {
    const primero = pendientes.keys().next().value as string | undefined;
    if (primero === undefined) break;
    pendientes.delete(primero);
  }
}

/** Un código nuevo para esta persona. */
export function emitirCodigoDeApp(userId: string, ahora: number = Date.now(), desafio?: string): string {
  limpiarVencidos(ahora);
  const codigo = crypto.randomBytes(32).toString('hex');
  pendientes.set(codigo, { userId: String(userId), vence: ahora + VIGENCIA_MS, ...(esDesafioValido(desafio) ? { desafio } : {}) });
  return codigo;
}

/** La persona a la que pertenece el código, o null si no existe, venció o ya se usó. Se gasta al leerlo. */
export function canjearCodigoDeApp(codigo: unknown, ahora: number = Date.now(), verificador?: unknown): string | null {
  if (typeof codigo !== 'string' || !/^[0-9a-f]{64}$/.test(codigo)) return null;
  const p = pendientes.get(codigo);
  pendientes.delete(codigo);
  if (!p || p.vence <= ahora) return null;
  // Con desafío, hace falta el verificador que lo genera (y el código ya se gastó: un intento con un verificador equivocado lo quema).
  if (p.desafio) {
    if (typeof verificador !== 'string' || verificador.length < 32 || verificador.length > 200) return null;
    const hash = crypto.createHash('sha256').update(verificador).digest('hex');
    if (hash.length !== p.desafio.length || !crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(p.desafio))) return null;
  }
  limpiarVencidos(ahora);
  return p.userId;
}

/** Solo para pruebas. */
export function _vaciarCodigosDeApp(): void {
  pendientes.clear();
}

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
export function emitirCodigoDeApp(userId: string, ahora: number = Date.now()): string {
  limpiarVencidos(ahora);
  const codigo = crypto.randomBytes(32).toString('hex');
  pendientes.set(codigo, { userId: String(userId), vence: ahora + VIGENCIA_MS });
  return codigo;
}

/** La persona a la que pertenece el código, o null si no existe, venció o ya se usó. Se gasta al leerlo. */
export function canjearCodigoDeApp(codigo: unknown, ahora: number = Date.now()): string | null {
  if (typeof codigo !== 'string' || !/^[0-9a-f]{64}$/.test(codigo)) return null;
  const p = pendientes.get(codigo);
  pendientes.delete(codigo);
  if (!p || p.vence <= ahora) return null;
  limpiarVencidos(ahora);
  return p.userId;
}

/** Solo para pruebas. */
export function _vaciarCodigosDeApp(): void {
  pendientes.clear();
}

/**
 * Una pestaña abierta antes de un deploy pide archivos con nombre viejo (`UserSettings-YoahdqqD.js`) que el deploy nuevo ya reemplazó.
 * No es un error de la pantalla: la solución es traer la versión nueva. Esto lo reconoce y recarga UNA vez (sin ciclos).
 *
 * Antes solo se recargaba desde `vite:preloadError` y sin frenar el error: la pantalla roja salía igual un instante (o quedaba
 * si la recarga ya se había hecho hacía poco), y «Reintentar» no podía arreglarlo porque React.lazy recuerda el fallo.
 */

const CLAVE = 'doapp:recarga-por-version-nueva';
/** Entre una recarga automática y la siguiente: si la recarga no lo arregló, no se repite en bucle y se avisa con un botón. */
export const ESPERA_ENTRE_RECARGAS_MS = 30_000;

const SEÑAS = [
  'failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'importing a module script failed',
  'unable to preload css',
  'chunkloaderror',
  'loading chunk',
];

/** ¿Este error es «el archivo de esta pantalla ya no existe en el servidor»? */
export function esErrorDeVersionVieja(error: unknown): boolean {
  if (!error) return false;
  const e = error as { message?: unknown; name?: unknown };
  const texto = `${typeof e.name === 'string' ? e.name : ''} ${typeof e.message === 'string' ? e.message : String(error)}`.toLowerCase();
  return SEÑAS.some((s) => texto.includes(s));
}

function ultimaRecarga(): number {
  try {
    return Number(sessionStorage.getItem(CLAVE) || 0);
  } catch {
    return 0;
  }
}

/** ¿Se puede recargar sola ahora? (no se hizo hace menos de `ESPERA_ENTRE_RECARGAS_MS`). */
export function puedeRecargarSola(ahora = Date.now()): boolean {
  return ahora - ultimaRecarga() > ESPERA_ENTRE_RECARGAS_MS;
}

/**
 * Trae la versión nueva: refresca la copia guardada de esta dirección (por si el navegador o Cloudflare tenían el index.html viejo)
 * y recarga. `forzar` salta el límite de una vez cada 30 s (lo usa el botón «Actualizar», que lo toca una persona).
 */
export async function recargarPorVersionNueva(forzar = false): Promise<boolean> {
  if (!forzar && !puedeRecargarSola()) return false;
  try {
    sessionStorage.setItem(CLAVE, String(Date.now()));
  } catch {
    /* sin sessionStorage: se recarga igual */
  }
  try {
    await fetch(window.location.href, { cache: 'reload', credentials: 'same-origin' });
  } catch {
    /* sin red: la recarga normal lo intenta igual */
  }
  window.location.reload();
  return true;
}

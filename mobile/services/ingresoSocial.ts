/**
 * Ingresar con Google o X desde la app.
 *
 * El ingreso social ocurre en el navegador del teléfono (la app no puede ver la pantalla de Google). El servidor, al terminar,
 * lleva a una página de doapparg.com que abre la app con `doapp://auth-callback?codigo=…`; la app canjea ese código (2 minutos,
 * un solo uso) por su sesión. Ver `server/services/ingresoDesdeApp.ts`.
 */
export type ProveedorSocial = 'google' | 'twitter';

/** La dirección que se abre en el navegador para empezar el ingreso. `origen=app` pide el código en vez de la sesión web. */
export function urlDeIngresoSocial(proveedor: ProveedorSocial, apiUrl: string): string {
  return `${apiUrl.replace(/\/+$/, '')}/auth/${proveedor}?origen=app`;
}

/** El código de un solo uso: 64 caracteres hexadecimales. Cualquier otra cosa no se manda al servidor. */
export function esCodigoDeIngreso(codigo: unknown): codigo is string {
  return typeof codigo === 'string' && /^[0-9a-f]{64}$/.test(codigo);
}

export const NOMBRE_DEL_PROVEEDOR: Record<ProveedorSocial, string> = { google: 'Google', twitter: 'X' };

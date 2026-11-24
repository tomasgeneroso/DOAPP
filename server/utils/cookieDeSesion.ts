/**
 * Lee el valor de una cookie de la cabecera «Cookie» (el servidor de tiempo real no pasa por cookie-parser).
 * Se usa para que el socket tome la sesión de la cookie httpOnly: la web ya no guarda el token en localStorage (auditoría de seguridad, 2026-11-24).
 */
export function valorDeCookie(cabecera: unknown, nombre: string): string | undefined {
  if (typeof cabecera !== 'string' || !cabecera) return undefined;
  for (const par of cabecera.split(';')) {
    const i = par.indexOf('=');
    if (i < 0) continue;
    if (par.slice(0, i).trim() !== nombre) continue;
    const valor = par.slice(i + 1).trim().replace(/^"(.*)"$/, '$1');
    try {
      return decodeURIComponent(valor);
    } catch {
      return valor;
    }
  }
  return undefined;
}

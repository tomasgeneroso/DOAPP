/**
 * La sesión de la web vive SOLO en la cookie httpOnly (auditoría de seguridad, 2026-11-24).
 *
 * Antes el token de sesión (7 días) también se guardaba en `localStorage`: cualquier script que corriera en la página (una falla de XSS, un tercero) podía leerlo
 * y llevárselo. La cookie httpOnly no la puede leer ningún script.
 *
 * Mucho código de la web pregunta `localStorage.getItem("token")` para saber si hay sesión y lo manda como `Authorization: Bearer …`. Para no tocar cada pantalla,
 * lo que se guarda ahora es un MARCADOR que no es un token: sirve para el «hay sesión» de la pantalla, y el servidor ignora un `Bearer` que no verifica y usa la
 * cookie (que el navegador manda solo en el mismo sitio).
 */
export const MARCADOR_DE_SESION = 'sesion-en-cookie';

/** Deja el marcador (nunca el token real) en el navegador. */
export function guardarMarcadorDeSesion(): void {
  try {
    localStorage.setItem('token', MARCADOR_DE_SESION);
  } catch {
    /* sin localStorage (modo privado estricto): la sesión igual está en la cookie */
  }
}

/** ¿Lo guardado parece un token de verdad (tres partes separadas por puntos)? Es lo que quedó de antes del cambio y hay que borrar. */
export function pareceUnTokenReal(valor: string | null | undefined): boolean {
  return !!valor && valor !== MARCADOR_DE_SESION && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(valor);
}

/** Si quedó un token real de una sesión anterior, lo reemplaza por el marcador. Se llama al arrancar la app. */
export function limpiarTokenViejo(): void {
  try {
    if (pareceUnTokenReal(localStorage.getItem('token'))) guardarMarcadorDeSesion();
  } catch {
    /* nada que limpiar */
  }
}

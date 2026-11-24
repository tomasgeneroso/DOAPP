/** Las fotos de las publicaciones del perfil vivían en `uploads/disputes/` y ahora van a `uploads/post-media/` (ver server/scripts/moverFotosDePublicaciones.ts). */
export const CARPETA_VIEJA = 'disputes';
export const CARPETA_NUEVA = 'post-media';

/** `http://host/uploads/disputes/a.png` o `/uploads/disputes/a.png` → `a.png`; cualquier otra cosa → null. */
export function nombreEnLaCarpetaVieja(url: unknown): string | null {
  const m = String(url ?? '').match(/\/uploads\/disputes\/([A-Za-z0-9._-]+)$/);
  return m ? m[1] : null;
}

/** La misma dirección apuntando a la carpeta nueva. */
export function direccionNueva(url: string): string {
  return url.replace(`/uploads/${CARPETA_VIEJA}/`, `/uploads/${CARPETA_NUEVA}/`);
}

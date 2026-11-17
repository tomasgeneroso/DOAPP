/**
 * Que una foto nunca pese de más (reporte del dueño, 2026-11-17: «cambio la foto de perfil, guardo, actualizo la página y no aparece»).
 *
 * El servidor acepta imágenes de hasta 5 MB. El editor de fotos conservaba el formato PNG de la foto original y la guardaba hasta con 2.400 píxeles de lado:
 * una foto en PNG así pesa varios megas, el servidor la rechazaba y el aviso quedaba escondido arriba de la pantalla. Ahora lo que se sube nunca pasa de
 * `TOPE_DE_IMAGEN_BYTES`: si pesa más, se pasa a JPEG y se achica de a poco hasta que entre.
 */
export const TOPE_DE_IMAGEN_BYTES = 4 * 1024 * 1024;

/** Lado más largo de una foto que se sube tal cual está (sin recortar). */
const LADO_MAXIMO = 2400;

const aBlob = (canvas: HTMLCanvasElement, tipo: string, calidad?: number): Promise<Blob> =>
  new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo armar la imagen'))), tipo, calidad));

/** Una copia del lienzo, achicada por `escala`, sobre fondo blanco (JPEG no tiene transparencia). */
function achicado(canvas: HTMLCanvasElement, escala: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(canvas.width * escala));
  c.height = Math.max(1, Math.round(canvas.height * escala));
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('No 2d context');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(canvas, 0, 0, c.width, c.height);
  return c;
}

/** Arma la imagen del lienzo; si pesa más que el tope, la pasa a JPEG y la achica hasta que entre. */
export async function codificarConTope(canvas: HTMLCanvasElement, tipo: 'image/jpeg' | 'image/png'): Promise<Blob> {
  let blob = await aBlob(canvas, tipo, tipo === 'image/jpeg' ? 0.9 : undefined);
  if (blob.size <= TOPE_DE_IMAGEN_BYTES) return blob;
  for (const escala of [1, 0.8, 0.65, 0.5, 0.4]) {
    blob = await aBlob(achicado(canvas, escala), 'image/jpeg', 0.85);
    if (blob.size <= TOPE_DE_IMAGEN_BYTES) return blob;
  }
  return blob;
}

/** Una foto elegida que se sube sin editar («Usar original»): si pesa más que el tope, se achica; si no, queda tal cual. */
export async function achicarSiPesaDeMas(archivo: File): Promise<File> {
  if (archivo.size <= TOPE_DE_IMAGEN_BYTES || !/^image\/(jpeg|jpg|png|webp|bmp)$/i.test(archivo.type)) return archivo;
  const url = URL.createObjectURL(archivo);
  try {
    const imagen = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const k = Math.min(1, LADO_MAXIMO / Math.max(imagen.naturalWidth, imagen.naturalHeight));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.max(1, Math.round(imagen.naturalWidth * k));
    lienzo.height = Math.max(1, Math.round(imagen.naturalHeight * k));
    const ctx = lienzo.getContext('2d');
    if (!ctx) return archivo;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    ctx.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
    const blob = await codificarConTope(lienzo, 'image/jpeg');
    const base = archivo.name.replace(/\.[^./\\]+$/, '') || 'foto';
    return new File([blob], `${base}.jpg`, { type: blob.type, lastModified: Date.now() });
  } catch {
    // Si el navegador no puede leerla (formato raro), se sube como está y el servidor dirá si no la acepta.
    return archivo;
  } finally {
    URL.revokeObjectURL(url);
  }
}

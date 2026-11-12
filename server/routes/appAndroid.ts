import express, { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { promises as fs } from 'fs';
import { entorno } from '../services/deployInfo.js';

/**
 * Descarga de la app para Android como APK, sin pasar por ninguna tienda (regla del dueño, 2026-11-12: «que se pueda descargar como APK,
 * sin necesidad de AppStore, y un botón de descargar APK»).
 *
 *  - GET /api/app/android         → el archivo (`doapp.apk`), como descarga;
 *  - GET /api/app/android/estado  → `{ disponible, version, build, tamanoMB, fecha }` (lo lee el botón de la web para saber si ya hay un archivo).
 *
 * **Solo en staging por ahora** (regla del dueño, 2026-11-12): en PRODUCCIÓN la ruta responde como si no hubiera archivo y el estado dice `oculto: true` (la web no muestra el botón). Producción y
 * staging comparten servidor y carpeta, así que lo que decide es el entorno (`APP_ENV`), no el archivo. Para publicarlo en producción se quita `habilitado()`.
 *
 * El APK NO vive en el repositorio ni en la carpeta que reemplaza cada deploy: lo deja el workflow `.github/workflows/android-apk.yml` en una carpeta
 * propia del servidor (`APK_DIR`, por omisión `/var/www/doapp-descargas`), junto con `doapp.apk.json` (versión y fecha). Producción y staging comparten
 * servidor, así que leen la misma carpeta. Sin archivo, el botón avisa que todavía no está y la descarga responde 404 con un mensaje claro.
 *
 * Pública y sin sesión (es lo que se le pasa a alguien para que instale la app). El nombre del archivo es fijo: no entra nada del pedido en la ruta del disco.
 */
const router = express.Router();

const NOMBRE_DEL_APK = 'doapp.apk';
const NOMBRE_DE_LA_FICHA = 'doapp.apk.json';
const TIPO_DEL_APK = 'application/vnd.android.package-archive';

/** La carpeta se lee en cada pedido: así se puede cambiar `APK_DIR` sin tocar el código y las pruebas la apuntan a una carpeta temporal. */
/**
 * Solo staging (y desarrollo): en producción todavía no se ofrece. Se mira el entorno (`APP_ENV`) Y el dominio por el que se entra: si el proceso de staging
 * arrancó sin `APP_ENV=staging` (pasó al cambiar de dominio, 2026-11-12: el botón no aparecía en staging.doapparg.com), igual se ofrece en `staging.…`.
 */
export const habilitado = (req?: Request): boolean => entorno() !== 'produccion' || /^staging\./i.test(String(req?.hostname || ''));

export function carpetaDelApk(): string {
  return process.env.APK_DIR || '/var/www/doapp-descargas';
}

const limiteDeLaDescarga = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Demasiadas descargas seguidas. Probá de nuevo en un rato.' } });
const limiteDelEstado = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Demasiados pedidos. Probá en un rato.' } });

interface FichaDelApk { version: string | null; build: string | null; fecha: string | null }

const soloTextoCorto = (v: unknown, patron: RegExp): string | null => (typeof v === 'string' && v.length <= 40 && patron.test(v) ? v : null);

/** La ficha la escribe el workflow; si falta o está rota la descarga igual funciona (solo no se muestra la versión). Lo que trae se valida: va a una pantalla pública. */
async function leerLaFicha(carpeta: string): Promise<FichaDelApk> {
  try {
    const crudo = await fs.readFile(path.join(carpeta, NOMBRE_DE_LA_FICHA), 'utf8');
    if (crudo.length > 2000) return { version: null, build: null, fecha: null };
    const ficha = JSON.parse(crudo) as Record<string, unknown>;
    return {
      version: soloTextoCorto(ficha.version, /^[0-9A-Za-z.+-]+$/),
      build: soloTextoCorto(String(ficha.build ?? ''), /^[0-9]+$/),
      fecha: soloTextoCorto(ficha.fecha, /^[0-9T:.\-+Z]+$/),
    };
  } catch {
    return { version: null, build: null, fecha: null };
  }
}

async function datosDelArchivo(carpeta: string): Promise<{ bytes: number; modificado: Date } | null> {
  try {
    const st = await fs.stat(path.join(carpeta, NOMBRE_DEL_APK));
    // Un archivo vacío es una subida a medio hacer: no se ofrece.
    return st.isFile() && st.size > 0 ? { bytes: st.size, modificado: st.mtime } : null;
  } catch {
    return null;
  }
}

router.get('/android/estado', limiteDelEstado, async (req: Request, res: Response): Promise<void> => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (!habilitado(req)) {
      res.json({ success: true, disponible: false, oculto: true });
      return;
    }
    const carpeta = carpetaDelApk();
    const archivo = await datosDelArchivo(carpeta);
    if (!archivo) {
      res.json({ success: true, disponible: false });
      return;
    }
    const ficha = await leerLaFicha(carpeta);
    res.json({
      success: true,
      disponible: true,
      version: ficha.version,
      build: ficha.build,
      tamanoMB: Math.round((archivo.bytes / (1024 * 1024)) * 10) / 10,
      fecha: ficha.fecha ?? archivo.modificado.toISOString(),
    });
  } catch {
    res.json({ success: true, disponible: false });
  }
});

router.get('/android', limiteDeLaDescarga, async (req: Request, res: Response): Promise<void> => {
  const carpeta = carpetaDelApk();
  const archivo = habilitado(req) ? await datosDelArchivo(carpeta) : null;
  if (!archivo) {
    res.status(404).json({ success: false, code: 'APK-NO-DISPONIBLE', message: 'La app para Android todavía no está disponible para descargar. Probá de nuevo en unos días.' });
    return;
  }
  // El archivo cambia con cada versión nueva: que ningún intermediario guarde uno viejo.
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.type(TIPO_DEL_APK);
  res.download(path.join(carpeta, NOMBRE_DEL_APK), NOMBRE_DEL_APK, (err) => {
    // Si el cliente corta la descarga a medias no es un error nuestro; solo se responde si todavía no se mandó nada.
    if (err && !res.headersSent) res.status(500).json({ success: false, message: 'No se pudo descargar el archivo. Probá de nuevo.' });
  });
});

export default router;

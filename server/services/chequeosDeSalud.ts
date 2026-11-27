import { promises as fs } from 'fs';
import path from 'path';
import { sequelize } from '../config/database.js';
import emailService from './email.js';
import { URL_PHOTON_BUSQUEDA } from '../../shared/geo/direcciones.js';
import type { ComponenteId } from '../../shared/salud/componentes.js';

/**
 * Los chequeos propios: cada uno prueba una parte de verdad y devuelve `null` si anda o el motivo si no. Las consultas a servicios de afuera son mínimas,
 * van sin datos de personas y con un nombre genérico (`NOMBRE_DEL_CHEQUEO`; OpenStreetMap pide que quien consulta se identifique).
 */
export const NOMBRE_DEL_CHEQUEO = 'DOAPP-estado/1.0';
export const DISCO_LIBRE_MINIMO_BYTES = 500 * 1024 * 1024;
const ESPERA_MS = 10_000;

export interface Chequeo {
  id: ComponenteId;
  /** Cada cuántos minutos. A los de afuera se les pregunta más espaciado. */
  cadaMinutos: number;
  probar: () => Promise<string | null>;
}

async function responde(url: string, nombre: string, headers: Record<string, string> = {}): Promise<string | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(ESPERA_MS), headers: { 'User-Agent': NOMBRE_DEL_CHEQUEO, ...headers } });
    await r.arrayBuffer().catch(() => undefined);
    if (r.ok) return null;
    return r.status === 401 || r.status === 403 ? `${nombre} rechaza el pedido (${r.status}): revisá la clave o si limitó a DOAPP.` : `${nombre} respondió ${r.status}.`;
  } catch (e) {
    return `${nombre} no responde (${(e as Error).name === 'TimeoutError' ? 'tardó demasiado' : 'sin conexión'}).`;
  }
}

const juntar = (motivos: Array<string | null>): string | null => motivos.filter(Boolean).join(' ') || null;

export async function chequearLaBase(): Promise<string | null> {
  try {
    await Promise.race([
      sequelize.query('SELECT 1'),
      new Promise((_r, rechazar) => setTimeout(() => rechazar(new Error('tardó más de 10 segundos')), ESPERA_MS).unref?.()),
    ]);
    return null;
  } catch (e) {
    return `La base no responde: ${(e as Error).message}`;
  }
}

/** Las fotos necesitan poder escribirse y que quede lugar en el disco. */
export async function chequearLasFotos(carpeta: string = path.join(process.cwd(), 'uploads')): Promise<string | null> {
  const prueba = path.join(carpeta, `.chequeo-${process.pid}`);
  try {
    await fs.mkdir(carpeta, { recursive: true });
    await fs.writeFile(prueba, 'ok');
    await fs.unlink(prueba);
  } catch (e) {
    return `No se puede escribir en la carpeta de fotos (${(e as NodeJS.ErrnoException).code || 'error'}).`;
  }
  try {
    const d = await fs.statfs(carpeta);
    const libre = d.bavail * d.bsize;
    return libre < DISCO_LIBRE_MINIMO_BYTES ? `Queda poco lugar en el disco: ${Math.round(libre / 1024 / 1024)} MB.` : null;
  } catch {
    return null; // sin forma de medir el disco: lo importante (escribir) anduvo
  }
}

export const CHEQUEOS: Chequeo[] = [
  { id: 'base_de_datos', cadaMinutos: 2, probar: chequearLaBase },
  { id: 'fotos', cadaMinutos: 5, probar: () => chequearLasFotos() },
  { id: 'correos', cadaMinutos: 10, probar: () => emailService.verificar() },
  {
    id: 'direcciones', cadaMinutos: 10,
    probar: async () => juntar(await Promise.all([
      responde('https://apis.datos.gob.ar/georef/api/provincias?max=1', 'Georef'),
      responde(`${URL_PHOTON_BUSQUEDA}?q=Corrientes&limit=1&countrycode=AR`, 'Photon'),
    ])),
  },
  {
    id: 'mapas', cadaMinutos: 30,
    probar: async () => juntar(await Promise.all([
      responde('https://tile.openstreetmap.org/0/0/0.png', 'OpenStreetMap (imágenes del mapa)'),
      responde('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', 'unpkg (librería del mapa)'),
    ])),
  },
  {
    id: 'pagos', cadaMinutos: 10,
    probar: async () => {
      const clave = process.env.MERCADOPAGO_ACCESS_TOKEN;
      return clave ? responde('https://api.mercadopago.com/v1/payment_methods', 'Mercado Pago', { Authorization: `Bearer ${clave}` }) : null;
    },
  },
  {
    id: 'cambio', cadaMinutos: 30,
    probar: async () => {
      // Con que una de las dos conteste, DOAPP tiene cotización.
      const r = await Promise.all([responde('https://dolarapi.com/v1/dolares/blue', 'dolarapi'), responde('https://api.bluelytics.com.ar/v2/latest', 'bluelytics')]);
      return r.some((x) => x === null) ? null : juntar(r);
    },
  },
];

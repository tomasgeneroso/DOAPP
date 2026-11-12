import { buscarDirecciones } from './direcciones.js';
import { buscarLugares } from './lugares.js';

/**
 * Ubicar una dirección en el mapa (regla del dueño, 2026-11-11: «el pin tiene que ir cambiando constantemente con la dirección»).
 *
 * El mapa del formulario de un trabajo armaba una frase suelta con la calle, el número y la ubicación y se la mandaba al buscador de OpenStreetMap: si la calle ya traía todo
 * escrito («Ayacucho 470, H3500 Resistencia, Chaco, Argentina») y se le agregaba el número otra vez, la búsqueda devolvía otra «Ayacucho» (la de Buenos Aires) y el pin quedaba
 * a 1.000 km. Ahora:
 *  1. con una calle simple se busca en Georef (el servicio oficial de direcciones de la Argentina) ACOTADA a la provincia y la localidad elegidas, con el número;
 *  2. si no hay resultado, o la calle ya es una dirección completa, se busca en OpenStreetMap con el texto armado sin repetir nada;
 *  3. con solo la ubicación («Resistencia, Chaco») se centra en la localidad, con menos zoom.
 */

export interface EntradaDeUbicacion {
  calle?: string;
  numero?: string;
  /** El campo «Ubicación» (localidad y provincia). */
  lugar?: string;
  provincia?: string;
  ciudad?: string;
}

export interface PuntoUbicado {
  lat: number;
  lon: number;
  /** Zoom del mapa: 17 para una dirección con número, 16 para una calle, 13 para una localidad. */
  zoom: number;
  fuente: 'georef' | 'osm';
}

const limpio = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();

/** ¿La «calle» ya es una dirección completa («Ayacucho 470, H3500 Resistencia, Chaco, Argentina»)? Entonces no se le agrega nada. */
export const esDireccionCompleta = (calle: unknown): boolean => limpio(calle).includes(',');

/** El texto que se le pide a OpenStreetMap, sin repetir el número ni la localidad. */
export function consultaLibre(e: EntradaDeUbicacion): string {
  const calle = limpio(e.calle);
  const numero = limpio(e.numero);
  const lugar = limpio(e.lugar);
  if (esDireccionCompleta(calle)) return /argentina/i.test(calle) ? calle : `${calle}, Argentina`;
  const via = numero && !new RegExp(`(^|\\s)${numero.replace(/\D/g, '')}(\\s|$)`).test(calle) ? `${calle} ${numero}` : calle;
  const partes = [via, lugar].filter(Boolean);
  if (partes.length === 0) return '';
  const texto = partes.join(', ');
  return /argentina/i.test(texto) ? texto : `${texto}, Argentina`;
}

export function zoomPara(e: EntradaDeUbicacion): number {
  if (!limpio(e.calle)) return 13;
  return limpio(e.numero) || esDireccionCompleta(e.calle) ? 17 : 16;
}

/** ¿Hay algo para buscar? Una calle o una ubicación de al menos cuatro letras. */
export function hayQueUbicar(e: EntradaDeUbicacion): boolean {
  return limpio(e.calle).length >= 4 || limpio(e.lugar).length >= 4;
}

export async function ubicarDireccion(e: EntradaDeUbicacion, opciones: { signal?: AbortSignal } = {}): Promise<PuntoUbicado | null> {
  if (!hayQueUbicar(e)) return null;
  const calle = limpio(e.calle);
  const zoom = zoomPara(e);

  if (calle && !esDireccionCompleta(calle)) {
    const consulta = [calle, limpio(e.numero)].filter(Boolean).join(' ');
    const r = await buscarDirecciones(consulta, { signal: opciones.signal, provincia: limpio(e.provincia) || undefined, ciudad: limpio(e.ciudad) || undefined });
    const primera = r.find((x) => x.lat !== undefined && x.lon !== undefined);
    if (primera && !opciones.signal?.aborted) return { lat: primera.lat as number, lon: primera.lon as number, zoom, fuente: 'georef' };
  }
  if (opciones.signal?.aborted) return null;

  const texto = consultaLibre(e);
  if (!texto) return null;
  const lugares = await buscarLugares(texto, { signal: opciones.signal });
  const primero = lugares[0];
  if (primero && !opciones.signal?.aborted) return { lat: primero.lat, lon: primero.lon, zoom, fuente: 'osm' };
  return null;
}

import { buscarLugares, detallesDeUbicacion, type LugarSugerido } from './lugares.js';
import { normalizarCodigoPostal } from './direcciones.js';

/**
 * Que la dirección sea CONGRUENTE (pedido del dueño, 2026-11-13): «cuando cambio el barrio no me cambia el código postal ni la ciudad; siempre que cambio alguna
 * parte de la dirección tiene que ser todo congruente, el mapa también».
 *
 * Antes cada campo se completaba solo desde la calle, el pin del mapa o la ubicación, pero cambiar el BARRIO o el CÓDIGO POSTAL a mano no tocaba nada más: quedaba
 * «Palermo» con el código de otro barrio, otra ciudad y el pin donde estaba. Acá se ubica lo que la persona escribió o eligió y se devuelve TODO lo que tiene que
 * cambiar con ello: el punto del mapa, la ciudad y provincia, el código postal (o el barrio) y si la calle anterior ya no corresponde.
 */

export interface ContextoDeZona {
  ciudad?: string;
  provincia?: string;
}

export interface ZonaUbicada {
  lat: number;
  lon: number;
  ciudad: string;
  provincia: string;
  barrio: string;
  codigoPostal: string | null;
}

/** «Ciudad, Provincia» sin repetir partes (si la ciudad y la provincia se llaman igual, una sola vez). */
export function nombreDeZona(ciudad?: string, provincia?: string): string {
  return [ciudad, provincia].filter((x, i, a): x is string => !!x && a.indexOf(x) === i).join(', ');
}

const mismoNombre = (a?: string, b?: string): boolean => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Las búsquedas que se prueban, de la más precisa a la más amplia: «barrio, ciudad, provincia», «barrio, provincia» y «barrio, Argentina». */
export function consultasDeBarrio(barrio: string, zona: ContextoDeZona = {}): string[] {
  const b = barrio.trim();
  if (b.length < 3) return [];
  const todas = [
    [b, zona.ciudad, zona.provincia].filter(Boolean).join(', '),
    [b, zona.provincia].filter(Boolean).join(', '),
    `${b}, Argentina`,
  ];
  return todas.filter((q, i) => todas.indexOf(q) === i);
}

/** Ubica un barrio: su punto en el mapa, su ciudad y provincia y su código postal (si OpenStreetMap no lo trae, se pregunta por el punto). */
export async function ubicarBarrio(barrio: string, zona: ContextoDeZona = {}, opciones: { signal?: AbortSignal } = {}): Promise<ZonaUbicada | null> {
  for (const consulta of consultasDeBarrio(barrio, zona)) {
    const lugares = await buscarLugares(consulta, opciones);
    if (opciones.signal?.aborted) return null;
    const l: LugarSugerido | undefined = lugares[0];
    if (!l) continue;
    const det = l.codigoPostal ? null : await detallesDeUbicacion(l.lat, l.lon, opciones);
    return {
      lat: l.lat,
      lon: l.lon,
      ciudad: l.ciudad || det?.ciudad || zona.ciudad || '',
      provincia: l.provincia || det?.provincia || zona.provincia || '',
      barrio: l.barrio || det?.barrio || '',
      codigoPostal: l.codigoPostal || det?.codigoPostal || null,
    };
  }
  return null;
}

/**
 * Ubica un código postal: solo se acepta un resultado que de verdad tenga ESE código (si no, se estaría moviendo el mapa a otro lado). Devuelve el punto, la ciudad
 * y provincia y el barrio de ese punto.
 */
export async function ubicarCodigoPostal(codigo: string, zona: ContextoDeZona = {}, opciones: { signal?: AbortSignal } = {}): Promise<ZonaUbicada | null> {
  const cp = normalizarCodigoPostal(codigo);
  if (!cp) return null;
  const consultas = [[cp, zona.ciudad, zona.provincia].filter(Boolean).join(', '), `${cp}, Argentina`];
  for (const consulta of consultas.filter((q, i) => consultas.indexOf(q) === i)) {
    const lugares = await buscarLugares(consulta, opciones);
    if (opciones.signal?.aborted) return null;
    // Un código con letra (C1425) también aparece como «1425» y al revés: se comparan los cuatro dígitos.
    const l = lugares.find((x) => !!x.codigoPostal && x.codigoPostal.replace(/\D/g, '').slice(0, 4) === cp.replace(/\D/g, '').slice(0, 4));
    if (!l) continue;
    const det = await detallesDeUbicacion(l.lat, l.lon, opciones);
    return {
      lat: l.lat,
      lon: l.lon,
      ciudad: l.ciudad || det?.ciudad || zona.ciudad || '',
      provincia: l.provincia || det?.provincia || zona.provincia || '',
      barrio: l.barrio || det?.barrio || '',
      codigoPostal: cp,
    };
  }
  return null;
}

export interface CambiosPorElBarrio {
  /** El punto del mapa nuevo. */
  lat: number;
  lon: number;
  /** El nombre de la ubicación («Ciudad, Provincia») si cambió; null si sigue siendo la misma. */
  ubicacion: string | null;
  zona: ContextoDeZona;
  codigoPostal: string;
  /** La calle y el número escritos antes ya no corresponden al barrio nuevo y se borran. */
  borrarCalle: boolean;
}

/** Qué cambia al ubicar un barrio nuevo (lo que la persona eligió de una lista puede traer su propio código postal, que manda). */
export function cambiosPorElBarrio(z: ZonaUbicada, actual: ContextoDeZona, hayCalle: boolean, codigoDeLaLista?: string): CambiosPorElBarrio {
  const cambioLaCiudad = !!z.ciudad && !mismoNombre(z.ciudad, actual.ciudad);
  return {
    lat: z.lat,
    lon: z.lon,
    ubicacion: cambioLaCiudad ? nombreDeZona(z.ciudad, z.provincia) : null,
    zona: { ciudad: z.ciudad || actual.ciudad, provincia: z.provincia || actual.provincia },
    codigoPostal: codigoDeLaLista || z.codigoPostal || '',
    borrarCalle: hayCalle,
  };
}

import { JOB_CATEGORIES } from '../constants/categories.js';

/**
 * Rubros y zona de trabajo de un perfil (pedido del dueño, 2026-11-12).
 *
 * - Una persona se registra como cliente, trabajador o ambos; el trabajador elige uno o varios RUBROS (los mismos de los trabajos: `JOB_CATEGORIES`) o «cualquier rubro».
 * - Su domicilio (`address.city`) fija la zona de trabajo base; además puede sumar OTRAS zonas y un radio en km desde el domicilio.
 * Lo que llega del navegador o de la app se sanea acá: solo rubros que existen, zonas con nombre y radios razonables.
 */
export type TipoDeCuenta = 'client' | 'worker' | 'both';

/**
 * Una zona marcada en el mapa (pedido del dueño, 2026-11-19: «poder marcar la zona donde trabajo con polígonos o radios en un mapa»): un círculo (centro y radio en km) o un
 * polígono (los vértices, en orden). Un trabajo está «en la zona» si su ubicación en el mapa cae adentro.
 */
export type AreaEnMapa =
  | { tipo: 'radio'; lat: number; lng: number; radiusKm: number }
  | { tipo: 'poligono'; puntos: Array<[number, number]> };

export interface ZonaDeTrabajo {
  name: string;
  /** Radio en km alrededor de esa zona (opcional). */
  radiusKm?: number;
  /** Si la zona se marcó en el mapa: su forma. Sin esto, la zona es solo un nombre que se busca en la ubicación del trabajo. */
  area?: AreaEnMapa;
}

export const MAXIMO_DE_AREAS_EN_MAPA = 5;
export const MAXIMO_DE_VERTICES = 20;
/** Un polígono o un círculo no puede abarcar más que esto (grados de latitud/longitud, ~330 km): evita «todo el país» por un clic de más. */
const MAXIMA_EXTENSION_EN_GRADOS = 3;
export const RADIO_MAXIMO_EN_MAPA_KM = 150;

export const RADIOS_DE_TRABAJO_KM = [5, 10, 20, 30, 50, 100] as const;
export const MAXIMO_DE_RUBROS = 20;
export const MAXIMO_DE_ZONAS = 10;

const IDS_DE_RUBROS: ReadonlySet<string> = new Set(JOB_CATEGORIES.map((c) => c.id));

export function esRubroValido(id: unknown): id is string {
  return typeof id === 'string' && IDS_DE_RUBROS.has(id);
}

export function etiquetaDeRubro(id: string): string {
  return JOB_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

/** Los rubros que existen, sin repetir y con un tope. Lo que no es una lista da []. */
export function sanearRubros(entrada: unknown): string[] {
  if (!Array.isArray(entrada)) return [];
  const vistos = new Set<string>();
  for (const x of entrada) {
    if (esRubroValido(x)) vistos.add(x);
    if (vistos.size >= MAXIMO_DE_RUBROS) break;
  }
  return [...vistos];
}

/** Radio en km: un entero entre 1 y 300, o null. */
export function sanearRadio(entrada: unknown): number | null {
  if (entrada === null || entrada === undefined || entrada === '') return null;
  const n = Math.round(Number(entrada));
  return Number.isFinite(n) && n >= 1 && n <= 300 ? n : null;
}

const redondear = (n: number, decimales: number): number => {
  const f = 10 ** decimales;
  return Math.round(n * f) / f;
};

/** La forma de una zona marcada en el mapa, saneada. Lo que no sea una forma válida da null (la zona queda solo con su nombre). */
export function sanearArea(entrada: unknown): AreaEnMapa | null {
  const a = entrada as any;
  if (!a || typeof a !== 'object') return null;
  if (a.tipo === 'radio') {
    const lat = Number(a.lat);
    const lng = Number(a.lng);
    const km = Number(a.radiusKm);
    if (![lat, lng, km].every(Number.isFinite) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    if (km < 1 || km > RADIO_MAXIMO_EN_MAPA_KM) return null;
    return { tipo: 'radio', lat: redondear(lat, 3), lng: redondear(lng, 3), radiusKm: Math.round(km * 10) / 10 };
  }
  if (a.tipo === 'poligono' && Array.isArray(a.puntos)) {
    const puntos: Array<[number, number]> = [];
    for (const p of a.puntos.slice(0, MAXIMO_DE_VERTICES)) {
      const lat = Number(Array.isArray(p) ? p[0] : p?.lat);
      const lng = Number(Array.isArray(p) ? p[1] : p?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
      puntos.push([redondear(lat, 3), redondear(lng, 3)]);
    }
    if (puntos.length < 3) return null;
    const lats = puntos.map((p) => p[0]);
    const lngs = puntos.map((p) => p[1]);
    if (Math.max(...lats) - Math.min(...lats) > MAXIMA_EXTENSION_EN_GRADOS || Math.max(...lngs) - Math.min(...lngs) > MAXIMA_EXTENSION_EN_GRADOS) return null;
    return { tipo: 'poligono', puntos };
  }
  return null;
}

/** ¿Un punto cae adentro del polígono? (Trazado de rayos.) */
export function puntoEnPoligono(lat: number, lng: number, puntos: ReadonlyArray<readonly [number, number]>): boolean {
  let adentro = false;
  for (let i = 0, j = puntos.length - 1; i < puntos.length; j = i++) {
    const [yi, xi] = puntos[i];
    const [yj, xj] = puntos[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) adentro = !adentro;
  }
  return adentro;
}

/** Distancia en km entre dos puntos (fórmula del haversine). */
export function kmEntre(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** ¿El punto está dentro de la zona marcada en el mapa? */
export function puntoEnArea(lat: number, lng: number, area: AreaEnMapa): boolean {
  return area.tipo === 'radio' ? kmEntre(area.lat, area.lng, lat, lng) <= area.radiusKm : puntoEnPoligono(lat, lng, area.puntos);
}

/**
 * Las zonas del mapa, en un texto corto para la dirección de `GET /api/jobs` (un JSON largo no entra en la barra): `r:lat:lng:km` para un círculo y `p:lat:lng:lat:lng…`
 * para un polígono, separadas por «;». `leerAreasPedidas` hace el camino de vuelta y vuelve a sanear todo (nada de lo que llega se da por bueno).
 */
export function areasComoTexto(areas: AreaEnMapa[]): string {
  return areas
    .slice(0, MAXIMO_DE_AREAS_EN_MAPA)
    .map((a) => (a.tipo === 'radio' ? `r:${a.lat}:${a.lng}:${a.radiusKm}` : `p:${a.puntos.map((p) => `${p[0]}:${p[1]}`).join(':')}`))
    .join(';');
}

export function leerAreasPedidas(texto: unknown): AreaEnMapa[] {
  if (typeof texto !== 'string' || !texto || texto.length > 6000) return [];
  const salida: AreaEnMapa[] = [];
  for (const trozo of texto.split(';').slice(0, MAXIMO_DE_AREAS_EN_MAPA)) {
    const [tipo, ...nums] = trozo.split(':');
    const n = nums.map(Number);
    let area: AreaEnMapa | null = null;
    if (tipo === 'r' && n.length === 3) area = sanearArea({ tipo: 'radio', lat: n[0], lng: n[1], radiusKm: n[2] });
    else if (tipo === 'p' && n.length >= 6 && n.length % 2 === 0) {
      const puntos: Array<[number, number]> = [];
      for (let i = 0; i < n.length; i += 2) puntos.push([n[i], n[i + 1]]);
      area = sanearArea({ tipo: 'poligono', puntos });
    }
    if (area) salida.push(area);
  }
  return salida;
}

/** Zonas con nombre (2 a 80 caracteres), sin repetir, con un tope; el radio de cada una es opcional y, si se marcó en el mapa, también su forma (con un tope propio). */
export function sanearZonas(entrada: unknown): ZonaDeTrabajo[] {
  if (!Array.isArray(entrada)) return [];
  const vistas = new Set<string>();
  const zonas: ZonaDeTrabajo[] = [];
  for (const z of entrada) {
    const name = String((z as any)?.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (name.length < 2) continue;
    const clave = name.toLowerCase();
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    const radiusKm = sanearRadio((z as any)?.radiusKm);
    const area = zonas.filter((x) => x.area).length < MAXIMO_DE_AREAS_EN_MAPA ? sanearArea((z as any)?.area) : null;
    zonas.push({ name, ...(radiusKm ? { radiusKm } : {}), ...(area ? { area } : {}) });
    if (zonas.length >= MAXIMO_DE_ZONAS) break;
  }
  return zonas;
}

/** «Cliente / Trabajador / Ambos» del registro → el `role` de la cuenta. Sin elegir (o algo raro), cliente. */
export function rolDeLaCuenta(tipo: unknown): 'client' | 'doer' | 'both' {
  if (tipo === 'worker' || tipo === 'doer') return 'doer';
  if (tipo === 'both') return 'both';
  return 'client';
}

export interface PerfilParaElMuro {
  workCategories?: string[];
  workAnyCategory?: boolean;
  workZones?: Array<{ name: string; area?: AreaEnMapa }>;
  workRadiusKm?: number | null;
  workLatitude?: number | null;
  workLongitude?: number | null;
  address?: { city?: string; state?: string } | null;
}

/** Los parámetros que se le suman a `GET /api/jobs` para mostrar solo lo que va con los rubros y la zona de la persona («Para mí»). */
export function parametrosParaMi(u: PerfilParaElMuro): Record<string, string> {
  const p: Record<string, string> = {};
  if (!u.workAnyCategory && (u.workCategories?.length ?? 0) > 0) p.categories = u.workCategories!.join(',');
  const nombres = [u.address?.city, ...(u.workZones || []).filter((z) => !z.area).map((z) => z.name)].filter((x): x is string => !!x && x.trim().length >= 2);
  if (nombres.length > 0) p.zones = nombres.join('|');
  const areas = (u.workZones || []).map((z) => z.area).filter((a): a is AreaEnMapa => !!a);
  if (areas.length > 0) p.areas = areasComoTexto(areas);
  if (u.workRadiusKm && u.workLatitude != null && u.workLongitude != null) {
    p.nearLat = String(u.workLatitude);
    p.nearLng = String(u.workLongitude);
    p.radiusKm = String(u.workRadiusKm);
  }
  return p;
}

/** ¿Tiene algo cargado para filtrar? Sin rubros ni zona, el interruptor no aparece. */
export const tieneAlgoParaMi = (u: PerfilParaElMuro): boolean => Object.keys(parametrosParaMi(u)).length > 0;

export const esTrabajador = (role: unknown): boolean => role === 'doer' || role === 'both';

/** Un punto (latitud, longitud) válido y redondeado a 2 decimales (~1 km): sirve para filtrar por radio sin guardar la dirección exacta. null si no es un punto. */
export function sanearPunto(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  if (lat === null || lat === undefined || lat === '' || lng === null || lng === undefined || lng === '') return null;
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < -90 || a > 90 || b < -180 || b > 180) return null;
  return { lat: Math.round(a * 100) / 100, lng: Math.round(b * 100) / 100 };
}

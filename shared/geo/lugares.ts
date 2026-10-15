import { normalizarCodigoPostal, separarCalleYAltura } from './direcciones.js';

/**
 * Lugares y direcciones reales para el formulario de un trabajo (Ubicación, Calle, Número, Barrio y Código postal).
 *
 *  - «Ubicación» busca lugares en OpenStreetMap (Nominatim) CON el detalle de la dirección: si la persona elige una dirección exacta
 *    (calle + número), se completan sola la calle, el número, el barrio, el código postal y la ubicación en el mapa.
 *  - Una dirección elegida sin barrio o sin código postal se completa con una consulta por su ubicación (`detallesDeUbicacion`).
 *  - Calle y número se SANEAN: el número de puerta son solo dígitos y el número no se queda escrito dentro de la calle.
 */

export interface LugarSugerido {
  /** Lo que se muestra en la lista. */
  etiqueta: string;
  calle: string;
  /** Solo dígitos, o '' si el lugar no es una dirección con número. */
  numero: string;
  barrio: string;
  ciudad: string;
  provincia: string;
  codigoPostal: string | null;
  lat: number;
  lon: number;
}

export const URL_NOMINATIM_BUSQUEDA = 'https://nominatim.openstreetmap.org/search';
const URL_NOMINATIM_INVERSO = 'https://nominatim.openstreetmap.org/reverse';

const txt = (x: unknown): string => (typeof x === 'string' ? x.trim() : '');
const num = (x: unknown): number | undefined => {
  const n = typeof x === 'string' ? Number(x) : (x as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};

/** El barrio, según cómo lo llame OpenStreetMap en cada ciudad. */
function barrioDe(a: any): string {
  return txt(a?.neighbourhood) || txt(a?.suburb) || txt(a?.quarter) || txt(a?.city_district) || '';
}

function ciudadDe(a: any): string {
  return txt(a?.city) || txt(a?.town) || txt(a?.village) || txt(a?.municipality) || txt(a?.county) || '';
}

export function urlDeLugares(consulta: unknown, max = 6): string | null {
  const t = String(consulta ?? '').replace(/\s+/g, ' ').trim();
  if (t.length < 3) return null;
  return `${URL_NOMINATIM_BUSQUEDA}?format=jsonv2&addressdetails=1&countrycodes=ar&accept-language=es&limit=${Math.min(Math.max(1, Math.floor(max) || 1), 10)}&q=${encodeURIComponent(t)}`;
}

/** Lee la respuesta de Nominatim. Lo que venga raro (sin ubicación, de otro país) se descarta. */
export function leerLugares(json: unknown): LugarSugerido[] {
  if (!Array.isArray(json)) return [];
  const vistos = new Set<string>();
  const salida: LugarSugerido[] = [];
  for (const r of json as any[]) {
    const a = r?.address;
    const lat = num(r?.lat);
    const lon = num(r?.lon);
    if (!a || lat === undefined || lon === undefined) continue;
    if (a.country_code && String(a.country_code).toLowerCase() !== 'ar') continue;
    const calle = txt(a.road) || txt(a.pedestrian) || txt(a.footway) || '';
    // Del número de casa solo valen los dígitos («967», no «967 bis» ni «S/N»): el campo es numérico.
    const crudo = txt(a.house_number).match(/\d{1,6}/)?.[0] || '';
    const numero = calle ? crudo.replace(/^0+/, '') : '';
    const barrio = barrioDe(a);
    const ciudad = ciudadDe(a);
    const provincia = txt(a.state);
    const principal = calle ? [calle, numero].filter(Boolean).join(' ') : txt(r?.name) || txt(r?.display_name).split(',')[0];
    const etiqueta = [principal, barrio && barrio !== principal ? barrio : '', ciudad && ciudad !== principal ? ciudad : '', provincia].filter(Boolean).join(', ');
    if (!etiqueta || vistos.has(etiqueta)) continue;
    vistos.add(etiqueta);
    salida.push({ etiqueta, calle, numero, barrio, ciudad, provincia, codigoPostal: normalizarCodigoPostal(a.postcode), lat, lon });
  }
  return salida;
}

export async function buscarLugares(consulta: string, opciones: { signal?: AbortSignal } = {}): Promise<LugarSugerido[]> {
  const url = urlDeLugares(consulta);
  if (!url) return [];
  try {
    const r = await fetch(url, { signal: opciones.signal, headers: { 'Accept-Language': 'es' } });
    return r.ok ? leerLugares(await r.json()) : [];
  } catch {
    return [];
  }
}

export interface DetallesDeUbicacion {
  codigoPostal: string | null;
  barrio: string;
  ciudad: string;
  provincia: string;
}

/** Lo que OpenStreetMap sabe de un punto: código postal, barrio, ciudad y provincia. Una consulta por dirección elegida. */
export async function detallesDeUbicacion(lat: unknown, lon: unknown, opciones: { signal?: AbortSignal; userAgent?: string } = {}): Promise<DetallesDeUbicacion | null> {
  const la = num(lat);
  const lo = num(lon);
  if (la === undefined || lo === undefined || Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
  try {
    const r = await fetch(`${URL_NOMINATIM_INVERSO}?lat=${la}&lon=${lo}&format=jsonv2&zoom=18&addressdetails=1&accept-language=es`, {
      signal: opciones.signal,
      headers: opciones.userAgent ? { 'User-Agent': opciones.userAgent } : undefined,
    });
    if (!r.ok) return null;
    const j: any = await r.json();
    const a = j?.address;
    if (!a || (a.country_code && String(a.country_code).toLowerCase() !== 'ar')) return null;
    return { codigoPostal: normalizarCodigoPostal(a.postcode), barrio: barrioDe(a), ciudad: ciudadDe(a), provincia: txt(a.state) };
  } catch {
    return null;
  }
}

// ───────────────────────── Calle y número: lo que se guarda ─────────────────────────

/** Palabras que, solas, no son un nombre de calle: «Calle 14», «Ruta 9», «Pasaje 3» (ahí el número es parte del nombre). */
const TIPOS_DE_VIA = /^(calle|ruta|pasaje|pje|camino|diagonal|avenida|av|autopista|boulevard|bv|bulevar|colectora|peatonal)\.?$/i;

/** El número de puerta: solo dígitos (de 1 a 6), sin ceros a la izquierda. «12a» → «12», «S/N» → ''. */
export function sanearNumeroDePuerta(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '').slice(0, 6).replace(/^0+/, '');
}

/**
 * La calle sin el número de la casa escrito adentro: «Av Corrientes 1234» → { calle: 'Av Corrientes', numero: '1234' }. Si lo
 * que queda antes del número es solo un tipo de vía («Calle 14», «Ruta 9»), el número es parte del nombre y no se separa.
 */
export function sanearCalle(v: unknown): { calle: string; numero: string } {
  const limpia = String(v ?? '').replace(/\s+/g, ' ').replace(/[<>]/g, '').trim().slice(0, 120);
  const { calle, altura } = separarCalleYAltura(limpia);
  if (altura === null || !calle || TIPOS_DE_VIA.test(calle) || !/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,}/.test(calle)) return { calle: limpia, numero: '' };
  return { calle, numero: String(altura) };
}

/** Un mensaje para mostrar si calle y número no se pueden guardar así; null si están bien. */
export function validarCalleYNumero(calle: unknown, numero: unknown): string | null {
  const c = String(calle ?? '').trim();
  const n = String(numero ?? '').trim();
  if (n && !/^\d{1,6}$/.test(n)) return 'El número de puerta solo puede tener números (de 1 a 6 dígitos).';
  if (c && !/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(c)) return 'La calle tiene que tener el nombre de la calle (no solo números).';
  if (c.length > 120) return 'La calle es demasiado larga.';
  const sep = sanearCalle(c);
  if (n && sep.numero && sep.numero === n) return 'El número está escrito dos veces: dejá en «Calle» solo el nombre de la calle.';
  return null;
}

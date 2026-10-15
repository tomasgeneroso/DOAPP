/**
 * Sugerencias de dirección para Configuración → Dirección (web y app).
 *
 * Usa la API pública de Georef (datos.gob.ar, Argentina): sin clave, con CORS abierto, y devuelve la calle, la altura, la localidad
 * y la provincia ya separadas, que es lo que piden los campos. Las sugerencias son una ayuda: la persona siempre puede escribir
 * a mano (si la API no responde, o la calle no está, el formulario sigue igual). El código postal no lo da la API: se completa a mano.
 */

export interface SugerenciaDeDireccion {
  /** Lo que se muestra en la lista: «Corrientes 1234, Rafaela, Santa Fe». */
  etiqueta: string;
  /** Calle y altura, para el campo «Calle y número». */
  calle: string;
  ciudad: string;
  provincia: string;
  lat?: number;
  lon?: number;
}

export const URL_GEOREF = 'https://apis.datos.gob.ar/georef/api/direcciones';
export const MINIMO_PARA_BUSCAR = 4;
export const MAXIMO_DE_SUGERENCIAS = 6;

/** La dirección de consulta, o null si todavía es muy corta para buscar. */
/** Acota la búsqueda a una provincia (y, si se sabe, a una localidad): así no ofrece «San Luis» de otra punta del país. */
export interface ContextoGeografico {
  provincia?: string;
  ciudad?: string;
}

const conContexto = (url: string, c?: ContextoGeografico): string =>
  url + (c?.provincia ? `&provincia=${encodeURIComponent(c.provincia)}` : '') + (c?.provincia && c?.ciudad ? `&localidad_censal=${encodeURIComponent(c.ciudad)}` : '');

export function urlDeBusqueda(texto: unknown, max: number = MAXIMO_DE_SUGERENCIAS, contexto?: ContextoGeografico): string | null {
  const t = String(texto ?? '').replace(/\s+/g, ' ').trim();
  if (t.length < MINIMO_PARA_BUSCAR) return null;
  return conContexto(`${URL_GEOREF}?direccion=${encodeURIComponent(t)}&max=${Math.min(Math.max(1, Math.floor(max) || 1), 10)}&campos=completo`, contexto);
}

const CHICAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'el']);

/** «AV SANTA FE» → «Av Santa Fe»; las palabras de enlace quedan en minúscula (salvo al principio). */
export function aCasoTitulo(texto: string): string {
  return texto
    .toLowerCase()
    .split(/(\s+)/)
    .map((p, i) => (/^\s*$/.test(p) ? p : i > 0 && CHICAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join('')
    .trim();
}

const texto = (x: any): string => (typeof x === 'string' ? x.trim() : '');
const numero = (x: unknown): number | undefined => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);

/** Lee la respuesta de Georef. Lo que venga raro da una lista vacía, nunca un error. */
export function leerSugerencias(json: unknown): SugerenciaDeDireccion[] {
  const lista = (json as any)?.direcciones;
  if (!Array.isArray(lista)) return [];
  const vistas = new Set<string>();
  const salida: SugerenciaDeDireccion[] = [];
  for (const d of lista) {
    const nombre = texto(d?.calle?.nombre);
    if (!nombre) continue;
    const altura = numero(d?.altura?.valor);
    const calle = `${aCasoTitulo(nombre)}${altura ? ` ${altura}` : ''}`;
    const ciudad = aCasoTitulo(texto(d?.localidad_censal?.nombre) || texto(d?.departamento?.nombre));
    const provincia = aCasoTitulo(texto(d?.provincia?.nombre));
    const etiqueta = [calle, ciudad, provincia === ciudad ? '' : provincia].filter(Boolean).join(', ');
    if (vistas.has(etiqueta)) continue;
    vistas.add(etiqueta);
    salida.push({ etiqueta, calle, ciudad, provincia, lat: numero(d?.ubicacion?.lat), lon: numero(d?.ubicacion?.lon) });
  }
  return salida;
}

/** Busca sugerencias. Cualquier falla (sin red, límite, respuesta rara) devuelve una lista vacía. */
export async function buscarDirecciones(consulta: string, opciones: { signal?: AbortSignal } & ContextoGeografico = {}): Promise<SugerenciaDeDireccion[]> {
  const url = urlDeBusqueda(consulta, MAXIMO_DE_SUGERENCIAS, opciones);
  if (!url) return [];
  try {
    const r = await fetch(url, { signal: opciones.signal });
    if (!r.ok) return [];
    return leerSugerencias(await r.json());
  } catch {
    return [];
  }
}

// ───────────────────────── Alturas que existen y código postal ─────────────────────────

/** Una calle con las alturas que existen en ella (Georef/INDEC). */
export interface CalleSugerida {
  etiqueta: string;
  /** Solo el nombre de la calle: falta el número. */
  calle: string;
  ciudad: string;
  provincia: string;
  desde: number;
  hasta: number;
}

export const URL_GEOREF_CALLES = 'https://apis.datos.gob.ar/georef/api/calles';

/** «Av Corrientes 1234» → { calle: 'Av Corrientes', altura: 1234 }. Sin número al final, altura null. */
export function separarCalleYAltura(texto: unknown): { calle: string; altura: number | null } {
  const t = String(texto ?? '').replace(/\s+/g, ' ').trim();
  const m = t.match(/^(.*?)[\s,]+(\d{1,6})$/);
  if (!m || !m[1].trim()) return { calle: t, altura: null };
  return { calle: m[1].trim().replace(/[,]+$/, ''), altura: Number(m[2]) };
}

export function urlDeCalles(nombre: unknown, max: number = MAXIMO_DE_SUGERENCIAS, contexto?: ContextoGeografico): string | null {
  const t = String(nombre ?? '').replace(/\s+/g, ' ').trim();
  if (t.length < MINIMO_PARA_BUSCAR) return null;
  return conContexto(`${URL_GEOREF_CALLES}?nombre=${encodeURIComponent(t)}&max=${Math.min(Math.max(1, Math.floor(max) || 1), 10)}&campos=nombre,altura,localidad_censal,provincia`, contexto);
}

/**
 * Lee la respuesta de `calles`. Lo que venga raro o sin rango de alturas se descarta (no se inventa un rango). Una misma calle
 * viene partida por tramos (por ejemplo por comuna): se junta en UNA entrada con el rango de todos los tramos.
 */
export function leerCalles(json: unknown): CalleSugerida[] {
  const lista = (json as any)?.calles;
  if (!Array.isArray(lista)) return [];
  const porClave = new Map<string, CalleSugerida>();
  for (const c of lista) {
    const nombre = texto(c?.nombre);
    if (!nombre) continue;
    const a = c?.altura;
    const ints = [a?.inicio?.derecha, a?.inicio?.izquierda].map(numero).filter((x): x is number => x !== undefined && x > 0);
    const fins = [a?.fin?.derecha, a?.fin?.izquierda].map(numero).filter((x): x is number => x !== undefined);
    const hasta = fins.length ? Math.max(...fins) : 0;
    if (hasta < 1) continue;
    // Muchas calles empiezan en 0: el primer número que existe es el 1.
    const desde = ints.length ? Math.min(...ints, hasta) : 1;
    const calle = aCasoTitulo(nombre);
    const ciudad = aCasoTitulo(texto(c?.localidad_censal?.nombre));
    const provincia = aCasoTitulo(texto(c?.provincia?.nombre));
    const k = [calle, ciudad, provincia].join('|');
    const previa = porClave.get(k);
    if (previa) {
      previa.desde = Math.min(previa.desde, desde);
      previa.hasta = Math.max(previa.hasta, hasta);
    } else {
      porClave.set(k, { etiqueta: '', calle, ciudad, provincia, desde, hasta });
    }
  }
  return [...porClave.values()].map((c) => ({
    ...c,
    etiqueta: `${[c.calle, c.ciudad, c.provincia === c.ciudad ? '' : c.provincia].filter(Boolean).join(', ')} (${c.desde}–${c.hasta})`,
  }));
}

export const alturaEnRango = (altura: number, c: Pick<CalleSugerida, 'desde' | 'hasta'>): boolean => altura >= c.desde && altura <= c.hasta;

export interface ResultadoDeBusqueda {
  /** Direcciones completas (calle + número que existe), con coordenadas. */
  direcciones: SugerenciaDeDireccion[];
  /** Calles con el rango de números que tienen: cuando todavía no hay número, o el número escrito no existe. */
  calles: CalleSugerida[];
  /** El número escrito no existe en ninguna calle con ese nombre. */
  alturaInexistente?: { altura: number; mayor: number };
}

async function pedir(url: string | null, signal?: AbortSignal): Promise<unknown> {
  if (!url) return null;
  try {
    const r = await fetch(url, { signal });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

/**
 * Sugerencias de dirección que EXISTEN:
 *  - con número: las direcciones que Georef reconoce (calle + número dentro del rango de la calle), con su ubicación;
 *  - sin número: las calles con su rango de números («1–6899»), para elegir y escribir un número que exista;
 *  - con un número que no existe en la calle: lo dice y ofrece las calles con su rango.
 * Cualquier falla (sin red, límite, respuesta rara) da listas vacías: la persona siempre puede escribir a mano.
 */
export async function buscarSugerencias(consulta: string, opciones: { signal?: AbortSignal } & ContextoGeografico = {}): Promise<ResultadoDeBusqueda> {
  const { calle, altura } = separarCalleYAltura(consulta);
  if (altura !== null) {
    const direcciones = await buscarDirecciones(consulta, opciones);
    if (direcciones.length > 0) return { direcciones, calles: [] };
    const calles = leerCalles(await pedir(urlDeCalles(calle, MAXIMO_DE_SUGERENCIAS, opciones), opciones.signal));
    if (calles.length === 0) return { direcciones: [], calles: [] };
    const sirven = calles.filter((c) => alturaEnRango(altura, c));
    // Si alguna calle sí tiene ese número, Georef simplemente no lo ubicó: se ofrecen esas calles y no se dice que no existe.
    if (sirven.length > 0) return { direcciones: [], calles: sirven };
    return { direcciones: [], calles, alturaInexistente: { altura, mayor: Math.max(...calles.map((c) => c.hasta)) } };
  }
  return { direcciones: [], calles: leerCalles(await pedir(urlDeCalles(calle, MAXIMO_DE_SUGERENCIAS, opciones), opciones.signal)) };
}

// Código postal: Georef no lo trae. Se pide a OpenStreetMap (Nominatim) por la UBICACIÓN de la dirección elegida: una consulta por
// elección (nunca mientras se escribe: su política no admite autocompletar), con el código postal del lugar y no del nombre de la calle.
export const URL_NOMINATIM_INVERSO = 'https://nominatim.openstreetmap.org/reverse';

/** Códigos postales argentinos: 4 dígitos (1043), con letra (C1043) o CPA completo (C1043AAJ). Lo demás no se usa. */
export function normalizarCodigoPostal(v: unknown): string | null {
  const t = String(v ?? '').trim().toUpperCase().replace(/\s+/g, '');
  return /^([A-Z]\d{4}[A-Z]{3}|[A-Z]\d{4}|\d{4})$/.test(t) ? t : null;
}

export function urlDeCodigoPostal(lat: unknown, lon: unknown): string | null {
  const la = numero(lat);
  const lo = numero(lon);
  if (la === undefined || lo === undefined || Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
  return `${URL_NOMINATIM_INVERSO}?lat=${la}&lon=${lo}&format=jsonv2&zoom=18&addressdetails=1&accept-language=es`;
}

export async function buscarCodigoPostal(lat: unknown, lon: unknown, opciones: { signal?: AbortSignal; userAgent?: string } = {}): Promise<string | null> {
  const url = urlDeCodigoPostal(lat, lon);
  if (!url) return null;
  try {
    const r = await fetch(url, { signal: opciones.signal, headers: opciones.userAgent ? { 'User-Agent': opciones.userAgent } : undefined });
    if (!r.ok) return null;
    const j: any = await r.json();
    // Solo si OpenStreetMap dice que es Argentina: un punto en el límite no puede devolver el código de otro país.
    if (j?.address?.country_code && String(j.address.country_code).toLowerCase() !== 'ar') return null;
    return normalizarCodigoPostal(j?.address?.postcode);
  } catch {
    return null;
  }
}

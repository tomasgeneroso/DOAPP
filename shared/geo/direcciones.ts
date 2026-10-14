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
export function urlDeBusqueda(texto: unknown, max: number = MAXIMO_DE_SUGERENCIAS): string | null {
  const t = String(texto ?? '').replace(/\s+/g, ' ').trim();
  if (t.length < MINIMO_PARA_BUSCAR) return null;
  return `${URL_GEOREF}?direccion=${encodeURIComponent(t)}&max=${Math.min(Math.max(1, Math.floor(max) || 1), 10)}&campos=completo`;
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
    const etiqueta = [calle, ciudad, provincia].filter(Boolean).join(', ');
    if (vistas.has(etiqueta)) continue;
    vistas.add(etiqueta);
    salida.push({ etiqueta, calle, ciudad, provincia, lat: numero(d?.ubicacion?.lat), lon: numero(d?.ubicacion?.lon) });
  }
  return salida;
}

/** Busca sugerencias. Cualquier falla (sin red, límite, respuesta rara) devuelve una lista vacía. */
export async function buscarDirecciones(consulta: string, opciones: { signal?: AbortSignal } = {}): Promise<SugerenciaDeDireccion[]> {
  const url = urlDeBusqueda(consulta);
  if (!url) return [];
  try {
    const r = await fetch(url, { signal: opciones.signal });
    if (!r.ok) return [];
    return leerSugerencias(await r.json());
  } catch {
    return [];
  }
}

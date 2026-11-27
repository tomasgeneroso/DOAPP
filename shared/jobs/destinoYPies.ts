/**
 * Dos datos opcionales de una publicación (pedido del dueño, 2026-11-27): la dirección de DESTINO, para mudanzas, fletes y mandados (la dirección de siempre es el origen), y el PIE de cada foto.
 * Del destino, la zona (localidad, barrio, código postal) es pública; la calle, el número, las indicaciones y el punto exacto se cuidan igual que los del origen.
 */
import { sanearCalle, validarCalleYNumero } from '../geo/lugares.js';

export interface Destino {
  location: string;
  neighborhood?: string | null;
  postalCode?: string | null;
  street?: string | null;
  number?: string | null;
  details?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export const LARGO_MAXIMO_DEL_PIE = 140;
export const CAMPOS_PRIVADOS_DEL_DESTINO = ['street', 'number', 'details', 'latitude', 'longitude'] as const;

const desdeJson = (v: unknown): unknown => {
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return undefined;
  }
};
const texto = (v: unknown, largo: number): string => String(v ?? '').trim().slice(0, largo);
const coordenada = (v: unknown, tope: number): number | null => {
  const n = v === null || v === '' || v === undefined ? NaN : Number(v);
  return Number.isFinite(n) && Math.abs(n) <= tope ? n : null;
};

/** `null`: sin destino (no se cargó o se quitó). */
export function leerDestino(valor: unknown): { ok: true; destino: Destino | null } | { ok: false; mensaje: string } {
  if (valor === undefined || valor === null || valor === '' || valor === 'null') return { ok: true, destino: null };
  const d = desdeJson(valor) as Record<string, unknown> | null | undefined;
  if (d === null) return { ok: true, destino: null };
  if (typeof d !== 'object') return { ok: false, mensaje: 'No pudimos leer la dirección de destino.' };
  let calle = texto(d.street, 120);
  let numero = texto(d.number, 10);
  const separada = sanearCalle(calle);
  if (separada.numero && !numero) {
    calle = separada.calle;
    numero = separada.numero;
  }
  const location = texto(d.location, 160);
  if (!location && !calle && !numero) return { ok: true, destino: null };
  if (!location) return { ok: false, mensaje: 'Completá la ciudad o localidad de destino.' };
  const problema = validarCalleYNumero(calle, numero);
  if (problema) return { ok: false, mensaje: `Destino: ${problema}` };
  return {
    ok: true,
    destino: {
      location,
      neighborhood: texto(d.neighborhood, 80) || null,
      postalCode: texto(d.postalCode, 12) || null,
      street: calle || null,
      number: numero || null,
      details: texto(d.details, 200) || null,
      latitude: coordenada(d.latitude, 90),
      longitude: coordenada(d.longitude, 180),
    },
  };
}

/** Los pies en el orden de las fotos que se suben. */
export function leerPies(valor: unknown): string[] {
  const v = desdeJson(valor);
  return Array.isArray(v) ? v.map((p) => texto(p, LARGO_MAXIMO_DEL_PIE)) : [];
}

/** Los pies de las fotos que ya estaban, por su dirección. */
export function leerMapaDePies(valor: unknown): Record<string, string> | null {
  const v = desdeJson(valor);
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([url, p]) => [url, texto(p, LARGO_MAXIMO_DEL_PIE)]));
}

/** El pie de cada foto que queda: las de antes conservan el suyo (o el que se escribió ahora) y las nuevas toman el suyo por orden. Sin pie no se guarda nada. */
export function piesDeLasFotos(quedan: string[], deAntes: Record<string, string>, nuevas: string[] = [], pies: string[] = []): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const url of quedan) if (deAntes[url]) salida[url] = deAntes[url];
  nuevas.forEach((url, i) => {
    if (pies[i]) salida[url] = pies[i];
  });
  return salida;
}

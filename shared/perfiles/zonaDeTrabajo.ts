import { JOB_CATEGORIES } from '../constants/categories.js';

/**
 * Rubros y zona de trabajo de un perfil (pedido del dueño, 2026-11-12).
 *
 * - Una persona se registra como cliente, trabajador o ambos; el trabajador elige uno o varios RUBROS (los mismos de los trabajos: `JOB_CATEGORIES`) o «cualquier rubro».
 * - Su domicilio (`address.city`) fija la zona de trabajo base; además puede sumar OTRAS zonas y un radio en km desde el domicilio.
 * Lo que llega del navegador o de la app se sanea acá: solo rubros que existen, zonas con nombre y radios razonables.
 */
export type TipoDeCuenta = 'client' | 'worker' | 'both';

export interface ZonaDeTrabajo {
  name: string;
  /** Radio en km alrededor de esa zona (opcional). */
  radiusKm?: number;
}

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

/** Zonas con nombre (2 a 80 caracteres), sin repetir, con un tope; el radio de cada una es opcional. */
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
    zonas.push(radiusKm ? { name, radiusKm } : { name });
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

export const esTrabajador = (role: unknown): boolean => role === 'doer' || role === 'both';

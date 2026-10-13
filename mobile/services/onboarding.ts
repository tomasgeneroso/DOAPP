import { post } from './api';

/**
 * Primer paso después de registrarse: contar qué tipo de trabajos interesan (la web hace lo mismo en /onboarding).
 * Es opcional: se puede saltar, y los intereses se pueden cambiar después en la configuración.
 */

export const alternarInteres = (elegidos: string[], id: string): string[] =>
  elegidos.includes(id) ? elegidos.filter((x) => x !== id) : [...elegidos, id];

/** Solo ids de categorías que existen y sin repetidos (lo que venga de otro lado no se manda). */
export function interesesValidos(elegidos: unknown, categorias: ReadonlyArray<{ id: string }>): string[] {
  const permitidos = new Set(categorias.map((c) => c.id));
  return Array.isArray(elegidos) ? [...new Set(elegidos.map(String))].filter((id) => permitidos.has(id)) : [];
}

export interface ResultadoDelOnboarding {
  ok: boolean;
  mensaje: string;
}

export function interpretarOnboarding(res: any): ResultadoDelOnboarding {
  return res?.success === true
    ? { ok: true, mensaje: 'Listo.' }
    : { ok: false, mensaje: String(res?.message || 'No se pudo guardar. Probá de nuevo.') };
}

/** Guarda los intereses (o salta con una lista vacía). Siempre marca el onboarding como completado. */
export async function terminarOnboarding(intereses: string[]): Promise<ResultadoDelOnboarding> {
  return interpretarOnboarding(await post<any>('/auth/onboarding', { interests: intereses, onboardingCompleted: true }));
}

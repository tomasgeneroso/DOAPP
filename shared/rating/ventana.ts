import { POLITICAS } from '../constants/policies.js';

/**
 * Que reseñas cuentan para la puntuacion que se muestra.
 *
 * Tres escalones, en este orden:
 *
 *   1. Ultimos 90 dias, si ahi hay al menos RATING_CONTRATOS_MINIMOS reseñas.
 *      Es la foto de como trabaja hoy.
 *   2. Si no llega, el ultimo año. Con pocas reseñas recientes, una sola mala
 *      decidiria toda la reputacion.
 *   3. Si en el año tampoco hay ninguna, todo el historial. Borrarle la
 *      reputacion a alguien que volvio despues de un año seria peor que
 *      mostrarla vieja: al lado se muestra de cuando es.
 *
 * Devuelve tambien la etiqueta, porque una puntuacion sin decir de que periodo
 * es miente por omision.
 */
export type VentanaId = 'reciente' | 'anual' | 'historico';

export interface VentanaDeRating {
  id: VentanaId;
  /** Desde cuando cuentan las reseñas. null = todo el historial. */
  desde: Date | null;
  dias: number | null;
  /** "últimos 90 días", "último año", "desde el inicio". */
  etiqueta: string;
  /** Cuantas reseñas quedaron dentro. */
  cantidad: number;
}

const MS_DIA = 86_400_000;

function desde(dias: number, ahora: Date): Date {
  return new Date(ahora.getTime() - dias * MS_DIA);
}

export function ventanaDeRating(fechas: Array<Date | string>, ahora = new Date()): VentanaDeRating {
  const tiempos = fechas
    .map((f) => new Date(f).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => b - a);

  const corte90 = desde(POLITICAS.RATING_VENTANA_DIAS, ahora).getTime();
  const enVentana = tiempos.filter((t) => t >= corte90).length;
  if (enVentana >= POLITICAS.RATING_CONTRATOS_MINIMOS) {
    return {
      id: 'reciente',
      desde: new Date(corte90),
      dias: POLITICAS.RATING_VENTANA_DIAS,
      etiqueta: `últimos ${POLITICAS.RATING_VENTANA_DIAS} días`,
      cantidad: enVentana,
    };
  }

  const corteAnual = desde(POLITICAS.RATING_VENTANA_LARGA_DIAS, ahora).getTime();
  const enAnual = tiempos.filter((t) => t >= corteAnual).length;
  if (enAnual > 0) {
    return { id: 'anual', desde: new Date(corteAnual), dias: POLITICAS.RATING_VENTANA_LARGA_DIAS, etiqueta: 'último año', cantidad: enAnual };
  }

  return { id: 'historico', desde: null, dias: null, etiqueta: 'desde el inicio', cantidad: tiempos.length };
}

/** Si una reseña entra en la ventana. */
export function entraEnVentana(fecha: Date | string, v: VentanaDeRating): boolean {
  if (!v.desde) return true;
  return new Date(fecha).getTime() >= v.desde.getTime();
}

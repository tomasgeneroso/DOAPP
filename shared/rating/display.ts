/**
 * Como se muestra una calificacion.
 *
 * Un usuario sin opiniones no tiene "0 estrellas" ni "5 estrellas": no tiene
 * calificacion. La web mostraba 0.0 y mobile mostraba 5.0 para la misma
 * persona -- las dos mienten, en direcciones opuestas. Mercado Libre no muestra
 * color hasta 10 ventas; nosotros decimos "Nuevo en DOAPP" hasta la primera
 * opinion. Es lo que ya hace la promocion del perfil: quien no tiene opiniones
 * puede promocionarse, porque no tiene nada en contra.
 *
 * Compartido por web y mobile para que las dos digan lo mismo.
 */

export const ETIQUETA_NUEVO = 'Nuevo en DOAPP';

export interface RatingMostrable {
  /** Texto a mostrar: "4.7" o "Nuevo en DOAPP". */
  texto: string;
  /** Si hay una calificacion real detras. */
  tieneCalificacion: boolean;
  /** El numero, solo si tieneCalificacion. */
  valor: number | null;
}

/**
 * De qué período es la puntuación, para mostrarlo al lado. Una puntuación sin
 * decir de cuándo es miente por omisión: no es lo mismo un 4,8 de esta semana
 * que uno de hace tres años.
 */
export function periodoDelRating(
  breakdown: { ventana?: { etiqueta?: string; id?: string } | null; historicas?: number } | null | undefined,
  reviewsCount?: number | null,
): string | null {
  const etiqueta = breakdown?.ventana?.etiqueta;
  if (!etiqueta) return null;
  const historicas = Number(breakdown?.historicas ?? NaN);
  const enVentana = Number(reviewsCount ?? NaN);
  const hayMas = Number.isFinite(historicas) && Number.isFinite(enVentana) && historicas > enVentana;
  return hayMas ? `${etiqueta} · ${historicas} en total` : etiqueta;
}

export function mostrarRating(
  rating: number | string | null | undefined,
  reviewsCount?: number | null,
): RatingMostrable {
  const r = Number(rating);
  const n = Number(reviewsCount ?? NaN);
  // Sin opiniones, o sin rating valido: nuevo. Si reviewsCount no viene, se
  // decide por el rating solo (0 o invalido = nuevo).
  const sinOpiniones = Number.isFinite(n) ? n <= 0 : !(r > 0);
  if (sinOpiniones || !Number.isFinite(r) || r <= 0) {
    return { texto: ETIQUETA_NUEVO, tieneCalificacion: false, valor: null };
  }
  return { texto: r.toFixed(1), tieneCalificacion: true, valor: r };
}

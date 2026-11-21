/**
 * «Hubo problemas durante el trabajo» (pedido del dueño, 2026-11-21).
 *
 * Quien contrató cuenta qué pasó y se abre un TICKET para el equipo de DOAPP (no un reclamo todavía). Mientras el ticket está abierto la confirmación automática se detiene y el pago
 * no se libera. El ticket termina de una de estas formas:
 *   - se lleva a un reclamo (disputa): el contrato pasa a «en reclamo» y decide el equipo;
 *   - se resuelve con el mismo trabajo (se arregló, o fue un malentendido): el contrato sigue y quien contrató puede aceptar el fin del trabajo de nuevo, con un plazo nuevo de
 *     `AUTO_CONFIRMACION_HORAS` antes de que se confirme solo.
 *
 * Las categorías son las del reclamo, así que «Llevar a reclamo» llega con la categoría ya elegida. Lo comparten la web, la app y el servidor.
 */
export const ETIQUETA_DE_PROBLEMA_DEL_TRABAJO = 'hubo-problemas';

export const CATEGORIAS_DE_PROBLEMA = ['incomplete_work', 'service_not_delivered', 'quality_issues', 'other'] as const;
export type CategoriaDeProblema = (typeof CATEGORIAS_DE_PROBLEMA)[number];

export const OPCIONES_DE_PROBLEMA: ReadonlyArray<{ categoria: CategoriaDeProblema; titulo: string; detalle: string }> = [
  { categoria: 'incomplete_work', titulo: 'El trabajo no se terminó', detalle: 'Quedó trabajo sin hacer.' },
  { categoria: 'service_not_delivered', titulo: 'No se presentó o no lo hizo', detalle: 'El trabajador no fue o no hizo el trabajo.' },
  { categoria: 'quality_issues', titulo: 'Se hizo, pero con problemas', detalle: 'El resultado no es el acordado o hay daños.' },
  { categoria: 'other', titulo: 'Hubo otro problema', detalle: 'Algo distinto a lo anterior.' },
];

/** Cuántas letras mínimas pide el relato: sin esto el equipo recibe un ticket vacío. */
export const LARGO_MINIMO_DEL_RELATO = 10;
export const LARGO_MAXIMO_DEL_RELATO = 2000;

export const esCategoriaDeProblema = (v: unknown): v is CategoriaDeProblema => typeof v === 'string' && (CATEGORIAS_DE_PROBLEMA as readonly string[]).includes(v);

export const tituloDeProblema = (categoria: string): string => OPCIONES_DE_PROBLEMA.find((o) => o.categoria === categoria)?.titulo ?? 'Hubo un problema';

/** ¿Es el ticket de un problema durante el trabajo? Y de qué categoría (la sacamos de las etiquetas). */
export function problemaDeLasEtiquetas(tags: unknown): { categoria: CategoriaDeProblema } | null {
  const lista = Array.isArray(tags) ? tags.map(String) : [];
  if (!lista.includes(ETIQUETA_DE_PROBLEMA_DEL_TRABAJO)) return null;
  const categoria = lista.find(esCategoriaDeProblema);
  return { categoria: (categoria as CategoriaDeProblema) ?? 'other' };
}

/** Lo que la pantalla de un ticket necesita para ofrecer «llevar a reclamo» y «seguir con el mismo trabajo». */
export interface ProblemaDelTrabajo {
  contractId: string;
  categoria: CategoriaDeProblema;
  /** El ticket sigue abierto: el pago no se libera solo. */
  abierto: boolean;
  /** El contrato está en un estado en que se puede seguir con el mismo trabajo. */
  puedeSeguirConElTrabajo: boolean;
}

export const TEXTO_DEL_PROBLEMA = {
  pausa: 'Mientras este ticket esté abierto la confirmación automática está detenida y el pago no se libera.',
  seguir: 'Seguir con el mismo trabajo',
  seguirAyuda: 'Si se arregló o fue un malentendido, el trabajo sigue y quien contrató puede aceptar el fin del trabajo de nuevo, con un plazo nuevo de 24 horas.',
  reclamo: 'Llevar a reclamo',
  reclamoAyuda: 'Si no se arregla, se abre un reclamo y el equipo de DOAPP decide. El contrato queda en reclamo y el pago en custodia.',
} as const;

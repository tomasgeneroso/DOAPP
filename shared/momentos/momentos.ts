/**
 * Momentos importantes (plan «Momentos DOAPP», 2026-11-26): reglas y textos que comparten el servidor y las pantallas.
 * Los textos van en positivo y solo prometen lo que DOAPP hace (no dice «verificados»: DOAPP no comprueba identidad ni antecedentes).
 */

/** Claves que una pantalla puede marcar como vistas (nada más se acepta). */
export const CLAVE_PRIMER_COBRO = 'primer_cobro';
export const CLAVE_BIENVENIDA = 'bienvenida';
/** La pregunta de bienvenida solo tiene sentido al principio. */
export const DIAS_DE_CUENTA_NUEVA = 14;
export const esClaveQueSePuedeMarcar = (c: unknown): c is string =>
  typeof c === 'string' && (c === CLAVE_PRIMER_COBRO || c === CLAVE_BIENVENIDA || /^politicas:[1-9]\d{0,3}$/.test(c));

/** Con menos personas que esto no se dice cuántas son: un número muy chico puede señalar a alguien concreto y desalienta publicar. */
export const MINIMO_PARA_DECIR_CUANTOS = 3;

export function textoDeOferta(personas: number, rubro: string): string {
  return personas >= MINIMO_PARA_DECIR_CUANTOS
    ? `${personas} personas ofrecen ${rubro.toLowerCase()} en DOAPP. Publicá y quienes puedan hacerlo te escriben.`
    : 'Publicá y quienes puedan hacerlo te escriben.';
}

export interface TrabajoDeOcasion { titulo: string; categoria: string }
export interface Ocasion { id: string; titulo: string; frase: string; trabajos: TrabajoDeOcasion[] }

/** Paquetes por ocasión: cada trabajo se publica por separado (no cambia nada del cobro). Las categorías son ids de shared/constants/categories.ts. */
export const OCASIONES: Ocasion[] = [
  {
    id: 'mudanza', titulo: 'Me mudo', frase: 'Tu casa nueva, lista para el primer día.',
    trabajos: [
      { titulo: 'Flete y mudanza', categoria: 'mudanzas' },
      { titulo: 'Limpieza antes de entrar', categoria: 'limpieza' },
      { titulo: 'Pintura de la casa nueva', categoria: 'pintura' },
      { titulo: 'Armado de muebles', categoria: 'armado_muebles' },
    ],
  },
  {
    id: 'visitas', titulo: 'Viene gente a casa', frase: 'Todo listo para recibir.',
    trabajos: [
      { titulo: 'Limpieza a fondo', categoria: 'limpieza' },
      { titulo: 'Arreglo del jardín o patio', categoria: 'jardineria' },
      { titulo: 'Arreglos chicos pendientes', categoria: 'reparaciones' },
    ],
  },
  {
    id: 'obra', titulo: 'Terminé una obra', frase: 'Del polvo a la casa en orden.',
    trabajos: [
      { titulo: 'Limpieza de fin de obra', categoria: 'limpieza' },
      { titulo: 'Pintura y retoques', categoria: 'pintura' },
      { titulo: 'Revisión de luz e instalaciones', categoria: 'electricidad' },
    ],
  },
];

export interface ResumenAnual {
  desde: string;
  hasta: string;
  trabajosTerminados: number;
  rubros: Array<{ rubro: string; cantidad: number }>;
  resenas: number;
  calificacionMedia: number | null;
}

/** El texto que la persona puede compartir de su año. Solo cuenta lo suyo: no nombra clientes, montos ni direcciones. */
export function textoDelResumen(r: ResumenAnual): string {
  const partes = [`En el último año terminé ${r.trabajosTerminados} ${r.trabajosTerminados === 1 ? 'trabajo' : 'trabajos'} con DOAPP.`];
  if (r.rubros.length > 0) partes.push(`Sobre todo: ${r.rubros.slice(0, 3).map((x) => x.rubro.toLowerCase()).join(', ')}.`);
  if (r.calificacionMedia !== null && r.resenas > 0) partes.push(`Mi puntuación: ${r.calificacionMedia.toLocaleString('es-AR', { maximumFractionDigits: 1 })} de 5 en ${r.resenas} ${r.resenas === 1 ? 'reseña' : 'reseñas'}.`);
  return partes.join(' ');
}

/** Aviso de publicación sin postulaciones: cuándo corresponde y cada cuánto, como mucho. */
export const HORAS_SIN_POSTULACIONES_PARA_AVISAR = 24;
export const DIAS_ENTRE_AVISOS_A_LA_MISMA_PERSONA = 7;
export const claveDelAvisoSinPostulaciones = (jobId: string): string => `sin_postulaciones:${jobId}`;

/** Fotos que se pueden elegir de cada lado en un antes y después. */
export const FOTOS_POR_LADO = 3;

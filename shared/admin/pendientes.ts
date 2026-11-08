/**
 * Lo que el administrador tiene que hacer hoy, ordenado por importancia y clasificado.
 *
 * Qué motivó esto: el panel de administración abría con estadísticas (usuarios, contratos, tickets) y los pendientes quedaban repartidos en una
 * pantalla por tipo (retiros, publicaciones, disputas…). Para saber si había trabajo esperando había que entrar a cada una. Ahora la portada del
 * panel arranca con esta lista: cada fila es un tipo de trabajo pendiente, con cuánto hay, cuánto hace que espera el más viejo y a qué nivel de
 * urgencia corresponde.
 *
 * El nivel sale de CUÁNTO LLEVA ESPERANDO el más viejo (una persona esperando un retiro o una publicación no es lo mismo a las 3 horas que a los
 * 3 días), salvo lo que tiene un reloj externo (un contracargo vence y vencido no hay nada que hacer: siempre es urgente). Los umbrales son
 * de operación, no de política: se cambian acá y en ningún otro lado.
 */

export type Urgencia = 'urgente' | 'importante' | 'normal';
export type CategoriaDePendiente = 'dinero' | 'publicaciones' | 'contratos' | 'usuarios' | 'soporte';

export interface TareaPendiente {
  /** Identifica el tipo de tarea (`retiros`, `publicaciones`…). */
  clave: string;
  categoria: CategoriaDePendiente;
  titulo: string;
  /** Una línea para quien la lee: cuántas hay y desde cuándo espera la más vieja. */
  detalle: string;
  cantidad: number;
  /** Horas que lleva esperando la más vieja; null si no se puede medir (o si el reloj es externo). */
  esperaHoras: number | null;
  urgencia: Urgencia;
  /** La pantalla de administración donde se resuelve. */
  ruta: string;
}

/** Cuánta espera (en horas) hace falta para pasar a «importante» y a «urgente». `siempre` = urgente sin mirar la espera (tiene un reloj externo). */
export type Umbral = { importante: number; urgente: number } | 'siempre';

/**
 * Los umbrales, por tipo de tarea. Criterio: lo que tiene a una persona esperando plata o esperando poder publicar sube antes; lo que no
 * mueve plata (identidad, tickets) puede esperar más. Es el valor de arranque: se ajusta con la práctica.
 */
export const UMBRALES_DE_ESPERA: Record<string, Umbral> = {
  contracargos: 'siempre',
  retencionesPorFraude: 'siempre',
  // Se completaron los lugares del beneficio de lanzamiento y la plataforma sigue en beta (comisión 0): la espera cuenta desde que se entregó el último lugar.
  lugaresDelLanzamiento: { importante: 12, urgente: 72 },
  retiros: { importante: 24, urgente: 48 },
  pagosPorVerificar: { importante: 6, urgente: 24 },
  pagosAlTrabajador: { importante: 24, urgente: 72 },
  publicaciones: { importante: 6, urgente: 24 },
  cancelaciones: { importante: 6, urgente: 24 },
  disputas: { importante: 24, urgente: 72 },
  trabajosVencidos: { importante: 48, urgente: 168 },
  identidadAReviser: { importante: 24, urgente: 96 },
  verificaciones: { importante: 24, urgente: 72 },
  tickets: { importante: 24, urgente: 72 },
};

/** Una tarea marcada «urgente» por quien la abrió (un ticket o una disputa con prioridad urgente) sube un nivel aunque no lleve mucho esperando. */
export function urgenciaDe(clave: string, esperaHoras: number | null, conPrioridadAlta = false): Urgencia {
  const umbral = UMBRALES_DE_ESPERA[clave];
  if (umbral === 'siempre') return 'urgente';
  let nivel: Urgencia = 'normal';
  if (umbral && esperaHoras !== null) {
    if (esperaHoras >= umbral.urgente) nivel = 'urgente';
    else if (esperaHoras >= umbral.importante) nivel = 'importante';
  }
  if (conPrioridadAlta && nivel === 'normal') nivel = 'importante';
  return nivel;
}

const PESO: Record<Urgencia, number> = { urgente: 0, importante: 1, normal: 2 };

/** Primero lo urgente; dentro de cada nivel, lo que más espera; si empatan, lo que tiene más cosas. No toca la lista que recibe. */
export function ordenarTareas<T extends Pick<TareaPendiente, 'urgencia' | 'esperaHoras' | 'cantidad'>>(tareas: readonly T[]): T[] {
  return [...tareas].sort((a, b) => PESO[a.urgencia] - PESO[b.urgencia] || (b.esperaHoras ?? -1) - (a.esperaHoras ?? -1) || b.cantidad - a.cantidad);
}

/** «hace 3 horas», «hace 2 días»: para decir cuánto lleva esperando lo más viejo. */
export function textoDeEspera(horas: number | null): string {
  if (horas === null || !Number.isFinite(horas) || horas < 0) return '';
  if (horas < 1) return 'hace menos de una hora';
  if (horas < 48) {
    const h = Math.floor(horas);
    return `hace ${h} ${h === 1 ? 'hora' : 'horas'}`;
  }
  const d = Math.floor(horas / 24);
  return `hace ${d} días`;
}

export const ETIQUETAS_DE_URGENCIA: Record<Urgencia, string> = { urgente: 'Urgente', importante: 'Importante', normal: 'Normal' };
export const ETIQUETAS_DE_CATEGORIA: Record<CategoriaDePendiente, string> = {
  dinero: 'Dinero',
  publicaciones: 'Publicaciones',
  contratos: 'Contratos',
  usuarios: 'Usuarios e identidad',
  soporte: 'Soporte',
};

/** Horas entre dos fechas (nunca negativas). */
export function horasDesde(fecha: Date | string | null | undefined, ahora: Date = new Date()): number | null {
  if (!fecha) return null;
  const t = new Date(fecha).getTime();
  return Number.isNaN(t) ? null : Math.max(0, (ahora.getTime() - t) / 3_600_000);
}

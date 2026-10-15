/**
 * Tareas que se definen al CREAR un trabajo con «entrega por tareas».
 *
 * Una tarea es un PASO a seguir para terminar el trabajo («cortar el pasto», «regar las plantas»), con un día opcional. Es una guía
 * para quien trabaja, y es cosa distinta de los REQUISITOS de finalización (lo que se toma como determinante si hay un reclamo).
 * La lee igual el servidor (que las guarda) y la pantalla (que avisa antes de enviar).
 */
export interface TareaDeCreacion {
  title: string;
  /** Día en formato AAAA-MM-DD, o null si la tarea no tiene un día fijo. */
  dueDate: string | null;
}

export const MAXIMO_DE_TAREAS = 30;
export const LARGO_MAXIMO_DE_TITULO = 200;

export type ResultadoDeTareas = { ok: true; tareas: TareaDeCreacion[] } | { ok: false; mensaje: string };

const aDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function comoLista(crudo: unknown): unknown[] | null {
  if (crudo === undefined || crudo === null || crudo === '') return [];
  if (Array.isArray(crudo)) return crudo;
  if (typeof crudo === 'string') {
    try {
      const p = JSON.parse(crudo);
      return Array.isArray(p) ? p : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Lee y valida las tareas. Las que no tienen título se descartan (son filas vacías del formulario). El día de cada tarea tiene que
 * caer entre el inicio y el fin del trabajo (si el fin se sabe): una tarea que no cabe en el trabajo es un error de carga.
 */
export function leerTareasDeCreacion(crudo: unknown, ventana: { inicio?: string | Date | null; fin?: string | Date | null } = {}): ResultadoDeTareas {
  const lista = comoLista(crudo);
  if (lista === null) return { ok: false, mensaje: 'Las tareas no tienen un formato válido.' };

  const desde = ventana.inicio ? aDia(new Date(ventana.inicio)) : null;
  const hasta = ventana.fin ? aDia(new Date(ventana.fin)) : null;

  const tareas: TareaDeCreacion[] = [];
  for (const [i, t] of lista.entries()) {
    if (!t || typeof t !== 'object') return { ok: false, mensaje: `La tarea ${i + 1} no es válida.` };
    const titulo = String((t as any).title ?? '').replace(/\s+/g, ' ').trim();
    if (!titulo) continue;
    if (titulo.length > LARGO_MAXIMO_DE_TITULO) return { ok: false, mensaje: `La tarea «${titulo.slice(0, 30)}…» es demasiado larga (máximo ${LARGO_MAXIMO_DE_TITULO} caracteres).` };

    const crudoDia = (t as any).dueDate;
    let dueDate: string | null = null;
    if (crudoDia !== undefined && crudoDia !== null && crudoDia !== '') {
      const m = String(crudoDia).match(/^(\d{4})-(\d{2})-(\d{2})/);
      const fecha = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
      if (!m || !fecha || Number.isNaN(fecha.getTime()) || aDia(fecha) !== `${m[1]}-${m[2]}-${m[3]}`) {
        return { ok: false, mensaje: `El día de la tarea «${titulo}» no es una fecha válida.` };
      }
      dueDate = aDia(fecha);
      if ((desde && dueDate < desde) || (hasta && dueDate > hasta)) {
        return { ok: false, mensaje: `El día de la tarea «${titulo}» tiene que estar entre el inicio y el fin del trabajo.` };
      }
    }
    tareas.push({ title: titulo, dueDate });
  }
  if (tareas.length > MAXIMO_DE_TAREAS) return { ok: false, mensaje: `Se pueden cargar hasta ${MAXIMO_DE_TAREAS} tareas.` };
  return { ok: true, tareas };
}

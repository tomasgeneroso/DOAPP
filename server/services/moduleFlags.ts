import { ModuleConfig } from '../models/sql/ModuleConfig.model.js';

/**
 * Si un módulo está encendido, preguntado desde el servidor.
 *
 * `server/routes/config.ts` ya publica la lista para el navegador, pero el
 * navegador no puede ser la autoridad: un cliente que manda
 * `paymentMode: 'on_completion'` con el módulo apagado tiene que chocar contra
 * el servidor, no contra una pantalla que decidió no mostrar el botón.
 *
 * Caché corta a propósito. Es una lectura que ocurre en cada publicación y en
 * cada contrato, y el dato cambia una vez cada varios meses; pero medio minuto
 * es poco como para que alguien apague el módulo por un problema y siga
 * entrando trabajo nuevo mientras tanto.
 */

const TTL_MS = 30_000;

const cache = new Map<string, { valor: boolean; vence: number }>();

/** Borra la caché. La llama el panel al cambiar un módulo. */
export function olvidarModulos(moduleId?: string): void {
  if (moduleId) cache.delete(moduleId);
  else cache.clear();
}

/**
 * @param porDefecto Qué contestar si la fila no existe todavía. Para un módulo
 *   que cambia quién asume un riesgo, la respuesta segura es `false`: si no
 *   está declarado, no está encendido.
 */
export async function moduloActivo(moduleId: string, porDefecto = false): Promise<boolean> {
  const guardado = cache.get(moduleId);
  if (guardado && Date.now() < guardado.vence) return guardado.valor;

  try {
    const fila = await ModuleConfig.findByPk(moduleId);
    const valor = fila ? Boolean(fila.isActive) : porDefecto;
    cache.set(moduleId, { valor, vence: Date.now() + TTL_MS });
    return valor;
  } catch (e: any) {
    /**
     * La base no contestó. No se cachea el resultado ni se inventa un `true`:
     * ante la duda, el módulo que cambia quién corre el riesgo está apagado.
     * Un error de conexión no puede ser la razón por la que se habilita un
     * trabajo sin protección de pago.
     */
    console.warn(`⚠️ No se pudo leer el módulo ${moduleId}: ${e?.message}`);
    return porDefecto;
  }
}

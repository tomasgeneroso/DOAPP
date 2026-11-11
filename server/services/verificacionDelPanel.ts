import { ModuleConfig } from '../models/sql/ModuleConfig.model.js';
import { MODULO_VERIFICACION_DIDIT } from '../../shared/constants/modulos.js';
import { fijarVerificacionConDidit } from './didit.js';

/**
 * Lleva el estado del módulo «Verificación de identidad con Didit» (`identity:didit`, panel de Módulos) a `verificacionConDiditActiva()`, que es síncrona.
 *
 * Se carga al arrancar y se refresca cada `CADA_CUANTO_MS`: el panel lo actualiza al instante en el proceso que atiende el cambio, y el refresco alcanza a cualquier otro proceso
 * (PM2 en cluster) sin que el dueño tenga que reiniciar nada. Si la base no contesta se conserva el último valor: un corte de lectura no puede encender ni apagar la verificación.
 */

export const CADA_CUANTO_MS = 20_000;

/** Lee el módulo y lo aplica. `null` = no existe la fila (nadie abrió el panel): sigue valiendo la variable de entorno. */
export async function cargarVerificacionDelPanel(): Promise<boolean | null> {
  const fila = await ModuleConfig.findByPk(MODULO_VERIFICACION_DIDIT);
  const valor = fila ? Boolean(fila.isActive) : null;
  fijarVerificacionConDidit(valor);
  return valor;
}

let temporizador: ReturnType<typeof setInterval> | null = null;

/** Arranca el refresco periódico (una sola vez). No mantiene vivo el proceso. */
export function iniciarRefrescoDeLaVerificacion(cadaMs: number = CADA_CUANTO_MS): void {
  if (temporizador) return;
  temporizador = setInterval(() => {
    cargarVerificacionDelPanel().catch((e: unknown) => console.warn('[verificación] no se pudo refrescar el módulo de Didit:', (e as Error)?.message));
  }, cadaMs);
  (temporizador as unknown as { unref?: () => void }).unref?.();
}

/** Para las pruebas. */
export function __detenerElRefresco(): void {
  if (temporizador) clearInterval(temporizador);
  temporizador = null;
}

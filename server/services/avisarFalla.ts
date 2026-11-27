/**
 * Puerta liviana para anotar que una parte de DOAPP falló. No carga nada pesado cuando los avisos están apagados (desarrollo y pruebas) y NUNCA lanza ni
 * espera: avisar no puede romper lo que estaba haciendo quien avisa.
 */
import { avisosAlDuenoActivos } from './avisosAlDuenoActivos.js';
import type { ComponenteId } from '../../shared/salud/componentes.js';

const motivoDe = (error: unknown): string => (error instanceof Error ? error.message : typeof error === 'string' ? error : '');

/** Un tropiezo de una parte. Avisa recién cuando se repite (ver `saludDeComponentes`). */
export function fallaDe(componente: ComponenteId, motivo: unknown): void {
  if (!avisosAlDuenoActivos()) return;
  void import('./saludDeComponentes.js').then((m) => m.reportarFalla(componente, motivoDe(motivo))).catch(() => undefined);
}

/** La parte volvió a andar (por ejemplo, un correo salió). */
export function exitoDe(componente: ComponenteId): void {
  if (!avisosAlDuenoActivos()) return;
  void import('./saludDeComponentes.js').then((m) => m.reportarExito(componente)).catch(() => undefined);
}

/**
 * Una tarea automática falló: queda en el registro igual que antes y, en el servidor, llega un correo (uno por tarea cada 6 horas). Al correo va solo el
 * mensaje del error: el texto del registro puede nombrar ids.
 */
export function fallaDeTarea(tarea: string, mensaje: string, error?: unknown): void {
  if (error === undefined) console.error(mensaje);
  else console.error(mensaje, error);
  if (!avisosAlDuenoActivos()) return;
  void import('./avisoAlDueno.js')
    .then((m) => m.avisarAlDuenoPorCorreo({
      clave: `tarea:${tarea}`,
      asunto: `Falló una tarea automática: ${tarea}`,
      quePaso: `La tarea automática «${tarea}» tuvo un error. Estas tareas hacen cosas solas (empezar y terminar contratos, avisos, vencimientos, saldos): si sigue fallando, eso deja de pasar.`,
      queHacer: `En el servidor: pm2 logs doapp --lines 200 --nostream. Buscá las líneas de «${tarea}».`,
      detalle: motivoDe(error) || 'Sin detalle: mirá el registro.',
    }))
    .catch(() => undefined);
}

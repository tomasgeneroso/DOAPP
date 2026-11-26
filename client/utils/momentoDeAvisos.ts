/**
 * El permiso de notificaciones se pide cuando sirve: recién después de postularse o de publicar (antes aparecía 30 segundos después de ingresar y volvía al
 * minuto). La pantalla avisa que ocurrió ese momento y quien maneja la sesión decide si preguntar.
 */
export const EVENTO_PARA_PEDIR_AVISOS = 'doapp:momento-para-avisos';

export function avisarMomentoParaNotificaciones(): void {
  try {
    window.dispatchEvent(new Event(EVENTO_PARA_PEDIR_AVISOS));
  } catch {
    /* sin ventana no hay nada que pedir */
  }
}

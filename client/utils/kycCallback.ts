/**
 * Pantalla a la que Didit devuelve a la persona cuando termina (o abandona) la verificación de identidad.
 *
 * Didit agrega a la dirección de retorno `?verificationSessionId=…&status=…`, pero ese `status` viaja por la barra
 * de direcciones: lo puede escribir cualquiera. Lo que se muestra sale SIEMPRE de `GET /api/auth/kyc/status`, que
 * pregunta a Didit la decisión real. Acá solo se decide cómo contarla.
 */

export type EstadoDeLaVerificacion = 'aprobada' | 'en_revision' | 'rechazada' | 'pendiente';

/** Los estados de Didit ('Approved', 'Declined', 'In Review', 'In Progress', 'Not Started', …) a los cuatro que importan. */
export function estadoDeLaVerificacion(kycStatus: unknown, dniVerified?: unknown): EstadoDeLaVerificacion {
  // `dniVerified` lo escribe el servidor al aprobarse: es lo único que cuenta como «verificada».
  if (dniVerified === true) return 'aprobada';
  const s = String(kycStatus ?? '').trim().toLowerCase();
  if (s === 'approved') return 'aprobada';
  if (s === 'declined' || s === 'rejected' || s === 'expired' || s === 'abandoned') return 'rechazada';
  if (s === 'in review' || s === 'in_review') return 'en_revision';
  return 'pendiente';
}

/** Cada cuánto y cuántas veces se vuelve a preguntar mientras Didit todavía no resolvió (el aviso a nuestro servidor puede demorar). */
export const ESPERA_ENTRE_CONSULTAS_MS = 3000;
export const MAXIMO_DE_CONSULTAS = 7;

export interface RespuestaDelEstado {
  success?: boolean;
  kycStatus?: string | null;
  dniVerified?: boolean;
}

/** ¿Hay que volver a preguntar? Solo si sigue pendiente y quedan intentos. */
export function hayQueVolverAPreguntar(estado: EstadoDeLaVerificacion, consultasHechas: number): boolean {
  return estado === 'pendiente' && consultasHechas < MAXIMO_DE_CONSULTAS;
}

/** Texto para mostrar. Lo que no se pudo confirmar se dice como tal, nunca como aprobado. */
export function textoDelEstado(estado: EstadoDeLaVerificacion, seAgotaronLasConsultas: boolean): { titulo: string; detalle: string } {
  switch (estado) {
    case 'aprobada':
      return { titulo: 'Identidad verificada', detalle: 'Listo: ya podés usar DOAPP con tu identidad verificada.' };
    case 'en_revision':
      return { titulo: 'Tu verificación está en revisión', detalle: 'Una persona del equipo la revisa. Te avisamos apenas tengamos la respuesta.' };
    case 'rechazada':
      return { titulo: 'No pudimos verificar tu identidad', detalle: 'Podés volver a intentarlo, con buena luz y el documento completo a la vista. Si el problema sigue, escribinos desde el Centro de ayuda.' };
    default:
      return seAgotaronLasConsultas
        ? { titulo: 'Todavía estamos procesando tu verificación', detalle: 'Puede demorar unos minutos. No hace falta que hagas nada más: cuando termine, lo vas a ver en tu perfil.' }
        : { titulo: 'Confirmando tu verificación…', detalle: 'Un momento, estamos consultando el resultado.' };
  }
}

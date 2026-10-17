/**
 * Topes que mandan al DUEÑO lo que sale de la plataforma. Una sola cifra para el retiro de un usuario y para la devolución automática al
 * medio de pago: la plata solo sale por encima de este monto con el dueño enterado y de acuerdo.
 *
 * No son política legal (no están en los términos): se pueden mover acá sin tocar el texto legal.
 */

/** Lo que un USUARIO puede retirar por día. Lo que pase se crea igual, pero lo tiene que aprobar el dueño. */
export const TOPE_DIARIO_RETIRO_USUARIO_ARS = 200_000;

/** Una devolución automática al medio de pago por más de esto no sale sola: queda como saldo y pasa por el dueño. */
export const DEVOLUCION_QUE_PIDE_DUENO_ARS = 200_000;
